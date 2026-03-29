import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { downloadFile } from '../services/apiClient';
import { getGradebook, updateGradebookCell } from '../services/assignments.api';
import { getCourse, listGroups } from '../services/courses.api';
import { submissionStatusLabels } from '../utils/lms';

export function GradebookPage() {
  const { courseId = '' } = useParams();
  const { token } = useAuth();

  const [course, setCourse] = useState<any | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupId, setGroupId] = useState('');
  const [format, setFormat] = useState('xlsx');
  const [gradebook, setGradebook] = useState<any | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { grade: string; teacherComment: string; status: string }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token || !courseId) return;
    const [courseData, groupsData, gradebookData] = await Promise.all([
      getCourse(token, courseId),
      listGroups(token, courseId),
      getGradebook(token, courseId, groupId || undefined),
    ]);
    setCourse(courseData);
    setGroups(groupsData);
    setGradebook(gradebookData);
    const nextDrafts: Record<string, { grade: string; teacherComment: string; status: string }> = {};
    for (const row of gradebookData.rows ?? []) {
      for (const cell of row.grades ?? []) {
        nextDrafts[`${row.student.id}:${cell.assignmentId}`] = {
          grade: cell.grade ?? '',
          teacherComment: cell.teacherComment ?? '',
          status: cell.status ?? 'reviewed',
        };
      }
    }
    setDrafts(nextDrafts);
  };

  useEffect(() => {
    void load();
  }, [token, courseId, groupId]);

  const assignments = gradebook?.assignments ?? [];
  const rows = gradebook?.rows ?? [];
  const isManager = ['admin', 'teacher', 'assistant'].includes(course?.currentUserRole ?? '');

  const title = useMemo(() => {
    const selected = groups.find((group) => group.id === groupId);
    return selected ? `Ведомость оценок: ${selected.name}` : 'Ведомость оценок';
  }, [groupId, groups]);

  const getDraft = (studentId: string, assignmentId: string, fallback: any) =>
    drafts[`${studentId}:${assignmentId}`] ?? {
      grade: fallback.grade ?? '',
      teacherComment: fallback.teacherComment ?? '',
      status: fallback.status ?? 'reviewed',
    };

  const saveCell = async (studentId: string, assignmentId: string) => {
    if (!token) return;
    const key = `${studentId}:${assignmentId}`;
    const draft = drafts[key];
    if (!draft) return;
    setSavingKey(key);
    try {
      await updateGradebookCell(token, courseId, {
        assignmentId,
        studentUserId: studentId,
        grade: draft.grade,
        teacherComment: draft.teacherComment,
        status: draft.status,
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  if (!isManager) {
    return (
      <div className="page col">
        <p>Доступ запрещен.</p>
      </div>
    );
  }

  return (
    <div className="page col">
      <div className="toolbar">
        <div>
          <h1>{title}</h1>
          <p className="muted">{course?.title ?? 'Курс'}</p>
        </div>
        <div className="row">
          <Link to={`/courses/${courseId}`}>Назад к курсу</Link>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Все группы</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="xlsx">xlsx</option>
            <option value="xls">xls</option>
            <option value="xlsm">xlsm</option>
          </select>
          {token && (
            <button
              className="secondary"
              onClick={() =>
                void downloadFile(
                  `/courses/${courseId}/gradebook/export?format=${format}${groupId ? `&groupId=${encodeURIComponent(groupId)}` : ''}`,
                  token,
                  `gradebook.${format}`,
                )
              }
            >
              Скачать ведомость
            </button>
          )}
        </div>
      </div>

      <div className="panel col" style={{ overflowX: 'auto' }}>
        <table className="gradebook-table">
          <thead>
            <tr>
              <th>Студент</th>
              <th>Группы</th>
              {assignments.map((assignment: any) => (
                <th key={assignment.id}>{assignment.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (
              <tr key={row.student.id}>
                <td>{row.student.fullName || row.student.nickname}</td>
                <td>{(row.student.groups ?? []).map((group: any) => group.name).join(', ') || '—'}</td>
                {row.grades.map((cell: any) => {
                  const draft = getDraft(row.student.id, cell.assignmentId, cell);
                  const key = `${row.student.id}:${cell.assignmentId}`;
                  return (
                    <td key={cell.assignmentId}>
                      <div className="col" style={{ minWidth: 180 }}>
                        <input
                          value={draft.grade}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: { ...draft, grade: e.target.value },
                            }))
                          }
                          placeholder="Оценка"
                        />
                        <select
                          value={draft.status}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: { ...draft, status: e.target.value },
                            }))
                          }
                        >
                          <option value="reviewed">{submissionStatusLabels.reviewed}</option>
                          <option value="returned_for_revision">{submissionStatusLabels.returned_for_revision}</option>
                        </select>
                        <textarea
                          rows={2}
                          value={draft.teacherComment}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: { ...draft, teacherComment: e.target.value },
                            }))
                          }
                          placeholder="Комментарий"
                        />
                        <button type="button" onClick={() => void saveCell(row.student.id, cell.assignmentId)}>
                          {savingKey === key ? 'Сохранение...' : 'Сохранить'}
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
