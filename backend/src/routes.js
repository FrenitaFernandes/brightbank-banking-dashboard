import { Router } from 'express';
import { pool } from './db.js';
import { ApiError } from './errors.js';
import { amountToPaise, parsePagination, requireName, requireReference } from './validation.js';

const router = Router();
const money = (paise) => Number(paise) / 100;
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/health', (req, res) => res.json({ success: true, status: 'healthy' }));

router.post('/accounts', asyncRoute(async (req, res) => {
  const name = requireName(req.body?.name);
  const result = await pool.query(
    'INSERT INTO accounts(name) VALUES($1) RETURNING id, name, balance_paise, created_at',
    [name]
  );
  const a = result.rows[0];
  res.status(201).json({ success: true, data: { id: a.id, name: a.name, balance: money(a.balance_paise), created_at: a.created_at } });
}));

router.get('/accounts', asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT id, name, balance_paise, created_at FROM accounts ORDER BY created_at DESC');
  res.json({ success: true, data: result.rows.map(a => ({ id: a.id, name: a.name, balance: money(a.balance_paise), created_at: a.created_at })) });
}));

router.get('/accounts/:id', asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT id, name, balance_paise, created_at FROM accounts WHERE id = $1', [req.params.id]);
  if (!result.rowCount) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  const a = result.rows[0];
  res.json({ success: true, data: { id: a.id, name: a.name, balance: money(a.balance_paise), created_at: a.created_at } });
}));

router.post('/accounts/:id/transactions', asyncRoute(async (req, res) => {
  const { type, amount, reference_id, description = null } = req.body || {};
  if (!['credit', 'debit'].includes(type)) throw new ApiError(400, 'INVALID_TRANSACTION_TYPE', 'Transaction type must be credit or debit.');
  const paise = amountToPaise(amount);
  const reference = requireReference(reference_id);
  if (description !== null && typeof description !== 'string') throw new ApiError(400, 'INVALID_DESCRIPTION', 'description must be a string.');
  const result = await pool.query(
    'SELECT * FROM post_account_transaction($1::uuid, $2, $3, $4, $5)',
    [req.params.id, type, paise, reference, description]
  );
  const t = result.rows[0];
  res.status(201).json({ success: true, data: {
    id: t.transaction_id, account_id: t.account_id, type: t.transaction_type,
    amount: money(t.amount_paise), balance: money(t.new_balance_paise),
    reference_id: t.reference_id, created_at: t.created_at
  }});
}));

router.get('/accounts/:id/transactions', asyncRoute(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const account = await pool.query('SELECT id FROM accounts WHERE id = $1', [req.params.id]);
  if (!account.rowCount) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  const [items, count] = await Promise.all([
    pool.query(
      `SELECT id, account_id, type, amount_paise, reference_id, description, created_at
       FROM transactions WHERE account_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    ),
    pool.query('SELECT COUNT(*)::int AS total FROM transactions WHERE account_id = $1', [req.params.id])
  ]);
  res.json({ success: true, data: items.rows.map(t => ({
    id: t.id, account_id: t.account_id, type: t.type, amount: money(t.amount_paise),
    reference_id: t.reference_id, description: t.description, created_at: t.created_at
  })), pagination: { page, limit, total: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / limit) } });
}));

router.post('/transfers', asyncRoute(async (req, res) => {
  const { from_account_id, to_account_id, amount, reference_id } = req.body || {};
  if (typeof from_account_id !== 'string' || typeof to_account_id !== 'string') {
    throw new ApiError(400, 'INVALID_ACCOUNT_ID', 'from_account_id and to_account_id are required.');
  }
  const paise = amountToPaise(amount);
  const reference = requireReference(reference_id);
  const result = await pool.query(
    'SELECT * FROM transfer_money($1::uuid, $2::uuid, $3, $4)',
    [from_account_id, to_account_id, paise, reference]
  );
  const t = result.rows[0];
  res.status(201).json({ success: true, data: {
    from_account_id: t.from_account_id, from_balance: money(t.from_balance_paise),
    to_account_id: t.to_account_id, to_balance: money(t.to_balance_paise),
    reference_id: t.reference_id
  }});
}));

export default router;
