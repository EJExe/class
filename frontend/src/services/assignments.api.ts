import { apiRequest } from './apiClient';

export function getAssignment(token: string, assignmentId: string) {
  return apiRequest<any>(`/assignments/${assignmentId}`, {}, token);
}

export function searchAssignmentStudents(token: string, assignmentId: string, query?: string) {
  const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  return apiRequest<Array<any>>(`/assignments/${assignmentId}/students${suffix}`, {}, token);
}

export function markAssignmentRead(token: string, assignmentId: string) {
  return apiRequest<any>(`/assignments/${assignmentId}/read`, { method: 'PATCH' }, token);
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

export function uploadAssignmentFile(token: string, assignmentId: string, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  return apiRequest<any>(`/assignments/${assignmentId}/files`, { method: 'POST', body: formData }, token);
}

export function listAssignmentFiles(token: string, assignmentId: string) {
  return apiRequest<Array<any>>(`/assignments/${assignmentId}/files`, {}, token);
}

export function deleteAssignmentFile(token: string, fileId: string) {
  return apiRequest<any>(`/assignment-files/${fileId}`, { method: 'DELETE' }, token);
}

export function uploadSubmission(token: string, assignmentId: string, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
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

export function updatePrivateMessage(token: string, messageId: string, content: string) {
  return apiRequest<any>(`/private-messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  }, token);
}

export function addSubmissionFileComment(token: string, fileId: string, content: string) {
  return apiRequest<any>(`/submission-files/${fileId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  }, token);
}

export function getAssignmentAuditLogs(token: string, assignmentId: string, page = 1, limit = 10) {
  return apiRequest<any>(`/assignments/${assignmentId}/audit-logs?page=${page}&limit=${limit}`, {}, token);
}

export function getSubmissionActivity(token: string, submissionId: string, page = 1, limit = 10) {
  return apiRequest<any>(`/submissions/${submissionId}/activity?page=${page}&limit=${limit}`, {}, token);
}

export function listAssignmentDeadlines(
  token: string,
  options?: {
    scope?: 'my' | 'course';
    courseId?: string;
    limit?: number;
    filter?: 'all' | 'upcoming' | 'overdue' | 'needs_review';
  },
) {
  const params = new URLSearchParams();
  if (options?.scope) params.set('scope', options.scope);
  if (options?.courseId) params.set('courseId', options.courseId);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.filter) params.set('filter', options.filter);
  const suffix = params.size ? `?${params.toString()}` : '';
  return apiRequest<Array<any>>(`/assignments-deadlines${suffix}`, {}, token);
}

export function listAvailableFiles(token: string, query?: string, courseId?: string) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set('q', query.trim());
  if (courseId) params.set('courseId', courseId);
  const suffix = params.size ? `?${params.toString()}` : '';
  return apiRequest<Array<any>>(`/files-library${suffix}`, {}, token);
}

export function listReviewQueue(token: string, courseId?: string) {
  const suffix = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
  return apiRequest<Array<any>>(`/review-queue${suffix}`, {}, token);
}

export function getGradebook(token: string, courseId: string, groupId?: string) {
  const suffix = groupId ? `?groupId=${encodeURIComponent(groupId)}` : '';
  return apiRequest<any>(`/courses/${courseId}/gradebook${suffix}`, {}, token);
}

export function updateGradebookCell(
  token: string,
  courseId: string,
  payload: {
    assignmentId: string;
    studentUserId: string;
    grade?: string;
    teacherComment?: string;
    status?: string;
  },
) {
  return apiRequest<any>(`/courses/${courseId}/gradebook`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, token);
}

export function trashAssignment(token: string, assignmentId: string) {
  return apiRequest<any>(`/assignments/${assignmentId}`, { method: 'DELETE' }, token);
}

export function restoreAssignment(token: string, assignmentId: string) {
  return apiRequest<any>(`/assignments/${assignmentId}/restore`, { method: 'PATCH' }, token);
}

export function listTrashedAssignments(token: string, courseId: string) {
  return apiRequest<Array<any>>(`/courses/${courseId}/assignments/trash`, {}, token);
}
