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
 const users=await one("SELECT COUNT(*) total,COALESCE(SUM(status='active'),0) active,COALESCE(SUM(status='blocked'),0) blocked FROM users");
 const courses=await one('SELECT COUNT(*) total FROM courses');
 const [states]=await db.query("SELECT status,COUNT(*) count FROM documents WHERE deleted_at IS NULL AND status NOT IN ('deleting','deleted') GROUP BY status");
 const documents={total:0,ready:0,processing:0,failed:0,unsupported:0};for(const row of states){documents.total+=Number(row.count);if(['queued','extracting','chunking','embedding','indexing'].includes(row.status))documents.processing+=Number(row.count);else documents[row.status]=Number(row.count);}
 const args=[range.from,range.to];
 const activity=await one("SELECT COUNT(*) total,COALESCE(SUM(status='answered'),0) answered,COALESCE(SUM(status='insufficient_context'),0) insufficient,COALESCE(SUM(status='failed'),0) failed,COALESCE(SUM(status='processing'),0) processing,AVG(CASE WHEN status<>'processing' AND latency_ms IS NOT NULL AND latency_ms>=0 THEN latency_ms END) averageLatencyMs,COUNT(CASE WHEN status<>'processing' AND latency_ms IS NOT NULL AND latency_ms>=0 THEN 1 END) latencySamples FROM qa_messages WHERE role='user' AND created_at>=? AND created_at<?",args);
 const origins=await one("SELECT COALESCE(SUM(answer_origin='grounded'),0) grounded,COALESCE(SUM(answer_origin='general'),0) general,COALESCE(SUM(answer_origin='unknown'),0) unknown FROM qa_messages WHERE role='user' AND status='answered' AND created_at>=? AND created_at<?",args);
 for(const key of Object.keys(origins))origins[key]=Number(origins[key]);
 const daily=async(table,extra)=> (await db.execute(`SELECT DATE_FORMAT(DATE_ADD(created_at,INTERVAL 7 HOUR),'%Y-%m-%d') day,COUNT(*) count FROM ${table} WHERE created_at>=? AND created_at<? ${extra} GROUP BY day ORDER BY day`,args))[0];
 const questionDays=await daily('qa_messages',"AND role='user'");const uploadDays=await daily('documents','');
 const [recentDocuments]=await db.query("SELECT CAST(d.id AS CHAR) id,d.original_name fileName,u.full_name uploader,c.name courseName,d.created_at createdAt,d.status FROM documents d JOIN users u ON u.id=d.user_id JOIN courses c ON c.id=d.course_id WHERE d.deleted_at IS NULL AND d.status NOT IN ('deleting','deleted') ORDER BY d.created_at DESC,d.id DESC LIMIT 8");
 const [audit]=await db.query('SELECT CAST(a.id AS CHAR) id,u.full_name actor,a.action,a.entity_type entityType,CAST(a.entity_id AS CHAR) entityId,a.created_at createdAt FROM audit_logs a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id DESC LIMIT 8');
 const [embedding]=await db.query('SELECT DISTINCT model,model_revision revision,dimension,metric FROM course_indexes');
 await db.commit();
 const fill=rows=>{const map=new Map(rows.map(r=>[r.day,Number(r.count)]));return range.dates.map(day=>({day,count:map.get(day)??0}));};
 for(const key of Object.keys(users))users[key]=Number(users[key]);for(const key of Object.keys(activity))activity[key]=activity[key]===null?null:Number(activity[key]);
 const completed=activity.answered+activity.insufficient;
 return {updatedAt:new Date().toISOString(),timezone:'Asia/Ho_Chi_Minh',range:{start:range.start,end:range.end},totals:{users,courses:Number(courses.total),documents},activity:{...activity,origins,insufficientRate:completed?activity.insufficient/completed:null},charts:{questions:fill(questionDays),uploads:fill(uploadDays),documentStates:states.map(r=>({status:r.status,count:Number(r.count)}))},recentDocuments,audit,configuration:{llmModel:config.LLM_MODEL||null,llmProvider:config.LLM_PROVIDER,embedding,ragTopK:config.RAG_TOP_K,ragScoreThreshold:config.RAG_SCORE_THRESHOLD,retrievalCandidates:CHAT_RETRIEVAL_CANDIDATES},notes:['Phân bố nguồn chỉ tính status answered trên message user: grounded/general được ghi từ phiên bản015; dữ liệu cũ unknown, không suy đoán từ model/citations.','Tỷ lệ thiếu ngữ cảnh hiện tính mọi answered, bao gồm general và unknown; không phải tỷ lệ riêng grounded.','Hoạt động hỏi đáp chỉ tính hội thoại còn lưu; xóa hội thoại làm giảm thống kê lịch sử.','Latency toàn luồng chỉ ghi trên message user từ phiên bản dashboard; lịch sử chưa đo không được suy diễn.','Biểu đồ upload tính bản ghi tải lên còn trong DB, kể cả trạng thái deleting/deleted; thẻ và phân bố trạng thái chỉ tính tài liệu đang sử dụng.','Cấu hình LLM là cấu hình API hiện tại; embedding lấy từ index đã lưu, không khẳng định dịch vụ/model đang hoạt động.']};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
