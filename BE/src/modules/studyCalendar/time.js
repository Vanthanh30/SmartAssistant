export const ZONE = 'Asia/Ho_Chi_Minh';
export const minute = 60000;
export function dayAt(value) { return new Date(new Date(value).getTime() + 7 * 60 * minute).toISOString().slice(0,10); }
export function addDays(day, count) {
  const [year,month,date] = day.split('-').map(Number);
  return new Date(Date.UTC(year,month-1,date+count)).toISOString().slice(0,10);
}
export function at(day, time = '00:00') { return new Date(`${day}T${time}:00+07:00`); }
export function weekBounds(day) { return { from: at(day), to: at(addDays(day,7)) }; }
export function iso(value) { return new Date(value).toISOString(); }
export function overlap(a,b) { return +new Date(a.start) < +new Date(b.end) && +new Date(a.end) > +new Date(b.start); }
export function duration(slot) { return (+new Date(slot.end) - +new Date(slot.start)) / minute; }
export function windows(week, intervals) {
  return intervals.flatMap(range => {
    const day = range.date || addDays(week,range.day-1);
    const start = at(day,range.start);
    const end = at(range.end <= range.start ? addDays(day,1) : day,range.end);
    // Split at local midnight, never leave a negative interval.
    const midnight = at(addDays(day,1));
    return +end > +midnight ? [{start,end:midnight},{start:midnight,end}] : [{start,end}];
  });
}
