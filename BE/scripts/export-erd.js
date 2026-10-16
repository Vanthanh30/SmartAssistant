import {writeFile} from 'node:fs/promises';
import {loadConfig} from '../src/config/env.js';
import {createPool} from '../src/config/db.js';
const pool=createPool(loadConfig());
try{
 const [tables]=await pool.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
 const [columns]=await pool.query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,DATA_TYPE,IS_NULLABLE,COLUMN_KEY,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
 const [keys]=await pool.query('SELECT TABLE_NAME,COLUMN_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME,ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION');
 const [indexes]=await pool.query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX');
 const [rules]=await pool.query('SELECT TABLE_NAME,CONSTRAINT_NAME,UPDATE_RULE,DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()');
 const grouped=new Map();for(const k of keys.filter(k=>k.REFERENCED_TABLE_NAME)){const key=k.TABLE_NAME+':'+k.CONSTRAINT_NAME;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(k);}
 const lines=['# ERD vật lý hiện tại — database tiếng Việt','',`Xuất từ schema thực tế: **${tables.length} bảng, ${grouped.size} FK**, ngày 16/10/2026. Không xuất dữ liệu, mật khẩu hoặc token.`, '', '```mermaid','erDiagram'];
 for(const {TABLE_NAME:table}of tables){lines.push('    '+table+' {');for(const c of columns.filter(c=>c.TABLE_NAME===table)){
 const flags=[];if(c.COLUMN_KEY==='PRI')flags.push('PK');if(keys.some(k=>k.TABLE_NAME===table&&k.COLUMN_NAME===c.COLUMN_NAME&&k.REFERENCED_TABLE_NAME))flags.push('FK');if(c.COLUMN_KEY==='UNI')flags.push('UK');
 lines.push(`        ${c.DATA_TYPE} ${c.COLUMN_NAME}${flags.length?' '+flags.join(','):''} "${c.IS_NULLABLE==='YES'?'nullable':'not null'}"`);
 }lines.push('    }');}
 for(const group of grouped.values()){
  const first=group[0],cols=group.map(k=>k.COLUMN_NAME);const optional=cols.some(col=>columns.some(c=>c.TABLE_NAME===first.TABLE_NAME&&c.COLUMN_NAME===col&&c.IS_NULLABLE==='YES'));
  const names=[...new Set(indexes.filter(i=>i.TABLE_NAME===first.TABLE_NAME&&!i.NON_UNIQUE).map(i=>i.INDEX_NAME))];const one=names.some(name=>{const parts=indexes.filter(i=>i.TABLE_NAME===first.TABLE_NAME&&i.INDEX_NAME===name);return parts.length===cols.length&&parts.every(p=>cols.includes(p.COLUMN_NAME));});
  lines.push(`    ${first.REFERENCED_TABLE_NAME} ${optional?'|o':'||'}--${one?'o|':'o{'} ${first.TABLE_NAME} : "${cols.join(', ')}"`);
 }
 lines.push('```','','## Cột, index và khóa ngoại');
 for(const {TABLE_NAME:table}of tables){lines.push('',`### ${table}`,'','| Cột | Kiểu MySQL | Nullable | Key |','|---|---|---|---|');for(const c of columns.filter(c=>c.TABLE_NAME===table))lines.push(`| ${c.COLUMN_NAME} | ${c.COLUMN_TYPE} | ${c.IS_NULLABLE} | ${c.COLUMN_KEY} |`);
 lines.push('','Indexes:','');for(const name of new Set(indexes.filter(i=>i.TABLE_NAME===table).map(i=>i.INDEX_NAME))){const parts=indexes.filter(i=>i.TABLE_NAME===table&&i.INDEX_NAME===name);lines.push(`- ${name}: ${parts[0].NON_UNIQUE?'INDEX':'UNIQUE'} (${parts.map(i=>i.COLUMN_NAME).join(', ')}).`);}
 for(const group of [...grouped.values()].filter(g=>g[0].TABLE_NAME===table)){const r=rules.find(r=>r.TABLE_NAME===table&&r.CONSTRAINT_NAME===group[0].CONSTRAINT_NAME);lines.push(`- FK ${group[0].CONSTRAINT_NAME}: (${group.map(g=>g.COLUMN_NAME).join(', ')}) → ${group[0].REFERENCED_TABLE_NAME}(${group.map(g=>g.REFERENCED_COLUMN_NAME).join(', ')}), DELETE ${r.DELETE_RULE}, UPDATE ${r.UPDATE_RULE}.`);}}
 lines.push('','## Quy ước vận hành','','- Quiz/flashcard dùng chung bo_hoc_tap và muc_hoc_tap, loai giữ quiz/flashcards. Enum nghiệp vụ không Việt hóa giá trị.','- tai_lieu giữ public ID/type Cloudinary; nguoi_dung giữ public ID avatar. File gốc private trên cloud, upload pending được spool tạm đến khi xác minh cloud.','- tac_vu_pdf giữ upload_pdf/extract_pdf/prepare_source/delete_pdf, lease/retry và unique tài liệu/loại tác vụ.','- Không có cloud_assets/mail_outbox/admin_status_guard/schema_migrations/schema_migration_runs hoặc bảng tiếng Anh song song.','- SQL tạo mới: BE/database/schema.sql. Backend không tự tạo/reset DB khi khởi động.','- Quan hệ composite ownership được giữ; quyền application và kiểm item thuộc bộ không được thay bằng FK giả.','');
 await writeFile(new URL('../../docs/ERD_CURRENT.md',import.meta.url),lines.join('\n'),'utf8');console.log(JSON.stringify({tables:tables.length,foreignKeys:grouped.size,columns:columns.length,file:'docs/ERD_CURRENT.md'}));
}finally{await pool.end();}
