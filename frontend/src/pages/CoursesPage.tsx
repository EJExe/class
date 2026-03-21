import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createCourse, joinCourse, listCourses } from '../services/courses.api';
import { deleteSession } from '../services/auth.api';
import { useAuth } from '../hooks/useAuth';

export function CoursesPage() {
  const { token, user, setToken } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Array<any>>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    if (!token) return;
    const data = await listCourses(token);
    setCourses(data);
  };

  useEffect(() => {
    void loadCourses();
  }, [token]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await createCourse(token, { title, description });
      setTitle('');
      setDescription('');
      await loadCourses();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await joinCourse(token, inviteCode);
      setInviteCode('');
      await loadCourses();
    } catch (e) {
      setError((e as Error).message);
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
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Курсы</h2>
        <div className="row">
          <span>{user?.nickname}</span>
          <button className="secondary" onClick={onLogout}>Выйти</button>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <form className="panel col" style={{ flex: 1 }} onSubmit={onCreate}>
          <h3>Создать курс</h3>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" required />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" rows={3} />
          <button type="submit">Создать</button>
        </form>

        <form className="panel col" style={{ flex: 1 }} onSubmit={onJoin}>
          <h3>Вступить по invite-коду</h3>
          <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Invite code" required />
          <button type="submit">Вступить</button>
        </form>
      </div>

      <div className="panel">
        <h3>Мои курсы</h3>
        {courses.length === 0 && <p>Пока нет курсов.</p>}
        <div className="col">
          {courses.map((course) => (
            <div key={course.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <div>
                <strong>{course.title}</strong>
                <div style={{ color: 'var(--muted)' }}>role: {course.role} | invite: {course.inviteCode}</div>
              </div>
              <Link to={`/courses/${course.id}`}>Открыть</Link>
            </div>
          ))}
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}

