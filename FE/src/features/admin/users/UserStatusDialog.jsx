import { useRef,useState } from 'react';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth,sessionKey } from '../../auth/useAuth.js';
import { Modal } from '../../../components/Modal.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { setUserStatus } from './api.js';
export function UserStatusDialog({user,onSaved}){
 const {data:auth}=useAuth();const client=useQueryClient();const navigate=useNavigate();const [open,setOpen]=useState(false);
 const lock=useRef(false);const trigger=useRef(null);const [desired,setDesired]=useState('blocked');
 const mutation=useMutation({retry:false,mutationFn:()=>setUserStatus(user.id,desired,auth.csrfToken),
  onSuccess:async updated=>{
   setOpen(false);
   if(updated.id===auth.user.id && updated.status==='blocked'){
    await client.cancelQueries();client.setQueryData(sessionKey,null);client.removeQueries({predicate:query=>query.queryKey[0]!=='auth'});navigate('/login',{replace:true});return;
   }
   client.setQueryData(['admin','users','detail',auth.user.id,user.id],updated);
   await client.invalidateQueries({queryKey:['admin','users','list',auth.user.id]});onSaved?.();
  },onSettled:()=>{lock.current=false;queueMicrotask(()=>trigger.current?.focus());} });
 const change=next=>{if(lock.current)return;mutation.reset();if(next)setDesired(user.status==='active' ? 'blocked' : 'active');setOpen(next);if(!next)queueMicrotask(()=>trigger.current?.focus());};
 return <><button ref={trigger} onClick={()=>change(true)}>{user.status==='active' ? 'Khóa tài khoản' : 'Mở khóa'}</button>
  <Modal open={open} onOpenChange={change} title={desired==='blocked' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'} description={`${user.fullName} · ${user.email}`}>
   <p>{desired==='blocked' ? 'Tài khoản sẽ không thể đăng nhập hoặc tiếp tục sử dụng các phiên hiện tại. PDF, môn học và lịch sử vẫn được giữ.' : 'Người dùng có thể đăng nhập lại. Các phiên đã thu hồi sẽ không được khôi phục.'}</p>
   {user.role==='admin' && desired==='blocked' && <p>Hệ thống sẽ từ chối khóa nếu đây là quản trị viên hoạt động cuối cùng.</p>}
   {user.id===auth.user.id && desired==='blocked' && <p role="status">Bạn đang khóa tài khoản của chính mình và sẽ bị đăng xuất khi thao tác thành công.</p>}
   {mutation.isError && <p role="alert" className="field-error">{mutation.error.message}</p>}
   <div className="actions"><Button disabled={mutation.isPending} onClick={()=>change(false)}>Hủy</Button><Button disabled={mutation.isPending} onClick={()=>{if(lock.current)return;lock.current=true;mutation.mutate();}}>{mutation.isPending ? 'Đang lưu…' : 'Xác nhận'}</Button></div>
  </Modal></>;
}
