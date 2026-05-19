import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

const PAGE_SIZE = 20;

export function CoursesPage() {
  const { token } = useAuth();
  const [courses, setCourses] = useState<Array<any>>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<Array<any>>([]);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications]);
  const hasAuditAccess = courses.some((course) => course.role === 'admin');

  const loadCourses = async (query?: string, pageNum = 1) => {
    if (!token) return;
    const [coursesData, notificationData] = await Promise.all([
      listCourses(token, query, pageNum, PAGE_SIZE),
      listNotifications(token),
    ]);
    setCourses(coursesData.items);
    setTotal(coursesData.total);
    setNotifications(notificationData);
  };

  useEffect(() => {
    void loadCourses(search, page);
  }, [token, search, page]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages) setPage(p);
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await createCourse(token, { title, description });
      setTitle('');
      setDescription('');
      setPage(1);
      await loadCourses(search, 1);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setJoinError(null);
    try {
      await joinCourse(token, inviteCode);
      setInviteCode('');
      setPage(1);
      await loadCourses(search, 1);
    } catch (err) {
      setJoinError((err as Error).message);
    }
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
        </div>
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
          {joinError && <p className="error-text">{joinError}</p>}
        </form>
      </div>

      <div className="panel col">
        <h3>Поиск по курсам</h3>
        <input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Введите название или описание курса"
        />
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

        <div className="row" style={{ justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <button
              className="secondary"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Назад
            </button>

            <span className="muted" style={{ fontSize: 14 }}>
              Страница {page} из {totalPages}
            </span>

            <button
              className="secondary"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Далее
            </button>

            <span className="muted" style={{ fontSize: 14 }}>|</span>

            <input
              type="number"
              min={1}
              max={totalPages}
              value={page}
              onChange={(e) => {
                const p = parseInt(e.target.value, 10);
                if (!isNaN(p)) goToPage(p);
              }}
              style={{ width: 60, textAlign: 'center' }}
              title={`Перейти к странице (1–${totalPages})`}
            />
          </div>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
