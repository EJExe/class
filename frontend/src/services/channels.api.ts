import { apiRequest } from './apiClient';

export function listChannels(token: string, courseId: string) {
  return apiRequest<Array<any>>(`/courses/${courseId}/channels`, {}, token);
}

export function getChannel(token: string, channelId: string) {
  return apiRequest<any>(`/channels/${channelId}`, {}, token);
}

export function createChannel(
  token: string,
  courseId: string,
  payload: {
    name: string;
    description?: string;
    type: 'text' | 'assignment';
    groupIds?: string[];
    assignmentTitle?: string;
    assignmentDescription?: string;
    assignmentDeadlineAt?: string;
  },
) {
  return apiRequest<any>(`/courses/${courseId}/channels`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function updateChannel(
  token: string,
  channelId: string,
  payload: { name?: string; description?: string; groupIds?: string[] },
) {
  return apiRequest<any>(`/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, token);
}
