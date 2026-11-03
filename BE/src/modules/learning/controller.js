import { sendData } from '../../shared/AppError.js';

export function learningController(learning) {
  const owner = (req) => req.auth.user.id;
  return {
    list: async (req, res) =>
      res.json({
        ...(await learning.list(owner(req), req.ids.courseId, req.filters)),
        requestId: req.requestId,
      }),
    create: async (req, res) =>
      sendData(req, res, await learning.create(req.auth, req.ids.courseId, req.input), 201),
    get: async (req, res) => sendData(req, res, await learning.detail(owner(req), req.ids.setId)),
    remove: async (req, res) => sendData(req, res, await learning.remove(req.auth, req.ids.setId)),
    attempts: async (req, res) =>
      sendData(req, res, await learning.attempts(owner(req), req.ids.setId)),
    start: async (req, res) =>
      sendData(req, res, await learning.start(req.auth, req.ids.setId, req.input), 201),
    attempt: async (req, res) =>
      sendData(req, res, await learning.attemptDetail(owner(req), req.ids.attemptId)),
    confirm: async (req, res) =>
      sendData(req, res, await learning.confirm(req.auth, req.ids.attemptId, req.input)),
    submit: async (req, res) =>
      sendData(req, res, await learning.submit(req.auth, req.ids.attemptId, req.input)),
  };
}
