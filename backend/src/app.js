import express from 'express';
import cors from 'cors';
import router from './routes.js';
import { errorHandler, ApiError } from './errors.js';

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  if (!req.is('application/json') && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next(new ApiError(400, 'INVALID_CONTENT_TYPE', 'Send request data as application/json.'));
  }
  next();
});
app.use('/api', router);
app.use((req, res, next) => next(new ApiError(404, 'ROUTE_NOT_FOUND', 'API route not found.')));
app.use(errorHandler);
export default app;
