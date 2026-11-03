import { createHash } from 'node:crypto';
export function instanceId(config) {
  if (/^sha256:[a-f0-9]{32}$/.test(config.STUDY_CALENDAR_INSTANCE_ID || ''))
    return config.STUDY_CALENDAR_INSTANCE_ID.slice(7);
  return createHash('sha256')
    .update(
      config.STUDY_CALENDAR_INSTANCE_ID ||
        `${config.APP_PUBLIC_URL}|${config.GOOGLE_CLIENT_ID}|${config.DB_NAME}`,
    )
    .digest('hex')
    .slice(0, 32);
}
export function ownedEvent(event, session, config) {
  const props = event?.extendedProperties?.private;
  return props?.studyApp === instanceId(config) && props?.studySession === String(session.id);
}
export function eventPayload(session, config) {
  const overrides = [];
  if (session.sessionStatus === 'planned') {
    if (session.reminderMinutes > 0)
      overrides.push({ method: 'popup', minutes: session.reminderMinutes });
    overrides.push({ method: 'popup', minutes: 0 });
  }
  const lessonText = session.lesson
    ? '\n\n' +
      session.lesson.topics.map((t) => `${t.title}: ${t.content}`).join('\n') +
      '\n\n' +
      session.lesson.activities.map((a) => `${a.minutes} phút: ${a.instruction}`).join('\n') +
      '\n\n' +
      session.lesson.resources
        .map((r) => `${r.fileName}, trang ${r.pageFrom}–${r.pageTo}`)
        .join('\n')
    : '';
  const plainGoal = ((session.goal || '') + lessonText)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return {
    summary: session.title,
    description: `${plainGoal}\n\n${config.APP_PUBLIC_URL}/app/study-calendar${session.lesson ? `/sessions/${session.id}` : ''}`,
    start: { dateTime: new Date(session.start).toISOString(), timeZone: 'Asia/Ho_Chi_Minh' },
    end: { dateTime: new Date(session.end).toISOString(), timeZone: 'Asia/Ho_Chi_Minh' },
    reminders: { useDefault: false, overrides },
    extendedProperties: {
      private: {
        studyApp: instanceId(config),
        studySession: String(session.id),
        studyRevision: String(session.version),
      },
    },
  };
}
