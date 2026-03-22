import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { listAuditLogs } from '../services/audit.api';

export function AuditLogsPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<Array<any>>([]);

  useEffect(() => {
    if (!token) return;
    listAuditLogs(token).then(setLogs).catch(() => setLogs([]));
  }, [token]);

  return (
    <div className="page col">
      <div className="toolbar">
        <h1>Audit log</h1>
        <Link to="/courses">Courses</Link>
      </div>

      <div className="panel col">
        {logs.map((log) => (
          <div key={log.id} className="card-row">
            <div>
              <strong>{log.actionType}</strong>
              <div className="muted">
                {log.entityType}:{log.entityId}
              </div>
              <div className="muted">
                {log.actor?.nickname ?? 'system'} · {new Date(log.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
