import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteSession } from '../services/auth.api';
import { createCourse, joinCourse, listCourses } from '../services/courses.api';
import { listNotifications } from '../services/notifications.api';
import { useAuth } from '../hooks/useAuth';
import { roleLabels } from '../utils/lms';

function SmallBadge() {
  return (
    <span className="mini-badge" aria-hidden="true">
      !
    </span>
  );
}

export function CoursesPage() {
  const { token, setToken } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Array<any>>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<Array<any>>([]);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications]);
  const hasAuditAccess = courses.some((course) => course.role === 'admin');

  const loadCourses = async (query?: string) => {
    if (!token) return;
    const [coursesData, notificationData] = await Promise.all([listCourses(token, query), listNotifications(token)]);
    setCourses(coursesData);
    setNotifications(notificationData);
  };

  useEffect(() => {
    void loadCourses(search);
  }, [token, search]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await createCourse(token, { title, description });
      setTitle('');
      setDescription('');
      await loadCourses(search);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await joinCourse(token, inviteCode);
      setInviteCode('');
      await loadCourses(search);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onLogout = async () => {
    if (token) {
      await deleteSession(token).catch(() => undefined);
    }
    setToken(null);
    navigate('/login');
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <div>
          <h1>Курсы</h1>
          <p className="muted">Курсы, задания, группы, уведомления и чат в одном пространстве.</p>
        </div>
        <div className="row">
          <Link to="/profile">Профиль</Link>
          <Link to="/deadlines">Календарь и проверка</Link>
          <Link to="/review-queue">Очередь проверки</Link>
          <Link to="/files">Файлы</Link>
          <Link to="/notifications">
            Уведомления {unreadCount > 0 && <SmallBadge />}
          </Link>
          {hasAuditAccess && <Link to="/audit">Журнал аудита</Link>}
          <button className="secondary" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </div>

      <div className="panel col">
        <h3>Поиск по курсам</h3>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Введите название или описание курса"
        />
      </div>

      <div className="grid-2">
        <form className="panel col" onSubmit={onCreate}>
          <h3>Создать курс</h3>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название курса" required />
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание"
          />
          <button type="submit">Создать</button>
        </form>

        <form className="panel col" onSubmit={onJoin}>
          <h3>Вступить в курс</h3>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Код приглашения"
            required
          />
          <button type="submit">Вступить</button>
        </form>
      </div>

      <div className="panel col">
        <h3>Мои курсы</h3>
        {courses.length === 0 && <p className="muted">Курсов пока нет.</p>}
        {courses.map((course) => (
          <div key={course.id} className="card-row">
            <div>
              <strong>
                {course.title} {course.hasUnread && <SmallBadge />}
              </strong>
              <div className="muted">
                роль: {roleLabels[course.role] ?? course.role} | каналов: {course.channelsCount} | групп:{' '}
                {course.groupsCount}
              </div>
              <div className="muted">код приглашения: {course.inviteCode}</div>
            </div>
            <Link to={`/courses/${course.id}`}>Открыть</Link>
          </div>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
