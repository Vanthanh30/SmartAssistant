import { useRef,useState } from 'react';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth.js';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { deleteConversation } from './api.js';
export function DeleteConversationDialog({ conversation,onDeleted }) {
 const {data:auth}=useAuth();const client=useQueryClient();const [open,setOpen]=useState(false);const lock=useRef(false);const trigger=useRef(null);
 const mutation=useMutation({retry:false,mutationFn:()=>deleteConversation(conversation.id,auth.csrfToken),
  onSuccess:async()=>{
   setOpen(false);onDeleted?.();
   await client.cancelQueries({queryKey:['history','detail',auth.user.id,conversation.id]});
   await client.cancelQueries({queryKey:['chat',auth.user.id,conversation.courseId,conversation.id]});
   client.removeQueries({queryKey:['history','detail',auth.user.id,conversation.id]});
   client.removeQueries({queryKey:['chat',auth.user.id,conversation.courseId,conversation.id]});
   await client.invalidateQueries({queryKey:['history','list',auth.user.id]});
  },onSettled:()=>{lock.current=false;queueMicrotask(()=>trigger.current?.focus());} });
 const change=next=>{if(lock.current)return;setOpen(next);mutation.reset();if(!next)queueMicrotask(()=>trigger.current?.focus());};
 return <><button ref={trigger} onClick={()=>change(true)}>Xóa hội thoại</button><Modal open={open} onOpenChange={change} title="Xóa hội thoại" description={conversation.title}>
  <p>Xóa toàn bộ câu hỏi, câu trả lời và trích dẫn của hội thoại này. Không thể khôi phục. PDF và môn học vẫn được giữ nguyên.</p>
  {mutation.isError && <p role="alert">{mutation.error.message}</p>}
  <div className="actions"><Button disabled={mutation.isPending} onClick={()=>change(false)}>Hủy</Button><Button disabled={mutation.isPending} onClick={()=>{if(lock.current)return;lock.current=true;mutation.mutate();}}>{mutation.isPending ? 'Đang xóa…' : 'Xác nhận xóa'}</Button></div>
 </Modal></>;
}
