import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET';
const DB = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json({limit:'1mb'}));
app.use(express.static(path.join(__dirname,'public')));

function load(){
  if(!fs.existsSync(DB)) return {players:[],payments:[],withdrawals:[],rooms:[],activity:[]};
  return JSON.parse(fs.readFileSync(DB,'utf8'));
}
function save(db){fs.mkdirSync(path.dirname(DB),{recursive:true}); fs.writeFileSync(DB+'.tmp',JSON.stringify(db,null,2)); fs.renameSync(DB+'.tmp',DB);}
function id(){return crypto.randomUUID();}
function now(){return new Date().toISOString();}
function admin(req,res,next){
  if(req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({error:'Unauthorized'});
  next();
}
function log(db,type,details){db.activity.unshift({id:id(),type,details,createdAt:now()}); db.activity=db.activity.slice(0,1000);}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'FF Nepal backend'}));

app.post('/api/players',(req,res)=>{
  const {fullName,uid,ign,phone,email} = req.body||{};
  if(!fullName || !uid) return res.status(400).json({error:'Full name and Free Fire UID are required'});
  const db=load();
  let p=db.players.find(x=>x.uid===String(uid));
  if(!p){p={id:id(),fullName:String(fullName),uid:String(uid),ign:String(ign||''),phone:String(phone||''),email:String(email||''),winningBalance:0,createdAt:now(),updatedAt:now()};db.players.push(p);}
  else {Object.assign(p,{fullName:String(fullName),ign:String(ign||p.ign),phone:String(phone||p.phone),email:String(email||p.email),updatedAt:now()});}
  log(db,'player_upsert',{playerId:p.id,uid:p.uid}); save(db); res.json(p);
});

app.post('/api/payments',(req,res)=>{
  const {playerId,uid,tournament,amount,transactionId} = req.body||{};
  if(!uid||!tournament||!amount||!transactionId) return res.status(400).json({error:'uid, tournament, amount and transactionId are required'});
  const db=load(); const p=db.players.find(x=>x.uid===String(uid));
  const payment={id:id(),playerId:playerId||p?.id||null,uid:String(uid),tournament:String(tournament),amount:Number(amount),transactionId:String(transactionId),status:'pending',createdAt:now()};
  db.payments.unshift(payment); log(db,'payment_created',{paymentId:payment.id,uid:payment.uid,amount:payment.amount}); save(db); res.status(201).json(payment);
});

app.post('/api/withdrawals',(req,res)=>{
  const {uid,amount,method,esewaNumber,bankName,accountName,accountNumber} = req.body||{};
  const n=Number(amount);
  if(!uid || !Number.isFinite(n) || n<100 || n>10000) return res.status(400).json({error:'Withdrawal must be between Rs.100 and Rs.10,000'});
  if(!['esewa','bank'].includes(method)) return res.status(400).json({error:'Method must be esewa or bank'});
  if(method==='esewa' && !esewaNumber) return res.status(400).json({error:'eSewa number is required'});
  if(method==='bank' && (!bankName||!accountName||!accountNumber)) return res.status(400).json({error:'Bank details are required'});
  const db=load(); const p=db.players.find(x=>x.uid===String(uid));
  if(!p) return res.status(404).json({error:'Player not found'});
  if(Number(p.winningBalance)<n) return res.status(400).json({error:'Insufficient winning balance'});
  const pending=db.withdrawals.find(w=>w.uid===String(uid)&&w.status==='pending');
  if(pending) return res.status(409).json({error:'A withdrawal is already pending'});
  const w={id:id(),playerId:p.id,uid:String(uid),amount:n,method,status:'pending',esewaNumber:String(esewaNumber||''),bankName:String(bankName||''),accountName:String(accountName||''),accountNumber:String(accountNumber||''),createdAt:now()};
  p.winningBalance=Number(p.winningBalance)-n; db.withdrawals.unshift(w); log(db,'withdrawal_requested',{withdrawalId:w.id,uid:w.uid,amount:n,method}); save(db); res.status(201).json(w);
});

app.get('/api/me/:uid',(req,res)=>{const db=load(); const p=db.players.find(x=>x.uid===String(req.params.uid)); if(!p)return res.status(404).json({error:'Player not found'}); res.json({player:p,withdrawals:db.withdrawals.filter(w=>w.uid===p.uid),payments:db.payments.filter(x=>x.uid===p.uid)});});

app.get('/api/admin/summary',admin,(req,res)=>{const db=load();res.json({players:db.players.length,pendingPayments:db.payments.filter(x=>x.status==='pending').length,pendingWithdrawals:db.withdrawals.filter(x=>x.status==='pending').length,totalWithdrawals:db.withdrawals.length});});
app.get('/api/admin/data',admin,(req,res)=>{const db=load();res.json(db);});

app.post('/api/admin/payments/:id/status',admin,(req,res)=>{const db=load();const p=db.payments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});const status=req.body?.status;if(!['approved','rejected'].includes(status))return res.status(400).json({error:'Invalid status'});p.status=status;p.reviewedAt=now();log(db,'payment_status',{paymentId:p.id,status});save(db);res.json(p);});

app.post('/api/admin/withdrawals/:id/status',admin,(req,res)=>{const db=load();const w=db.withdrawals.find(x=>x.id===req.params.id);if(!w)return res.status(404).json({error:'Withdrawal not found'});const status=req.body?.status;if(!['paid','rejected'].includes(status))return res.status(400).json({error:'Invalid status'});if(w.status!=='pending')return res.status(409).json({error:'Withdrawal already processed'});w.status=status;w.reviewedAt=now();w.transactionRef=String(req.body?.transactionRef||'');if(status==='rejected'){const p=db.players.find(x=>x.id===w.playerId);if(p)p.winningBalance=Number(p.winningBalance)+Number(w.amount);}log(db,'withdrawal_status',{withdrawalId:w.id,status,transactionRef:w.transactionRef});save(db);res.json(w);});

app.post('/api/admin/rooms',admin,(req,res)=>{const {tournament,roomId,password,status='open'}=req.body||{};if(!tournament||!roomId||!password)return res.status(400).json({error:'tournament, roomId and password required'});const db=load();const r={id:id(),tournament,roomId,password,status,createdAt:now()};db.rooms.unshift(r);log(db,'room_created',{roomId,tournament});save(db);res.status(201).json(r);});
app.get('/api/rooms',(req,res)=>{const db=load();res.json(db.rooms.filter(r=>r.status!=='closed'));});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`FF Nepal backend running on http://localhost:${PORT}`));
