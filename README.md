# Banking Full-Stack Assessment

Starter implementation using HTML, CSS, vanilla JavaScript, Node.js + Express, and Supabase PostgreSQL. The frontend uses Vite only as a local development server; it does not use React.

## Features
- Create and list accounts
- View account balance and transaction history
- Credit/debit transactions with validation
- Duplicate reference protection per account
- PostgreSQL transaction for atomic balance updates and transaction insertion
- Pagination
- Atomic money transfers (bonus)
- Consistent API error responses

## Requirements
- Node.js 18+
- npm
- Supabase project (PostgreSQL)
- Git

## 1. Database setup
In Supabase, open **SQL Editor**, create a new query, and run `database/schema.sql`.

The schema uses integer minor units (`balance_paise`, `amount_paise`) to avoid floating-point money calculations. The UI accepts INR rupees and converts to paise.

## 2. Configure backend
```bash
cd backend
npm install
```
Copy `.env.example` to `.env` and fill in your Supabase database connection string as `DATABASE_URL`.

In Supabase, find the PostgreSQL connection string under **Project Settings → Database**. Prefer the connection pooler string if your network requires it. Keep the password private and never commit `.env`.

```bash
npm run dev
```
Backend defaults to `http://localhost:5000`. Health endpoint: `GET /api/health`.

## 3. Configure frontend
The frontend is built with plain HTML, CSS, and JavaScript (no React required). Vite is used only to serve the files locally. In a second terminal:
```bash
cd frontend
npm install
```
Copy `.env.example` to `.env` if you need a different API URL. The default API URL is `http://localhost:5000/api`.

```bash
npm run dev
```
Open the local URL printed by Vite (usually `http://localhost:5173`).

## API summary
- `POST /api/accounts` — `{ "name": "Savings" }`
- `GET /api/accounts`
- `GET /api/accounts/:id`
- `POST /api/accounts/:id/transactions` — `{ "type": "credit", "amount": 100, "reference_id": "REF-001" }`
- `GET /api/accounts/:id/transactions?page=1&limit=10`
- `POST /api/transfers` — `{ "from_account_id": "...", "to_account_id": "...", "amount": 30, "reference_id": "TRANSFER-001" }`

Amounts in API requests/responses are INR rupees. Database stores paise as integers.

## Status codes
- `201` created
- `200` success
- `400` invalid request / pagination
- `404` account not found
- `409` duplicate reference or transfer conflict
- `422` insufficient balance / business rule violation
- `500` unexpected server error

## Assumptions
1. A new account starts with a zero balance.
2. Account names are required and trimmed.
3. `reference_id` must be unique per account. A transfer uses the same reference for its paired debit/credit, so uniqueness is enforced per account, not globally.
4. Amounts must be positive and limited to two decimal places.
5. Only `credit` and `debit` are accepted transaction types.
6. Pagination defaults to page 1 and limit 10; limit maximum is 100.
7. No authentication was specified in the assessment; add authentication/authorization before any real-world use.
8. This is an assessment starter, not production banking software.

## Important implementation notes
- Balance changes and transaction inserts use PostgreSQL transactions, so failures roll back both.
- Debit/transfer balance updates use conditional SQL and row locks to avoid overdrawing under concurrent requests.
- Never expose `DATABASE_URL` or service credentials in the frontend.
- Test duplicate references, invalid IDs, insufficient balance, invalid pagination, and failed transfers before submitting.
