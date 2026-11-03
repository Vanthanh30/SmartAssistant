export const userDto = user => ({ id: String(user.id), fullName: user.full_name, email: user.email,
  role: user.role, status: user.status,
  avatarStorageStatus: user.avatar_storage_status ?? null,
  avatarUrl: user.avatar_key ? `/api/v1/users/me/avatar?v=${encodeURIComponent(user.avatar_key)}` : null });
