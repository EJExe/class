import { apiRequest } from './apiClient';

export type SessionResponse = {
  token: string;
  user: { id: string; nickname: string };
  expiresAt: string;
};

export function createSession(nickname: string, password?: string) {
  return apiRequest<SessionResponse>('/session', {
    method: 'POST',
    body: JSON.stringify({ nickname, password: password || undefined }),
  });
}

export function deleteSession(token: string) {
  return apiRequest<{ ok: boolean }>('/session', { method: 'DELETE' }, token);
}

export function getMe(token: string) {
  return apiRequest<{ id: string; nickname: string; lastSeenAt: string }>('/me', {}, token);
}

