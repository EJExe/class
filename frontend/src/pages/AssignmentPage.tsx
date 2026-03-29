import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../hooks/useAuth';
import {
  addSubmissionFileComment,
  getAssignment,
  getAssignmentAuditLogs,
  getMySubmission,
  getPrivateChat,
  getSubmission,
  getSubmissionActivity,
  gradeSubmission,
  listPrivateMessages,
  listSubmissions,
  markAssignmentRead,
  searchAssignmentStudents,
  submitSubmission,
  trashAssignment,
  updateAssignment,
  updatePrivateMessage,
  uploadAssignmentFile,
  uploadSubmission,
} from '../services/assignments.api';
import { downloadFile } from '../services/apiClient';
import { getCourse } from '../services/courses.api';
import { wsService } from '../services/ws.service';
import { assignmentStatusLabels, submissionStatusLabels } from '../utils/lms';

function renderActivityDetails(item: any) {
  const meta = item?.metadataJson ?? {};
  const details: string[] = [];

  if (meta.previousStatus || meta.nextStatus) {
    const from = meta.previousStatus ? submissionStatusLabels[meta.previousStatus] ?? meta.previousStatus : '';
    const to = meta.nextStatus ? submissionStatusLabels[meta.nextStatus] ?? meta.nextStatus : '';
    details.push(from && to ? `Статус: ${from} -> ${to}` : `Статус: ${to || from}`);
  }
  if (meta.grade) details.push(`Оценка: ${meta.grade}`);
  if (meta.teacherComment) details.push(`Комментарий преподавателя: ${meta.teacherComment}`);
  if (meta.originalName) details.push(`Файл: ${meta.originalName}`);

  return details;
}

function renderAuditDetails(item: any) {
  const meta = item?.metadataJson ?? {};
  const details: string[] = [];

  if (meta.title) details.push(`Название: ${meta.title}`);
  if (meta.description) details.push('Описание обновлено');
  if (meta.deadlineAt) details.push(`Дедлайн: ${new Date(meta.deadlineAt).toLocaleString()}`);
  if (meta.status) details.push(`Статус: ${assignmentStatusLabels[meta.status] ?? meta.status}`);
  if (meta.originalName) details.push(`Файл: ${meta.originalName}`);
  if (meta.contentPreview) details.push(`Комментарий: ${meta.contentPreview}`);

  return details;
}

export function AssignmentPage() {
  const { courseId = '', assignmentId = '' } = useParams();
  const { token, user } = useAuth();

  const materialInputRef = useRef<HTMLInputElement | null>(null);
  const submissionInputRef = useRef<HTMLInputElement | null>(null);

  const [courseRole, setCourseRole] = useState('student');
  const [assignment, setAssignment] = useState<any | null>(null);
  const [mySubmission, setMySubmission] = useState<any | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
  const [privateChat, setPrivateChat] = useState<any | null>(null);
  const [privateMessages, setPrivateMessages] = useState<any[]>([]);
  const [privateMessageText, setPrivateMessageText] = useState('');
  const [editingPrivateMessageId, setEditingPrivateMessageId] = useState<string | null>(null);
  const [editingPrivateMessageText, setEditingPrivateMessageText] = useState('');
  const [activity, setActivity] = useState<any[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityMeta, setActivityMeta] = useState({ total: 0, page: 1, pageSize: 10 });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditMeta, setAuditMeta] = useState({ total: 0, page: 1, pageSize: 10 });
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [submissionFiles, setSubmissionFiles] = useState<File[]>([]);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    title: '',
    description: '',
    deadlineAt: '',
    status: 'draft',
  });
  const [gradeForm, setGradeForm] = useState({
    grade: '',
    teacherComment: '',
    status: 'reviewed',
  });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const isReviewer = ['admin', 'teacher', 'assistant'].includes(courseRole);
  const isAdmin = courseRole === 'admin';
  const activeStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  const loadBase = async () => {
    if (!token || !assignmentId || !courseId || !user?.id) return;

    const [assignmentData, courseData, mySubmissionData] = await Promise.all([
      getAssignment(token, assignmentId),
      getCourse(token, courseId),
      getMySubmission(token, assignmentId),
    ]);

    setAssignment(assignmentData);
    setMySubmission(mySubmissionData);
    setAssignmentForm({
      title: assignmentData.title,
      description: assignmentData.description ?? '',
      deadlineAt: assignmentData.deadlineAt ? new Date(assignmentData.deadlineAt).toISOString().slice(0, 16) : '',
      status: assignmentData.status,
    });

    const role =
      courseData.currentUserRole ??
      courseData.members.find((member: any) => member.user.id === user.id)?.role ??
      'student';
    setCourseRole(role);

    const studentUsers = (courseData.members ?? [])
      .filter((member: any) => member.role === 'student')
      .map((member: any) => member.user);
    setStudents(studentUsers);

    if (['admin', 'teacher', 'assistant'].includes(role)) {
      const [submissionsPage, auditPageData] = await Promise.all([
        listSubmissions(token, assignmentId),
        getAssignmentAuditLogs(token, assignmentId, auditPage, 10),
      ]);
      setSubmissions(submissionsPage.items);
      setAuditLogs(auditPageData.items);
      setAuditMeta({
        total: auditPageData.total,
        page: auditPageData.page,
        pageSize: auditPageData.pageSize,
      });
      setSelectedSubmissionId((current) => current || submissionsPage.items[0]?.id || '');
      setSelectedStudentId((current) => current || submissionsPage.items[0]?.student?.id || studentUsers[0]?.id || '');
    } else {
      setSelectedStudentId(user.id);
      setSelectedSubmissionId(mySubmissionData?.id ?? '');
      setSubmissions([]);
      setAuditLogs([]);
      setAuditMeta({ total: 0, page: 1, pageSize: 10 });
    }
  };

  useEffect(() => {
    void loadBase();
  }, [token, assignmentId, courseId, user?.id, auditPage]);

  useEffect(() => {
    if (!token || !assignmentId) return;
    void markAssignmentRead(token, assignmentId).catch(() => undefined);
  }, [token, assignmentId]);

  useEffect(() => {
    setActivityPage(1);
  }, [selectedSubmissionId]);

  useEffect(() => {
    if (!token || !assignmentId || !isReviewer) return;
    void searchAssignmentStudents(token, assignmentId, studentSearch).then(setStudents);
  }, [token, assignmentId, isReviewer, studentSearch]);

  useEffect(() => {
    if (!token || !selectedSubmissionId) {
      setSelectedSubmission(null);
      return;
    }
    void getSubmission(token, selectedSubmissionId).then(setSelectedSubmission);
  }, [token, selectedSubmissionId]);

  useEffect(() => {
    if (!token || !selectedSubmissionId) {
      setActivity([]);
      setActivityMeta({ total: 0, page: 1, pageSize: 10 });
      return;
    }
    void getSubmissionActivity(token, selectedSubmissionId, activityPage, 10).then((page) => {
      setActivity(page.items);
      setActivityMeta({
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      });
    });
  }, [token, selectedSubmissionId, activityPage]);

  useEffect(() => {
    if (!token || !assignmentId) return;
    const studentUserId = isReviewer ? selectedStudentId : undefined;
    if (isReviewer && !studentUserId) {
      setPrivateChat(null);
      setPrivateMessages([]);
      return;
    }

    void getPrivateChat(token, assignmentId, studentUserId).then(async (chat) => {
      setPrivateChat(chat);
      setPrivateMessages(await listPrivateMessages(token, chat.id));
    });
  }, [token, assignmentId, isReviewer, selectedStudentId]);

  useEffect(() => {
    if (!token || !privateChat?.id) return;

    const socket = wsService.connect(token);
    const join = () => socket.emit('private-chat:join', { chatId: privateChat.id });
    const onNew = (event: any) => {
      if (event.chatId !== privateChat.id) return;
      setPrivateMessages((prev) =>
        prev.some((item) => item.id === event.message.id) ? prev : [...prev, event.message],
      );
    };
    const onUpdated = (event: any) => {
      if (event.chatId !== privateChat.id) return;
      setPrivateMessages((prev) => prev.map((item) => (item.id === event.message.id ? event.message : item)));
      setEditingPrivateMessageId((current) => (current === event.message.id ? null : current));
    };

    socket.on('connect', join);
    socket.on('private-chat:message:new', onNew);
    socket.on('private-chat:message:updated', onUpdated);
    if (socket.connected) join();

    return () => {
      socket.emit('private-chat:leave', { chatId: privateChat.id });
      socket.off('connect', join);
      socket.off('private-chat:message:new', onNew);
      socket.off('private-chat:message:updated', onUpdated);
    };
  }, [token, privateChat?.id]);

  const saveAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await updateAssignment(token, assignmentId, {
        title: assignmentForm.title,
        description: assignmentForm.description,
        deadlineAt: assignmentForm.deadlineAt ? new Date(assignmentForm.deadlineAt).toISOString() : undefined,
        status: assignmentForm.status,
      });
      await loadBase();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUploadMaterials = async () => {
    if (!token || materialFiles.length === 0) return;
    await uploadAssignmentFile(token, assignmentId, materialFiles);
    setMaterialFiles([]);
    if (materialInputRef.current) materialInputRef.current.value = '';
    await loadBase();
  };

  const onUploadSubmission = async () => {
    if (!token || submissionFiles.length === 0) return;
    await uploadSubmission(token, assignmentId, submissionFiles);
    setSubmissionFiles([]);
    if (submissionInputRef.current) submissionInputRef.current.value = '';
    await loadBase();
  };

  const onSubmitSubmission = async () => {
    if (!token) return;
    setIsSubmittingFinal(true);
    try {
      await submitSubmission(token, assignmentId);
      await loadBase();
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  const onGradeSubmission = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedSubmissionId) return;
    await gradeSubmission(token, selectedSubmissionId, {
      grade: gradeForm.grade,
      teacherComment: gradeForm.teacherComment,
      status: gradeForm.status,
    });
    await loadBase();
  };

  const onSendPrivateMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !privateChat || !privateMessageText.trim()) return;
    wsService.connect(token).emit('private-chat:message', {
      chatId: privateChat.id,
      content: privateMessageText.trim(),
    });
    setPrivateMessageText('');
  };

  const startEditPrivateMessage = (message: any) => {
    setEditingPrivateMessageId(message.id);
    setEditingPrivateMessageText(message.content);
  };

  const savePrivateMessage = async (messageId: string) => {
    if (!token || !privateChat || !editingPrivateMessageText.trim()) return;
    const socket = wsService.connect(token);
    if (socket.connected) {
      socket.emit('private-chat:message:update', {
        chatId: privateChat.id,
        messageId,
        content: editingPrivateMessageText.trim(),
      });
    } else {
      const updated = await updatePrivateMessage(token, messageId, editingPrivateMessageText.trim());
      setPrivateMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    }
    setEditingPrivateMessageId(null);
    setEditingPrivateMessageText('');
  };

  const addComment = async (fileId: string) => {
    if (!token || !commentDrafts[fileId]?.trim()) return;
    const comment = await addSubmissionFileComment(token, fileId, commentDrafts[fileId]);
    setSelectedSubmission((prev: any) =>
      prev
        ? {
            ...prev,
            files: prev.files.map((file: any) =>
              file.id === fileId ? { ...file, comments: [...(file.comments ?? []), comment] } : file,
            ),
          }
        : prev,
    );
    setCommentDrafts((prev) => ({ ...prev, [fileId]: '' }));
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <div>
          <h1>{assignment?.title ?? 'Задание'}</h1>
          <div className="muted">
            {assignment ? assignmentStatusLabels[assignment.status] ?? assignment.status : 'Загрузка'}
          </div>
        </div>
        <div className="row">
          <Link to={`/courses/${courseId}`}>Назад к курсу</Link>
          {isReviewer && (
            <Link to={`/courses/${courseId}/assignments/trash`}>Корзина заданий</Link>
          )}
          {token && isAdmin && (
            <button
              className="secondary"
              onClick={() =>
                void downloadFile(
                  `/assignments-deadlines/export?scope=course&courseId=${courseId}`,
                  token,
                  'deadlines.csv',
                )
              }
            >
              Экспорт дедлайнов CSV
            </button>
          )}
        </div>
      </div>

      <div className="grid-2-lms">
        <div className="col">
          <div className="panel col">
            <h3>О задании</h3>
            <p>{assignment?.description || 'Описание не добавлено.'}</p>
            <div className="muted">
              Срок сдачи: {assignment?.deadlineAt ? new Date(assignment.deadlineAt).toLocaleString() : 'не указан'}
            </div>
            {(assignment?.files ?? []).map((file: any) => (
              <div key={file.id} className="card-row">
                <span>{file.originalName}</span>
                {token && (
                  <button
                    className="secondary"
                    onClick={() => void downloadFile(`/assignment-files/${file.id}/download`, token, file.originalName)}
                  >
                    Скачать
                  </button>
                )}
              </div>
            ))}
          </div>

          {isReviewer ? (
            <div className="panel col">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Управление заданием</h3>
                <button className="secondary" type="button" onClick={() => setIsManageOpen((prev) => !prev)}>
                  {isManageOpen ? 'Скрыть' : 'Открыть'}
                </button>
              </div>
              <div className="row">
                <button
                  className="secondary"
                  type="button"
                  onClick={async () => {
                    if (!token) return;
                    await trashAssignment(token, assignmentId);
                    window.location.href = `/courses/${courseId}/assignments/trash`;
                  }}
                >
                  Переместить в корзину
                </button>
              </div>
              {isManageOpen && (
                <form className="col" onSubmit={saveAssignment}>
                  <input
                    value={assignmentForm.title}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Название"
                  />
                  <textarea
                    rows={5}
                    value={assignmentForm.description}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Описание"
                  />
                  <input
                    type="datetime-local"
                    value={assignmentForm.deadlineAt}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, deadlineAt: e.target.value }))}
                  />
                  <select
                    value={assignmentForm.status}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    {Object.entries(assignmentStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    ref={materialInputRef}
                    className="hidden-file-input"
                    type="file"
                    multiple
                    onChange={(e) => setMaterialFiles(Array.from(e.target.files ?? []))}
                  />
                  <div className="file-picker-actions">
                    <button className="link-button" type="button" onClick={() => materialInputRef.current?.click()}>
                      Загрузить материалы
                    </button>
                    {materialFiles.length > 0 && (
                      <button className="secondary" type="button" onClick={() => void onUploadMaterials()}>
                        Отправить файлы
                      </button>
                    )}
                  </div>
                  <button type="submit">Сохранить</button>
                </form>
              )}
            </div>
          ) : (
            <>
              <div className="panel col">
                <h3>Моя работа</h3>
                <div className="muted">
                  Статус:{' '}
                  {mySubmission
                    ? submissionStatusLabels[mySubmission.status] ?? mySubmission.status
                    : submissionStatusLabels.not_submitted}
                </div>
                {mySubmission?.grade && <div>Оценка: {mySubmission.grade}</div>}
                {mySubmission?.teacherComment && <div>Комментарий преподавателя: {mySubmission.teacherComment}</div>}
                {mySubmission?.currentFile && token && (
                  <button
                    className="secondary"
                    onClick={() =>
                      void downloadFile(
                        `/submission-files/${mySubmission.currentFile.id}/download`,
                        token,
                        mySubmission.currentFile.originalName,
                      )
                    }
                  >
                    Скачать текущий файл
                  </button>
                )}
                <input
                  ref={submissionInputRef}
                  className="hidden-file-input"
                  type="file"
                  multiple
                  onChange={(e) => setSubmissionFiles(Array.from(e.target.files ?? []))}
                />
                <div className="file-picker-actions">
                  <button className="link-button" type="button" onClick={() => submissionInputRef.current?.click()}>
                    Загрузить черновики
                  </button>
                  {submissionFiles.length > 0 && (
                    <button className="secondary" type="button" onClick={() => void onUploadSubmission()}>
                      Отправить файлы
                    </button>
                  )}
                </div>
                <button
                  className={isSubmittingFinal ? 'secondary' : ''}
                  disabled={isSubmittingFinal}
                  onClick={() => void onSubmitSubmission()}
                >
                  {isSubmittingFinal ? 'Сдача...' : 'Сдать работу'}
                </button>
              </div>

              {selectedSubmission && (
                <div className="panel col">
                  <h3>Версии моих файлов и комментарии</h3>
                  {(selectedSubmission.files ?? []).map((file: any) => (
                    <div key={file.id} className="col card-row" style={{ alignItems: 'stretch' }}>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{file.originalName}</strong>
                          <div className="muted">{new Date(file.uploadedAt).toLocaleString()}</div>
                        </div>
                        {token && (
                          <button
                            className="secondary"
                            onClick={() =>
                              void downloadFile(`/submission-files/${file.id}/download`, token, file.originalName)
                            }
                          >
                            Скачать
                          </button>
                        )}
                      </div>
                      {(file.comments ?? []).length === 0 && (
                        <div className="muted">Комментариев к этой версии пока нет.</div>
                      )}
                      {(file.comments ?? []).map((comment: any) => (
                        <div key={comment.id} className="message-item">
                          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                            <UserAvatar user={comment.author} size={24} />
                            <strong>{comment.author.nickname}</strong>
                          </div>
                          <div>{comment.content}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="col">
          {isReviewer && (
            <div className="panel col">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Работы студентов</h3>
                {token && isAdmin && selectedSubmissionId && (
                  <button
                    className="secondary"
                    onClick={() =>
                      void downloadFile(
                        `/submissions/${selectedSubmissionId}/activity/export`,
                        token,
                        'submission-activity.csv',
                      )
                    }
                  >
                    Экспорт журнала проверки
                  </button>
                )}
              </div>

              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Поиск по студентам"
              />

              <div className="row" style={{ flexWrap: 'wrap' }}>
                {students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    className={selectedStudentId === student.id ? '' : 'secondary'}
                    onClick={() => {
                      setSelectedStudentId(student.id);
                      const existing = submissions.find((submission) => submission.student.id === student.id);
                      setSelectedSubmissionId(existing?.id ?? '');
                    }}
                  >
                    <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <UserAvatar user={student} size={26} />
                      <span>{student.nickname}</span>
                    </span>
                  </button>
                ))}
              </div>

              {submissions
                .filter((submission) => !selectedStudentId || submission.student.id === selectedStudentId)
                .map((submission) => (
                  <button
                    key={submission.id}
                    className={selectedSubmissionId === submission.id ? '' : 'secondary'}
                    onClick={() => setSelectedSubmissionId(submission.id)}
                  >
                    <span className="row" style={{ gap: 10, alignItems: 'center' }}>
                      <UserAvatar user={submission.student} size={28} />
                      <span>
                        {submission.student.nickname} |{' '}
                        {submissionStatusLabels[submission.status] ?? submission.status}
                      </span>
                    </span>
                  </button>
                ))}

              {selectedSubmission && (
                <>
                  <form className="col" onSubmit={onGradeSubmission}>
                    <select
                      value={gradeForm.status}
                      onChange={(e) => setGradeForm((prev) => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="returned_for_revision">
                        {submissionStatusLabels.returned_for_revision}
                      </option>
                      <option value="reviewed">{submissionStatusLabels.reviewed}</option>
                    </select>
                    <input
                      value={gradeForm.grade}
                      onChange={(e) => setGradeForm((prev) => ({ ...prev, grade: e.target.value }))}
                      placeholder="Оценка"
                    />
                    <textarea
                      rows={4}
                      value={gradeForm.teacherComment}
                      onChange={(e) => setGradeForm((prev) => ({ ...prev, teacherComment: e.target.value }))}
                      placeholder="Комментарий преподавателя"
                    />
                    <button type="submit">Сохранить проверку</button>
                  </form>

                  <div className="panel col">
                    <h3>Версии файлов студента</h3>
                    {(selectedSubmission.files ?? []).map((file: any) => (
                      <div key={file.id} className="col card-row" style={{ alignItems: 'stretch' }}>
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{file.originalName}</strong>
                            <div className="muted">{new Date(file.uploadedAt).toLocaleString()}</div>
                          </div>
                          {token && (
                            <button
                              className="secondary"
                              onClick={() =>
                                void downloadFile(`/submission-files/${file.id}/download`, token, file.originalName)
                              }
                            >
                              Скачать
                            </button>
                          )}
                        </div>
                        {(file.comments ?? []).map((comment: any) => (
                          <div key={comment.id} className="message-item">
                            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                              <UserAvatar user={comment.author} size={24} />
                              <strong>{comment.author.nickname}</strong>
                            </div>
                            <div>{comment.content}</div>
                          </div>
                        ))}
                        <div className="row">
                          <input
                            style={{ flex: 1 }}
                            value={commentDrafts[file.id] ?? ''}
                            onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [file.id]: e.target.value }))}
                            placeholder="Комментарий к конкретной версии"
                          />
                          <button type="button" onClick={() => void addComment(file.id)}>
                            Добавить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="panel col">
            <h3>
              Личный чат {isReviewer && activeStudent ? `со студентом ${activeStudent.nickname}` : ''}
            </h3>
            <div className="message-list compact-list">
              {privateMessages.map((message) => {
                const canEdit = message.authorUserId === user?.id;
                return (
                  <div key={message.id} className="message-item">
                    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                      <UserAvatar user={message.author} size={30} />
                      <div style={{ flex: 1 }}>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <strong>{message.author.nickname}</strong>
                          {canEdit && (
                            <button
                              className="message-delete-cross"
                              type="button"
                              onClick={() => startEditPrivateMessage(message)}
                              title="Редактировать"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        {editingPrivateMessageId === message.id ? (
                          <div className="col" style={{ gap: 8 }}>
                            <textarea
                              rows={3}
                              value={editingPrivateMessageText}
                              onChange={(e) => setEditingPrivateMessageText(e.target.value)}
                            />
                            <div className="row">
                              <button type="button" onClick={() => void savePrivateMessage(message.id)}>
                                Сохранить
                              </button>
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => setEditingPrivateMessageId(null)}
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            {message.content}{' '}
                            {message.editedAt && <span className="muted">(изменено)</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <form className="row" onSubmit={onSendPrivateMessage}>
              <input
                style={{ flex: 1 }}
                value={privateMessageText}
                onChange={(e) => setPrivateMessageText(e.target.value)}
                placeholder="Сообщение"
              />
              <button type="submit">Отправить</button>
            </form>
          </div>

          {isReviewer && selectedSubmission && (
            <div className="panel col">
              <h3>История работы студента</h3>
              {activity.map((item) => (
                <div key={item.id} className="card-row">
                  <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <UserAvatar user={item.actor} size={28} />
                    <div>
                      <strong>{item.actionType}</strong>
                      <div className="muted">
                        {item.actor?.nickname ?? 'system'} | {new Date(item.occurredAt).toLocaleString()}
                      </div>
                      {renderActivityDetails(item).map((detail) => (
                        <div key={detail} className="muted">
                          {detail}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {activityMeta.total > activityMeta.pageSize && (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <button
                    className="secondary"
                    disabled={activityPage <= 1}
                    onClick={() => setActivityPage((prev) => Math.max(prev - 1, 1))}
                  >
                    Назад
                  </button>
                  <span className="muted">
                    Страница {activityMeta.page} из{' '}
                    {Math.max(1, Math.ceil(activityMeta.total / activityMeta.pageSize))}
                  </span>
                  <button
                    className="secondary"
                    disabled={activityPage >= Math.ceil(activityMeta.total / activityMeta.pageSize)}
                    onClick={() => setActivityPage((prev) => prev + 1)}
                  >
                    Вперед
                  </button>
                </div>
              )}
            </div>
          )}

          {isReviewer && (
            <div className="panel col">
              <h3>Аудит задания</h3>
              {auditLogs.map((item) => (
                <div key={item.id} className="card-row">
                  <div>
                    <strong>{item.actionType}</strong>
                    <div className="muted">
                      {item.actor?.nickname ?? 'system'} | {new Date(item.createdAt).toLocaleString()}
                    </div>
                    {renderAuditDetails(item).map((detail) => (
                      <div key={`${item.id}-${detail}`} className="muted">
                        {detail}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {auditMeta.total > auditMeta.pageSize && (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <button
                    className="secondary"
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((prev) => Math.max(prev - 1, 1))}
                  >
                    Назад
                  </button>
                  <span className="muted">
                    Страница {auditMeta.page} из{' '}
                    {Math.max(1, Math.ceil(auditMeta.total / auditMeta.pageSize))}
                  </span>
                  <button
                    className="secondary"
                    disabled={auditPage >= Math.ceil(auditMeta.total / auditMeta.pageSize)}
                    onClick={() => setAuditPage((prev) => prev + 1)}
                  >
                    Вперед
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
