import { apiRequest } from './apiClient';

export function listNotifications(token: string, cursor?: string, limit?: number) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const suffix = params.size ? `?${params.toString()}` : '';
  return apiRequest<Array<any>>(`/notifications${suffix}`, {}, token);
}

export function markNotificationRead(token: string, id: string) {
  return apiRequest<any>(`/notifications/${id}/read`, { method: 'PATCH' }, token);
}

export function markAllNotificationsRead(token: string) {
  return apiRequest<any>('/notifications/read-all', { method: 'PATCH' }, token);
}
