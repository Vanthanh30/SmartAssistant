export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
export const sendData = (req, res, data, status = 200) => res.status(status).json({ data, requestId: req.requestId });
