import { apiRequest } from './apiClient';

export function listNotifications(token: string, cursor?: string) {
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiRequest<Array<any>>(`/notifications${suffix}`, {}, token);
}

export function markNotificationRead(token: string, id: string) {
  return apiRequest<any>(`/notifications/${id}/read`, { method: 'PATCH' }, token);
}

export function markAllNotificationsRead(token: string) {
  return apiRequest<any>('/notifications/read-all', { method: 'PATCH' }, token);
}
