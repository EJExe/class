import { apiRequest } from './apiClient';

export type AuthUser = {
  id: string;
  login: string | null;
  email: string | null;
  nickname: string;
  fullName: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  lastSeenAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
  expiresAt: string;
};

export function login(login: string, password: string) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  });
}

export function register(payload: {
  login: string;
  email: string;
  password: string;
  fullName: string;
  birthDate: string;
  nickname?: string;
}) {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteSession(token: string) {
  return apiRequest<{ ok: boolean }>('/session', { method: 'DELETE' }, token);
}

export function getMe(token: string) {
  return apiRequest<AuthUser>('/me', {}, token);
}

export function updateProfile(
  token: string,
  payload: {
    login?: string;
    email?: string;
    nickname?: string;
    fullName?: string;
    birthDate?: string;
    currentPassword?: string;
    newPassword?: string;
  },
) {
  return apiRequest<AuthUser>('/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, token);
}

export function uploadAvatar(token: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<AuthUser>('/me/avatar', {
    method: 'POST',
    body: formData,
  }, token);
}
