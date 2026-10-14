import { UserRound } from 'lucide-react';
import { SectionHeading } from '../../components/SectionHeading.jsx';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProfile, updateProfile, uploadAvatar } from './api.js';
import { useAuth, sessionKey } from '../auth/useAuth.js';
import { FormField } from '../../components/FormField.jsx';
import { StatusPanel } from '../../components/StatusPanel.jsx';
import { Avatar } from './Avatar.jsx';
const schema = z.object({ fullName: z.string().transform(v => v.trim().normalize('NFC')).refine(v => [...v].length >= 2 && [...v].length <= 100, 'Họ tên phải có 2–100 ký tự.') });
function ProfileForm({ user }) {
  const { data: auth } = useAuth();
  const client = useQueryClient();
  const [notice, setNotice] = useState('');
  const [fileError, setFileError] = useState('');
  const fileInput = useRef(null);
  const { register, handleSubmit, reset, setError, formState: { errors, isDirty } } = useForm({ resolver: zodResolver(schema), defaultValues: { fullName: user.fullName } });
  const updateCaches = async data => {
    await Promise.all([client.cancelQueries({ queryKey: sessionKey }), client.cancelQueries({ queryKey: ['profile', 'me'] })]);
    if (client.getQueryData(sessionKey)?.user.id !== data.id) return;
    client.setQueryData(sessionKey, current => ({ ...current, user: data }));
    client.setQueryData(['profile', 'me', data.id], data);
  };
  const save = useMutation({ mutationFn: input => updateProfile(input, auth.csrfToken), onSuccess: async data => { await updateCaches(data); reset({ fullName: data.fullName }); setNotice('Đã lưu hồ sơ.'); },
    onError: error => { for (const [key, message] of Object.entries(error.fields ?? {})) setError(key, { message }); } });
  const avatar = useMutation({ mutationFn: file => uploadAvatar(file, auth.csrfToken), onSuccess: async data => {
    await updateCaches(data); await client.invalidateQueries({ queryKey: ['profile', 'avatar'] }); setNotice('Đã cập nhật ảnh đại diện.');
  } });
  const pickAvatar = event => {
    const file = event.target.files?.[0]; setFileError(''); setNotice('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) setFileError('Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
    else if (file.size > 2 * 1024 ** 2) setFileError('Ảnh đại diện tối đa 2 MB.');
    else avatar.mutate(file);
    event.target.value = '';
  };
  return <section className="profile-card"><SectionHeading icon={UserRound} eyebrow="TÀI KHOẢN CỦA BẠN" title="Thông tin cá nhân"/><div className="avatar-row"><Avatar user={user}/><div>
    <label htmlFor="avatar-file">Ảnh đại diện</label><input ref={fileInput} id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={pickAvatar} disabled={avatar.isPending}/>
    <p className="hint">JPEG, PNG hoặc WebP, tối đa 2 MB. Metadata ảnh sẽ được loại bỏ.</p>{user.avatarStorageStatus&&<p role={user.avatarStorageStatus==='failed'?'alert':'status'}>Cloudinary: {user.avatarStorageStatus==='uploaded'?'Đã lưu cloud':user.avatarStorageStatus==='failed'?'Lưu cloud thất bại; hãy kiểm tra cấu hình và tải lại ảnh.':'Đang chờ đồng bộ cloud. Ảnh hiện có trong cache riêng tư.'}</p>}</div></div>
    {avatar.isPending && <p role="status">Đang cập nhật ảnh…</p>}{(fileError || avatar.isError) && <p role="alert" className="field-error">{fileError || avatar.error.message}</p>}
    <form onSubmit={handleSubmit(input => { setNotice(''); if (!save.isPending) save.mutate(input); })} noValidate>
      <FormField label="Họ tên" id="profile-name" error={errors.fullName?.message}><input id="profile-name" {...register('fullName')} autoComplete="name" aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? 'profile-name-error' : undefined}/></FormField>
      <FormField label="Email" id="profile-email"><input id="profile-email" value={user.email} readOnly/></FormField>
      {save.isError && <p role="alert" className="field-error">{save.error.message}</p>}
      <div className="actions"><button type="button" disabled={save.isPending} onClick={() => { reset({ fullName: user.fullName }); setNotice(''); }}>Hủy thay đổi</button><button className="primary" type="submit" disabled={!isDirty || save.isPending}>{save.isPending ? 'Đang lưu…' : 'Lưu hồ sơ'}</button></div>
    </form>{notice && <p role="status" className="success-text">{notice}</p>}</section>;
}
export function ProfilePage() {
  const { data: auth } = useAuth();
  const profile = useQuery({ queryKey: ['profile', 'me', auth?.user.id], queryFn: getProfile, retry: false,
    refetchInterval: query => ['queued','uploading'].includes(query.state.data?.avatarStorageStatus) ? 3000 : false });
  if (profile.isPending) return <StatusPanel title="Đang tải hồ sơ…"/>;
  if (profile.isError) return <StatusPanel title="Không thể tải hồ sơ" retry={() => profile.refetch()}><p>{profile.error.message}</p></StatusPanel>;
  return <ProfileForm user={profile.data}/>;
}
