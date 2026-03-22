import { apiRequest } from './apiClient';

export function listAuditLogs(token: string, limit = 100) {
  return apiRequest<Array<any>>(`/audit-logs?limit=${limit}`, {}, token);
}
