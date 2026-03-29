import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAssignmentDeadlines } from '../services/assignments.api';
import { listCourses } from '../services/courses.api';
import { useAuth } from '../hooks/useAuth';
import { assignmentStatusLabels, submissionStatusLabels } from '../utils/lms';

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(source: Date) {
  const date = new Date(source);
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
}

function startOfMonth(source: Date) {
  const date = new Date(source.getFullYear(), source.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(source: Date, days: number) {
  const date = new Date(source);
  date.setDate(date.getDate() + days);
  return date;
}

function addWeeks(source: Date, weeks: number) {
  return addDays(source, weeks * 7);
}

function addMonths(source: Date, months: number) {
  return new Date(source.getFullYear(), source.getMonth() + months, 1);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function getIsoWeekValue(source: Date) {
  const date = startOfWeek(source);
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${pad(weekNumber)}`;
}

function parseWeekValue(value: string) {
  const match = value.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    return startOfWeek(new Date());
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  const januaryFourth = new Date(year, 0, 4);
  const firstWeekStart = startOfWeek(januaryFourth);
  return addWeeks(firstWeekStart, week - 1);
}

function getMonthValue(source: Date) {
  return `${source.getFullYear()}-${pad(source.getMonth() + 1)}`;
}

function parseMonthValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return startOfMonth(new Date());
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

export function DeadlinesPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Array<any>>([]);
  const [courses, setCourses] = useState<Array<any>>([]);
  const [scope, setScope] = useState<'my' | 'course'>('my');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'overdue' | 'needs_review'>('all');
  const [view, setView] = useState<'list' | 'week' | 'month'>('list');
  const [weekCursor, setWeekCursor] = useState(() => startOfWeek(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  useEffect(() => {
    if (!token) return;
    void listCourses(token).then(setCourses);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (scope === 'course' && !selectedCourseId) {
      setItems([]);
      return;
    }

    void listAssignmentDeadlines(token, {
      scope,
      courseId: scope === 'course' ? selectedCourseId || undefined : undefined,
      limit: 100,
      filter,
    }).then(setItems);
  }, [token, scope, selectedCourseId, filter]);

  const currentWeekStart = startOfWeek(new Date());
  const currentMonthStart = startOfMonth(new Date());

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekCursor, index)), [weekCursor]);

  const monthDays = useMemo(() => {
    const firstDay = startOfMonth(monthCursor);
    const firstWeekDay = (firstDay.getDay() || 7) - 1;
    const gridStart = addDays(firstDay, -firstWeekDay);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [monthCursor]);

  const weekLabel = `${weekDays[0].toLocaleDateString('ru-RU')} - ${weekDays[6].toLocaleDateString('ru-RU')}`;
  const monthLabel = monthCursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const renderCard = (item: any) => (
    <div key={item.id} className="card-row">
      <div>
        <strong>{item.title}</strong>
        <div className="muted">{'\u041a\u0443\u0440\u0441'}: {item.course.title}</div>
        <div className="muted">
          {'\u0421\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u0434\u0430\u043d\u0438\u044f'}: {assignmentStatusLabels[item.status] ?? item.status}
        </div>
        <div className="muted">
          {'\u0414\u0435\u0434\u043b\u0430\u0439\u043d'}:{' '}
          {item.deadlineAt
            ? new Date(item.deadlineAt).toLocaleString('ru-RU')
            : '\u043d\u0435 \u0437\u0430\u0434\u0430\u043d'}
        </div>
        {item.mySubmission && (
          <div className="muted">
            {'\u0421\u0442\u0430\u0442\u0443\u0441 \u043c\u043e\u0435\u0439 \u0440\u0430\u0431\u043e\u0442\u044b'}:{' '}
            {submissionStatusLabels[item.mySubmission.status] ?? item.mySubmission.status}
          </div>
        )}
        {item.isReviewerView && item.needsReviewCount > 0 && (
          <div className="error-text">
            {'\u0422\u0440\u0435\u0431\u0443\u044e\u0442 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438'}: {item.needsReviewCount}
          </div>
        )}
      </div>
      <Link to={`/courses/${item.course.id}/assignments/${item.id}`}>{'\u041e\u0442\u043a\u0440\u044b\u0442\u044c'}</Link>
    </div>
  );

  return (
    <div className="page col">
      <div className="toolbar">
        <div>
          <h1>{'\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0430'}</h1>
          <p className="muted">
            {
              '\u0421\u043b\u0435\u0434\u0438\u0442\u0435 \u0437\u0430 \u0441\u0440\u043e\u043a\u0430\u043c\u0438 \u0441\u0434\u0430\u0447\u0438 \u0438 \u0431\u044b\u0441\u0442\u0440\u043e \u043f\u0435\u0440\u0435\u0445\u043e\u0434\u0438\u0442\u0435 \u043a \u0437\u0430\u0434\u0430\u043d\u0438\u044f\u043c, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043d\u0443\u0436\u043d\u043e \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c.'
            }
          </p>
        </div>
        <Link to="/courses">{'\u041a \u043a\u0443\u0440\u0441\u0430\u043c'}</Link>
      </div>

      <div className="panel col">
        <div className="row">
          <button className={scope === 'my' ? '' : 'secondary'} onClick={() => setScope('my')}>
            {'\u041c\u043e\u0438 \u0437\u0430\u0434\u0430\u043d\u0438\u044f'}
          </button>
          <button className={scope === 'course' ? '' : 'secondary'} onClick={() => setScope('course')}>
            {'\u0412\u0441\u0435 \u0437\u0430\u0434\u0430\u043d\u0438\u044f \u043a\u0443\u0440\u0441\u0430'}
          </button>
        </div>

        {scope === 'course' && (
          <select value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
            <option value="">{'\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043a\u0443\u0440\u0441'}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        )}

        <div className="row">
          <button className={filter === 'all' ? '' : 'secondary'} onClick={() => setFilter('all')}>
            {'\u0412\u0441\u0435'}
          </button>
          <button className={filter === 'upcoming' ? '' : 'secondary'} onClick={() => setFilter('upcoming')}>
            {'\u0411\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435'}
          </button>
          <button className={filter === 'overdue' ? '' : 'secondary'} onClick={() => setFilter('overdue')}>
            {'\u041f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u043d\u044b\u0435'}
          </button>
          <button className={filter === 'needs_review' ? '' : 'secondary'} onClick={() => setFilter('needs_review')}>
            {'\u041d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443'}
          </button>
        </div>

        <div className="row">
          <button className={view === 'list' ? '' : 'secondary'} onClick={() => setView('list')}>
            {'\u0421\u043f\u0438\u0441\u043e\u043a'}
          </button>
          <button className={view === 'week' ? '' : 'secondary'} onClick={() => setView('week')}>
            {'\u041d\u0435\u0434\u0435\u043b\u044f'}
          </button>
          <button className={view === 'month' ? '' : 'secondary'} onClick={() => setView('month')}>
            {'\u041c\u0435\u0441\u044f\u0446'}
          </button>
        </div>

        {view === 'week' && (
          <div className="calendar-toolbar">
            <div className="row">
              <button className="secondary" onClick={() => setWeekCursor((prev) => addWeeks(prev, -1))}>
                {'\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0430\u044f \u043d\u0435\u0434\u0435\u043b\u044f'}
              </button>
              <button className="secondary" onClick={() => setWeekCursor((prev) => addWeeks(prev, 1))}>
                {'\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0430\u044f \u043d\u0435\u0434\u0435\u043b\u044f'}
              </button>
              <button className="secondary" onClick={() => setWeekCursor(currentWeekStart)}>
                {'\u041a \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u043d\u0435\u0434\u0435\u043b\u0435'}
              </button>
            </div>
            <div className="row">
              <input
                type="week"
                value={getIsoWeekValue(weekCursor)}
                onChange={(event) => setWeekCursor(parseWeekValue(event.target.value))}
                style={{ maxWidth: 180 }}
              />
              <span className="muted">{weekLabel}</span>
            </div>
          </div>
        )}

        {view === 'month' && (
          <div className="calendar-toolbar">
            <div className="row">
              <button className="secondary" onClick={() => setMonthCursor((prev) => addMonths(prev, -1))}>
                {'\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0439 \u043c\u0435\u0441\u044f\u0446'}
              </button>
              <button className="secondary" onClick={() => setMonthCursor((prev) => addMonths(prev, 1))}>
                {'\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u043c\u0435\u0441\u044f\u0446'}
              </button>
              <button className="secondary" onClick={() => setMonthCursor(currentMonthStart)}>
                {'\u041a \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u043c\u0435\u0441\u044f\u0446\u0443'}
              </button>
            </div>
            <div className="row">
              <input
                type="month"
                value={getMonthValue(monthCursor)}
                onChange={(event) => setMonthCursor(parseMonthValue(event.target.value))}
                style={{ maxWidth: 180 }}
              />
              <span className="muted" style={{ textTransform: 'capitalize' }}>
                {monthLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {view === 'list' && (
        <div className="panel col">
          {items.length === 0 ? (
            <div className="muted">{'\u041f\u043e\u0434\u0445\u043e\u0434\u044f\u0449\u0438\u0445 \u0437\u0430\u0434\u0430\u043d\u0438\u0439 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e.'}</div>
          ) : (
            items.map(renderCard)
          )}
        </div>
      )}

      {view === 'week' && (
        <div className="calendar-grid week-grid">
          {weekDays.map((day) => {
            const dayItems = items.filter((item) => item.deadlineAt && sameDay(new Date(item.deadlineAt), day));
            return (
              <div key={day.toISOString()} className="calendar-cell">
                <strong>{day.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' })}</strong>
                {dayItems.length === 0 ? (
                  <span className="muted">{'\u041d\u0435\u0442 \u0434\u0435\u0434\u043b\u0430\u0439\u043d\u043e\u0432'}</span>
                ) : (
                  dayItems.map((item) => (
                    <Link key={item.id} to={`/courses/${item.course.id}/assignments/${item.id}`} className="calendar-item">
                      {item.title}
                    </Link>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'month' && (
        <div className="calendar-grid month-grid">
          {monthDays.map((day) => {
            const dayItems = items.filter((item) => item.deadlineAt && sameDay(new Date(item.deadlineAt), day));
            const isOutsideMonth = day.getMonth() !== monthCursor.getMonth();
            return (
              <div key={day.toISOString()} className={`calendar-cell ${isOutsideMonth ? 'outside-month' : ''}`}>
                <strong>{day.getDate()}</strong>
                {dayItems.length === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  dayItems.slice(0, 3).map((item) => (
                    <Link key={item.id} to={`/courses/${item.course.id}/assignments/${item.id}`} className="calendar-item">
                      {item.title}
                    </Link>
                  ))
                )}
                {dayItems.length > 3 && (
                  <span className="muted">
                    {'\u0415\u0449\u0451'}: {dayItems.length - 3}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
