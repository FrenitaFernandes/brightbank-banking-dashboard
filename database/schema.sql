CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    reference_id TEXT NOT NULL CHECK (length(trim(reference_id)) > 0),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT transactions_account_reference_unique UNIQUE (account_id, reference_id)
);

CREATE INDEX IF NOT EXISTS transactions_account_created_idx
    ON transactions(account_id, created_at DESC);

-- Atomic single-account transaction.
CREATE OR REPLACE FUNCTION post_account_transaction(
    p_account_id UUID,
    p_type TEXT,
    p_amount_paise BIGINT,
    p_reference_id TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
    transaction_id UUID,
    account_id UUID,
    transaction_type TEXT,
    amount_paise BIGINT,
    new_balance_paise BIGINT,
    reference_id TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance BIGINT;
    v_transaction_id UUID;
    v_created_at TIMESTAMPTZ;
BEGIN
    IF p_type NOT IN ('credit', 'debit') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TRANSACTION_TYPE';
    END IF;
    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_AMOUNT';
    END IF;
    IF p_reference_id IS NULL OR length(trim(p_reference_id)) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REFERENCE_ID_REQUIRED';
    END IF;

    SELECT a.balance_paise INTO v_balance
      FROM accounts a WHERE a.id = p_account_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ACCOUNT_NOT_FOUND';
    END IF;

    IF EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.account_id = p_account_id AND t.reference_id = p_reference_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'DUPLICATE_REFERENCE';
    END IF;

    IF p_type = 'debit' AND v_balance < p_amount_paise THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_BALANCE';
    END IF;

    UPDATE accounts
       SET balance_paise = balance_paise +
           CASE WHEN p_type = 'credit' THEN p_amount_paise ELSE -p_amount_paise END
     WHERE id = p_account_id
     RETURNING balance_paise INTO v_balance;

    INSERT INTO transactions(account_id, type, amount_paise, reference_id, description)
    VALUES (p_account_id, p_type, p_amount_paise, trim(p_reference_id), p_description)
    RETURNING id, transactions.created_at INTO v_transaction_id, v_created_at;

    RETURN QUERY SELECT v_transaction_id, p_account_id, p_type, p_amount_paise,
                        v_balance, trim(p_reference_id), v_created_at;
END;
$$;

-- Atomic transfer: both account updates and both ledger entries succeed or roll back together.
CREATE OR REPLACE FUNCTION transfer_money(
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount_paise BIGINT,
    p_reference_id TEXT
)
RETURNS TABLE (
    from_account_id UUID,
    from_balance_paise BIGINT,
    to_account_id UUID,
    to_balance_paise BIGINT,
    reference_id TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_from_balance BIGINT;
    v_to_balance BIGINT;
    v_first UUID;
    v_second UUID;
BEGIN
    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SAME_ACCOUNT_TRANSFER';
    END IF;
    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_AMOUNT';
    END IF;
    IF p_reference_id IS NULL OR length(trim(p_reference_id)) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REFERENCE_ID_REQUIRED';
    END IF;

    -- Lock in stable UUID order to reduce deadlock risk.
    v_first := LEAST(p_from_account_id, p_to_account_id);
    v_second := GREATEST(p_from_account_id, p_to_account_id);

    PERFORM 1 FROM accounts WHERE id = v_first FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ACCOUNT_NOT_FOUND';
    END IF;
    PERFORM 1 FROM accounts WHERE id = v_second FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ACCOUNT_NOT_FOUND';
    END IF;

    IF EXISTS (SELECT 1 FROM transactions WHERE account_id = p_from_account_id AND transactions.reference_id = p_reference_id)
       OR EXISTS (SELECT 1 FROM transactions WHERE account_id = p_to_account_id AND transactions.reference_id = p_reference_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'DUPLICATE_REFERENCE';
    END IF;

    SELECT balance_paise INTO v_from_balance FROM accounts WHERE id = p_from_account_id;
    SELECT balance_paise INTO v_to_balance FROM accounts WHERE id = p_to_account_id;
    IF v_from_balance < p_amount_paise THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_BALANCE';
    END IF;

    UPDATE accounts SET balance_paise = balance_paise - p_amount_paise WHERE id = p_from_account_id
      RETURNING balance_paise INTO v_from_balance;
    UPDATE accounts SET balance_paise = balance_paise + p_amount_paise WHERE id = p_to_account_id
      RETURNING balance_paise INTO v_to_balance;

    INSERT INTO transactions(account_id, type, amount_paise, reference_id, description)
    VALUES (p_from_account_id, 'debit', p_amount_paise, trim(p_reference_id), 'Transfer sent');
    INSERT INTO transactions(account_id, type, amount_paise, reference_id, description)
    VALUES (p_to_account_id, 'credit', p_amount_paise, trim(p_reference_id), 'Transfer received');

    RETURN QUERY SELECT p_from_account_id, v_from_balance, p_to_account_id, v_to_balance, trim(p_reference_id);
END;
$$;

-- Prevent transaction ledger entries from being changed or deleted.
CREATE OR REPLACE FUNCTION prevent_transaction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        USING ERRCODE = '55000',
              MESSAGE = 'TRANSACTIONS_ARE_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS transactions_immutable_trigger ON transactions;

CREATE TRIGGER transactions_immutable_trigger
BEFORE UPDATE OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_transaction_mutation();
