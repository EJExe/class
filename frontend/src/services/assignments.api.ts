import { apiRequest } from './apiClient';

export function getAssignment(token: string, assignmentId: string) {
  return apiRequest<any>(`/assignments/${assignmentId}`, {}, token);
}

export function updateAssignment(
  token: string,
  assignmentId: string,
  payload: { title?: string; description?: string; deadlineAt?: string; status?: string },
) {
  return apiRequest<any>(`/assignments/${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, token);
}

export function uploadAssignmentFile(token: string, assignmentId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<any>(`/assignments/${assignmentId}/files`, { method: 'POST', body: formData }, token);
}

export function listAssignmentFiles(token: string, assignmentId: string) {
  return apiRequest<Array<any>>(`/assignments/${assignmentId}/files`, {}, token);
}

export function deleteAssignmentFile(token: string, fileId: string) {
  return apiRequest<any>(`/assignment-files/${fileId}`, { method: 'DELETE' }, token);
}

export function uploadSubmission(token: string, assignmentId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<any>(`/assignments/${assignmentId}/submissions/upload`, { method: 'POST', body: formData }, token);
}

export function submitSubmission(token: string, assignmentId: string) {
  return apiRequest<any>(`/assignments/${assignmentId}/submissions/submit`, { method: 'POST' }, token);
}

export function getMySubmission(token: string, assignmentId: string) {
  return apiRequest<any>(`/assignments/${assignmentId}/my-submission`, {}, token);
}

export function listSubmissions(token: string, assignmentId: string, page = 1, limit = 20, status?: string) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (status) {
    query.set('status', status);
  }
  return apiRequest<any>(`/assignments/${assignmentId}/submissions?${query.toString()}`, {}, token);
}

export function getSubmission(token: string, submissionId: string) {
  return apiRequest<any>(`/submissions/${submissionId}`, {}, token);
}

export function updateSubmissionStatus(token: string, submissionId: string, status: string) {
  return apiRequest<any>(`/submissions/${submissionId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, token);
}

export function gradeSubmission(
  token: string,
  submissionId: string,
  payload: { grade?: string; teacherComment?: string; status?: string },
) {
  return apiRequest<any>(`/submissions/${submissionId}/grade`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, token);
}

export function getPrivateChat(token: string, assignmentId: string, studentUserId?: string) {
  const query = studentUserId ? `?studentUserId=${encodeURIComponent(studentUserId)}` : '';
  return apiRequest<any>(`/assignments/${assignmentId}/private-chat${query}`, {}, token);
}

export function listPrivateMessages(token: string, chatId: string) {
  return apiRequest<Array<any>>(`/private-chats/${chatId}/messages`, {}, token);
}

export function createPrivateMessage(token: string, chatId: string, content: string) {
  return apiRequest<any>(`/private-chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  }, token);
}

export function getAssignmentAuditLogs(token: string, assignmentId: string) {
  return apiRequest<Array<any>>(`/assignments/${assignmentId}/audit-logs`, {}, token);
}

export function getSubmissionActivity(token: string, submissionId: string) {
  return apiRequest<Array<any>>(`/submissions/${submissionId}/activity`, {}, token);
}
