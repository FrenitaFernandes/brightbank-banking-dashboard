export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function mapDatabaseError(error) {
  const message = String(error?.message || '');
  const code = error?.code;
  if (message.includes('ACCOUNT_NOT_FOUND') || code === 'P0002') return new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  if (message.includes('INSUFFICIENT_BALANCE') || message.includes('P0001')) return new ApiError(422, 'INSUFFICIENT_BALANCE', 'The account has insufficient balance.');
  if (message.includes('DUPLICATE_REFERENCE') || code === '23505') return new ApiError(409, 'DUPLICATE_REFERENCE', 'This reference_id has already been used for this account.');
  if (message.includes('INVALID_TRANSACTION_TYPE')) return new ApiError(400, 'INVALID_TRANSACTION_TYPE', 'Transaction type must be credit or debit.');
  if (message.includes('INVALID_AMOUNT')) return new ApiError(400, 'INVALID_AMOUNT', 'Amount must be greater than zero and have at most two decimal places.');
  if (message.includes('REFERENCE_ID_REQUIRED')) return new ApiError(400, 'REFERENCE_ID_REQUIRED', 'reference_id is required.');
  if (message.includes('SAME_ACCOUNT_TRANSFER')) return new ApiError(400, 'SAME_ACCOUNT_TRANSFER', 'Source and destination accounts must be different.');
  if (code === '22P02') return new ApiError(400, 'INVALID_ID', 'The supplied ID is not a valid UUID.');
  if (code === '23503') return new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  if (code === '22023') return new ApiError(400, 'INVALID_REQUEST', message);
  return null;
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const mapped = err.status ? err : mapDatabaseError(err);
  const status = mapped?.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    success: false,
    error: {
      code: mapped?.code || 'INTERNAL_SERVER_ERROR',
      message: mapped?.message || 'An unexpected error occurred.'
    }
  });
}
