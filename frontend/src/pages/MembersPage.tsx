import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCourseMembers } from '../services/courses.api';
import { useAuth } from '../hooks/useAuth';

export function MembersPage() {
  const { courseId = '' } = useParams();
  const { token } = useAuth();
  const [members, setMembers] = useState<Array<any>>([]);

  useEffect(() => {
    if (!token || !courseId) return;
    getCourseMembers(token, courseId).then(setMembers).catch(() => setMembers([]));
  }, [token, courseId]);

  return (
    <div className="page col">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Участники курса</h2>
        <Link to={`/courses/${courseId}`}>Назад в курс</Link>
      </div>

      <div className="panel col">
        {members.map((m) => (
          <div key={m.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <span>{m.user.nickname}</span>
            <span style={{ color: 'var(--muted)' }}>{m.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

