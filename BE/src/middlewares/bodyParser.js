import express from 'express';
export const bodyParser = (req, res, next) =>
  /^\/api\/v1\/(?:lich-hoc|ket-noi\/google|thong-bao-hoc)(?:\/|$)/.test(req.path)
    ? next()
    : express.json({ limit: /\/learning-sets$/.test(req.path) ? '1mb' : '16kb' })(req, res, next);
