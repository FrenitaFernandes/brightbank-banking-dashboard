import { ApiError } from './errors.js';

export function requireName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ApiError(400, 'INVALID_NAME', 'Account name must be provided.');
  }
  if (name.trim().length > 100) throw new ApiError(400, 'INVALID_NAME', 'Account name must be 100 characters or fewer.');
  return name.trim();
}

export function amountToPaise(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'Amount must be a number greater than zero.');
  }
  if (Math.round(value * 100) !== value * 100) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'Amount must have at most two decimal places.');
  }
  if (value > 1000000000) throw new ApiError(400, 'INVALID_AMOUNT', 'Amount exceeds the allowed limit.');
  return Math.round(value * 100);
}

export function requireReference(reference) {
  if (typeof reference !== 'string' || !reference.trim()) {
    throw new ApiError(400, 'REFERENCE_ID_REQUIRED', 'reference_id is required.');
  }
  if (reference.trim().length > 120) throw new ApiError(400, 'INVALID_REFERENCE_ID', 'reference_id must be 120 characters or fewer.');
  return reference.trim();
}

export function parsePagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError(400, 'INVALID_PAGINATION', 'page must be >= 1 and limit must be between 1 and 100.');
  }
  return { page, limit, offset: (page - 1) * limit };
}
