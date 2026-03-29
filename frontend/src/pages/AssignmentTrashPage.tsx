import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { listTrashedAssignments, restoreAssignment } from '../services/assignments.api';
import { getCourse } from '../services/courses.api';

export function AssignmentTrashPage() {
  const { courseId = '' } = useParams();
  const { token } = useAuth();

  const [course, setCourse] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token || !courseId) return;
    const [courseData, trashed] = await Promise.all([getCourse(token, courseId), listTrashedAssignments(token, courseId)]);
    setCourse(courseData);
    setItems(trashed);
  };

  useEffect(() => {
    void load();
  }, [token, courseId]);

  const onRestore = async (assignmentId: string) => {
    if (!token) return;
    try {
      await restoreAssignment(token, assignmentId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <div>
          <h1>Корзина заданий</h1>
          <p className="muted">{course?.title ?? 'Курс'}</p>
        </div>
        <div className="row">
          <Link to={`/courses/${courseId}`}>Назад к курсу</Link>
        </div>
      </div>

      <div className="panel col">
        {items.length === 0 && <p className="muted">В корзине пока нет заданий.</p>}
        {items.map((item) => (
          <div key={item.id} className="card-row">
            <div>
              <strong>{item.title}</strong>
              <div className="muted">
                Канал: {item.channel?.name} | Удалено: {item.deletedAt ? new Date(item.deletedAt).toLocaleString() : '—'}
              </div>
            </div>
            <div className="row">
              <Link to={`/courses/${courseId}/assignments/${item.id}`}>Открыть</Link>
              <button type="button" onClick={() => void onRestore(item.id)}>
                Восстановить
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
