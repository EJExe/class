import { apiRequest } from './apiClient';

export function listCourses(token: string) {
  return apiRequest<Array<any>>('/courses', {}, token);
}

export function createCourse(token: string, payload: { title: string; description?: string }) {
  return apiRequest<any>('/courses', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function joinCourse(token: string, inviteCode: string) {
  return apiRequest<any>('/courses/join', { method: 'POST', body: JSON.stringify({ inviteCode }) }, token);
}

export function getCourse(token: string, id: string) {
  return apiRequest<any>(`/courses/${id}`, {}, token);
}

export function getCourseMembers(token: string, id: string) {
  return apiRequest<Array<any>>(`/courses/${id}/members`, {}, token);
}

