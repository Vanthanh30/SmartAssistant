// SQL lưu giá trị nghiệp vụ tiếng Việt. DTO giữ hợp đồng REST hiện hành.
const values={student:'học sinh',admin:'quản trị viên',active:'hoạt động',blocked:'bị khóa',
 uploaded:'đã tải lên',processing:'đang xử lý',ready:'sẵn sàng',failed:'thất bại',deleting:'đang xóa',deleted:'đã xóa',unsupported:'không hỗ trợ',
 answered:'đã trả lời',insufficient_context:'không đủ ngữ cảnh',grounded:'có nguồn',unknown:'chưa xác định',
 quiz:'trắc nghiệm',flashcards:'thẻ ghi nhớ',ai:'trí tuệ nhân tạo',manual:'thủ công',rules:'quy tắc',
 in_progress:'đang làm',completed:'hoàn thành',planned:'đã lên lịch',cancelled:'đã hủy',confirmed:'đã xác nhận',
 again:'học lại',hard:'khó',good:'tốt',easy:'dễ',connected:'đã kết nối',disconnected:'đã ngắt kết nối',reconnect_required:'cần kết nối lại',
 high:'cao',normal:'bình thường',low:'thấp',none:'không',morning:'buổi sáng',afternoon:'buổi chiều',evening:'buổi tối',
 extracting:'trích xuất',chunking:'chia đoạn',embedding:'tạo biểu diễn',indexing:'lập chỉ mục'};
const reversed=Object.fromEntries(Object.entries(values).map(([key,value])=>[value,key]));
export const toDb=value=>values[value]??value;
export const fromDb=value=>reversed[value]??value;
const businessFields=new Set(['priority','preferred','status','kind','memory']);
export const translate=(value,convert=toDb,field='')=>Array.isArray(value)?value.map(v=>translate(v,convert,field)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,translate(v,convert,key)])):typeof value==='string'&&businessFields.has(field)?convert(value):value;
