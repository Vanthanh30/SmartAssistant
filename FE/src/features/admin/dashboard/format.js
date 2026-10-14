export const number=value=>value==null?'Chưa có dữ liệu':new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(value);
export const time=value=>new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value));
export const labels={queued:'Chờ xử lý',extracting:'Trích xuất',chunking:'Chia đoạn',embedding:'Embedding',indexing:'Lập chỉ mục',ready:'Sẵn sàng',failed:'Thất bại',unsupported:'Không hỗ trợ'};
