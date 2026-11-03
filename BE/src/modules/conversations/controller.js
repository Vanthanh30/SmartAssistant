import { sendData } from '../../shared/AppError.js';

export function conversationController(chat, sources) {
  const owner = (req) => req.auth.user.id;
  return {
    list: async (req, res) =>
      res.json({ ...(await chat.list(owner(req), req.filters)), requestId: req.requestId }),
    listForCourse: async (req, res) =>
      res.json({
        ...(await chat.list(owner(req), { ...req.filters, courseId: req.ids.courseId })),
        requestId: req.requestId,
      }),
    create: async (req, res) =>
      sendData(req, res, await chat.create(owner(req), req.ids.courseId, req.input), 201),
    get: async (req, res) =>
      sendData(req, res, await chat.get(owner(req), req.ids.conversationId, req.filters)),
    formula: async (req, res) => {
      const bytes = await sources.formula(owner(req), req.ids);
      if (!bytes) return res.status(404).end();
      return res
        .set({
          'Content-Type': 'image/png',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        .send(bytes);
    },
    remove: async (req, res) =>
      sendData(req, res, await chat.remove(owner(req), req.ids.conversationId)),
    ask: async (req, res) =>
      sendData(req, res, await chat.ask(req.auth, req.ids.conversationId, req.input)),
  };
}
