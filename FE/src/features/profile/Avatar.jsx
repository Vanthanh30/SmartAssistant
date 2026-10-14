import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAvatar } from './api.js';
export function Avatar({ user }) {
  const image = useRef(null);
  const avatar = useQuery({ queryKey: ['profile', 'avatar', user.id, user.avatarUrl], queryFn: getAvatar,
    enabled: !!user.avatarUrl, retry: false, staleTime: 60000 });
  useEffect(() => {
    if (!avatar.data || !image.current) return;
    const url = URL.createObjectURL(avatar.data);
    image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [avatar.data]);
  return avatar.data ? <img ref={image} className="avatar" alt="Ảnh đại diện"/> : <span className="avatar avatar-fallback" aria-label={avatar.isError ? 'Không thể tải ảnh đại diện' : 'Chưa có ảnh đại diện'}>{[...user.fullName][0]}</span>;
}
