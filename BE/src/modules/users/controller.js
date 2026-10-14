import { sendData } from '../../shared/AppError.js';
export function userController(service) {
  return {
    get: async (req, res) => sendData(req, res, await service.profile(req.auth.user.id)),
    patch: async (req, res) => sendData(req, res, await service.update(req.auth.user.id, req.input)),
    upload: async (req, res) => sendData(req, res, await service.uploadAvatar(req.auth.user.id, req.file)),
    avatar: async (req, res) => res.type('image/webp').send(await service.avatar(req.auth.user.id)),
  };
}
