import { apiRequest } from './apiClient';

export function listCourses(token: string) {
  return apiRequest<Array<any>>('/courses', {}, token);
}

export function createCourse(token: string, payload: { title: string; description?: string }) {
  return apiRequest<any>('/courses', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function updateCourse(token: string, id: string, payload: { title?: string; description?: string }) {
  return apiRequest<any>(`/courses/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
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

export function updateMemberRole(token: string, courseId: string, userId: string, role: string) {
  return apiRequest<any>(
    `/courses/${courseId}/members/${userId}/role`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
    token,
  );
}

export function getRoles(token: string, courseId: string) {
  return apiRequest<Array<any>>(`/courses/${courseId}/roles`, {}, token);
}

export function listGroups(token: string, courseId: string) {
  return apiRequest<Array<any>>(`/courses/${courseId}/groups`, {}, token);
}

export function createGroup(token: string, courseId: string, name: string) {
  return apiRequest<any>(`/courses/${courseId}/groups`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  }, token);
}

export function addGroupMember(token: string, groupId: string, userId: string) {
  return apiRequest<any>(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  }, token);
}

export function removeGroupMember(token: string, groupId: string, userId: string) {
  return apiRequest<any>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }, token);
}
