import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAvailableFiles } from '../services/assignments.api';
import { listCourses } from '../services/courses.api';
import { useAuth } from '../hooks/useAuth';

export function FilesLibraryPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Array<any>>([]);
  const [courses, setCourses] = useState<Array<any>>([]);
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');

  useEffect(() => {
    if (!token) return;
    void listCourses(token).then(setCourses);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void listAvailableFiles(token, query, courseId || undefined).then(setItems);
  }, [token, query, courseId]);

  return (
    <div className="page col">
      <div className="toolbar">
        <h1>Файлы и материалы</h1>
        <Link to="/courses">К курсам</Link>
      </div>

      <div className="panel col">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по файлам и заданиям" />
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
        {items.length === 0 && <div className="muted">Файлы не найдены.</div>}
        {items.map((item) => (
          <div key={`${item.type}-${item.id}`} className="card-row">
            <div>
              <strong>{item.name}</strong>
              <div className="muted">Курс: {item.course.title}</div>
              <div className="muted">Задание: {item.assignment.title}</div>
              <div className="muted">
                Тип: {item.type === 'assignment_material' ? 'Материал задания' : 'Файл студента'}
              </div>
              {item.owner && <div className="muted">Студент: {item.owner.nickname}</div>}
            </div>
            <Link to={`/courses/${item.course.id}/assignments/${item.assignment.id}`}>Открыть задание</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
