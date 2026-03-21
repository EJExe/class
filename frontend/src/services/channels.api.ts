import { apiRequest } from './apiClient';

export function listChannels(token: string, courseId: string) {
  return apiRequest<Array<any>>(`/courses/${courseId}/channels`, {}, token);
}

export function createChannel(token: string, courseId: string, name: string) {
  return apiRequest<any>(`/courses/${courseId}/channels`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  }, token);
}

