import { useState } from 'react';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../auth/useAuth.js';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/ui/Button.jsx';
export function DeleteCourseDialog({course}){
 const {data:auth}=useAuth(),client=useQueryClient(),navigate=useNavigate();const [open,setOpen]=useState(false);
 const remove=useMutation({mutationFn:()=>api('/courses/'+course.id,{method:'DELETE',csrfToken:auth.csrfToken}),onSuccess:()=>{client.invalidateQueries({queryKey:['courses']});navigate('/app/courses');}});
 return <><Button onClick={()=>{remove.reset();setOpen(true);}}>Xóa môn học</Button><Modal open={open} onOpenChange={value=>{if(!remove.isPending)setOpen(value);}} title="Xóa môn học?" description="Chỉ xóa được môn chưa có dữ liệu liên quan.">
  <p>{course.name}</p>{remove.isError&&<p role="alert">{remove.error.message}</p>}
  <div className="actions"><Button disabled={remove.isPending} onClick={()=>setOpen(false)}>Hủy</Button><Button disabled={remove.isPending} onClick={()=>remove.mutate()}>Xác nhận xóa</Button></div>
 </Modal></>;
}
