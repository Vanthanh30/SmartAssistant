import multer from 'multer';
import { AppError } from '../shared/AppError.js';
export const notFound = (req, res, next) =>
  next(new AppError(404, 'NOT_FOUND', 'Không tìm thấy trang hoặc tài nguyên.'));
export const errorHandler = (config) => (error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError)
    error = new AppError(
      error.code === 'LIMIT_FILE_SIZE' ? 413 : 422,
      error.code === 'LIMIT_FILE_SIZE'
        ? req.uploadKind === 'pdf'
          ? 'PDF_TOO_LARGE'
          : 'AVATAR_TOO_LARGE'
        : 'INVALID_UPLOAD',
      error.code === 'LIMIT_FILE_SIZE'
        ? req.uploadKind === 'pdf'
          ? `PDF tối đa ${config.MAX_UPLOAD_MB} MB.`
          : 'Ảnh đại diện tối đa 2 MB.'
        : 'Chỉ chọn một file trong trường file.',
    );
  const status =
    error.status ??
    (error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500);
  if (status >= 500)
    console.error(
      JSON.stringify({
        requestId: req.requestId,
        code: error.code ?? 'INTERNAL_ERROR',
        status,
        errorType: error.name,
        frames: error.stack
          ?.split('\n')
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 8),
      }),
    );
  res.status(status).json({
    error: {
      code:
        error.code ??
        (status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR'),
      message: error instanceof AppError ? error.message : 'Không thể xử lý yêu cầu.',
      ...(error.details ? { details: error.details } : {}),
    },
    requestId: req.requestId,
  });
};
