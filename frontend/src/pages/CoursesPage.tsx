import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteSession } from '../services/auth.api';
import { createCourse, joinCourse, listCourses } from '../services/courses.api';
import { useAuth } from '../hooks/useAuth';

export function CoursesPage() {
  const { token, user, setToken } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Array<any>>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hasAuditAccess = courses.some((course) => course.role !== 'student');

  const loadCourses = async () => {
    if (!token) return;
    setCourses(await listCourses(token));
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
      await loadCourses();
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
          <h1>Courses</h1>
          <p className="muted">Assignments, submissions, groups, notifications and course chat.</p>
        </div>
        <div className="row">
          <Link to="/notifications">Notifications</Link>
          {hasAuditAccess && <Link to="/audit">Audit log</Link>}
          <span>{user?.nickname}</span>
          <button className="secondary" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className="grid-2">
        <form className="panel col" onSubmit={onCreate}>
          <h3>Create course</h3>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" required />
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
          <button type="submit">Create</button>
        </form>

        <form className="panel col" onSubmit={onJoin}>
          <h3>Join course</h3>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Invite code"
            required
          />
          <button type="submit">Join</button>
        </form>
      </div>

      <div className="panel col">
        <h3>My courses</h3>
        {courses.length === 0 && <p className="muted">No courses yet.</p>}
        {courses.map((course) => (
          <div key={course.id} className="card-row">
            <div>
              <strong>{course.title}</strong>
              <div className="muted">
                role: {course.role} | channels: {course.channelsCount} | groups: {course.groupsCount}
              </div>
              <div className="muted">invite: {course.inviteCode}</div>
            </div>
            <Link to={`/courses/${course.id}`}>Open</Link>
          </div>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
