# FREE FIRE TOURNAMENT NEPAL — Backend

This is a starter backend for the tournament app. It stores player, payment, withdrawal, room and activity data in `data/db.json` and exposes REST APIs.

## Run
1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and set a long random `ADMIN_KEY`.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Admin API
Send `x-admin-key: YOUR_ADMIN_KEY` for `/api/admin/*` requests.

### Important
- Withdrawal limits are enforced at Rs.100–Rs.10,000.
- Player can choose eSewa or bank payout details.
- Admin manually pays the player, then marks the withdrawal `paid` with a transaction reference.
- Rejecting a pending withdrawal returns the amount to the player's winning balance.
- This is a starter backend, not a production financial system. Before public real-money use, add HTTPS, a real database, proper admin authentication/session management, validation, audit controls, backups, rate limits and legal/compliance review.
