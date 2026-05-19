import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAvailableFiles } from '../services/assignments.api';
import { listCourses } from '../services/courses.api';
import { downloadFile } from '../services/apiClient';
import { useAuth } from '../hooks/useAuth';

export function FilesLibraryPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<Array<any>>([]);
  const [courses, setCourses] = useState<Array<any>>([]);
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const [showStudentFiles, setShowStudentFiles] = useState(false);

  useEffect(() => {
    if (!token) return;
    void listCourses(token).then((data) => setCourses(data.items));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void listAvailableFiles(token, query, courseId || undefined).then(setItems);
  }, [token, query, courseId]);

  const hasOtherStudentsFiles = useMemo(
    () => items.some((item) => item.type === 'submission_file' && item.owner && item.owner.id !== user?.id),
    [items, user?.id],
  );

  const visibleItems = useMemo(
    () => (showStudentFiles || !hasOtherStudentsFiles ? items : items.filter((item) => item.type !== 'submission_file')),
    [items, showStudentFiles, hasOtherStudentsFiles],
  );

  return (
    <div className="page col">
      <div className="toolbar">
        <h1>Файлы и материалы</h1>
        <Link to="/courses">К курсам</Link>
      </div>

      <div className="panel col">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по файлам и заданиям" />
        <div className="row">
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Все курсы</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          {hasOtherStudentsFiles && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showStudentFiles}
                onChange={(e) => setShowStudentFiles(e.target.checked)}
              />
              {'Показать работы студентов'}
            </label>
          )}
        </div>
      </div>

      <div className="panel col">
        {visibleItems.length === 0 && <div className="muted">Файлы не найдены.</div>}
        {visibleItems.map((item) => (
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
              <div className="row">
                <button
                  className="secondary"
                  onClick={() =>
                    void downloadFile(
                      `/${item.type === 'assignment_material' ? 'assignment-files' : 'submission-files'}/${item.id}/download`,
                      token!,
                      item.name,
                    )
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 4 }}>
                    <path d="M8 11L3 6h3V1h4v5h3L8 11zM2 13v2h12v-2H2z" />
                  </svg>
                  {'Скачать'}
                </button>
                <Link to={`/courses/${item.course.id}/assignments/${item.assignment.id}`}>{'Открыть задание'}</Link>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
