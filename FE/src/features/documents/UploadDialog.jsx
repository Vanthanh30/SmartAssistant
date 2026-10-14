import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useAuth } from '../auth/useAuth.js';
import { uploadPdf } from './api.js';
import { Upload } from 'lucide-react';
export function UploadDialog({ courseId, limits, onUploaded }) {
  const { data: auth } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const lock = useRef(false); const trigger = useRef(null);
  const maxBytes = limits?.maxFileBytes ?? 20 * 1024 ** 2;
  const mutation = useMutation({ mutationFn: selected => uploadPdf(courseId, selected, auth.csrfToken),
    onSuccess: async result => {
      await client.invalidateQueries({ queryKey: ['documents', 'list', auth.user.id, courseId] });
      setOpen(false); setFile(null); onUploaded(result); queueMicrotask(() => trigger.current?.focus());
    }, onSettled: () => { lock.current = false; } });
  const changeOpen = next => { if (lock.current || mutation.isPending) return; setOpen(next); setFile(null); setError(''); mutation.reset(); if (!next) queueMicrotask(() => trigger.current?.focus()); };
  const submit = event => {
    event.preventDefault(); if (lock.current) return; setError('');
    if (!file) return setError('Chọn một file PDF.');
    if (!/\.pdf$/i.test(file.name) || file.type !== 'application/pdf') return setError('Chỉ nhận file .pdf có định dạng application/pdf.');
    if (!file.size || file.size > maxBytes) return setError(`PDF phải có dữ liệu và không quá ${Math.floor(maxBytes / 1024 ** 2)} MB.`);
    lock.current = true; mutation.mutate(file);
  };
  return <><Button variant="primary" ref={trigger} onClick={() => changeOpen(true)}><Upload size={17} aria-hidden="true"/>Tải PDF</Button>
    <Modal open={open} onOpenChange={changeOpen} title="Tải tài liệu PDF" description="Tài liệu được lưu riêng tư trong môn học của bạn.">
      <form onSubmit={submit} noValidate><p>Chỉ nhận PDF có lớp văn bản, tối đa {Math.floor(maxBytes / 1024 ** 2)} MB/file. Không hỗ trợ OCR; bảng, hình và công thức có thể trích xuất không đầy đủ.</p>
        <p className="privacy-notice">PDF được lưu riêng tư trên Cloudinary khi dịch vụ được cấu hình. Máy chủ giữ cache phục vụ trích xuất và xem PDF. Hỏi đáp có nguồn phù hợp dùng trích đoạn tại máy chủ; khi không có nguồn phù hợp, chỉ câu hỏi được gửi tới OpenAI. Tạo quiz/flashcard vẫn gửi trích đoạn tới LLM. Email đăng ký sẽ nhận thông báo khi tài liệu sẵn sàng hoặc xử lý thất bại.</p>
        {limits && <p className="hint">Hạn mức: {limits.maxDocumentsPerCourse} tài liệu/môn; {Math.floor(limits.maxCourseBytes / 1024 ** 2)} MB/môn và {Math.floor(limits.maxUserBytes / 1024 ** 2)} MB/tài khoản.</p>}
        <label htmlFor="pdf-upload">File PDF</label><input id="pdf-upload" type="file" accept="application/pdf,.pdf" disabled={mutation.isPending} aria-describedby="pdf-upload-error" onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); mutation.reset(); }}/>
        {(error || mutation.isError) && <p id="pdf-upload-error" role="alert" className="field-error">{error || mutation.error.message}</p>}
        {mutation.isPending && <p role="status">Đang tải PDF lên máy chủ…</p>}
        <div className="actions"><Button disabled={mutation.isPending} onClick={() => changeOpen(false)}>Hủy</Button><Button variant="primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Đang tải…' : 'Tải lên'}</Button></div>
      </form></Modal></>;
}
