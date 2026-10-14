import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/Modal.jsx';
import { FormField } from '../../components/FormField.jsx';
import { useAuth } from '../auth/useAuth.js';
import { courseSchema } from './schema.js';
import { Plus, Pencil } from 'lucide-react';
import { createCourse, updateCourse } from './api.js';
export function CourseDialog({ course, trigger, onSaved }) {
  const [open, setOpen] = useState(false);
  const triggerButton = useRef(null);
  return <><button className={course ? 'course-edit' : 'primary'} ref={triggerButton} onClick={() => setOpen(true)}>{course ? <Pencil size={16} aria-hidden="true"/> : <Plus size={18} aria-hidden="true"/>}{trigger}</button>
    {open && <CourseEditor course={course} onSaved={onSaved} close={() => { setOpen(false); queueMicrotask(() => triggerButton.current?.focus()); }} />}</>;
}
function CourseEditor({ course, close, onSaved }) {
  const { data: auth } = useAuth();
  const client = useQueryClient();
  const lock = useRef(false);
  const { register, handleSubmit, setError, formState: { errors } } = useForm({ resolver: zodResolver(courseSchema), defaultValues: { name: course?.name ?? '', description: course?.description ?? '' } });
  const mutation = useMutation({
    mutationFn: input => course ? updateCourse(course.id, input, auth.csrfToken) : createCourse(input, auth.csrfToken),
    onSuccess: async data => { client.setQueryData(['courses', 'detail', auth.user.id, data.id], data); await client.invalidateQueries({ queryKey: ['courses', 'list'] }); onSaved?.(); close(); },
    onError: error => { for (const [name, message] of Object.entries(error.fields ?? {})) setError(name, { message }); }
  });
  const submit = async input => {
    if (lock.current) return; lock.current = true;
    try { await mutation.mutateAsync(input); } catch { /* Display mutation error. */ } finally { lock.current = false; }
  };
  return <Modal open title={course ? 'Sửa môn học' : 'Tạo môn học'} description="Môn học chỉ thuộc tài khoản của bạn." onOpenChange={value => { if (!value && !mutation.isPending) close(); }}>
    <form onSubmit={event => { void handleSubmit(submit)(event); }} noValidate>
      <FormField label="Tên môn học" id="course-name" error={errors.name?.message}><input id="course-name" {...register('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'course-name-error' : undefined} /></FormField>
      <FormField label="Mô tả" id="course-description" error={errors.description?.message}><textarea id="course-description" {...register('description')} rows={4} aria-invalid={!!errors.description} /></FormField>
      {mutation.isError && <p role="alert" className="field-error">{mutation.error.message}</p>}
      <div className="actions"><button type="button" onClick={close} disabled={mutation.isPending}>Hủy</button><button className="primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Đang lưu…' : 'Lưu môn học'}</button></div>
    </form></Modal>;
}
