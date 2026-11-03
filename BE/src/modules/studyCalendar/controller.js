import { sendData } from '../../shared/AppError.js';
export function calendarController(service, google, config) {
  const owner = (req) => req.auth.user.id;
  return {
    list: async (req, res) => sendData(req, res, await service.list(owner(req), req.filters)),
    syncCandidates: async (req, res) =>
      sendData(req, res, await service.syncCandidates(owner(req))),
    detail: async (req, res) => sendData(req, res, await service.detail(owner(req), req.ids.id)),
    remove: async (req, res) =>
      sendData(req, res, await service.remove(req.auth, req.ids.id, req.input.version)),
    conversation: async (req, res) =>
      sendData(
        req,
        res,
        await service.conversation(req.auth, req.ids.id, req.input.newConversation),
      ),
    propose: async (req, res) => sendData(req, res, await service.propose(owner(req), req.input)),
    move: async (req, res) =>
      sendData(req, res, await service.move(owner(req), req.ids.id, req.input)),
    confirm: async (req, res) =>
      sendData(req, res, await service.confirm(req.auth, req.input), 201),
    create: async (req, res) => sendData(req, res, await service.create(req.auth, req.input), 201),
    patch: async (req, res) =>
      sendData(req, res, await service.patch(req.auth, req.ids.id, req.input)),
    complete: async (req, res) =>
      sendData(
        req,
        res,
        await service.status(req.auth, req.ids.id, req.input.version, 'completed'),
      ),
    cancel: async (req, res) =>
      sendData(
        req,
        res,
        await service.status(req.auth, req.ids.id, req.input.version, 'cancelled'),
      ),
    retry: async (req, res) =>
      sendData(req, res, await service.retry(req.auth, req.ids.id, req.input)),
    stopSync: async (req, res) =>
      sendData(req, res, await service.stopSync(req.auth, req.ids.id, req.input.version)),
    inbox: async (req, res) =>
      sendData(req, res, await service.inbox(owner(req), req.filters?.cursor)),
    read: async (req, res) => sendData(req, res, await service.read(req.auth, req.ids?.id)),
    googleStatus: async (req, res) => sendData(req, res, await google.status(owner(req))),
    googleBegin: async (req, res) => sendData(req, res, await google.begin(req.auth)),
    googleDisconnect: async (req, res) => sendData(req, res, await google.disconnect(req.auth)),
    googleEvent: async (req, res) =>
      sendData(req, res, await google.openEvent(req.auth, req.ids.id)),
    googleCallback: async (req, res) => {
      res.set('Referrer-Policy', 'no-referrer');
      try {
        await google.callback(req.auth, req.input);
        res.redirect(303, `${config.APP_PUBLIC_URL}/app/study-calendar?google=connected`);
      } catch {
        res.redirect(303, `${config.APP_PUBLIC_URL}/app/study-calendar?google=failed`);
      }
    },
  };
}
