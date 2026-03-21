import { apiRequest } from './apiClient';

export function getMessages(token: string, channelId: string, cursor?: string) {
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiRequest<{ items: Array<any>; nextCursor: string | null }>(`/channels/${channelId}/messages${suffix}`, {}, token);
}

export function sendMessage(token: string, channelId: string, content: string) {
  return apiRequest<any>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  }, token);
}

export function deleteMessage(token: string, messageId: string) {
  return apiRequest<{ id: string; deletedAt: string }>(`/messages/${messageId}`, { method: 'DELETE' }, token);
}

