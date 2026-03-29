import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listReviewQueue } from '../services/assignments.api';
import { listCourses } from '../services/courses.api';
import { useAuth } from '../hooks/useAuth';
import { submissionStatusLabels } from '../utils/lms';
import { UserAvatar } from '../components/UserAvatar';

export function ReviewQueuePage() {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState('');

  useEffect(() => {
    if (!token) return;
    void listCourses(token).then(setCourses);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void listReviewQueue(token, courseId || undefined).then(setItems);
  }, [token, courseId]);

  return (
    <div className="page col">
      <div className="toolbar">
        <h1>Очередь проверки</h1>
        <Link to="/courses">К курсам</Link>
      </div>

      <div className="panel col">
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Все курсы</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
      </div>

      <div className="panel col">
        {items.length === 0 && <div className="muted">Работ, требующих проверки, сейчас нет.</div>}
        {items.map((item) => (
          <div key={item.id} className="card-row">
            <div>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <UserAvatar user={item.student} size={28} />
                <strong>{item.student.fullName || item.student.nickname}</strong>
              </div>
              <div className="muted">Курс: {item.assignment.channel.course.title}</div>
              <div className="muted">Задание: {item.assignment.title}</div>
              <div className="muted">Статус: {submissionStatusLabels[item.status] ?? item.status}</div>
              <div className="muted">Ждет проверки с: {new Date(item.needsAttentionSince).toLocaleString()}</div>
            </div>
            <Link to={`/courses/${item.assignment.channel.course.id}/assignments/${item.assignmentId}`}>Открыть</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
