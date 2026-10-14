import { AppError } from '../../../shared/AppError.js';
import { documentDto,privatePdfContent } from '../../documents/service.js';
export const adminDocumentDto=row=>({...documentDto(row),courseName:row.course_name,uploadedBy:{id:String(row.user_id),fullName:row.owner_name,email:row.owner_email,role:row.owner_role,status:row.owner_status}});
export function adminDocumentService(repository,config,deleteDocument){
 const get=async id=>{const row=await repository.get(id);if(!row)throw new AppError(404,'DOCUMENT_NOT_FOUND','Không tìm thấy tài liệu.');return row;};
 return {
  async courses(filters){const result=await repository.courses(filters);return {data:result.rows.map(row=>({id:String(row.id),name:row.name,userId:String(row.user_id),ownerName:row.owner_name})),meta:{page:filters.page,pageSize:filters.pageSize,total:result.total}};},
  async list(filters){const result=await repository.list(filters);return {data:result.rows.map(adminDocumentDto),meta:{page:filters.page,pageSize:filters.pageSize,total:result.total}};},
  async get(id){return adminDocumentDto(await get(id));},
  async content(id){return privatePdfContent(await get(id),config);},
  remove:(auth,id)=>deleteDocument(auth.user,id,{csrfToken:auth.csrfToken}),
 };
}
