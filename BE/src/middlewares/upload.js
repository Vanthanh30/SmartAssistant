import multer from 'multer';
export const avatarUpload = () =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 ** 2, files: 1, fields: 0, parts: 1 },
  }).single('file');
export const pdfUpload = (config) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 ** 2, files: 1, fields: 0 },
  }).single('file');
