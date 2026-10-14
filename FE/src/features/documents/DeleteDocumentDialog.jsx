import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth.js';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { deleteDocument } from './api.js';
export function DeleteDocumentDialog({ document, courseId, onAccepted, removeDocument = deleteDocument, queryScope = 'student' }) {
  const { data: auth } = useAuth(); const client = useQueryClient();
  const [open, setOpen] = useState(false); const locked = useRef(false);
  const mutation = useMutation({ retry: false, mutationFn: () => removeDocument(document.id, auth.csrfToken),
    onSuccess: async result => {
      setOpen(false);
      if(queryScope==='admin'){
        client.setQueryData(['admin','documents','detail',auth.user.id,document.id],{...document,status:result.status,errorMessage:null,deletionRetryable:false});
        onAccepted(document.id,result.status);
        await Promise.all([client.invalidateQueries({queryKey:['admin','documents','list',auth.user.id]}),client.invalidateQueries({queryKey:['admin','documents','detail',auth.user.id,document.id]})]);
        return;
      }
      client.setQueryData(['documents','detail',auth.user.id,document.id], { ...document, status: result.status, errorMessage: null, deletionRetryable: false });
      onAccepted(document.id, result.status);
      client.setQueriesData({ queryKey: ['documents','list',auth.user.id,courseId] }, previous => previous ? { ...previous,
        data: previous.data.map(row => row.id === document.id ? { ...row, status: result.status, errorMessage: null, deletionRetryable: false } : row) } : previous);
      await Promise.all([client.invalidateQueries({ queryKey: ['documents','list',auth.user.id,courseId] }),
        client.invalidateQueries({ queryKey: ['documents','detail',auth.user.id,document.id] }), client.invalidateQueries({ queryKey: ['courses'] })]);
    }, onSettled: () => { locked.current = false; } });
  const changeOpen = next => { if (locked.current) return; setOpen(next); mutation.reset(); };
  const submit = () => { if (locked.current) return; locked.current = true; mutation.mutate(); };
  if (document.status === 'deleted') return null;
  return <><Button disabled={document.status === 'deleting' && !document.deletionRetryable} onClick={() => changeOpen(true)}>
    {document.deletionRetryable ? 'Thử xóa lại' : document.status === 'deleting' ? 'Đang xóa…' : 'Xóa PDF'}</Button>
    <Modal open={open} onOpenChange={changeOpen} title={document.deletionRetryable ? 'Tiếp tục xóa tài liệu' : 'Xóa tài liệu PDF'}
      description={`Tài liệu: ${document.fileName}`}>
      <p>Tài liệu này sẽ không thể mở hoặc dùng làm nguồn ngay khi yêu cầu xóa được tiếp nhận. File và nội dung đã xử lý sẽ được xóa; các tài liệu khác trong môn học được giữ lại.</p>
      <p>Lịch sử hỏi đáp giữ trích đoạn đã lưu, nhưng không còn mở được nguồn PDF này.</p>
      {mutation.isError && <p role="alert" className="field-error">{mutation.error.message}</p>}
      <div className="actions"><Button disabled={mutation.isPending} onClick={() => changeOpen(false)}>Hủy</Button>
        <Button disabled={mutation.isPending} onClick={submit}>{mutation.isPending ? 'Đang gửi…' : 'Xác nhận xóa'}</Button></div>
    </Modal></>;
}
