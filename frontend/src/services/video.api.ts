import { apiRequest } from './apiClient';

export function getCourseVideoRoom(token: string, courseId: string) {
  return apiRequest<any>(`/courses/${courseId}/video-room`, {}, token);
}

export function getVideoParticipants(token: string, roomId: string) {
  return apiRequest<Array<any>>(`/video-rooms/${roomId}/participants`, {}, token);
}

export function kickVideoParticipant(token: string, roomId: string, userId: string) {
  return apiRequest<any>(`/video-rooms/${roomId}/participants/${userId}`, { method: 'DELETE' }, token);
}
