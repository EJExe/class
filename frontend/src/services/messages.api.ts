import { apiRequest } from './apiClient';

export function getMessages(token: string, channelId: string, cursor?: string, limit?: number) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const suffix = params.size ? `?${params.toString()}` : '';
  return apiRequest<{ items: Array<any>; nextCursor: string | null }>(`/channels/${channelId}/messages${suffix}`, {}, token);
}

export function searchMessages(token: string, channelId: string, query: string, limit = 30) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  return apiRequest<Array<any>>(`/channels/${channelId}/messages/search?${params.toString()}`, {}, token);
}

export function markChannelRead(token: string, channelId: string) {
  return apiRequest<any>(`/channels/${channelId}/read`, { method: 'PATCH' }, token);
}

export function sendMessage(token: string, channelId: string, content: string, files: File[] = []) {
  if (files.length > 0) {
    const formData = new FormData();
    formData.set('content', content);
    files.forEach((file) => formData.append('files', file));
    return apiRequest<any>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: formData,
    }, token);
  }

  return apiRequest<any>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  }, token);
}

export function deleteMessage(token: string, messageId: string) {
  return apiRequest<{ id: string; deletedAt: string }>(`/messages/${messageId}`, { method: 'DELETE' }, token);
}

export function updateMessage(token: string, messageId: string, content: string) {
  return apiRequest<any>(`/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  }, token);
}

export function addMessageReaction(token: string, messageId: string, emoji: string) {
  return apiRequest<any>(`/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  }, token);
}

export function removeMessageReaction(token: string, messageId: string, emoji: string) {
  return apiRequest<any>(`/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`, {
    method: 'DELETE',
  }, token);
}

