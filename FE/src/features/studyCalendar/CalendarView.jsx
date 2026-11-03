import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import luxonPlugin from "@fullcalendar/luxon3";
import interactionPlugin from "@fullcalendar/interaction";
import { DateTime } from "luxon";
import vi from "@fullcalendar/core/locales/vi";
import { sessionAppearance } from "./sessionAppearance.js";
export function CalendarView({
  date,
  view,
  sessions,
  drafts = [],
  onSelect,
  onCreate,
}) {
  const first = sessions
    .filter((s) => s.status !== "cancelled")
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  const scrollTime = first
    ? DateTime.fromISO(first.start, { zone: "Asia/Ho_Chi_Minh" })
        .minus({ hours: 1 })
        .toFormat("HH:mm:ss")
    : "07:00:00";
  const events = [
    ...sessions.map((s) => {
      const appearance = sessionAppearance(s);
      return {
        id: s.id,
        title: `${appearance.state === "planned" ? "" : appearance.label + " · "}${s.title}`,
        start: s.start,
        end: s.end,
        backgroundColor: appearance.color,
        borderColor: appearance.color,
        textColor: "#ffffff",
        classNames: [`calendar-event-${appearance.state}`],
        extendedProps: { session: s },
      };
    }),
    ...drafts.map((s) => ({
      id: s.requestId,
      title: `Nháp · ${s.title}`,
      start: s.start,
      end: s.end,
      classNames: ["calendar-event-draft"],
      extendedProps: { draft: true, session: s },
    })),
  ];
  return (
    <div
      className={`study-calendar-grid calendar-view-${view}${onCreate ? " calendar-can-create" : ""}`}
    >
      <FullCalendar
        key={`${date}:${view}`}
        plugins={[
          dayGridPlugin,
          timeGridPlugin,
          listPlugin,
          luxonPlugin,
          interactionPlugin,
        ]}
        initialView={view}
        initialDate={date}
        timeZone="Asia/Ho_Chi_Minh"
        locale={vi}
        firstDay={1}
        headerToolbar={false}
        height={view === "timeGridWeek" ? 650 : "auto"}
        scrollTime={scrollTime}
        allDaySlot={false}
        nowIndicator
        dayMaxEvents={3}
        events={events}
        eventInteractive
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        dateClick={(info) => {
          if (!onCreate) return;
          const date = DateTime.fromISO(info.dateStr, {
            zone: "Asia/Ho_Chi_Minh",
          });
          const start = info.allDay ? date.set({ hour: 9, minute: 0 }) : date;
          onCreate({
            start: start.toUTC().toISO(),
            end: start.plus({ minutes: 60 }).toUTC().toISO(),
          });
        }}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onSelect?.(
            info.event.extendedProps.session,
            info.event.extendedProps.draft,
          );
        }}
      />
    </div>
  );
}
