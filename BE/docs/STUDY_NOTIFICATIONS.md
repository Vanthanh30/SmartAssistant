# Study notifications

The bell displays a persistent inbox, unread count, filters and read actions. Session links preserve BIGINT identifiers. Escape and outside clicks close the panel; mobile uses a viewport-sized panel.

## Persistence and generation

- Existing schema version 16 remains unchanged. `ke_hoach_hoc.dieu_kien_hoc.notifications` stores up to 200 notices per plan for 30 days, with read state and session snapshots. No AI calls.
- Owner advisory lock plus database transaction/row locks protect JSON updates alongside calendar edits. Notifications contain only compact session summaries, not duplicate lesson payloads.
- Worker checks every 30 seconds. Inbox requests catch up after downtime. Calendar mutations reconcile before and after writes to capture changes even between worker ticks.
- Before/start reminders, missed sessions, changed/cancelled sessions are supported. Rescheduling/finishing retracts actionable old reminders. Changing Google sync alone does not issue a new occurrence.
- Read endpoints are authenticated, student-only, CSRF protected and owner scoped. GET pages contain 20 notices and a stable ID cursor.

## Web Push

`web-push` implements encrypted Web Push/VAPID; `FE/public/study-push-sw.js` handles delivery without intercepting fetches or caching private pages. Generic lock-screen text avoids displaying document names. Clicking opens the app's calendar; notification rows open the exact session.

Run `node scripts/setup-web-push.js` from BE once. Keys are written privately to `.env` (never logged). Keep the keys stable across deploys; set `WEB_PUSH_SUBJECT` to an operator contact URI in production. Restart the **existing** API and worker after changing environment variables. No additional server process is required.

Users opt in under bell → Cài đặt nhắc học → Bật nhắc khi đóng tab. This needs a saved plan, supported browser, secure context (HTTPS in deployment; localhost in development), notification permission and network access to the browser's push provider. The service stores at most five devices per owner in the first plan's `pushDevices` JSON. Logout revokes this browser's subscription; disabling is independent of in-app history.

Endpoints are limited to known Google/Mozilla/Apple/Microsoft push hosts. Delivery attempts time out after five seconds; temporary failures retry on subsequent worker ticks within five minutes, expired subscriptions (404/410) are removed. A per-owner delivery lock and sent-ID acknowledgements avoid normal concurrent duplicate sends. A process crash after provider acceptance but before acknowledgement may repeat a notification; stable tags collapse identical retries. Provider acceptance is not evidence of OS display or user reading.

The worker must be running (`npm run dev` launches it, or deployment runs `npm run start:worker`). Closing a tab is supported by Web Push; a powered-off device, blocked notifications or browser/OS background restrictions can still delay/prevent display. Google Calendar reminders remain independent.

## Verification

- `node --test tests/modules/notifications.test.js tests/modules/intelligent-calendar.test.js` in BE.
- `node --test tests/notification-model.test.js tests/study-push-worker.test.js tests/session-preview-model.test.js tests/session-study-model.test.js` in FE.
- FE `scripts/test-notifications.cjs`: mocked API browser checks for badge, read persistence, filters, exact session link, mark-all, mobile layout, Escape. Existing session classroom browser regression also passes.
- Push delivery/retries tested with an injected transport and service worker sandbox. Actual browser-provider/OS delivery requires a real user opt-in and is not asserted by these tests.
