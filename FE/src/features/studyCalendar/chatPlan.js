// Deliberately bounded parsing: ask again instead of guessing missing times.
export const plain = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
export const isScheduleIntent = text => /\b(len|lap|xep|tao)\s+(ke hoach\s+)?lich\s+hoc\b|\blap ke hoach hoc\b/.test(plain(text));
export function workload(text) {
 const value=plain(text), count=value.match(/\b(\d+)\s*buoi\b/), duration=value.match(/\b(\d+)\s*phut\b/);
 if(!count||!duration||+count[1]<1||+count[1]>29||+duration[1]<15||+duration[1]>180)throw Error('Bạn nhập số buổi (1–29) và thời lượng (15–180 phút), ví dụ: Ôn chương 1, 3 buổi, 60 phút.');
 const goal=text.replace(/\d+\s*buổi/giu,'').replace(/\d+\s*phút/giu,'').replace(/^[\s,;.]+|[\s,;.]+$/g,'').trim();
 return {sessions:+count[1],duration:+duration[1],goal:goal||'Ôn tập'};
}
export function windows(text) {
 const value=plain(text).replace(/[–—]/g,'-');
 const all=/hang ngay|moi ngay|ca tuan/.test(value);
 const clock=value.match(/(?:tu\s+)?(\d{1,2})(?::(\d{2})|h(\d{2})?)?\s*(?:-|den)\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)?/);
 if(clock&&/\d\s*(?::\d{2})?\s*(?:-|den)\s*\d/.test(value.slice(clock.index+clock[0].length)))throw Error('Hãy nhập một khung giờ chung cho các ngày đã chọn. Với nhiều khung giờ khác nhau, dùng Tùy chỉnh nâng cao trên trang Lịch học.');
 const dayPart=clock?value.slice(0,clock.index):'';
 const days=all?[1,2,3,4,5,6,7]:[...new Set([...(dayPart.match(/\b[2-7]\b/g)||[])].map(n=>+n-1).concat(/chu nhat|\bcn\b/.test(dayPart)?[7]:[]))];
 if(!days.length||!clock)throw Error('Hãy ghi rõ ngày và giờ, ví dụ: Thứ 2, 4, 6 từ 19:00 đến 21:00; hoặc Hằng ngày 19–21. Mỗi lần một khung giờ chung.');
 const start=[+clock[1],+(clock[2]||clock[3]||0)],end=[+clock[4],+(clock[5]||clock[6]||0)];
 if([...start,...end].some(n=>!Number.isFinite(n))||start[0]>23||end[0]>23||start[1]>59||end[1]>59||start.join(':')===end.join(':'))throw Error('Giờ chưa hợp lệ. Hãy dùng giờ 00:00–23:59 và hai mốc khác nhau.');
 const fmt=parts=>parts.map(n=>String(n).padStart(2,'0')).join(':');
 return days.map(day=>({day,start:fmt(start),end:fmt(end)}));
}
