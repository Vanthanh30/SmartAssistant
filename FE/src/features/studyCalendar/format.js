// Global reminder UI does not need to load the calendar's Luxon dependency.
const formatter=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export const when=value=>formatter.format(new Date(value));
