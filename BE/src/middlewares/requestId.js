import { randomUUID } from 'node:crypto';
export const requestId = (req, res, next) => {
  req.requestId = randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
};
