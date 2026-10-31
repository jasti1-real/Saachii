# Saachii

Responsive white-theme front-end starter and Cloudflare Workers/D1 API scaffold.

## Files
- `index.html` — UI starter (demo-only browser storage; not production authentication)
- `src/worker.js` — API starter with PBKDF2 password hashing, hashed opaque sessions, account/products/referral/ledger reads
- `schema.sql` — D1 schema and the ten product listings
- `wrangler.toml` — Cloudflare Workers configuration template

## Cloudflare setup
1. Create a D1 database named `saachii-db`.
2. Replace the placeholder `database_id` in `wrangler.toml`.
3. Run `npx wrangler d1 execute saachii-db --remote --file=./schema.sql`.
4. Install Wrangler locally and deploy with `npx wrangler deploy`.
5. Test `GET /api/health`, registration, login, authenticated `/api/me`, products and referrals.

## Important
- The current static `index.html` is still a UI demo and is not yet wired to these API endpoints.
- Money-moving routes intentionally return HTTP 503. Do not enable them until official MarzPay API documentation, server-side credentials, signed webhook verification, idempotency, reconciliation and test transactions are implemented.
- Product prices/income/durations reflect the supplied figures. They are not a guarantee of return. Product purchase is disabled by default in D1 (`enabled=0`).
- Welcome bonus is not automatically credited in the API scaffold pending a clear unlock/withdrawal policy.
- Configure exact allowed origins, rate limiting, monitoring, backups, password reset, session revocation, privacy terms, legal review and security testing before production.
- Never put MarzPay secrets in frontend code or commit secrets to GitHub.
