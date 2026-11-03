import { sendData } from '../../shared/AppError.js';
export function courseController(service) {
  return {
    remove: async (req, res) =>
      sendData(req, res, await service.remove(req.auth.user.id, req.ids.courseId)),
    get: async (req, res) =>
      sendData(req, res, await service.get(req.auth.user.id, req.ids.courseId)),
    create: async (req, res) =>
      sendData(req, res, await service.create(req.auth.user.id, req.input), 201),
    patch: async (req, res) =>
      sendData(req, res, await service.patch(req.auth.user.id, req.ids.courseId, req.input)),
    list: async (req, res) =>
      res.json({
        ...(await service.list(req.auth.user.id, req.filters)),
        requestId: req.requestId,
      }),
  };
}
