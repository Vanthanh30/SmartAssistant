import { CHAT_RETRIEVAL_CANDIDATES } from '../../../rag/retrieval.js';
import { AppError } from '../../../shared/AppError.js';
const DAY=86400000;
export function dashboardRange(query, now=new Date()) {
 const today=new Date(now.getTime()+7*3600000).toISOString().slice(0,10);
 const valid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const end=query.end??today;const days=query.days??'7';
 if(!valid(end)||!['7','30'].includes(days))throw new AppError(422,'INVALID_DATE_RANGE','Ngày hoặc bộ lọc không hợp lệ.');
 const start=query.start??new Date(Date.parse(end)-(Number(days)-1)*DAY).toISOString().slice(0,10);
 if(Object.keys(query).some(k=>!['start','end','days'].includes(k))||!['7','30'].includes(days)||!valid(start)||!valid(end)||start>end||end>today||(Date.parse(end)-Date.parse(start))/DAY>=93)throw new AppError(422,'INVALID_DATE_RANGE','Chọn khoảng ngày hợp lệ, tối đa 93 ngày và không vượt quá hôm nay.');
 const dates=[];for(let t=Date.parse(start);t<=Date.parse(end);t+=DAY)dates.push(new Date(t).toISOString().slice(0,10));
 return {start,end,dates,from:new Date(Date.parse(start)-7*3600000),to:new Date(Date.parse(end)+DAY-7*3600000)};
}
export async function dashboardData(pool, config, range) {
 const db=await pool.getConnection();
 try {
 await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 await db.beginTransaction();
 const one=async(sql,args=[])=> (await db.execute(sql,args))[0][0];
 const users=await one("SELECT COUNT(*) total,COALESCE(SUM(trang_thai='active'),0) active,COALESCE(SUM(trang_thai='blocked'),0) blocked FROM nguoi_dung");
 const courses=await one("SELECT COUNT(*) total FROM mon_hoc");
 const [states]=await db.query("SELECT trang_thai,COUNT(*) count FROM tai_lieu WHERE luc_xoa IS NULL AND trang_thai NOT IN ('deleting','deleted') GROUP BY trang_thai");
 const documents={total:0,ready:0,processing:0,failed:0,unsupported:0};for(const row of states){documents.total+=Number(row.count);if(['queued','extracting','chunking','embedding','indexing'].includes(row.status))documents.processing+=Number(row.count);else documents[row.status]=Number(row.count);}
 const args=[range.from,range.to];
 const activity=await one("SELECT COUNT(*) total,COALESCE(SUM(trang_thai='answered'),0) answered,COALESCE(SUM(trang_thai='insufficient_context'),0) insufficient,COALESCE(SUM(trang_thai='failed'),0) failed,COALESCE(SUM(trang_thai='processing'),0) processing,AVG(CASE WHEN trang_thai<>'processing' AND do_tre_ms IS NOT NULL AND do_tre_ms>=0 THEN do_tre_ms END) averageLatencyMs,COUNT(CASE WHEN trang_thai<>'processing' AND do_tre_ms IS NOT NULL AND do_tre_ms>=0 THEN 1 END) latencySamples FROM tin_nhan WHERE vai_tro='user' AND ngay_tao>=? AND ngay_tao<?",args);
 const origins=await one("SELECT COALESCE(SUM(nguon_tra_loi='grounded'),0) grounded,COALESCE(SUM(nguon_tra_loi='general'),0) general,COALESCE(SUM(nguon_tra_loi='unknown'),0) unknown FROM tin_nhan WHERE vai_tro='user' AND trang_thai='answered' AND ngay_tao>=? AND ngay_tao<?",args);
 for(const key of Object.keys(origins))origins[key]=Number(origins[key]);
 const daily=async(table,extra)=> (await db.execute(`SELECT DATE_FORMAT(DATE_ADD(ngay_tao,INTERVAL 7 HOUR),'%Y-%m-%d') day,COUNT(*) count FROM ${table} WHERE ngay_tao>=? AND ngay_tao<? ${extra} GROUP BY day ORDER BY day`,args))[0];
 const questionDays=await daily('tin_nhan',"AND vai_tro='user'");const uploadDays=await daily('tai_lieu','');
 const [recentDocuments]=await db.query("SELECT CAST(d.ma AS CHAR) ma,d.ten_tep_goc fileName,u.ho_ten uploader,c.ten courseName,d.ngay_tao createdAt,d.trang_thai FROM tai_lieu d JOIN nguoi_dung u ON u.ma=d.ma_nguoi_dung JOIN mon_hoc c ON c.ma=d.ma_mon_hoc WHERE d.luc_xoa IS NULL AND d.trang_thai NOT IN ('deleting','deleted') ORDER BY d.ngay_tao DESC,d.ma DESC LIMIT 8");
 const [audit]=await db.query("SELECT CAST(a.ma AS CHAR) ma,u.ho_ten actor,a.hanh_dong,a.loai_doi_tuong entityType,CAST(a.ma_doi_tuong AS CHAR) entityId,a.ngay_tao createdAt FROM nhat_ky_quan_tri a JOIN nguoi_dung u ON u.ma=a.ma_nguoi_thuc_hien ORDER BY a.ngay_tao DESC,a.ma DESC LIMIT 8");
 const [embedding]=await db.query("SELECT DISTINCT mo_hinh,phien_ban_mo_hinh revision,so_chieu,phep_do FROM chi_muc_tim_kiem");
 await db.commit();
 const fill=rows=>{const map=new Map(rows.map(r=>[r.day,Number(r.count)]));return range.dates.map(day=>({day,count:map.get(day)??0}));};
 for(const key of Object.keys(users))users[key]=Number(users[key]);for(const key of Object.keys(activity))activity[key]=activity[key]===null?null:Number(activity[key]);
 const completed=activity.answered+activity.insufficient;
 return {updatedAt:new Date().toISOString(),timezone:'Asia/Ho_Chi_Minh',range:{start:range.start,end:range.end},totals:{users,courses:Number(courses.total),documents},activity:{...activity,origins,insufficientRate:completed?activity.insufficient/completed:null},charts:{questions:fill(questionDays),uploads:fill(uploadDays),documentStates:states.map(r=>({status:r.status,count:Number(r.count)}))},recentDocuments,audit,configuration:{llmModel:config.LLM_MODEL||null,llmProvider:config.LLM_PROVIDER,embedding,ragTopK:config.RAG_TOP_K,ragScoreThreshold:config.RAG_SCORE_THRESHOLD,retrievalCandidates:CHAT_RETRIEVAL_CANDIDATES},notes:['Phân bố nguồn chỉ tính status answered trên message user: grounded/general được ghi từ phiên bản015; dữ liệu cũ unknown, không suy đoán từ model/citations.','Tỷ lệ thiếu ngữ cảnh hiện tính mọi answered, bao gồm general và unknown; không phải tỷ lệ riêng grounded.','Hoạt động hỏi đáp chỉ tính hội thoại còn lưu; xóa hội thoại làm giảm thống kê lịch sử.','Latency toàn luồng chỉ ghi trên message user từ phiên bản dashboard; lịch sử chưa đo không được suy diễn.','Biểu đồ upload tính bản ghi tải lên còn trong DB, kể cả trạng thái deleting/deleted; thẻ và phân bố trạng thái chỉ tính tài liệu đang sử dụng.','Cấu hình LLM là cấu hình API hiện tại; embedding lấy từ index đã lưu, không khẳng định dịch vụ/model đang hoạt động.']};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
