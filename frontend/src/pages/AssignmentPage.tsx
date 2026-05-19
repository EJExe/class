import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../hooks/useAuth';
import {
  addSubmissionFileComment,
  deleteAssignmentFile,
  deleteSubmissionFile,
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
import { getCourse, listGroups } from '../services/courses.api';
import { wsService } from '../services/ws.service';
import { assignmentStatusLabels, submissionStatusLabels } from '../utils/lms';

const actionTypeLabels: Record<string, string> = {
  'assignment.created': 'Создано задание',
  'assignment.updated': 'Изменено задание',
  'assignment.trashed': 'Задание перемещено в корзину',
  'assignment.restored': 'Задание восстановлено из корзины',
  'assignment.file_uploaded': 'Загружен файл задания',
  'assignment.file_deleted': 'Удален файл задания',
  'submission.uploaded': 'Загружен файл работы',
  'submission.submitted': 'Работа отправлена на проверку',
  'submission.status_changed': 'Изменен статус работы',
  'submission.graded': 'Работа проверена',
  'submission.file_comment_created': 'Добавлен комментарий к файлу работы',
  'submission.gradebook_updated': 'Обновлена ведомость',
  'assignment_chat.message_created': 'Сообщение в личном чате',
  'assignment_chat.message_updated': 'Сообщение в личном чате изменено',
  file_uploaded: 'Загружен файл',
  submitted: 'Работа сдана',
  status_changed: 'Изменен статус',
  graded: 'Выставлена оценка',
  gradebook_updated: 'Обновлена ведомость',
};

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

function StatusIcon({ status }: { status: string }) {
  if (!status || status === 'not_submitted' || status === 'draft') {
    return <i className="bi bi-cup status-icon not_submitted" title="Не сдано" />;
  }
  if (status === 'submitted' || status === 'submitted_late' || status === 'under_review') {
    return <i className="bi bi-cup-hot status-icon under_review" title="На проверке" />;
  }
  if (status === 'reviewed') {
    return <i className="bi bi-cup-hot-fill status-icon reviewed" title="Проверено" />;
  }
  if (status === 'returned_for_revision') {
    return <span className="status-icon revision" title="На доработке" />;
  }
  return <i className="bi bi-cup status-icon not_submitted" title="Не сдано" />;
}

export function AssignmentPage() {
  const { courseId = '', assignmentId = '' } = useParams();
  const { token, user } = useAuth();

  const materialInputRef = useRef<HTMLInputElement | null>(null);
  const submissionInputRef = useRef<HTMLInputElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  const [courseRole, setCourseRole] = useState('student');
  const [assignment, setAssignment] = useState<any | null>(null);
  const [mySubmission, setMySubmission] = useState<any | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupFilter, setGroupFilter] = useState('all');
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
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
  const [expandedCommentFiles, setExpandedCommentFiles] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const isReviewer = ['admin', 'teacher', 'assistant'].includes(courseRole);
  const isAdmin = courseRole === 'admin';
  const activeStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  const studentRows = useMemo(() => {
    const submissionByStudentId = new Map(
      submissions.map((s: any) => [s.student.id, s]),
    );

    let filtered = students;
    if (groupFilter !== 'all') {
      const group = groups.find((g) => g.id === groupFilter);
      const memberIds = new Set((group?.members ?? []).map((m: any) => m.user.id));
      filtered = students.filter((s) => memberIds.has(s.id));
    }

    return filtered.map((student) => {
      const submission = submissionByStudentId.get(student.id);
      return {
        student,
        submission: submission ?? null,
        status: submission?.status ?? 'not_submitted',
        grade: submission?.grade ?? null,
        submittedAt: submission?.submittedAt ?? null,
        submissionId: submission?.id ?? null,
      };
    });
  }, [students, submissions, groupFilter, groups]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      not_submitted: 0,
      under_review: 0,
      reviewed: 0,
      revision: 0,
    };
    studentRows.forEach((row) => {
      if (!row.status || row.status === 'not_submitted' || row.status === 'draft') {
        counts.not_submitted++;
      } else if (row.status === 'submitted' || row.status === 'submitted_late' || row.status === 'under_review') {
        counts.under_review++;
      } else if (row.status === 'reviewed') {
        counts.reviewed++;
      } else if (row.status === 'returned_for_revision') {
        counts.revision++;
      }
    });
    return counts;
  }, [studentRows]);

  // Close settings dropdown on outside click
  useEffect(() => {
    if (!isSettingsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isSettingsOpen]);

  const loadBase = async () => {
    if (!token || !assignmentId || !courseId || !user?.id) return;

    const [assignmentData, courseData, mySubmissionData, groupData] = await Promise.all([
      getAssignment(token, assignmentId),
      getCourse(token, courseId),
      getMySubmission(token, assignmentId),
      listGroups(token, courseId),
    ]);

    setAssignment(assignmentData);
    setMySubmission(mySubmissionData);
    setGroups(groupData);
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

    let studentUsers = (courseData.members ?? [])
      .filter((member: any) => member.role === 'student')
      .map((member: any) => member.user);

    const channelGroupAccess: Array<{ groupId: string }> = assignmentData?.channel?.groupAccess ?? [];
    if (channelGroupAccess.length > 0) {
      const allowedGroupIds = new Set(channelGroupAccess.map((ga) => ga.groupId));
      const studentIdsInGroups = new Set<string>();
      for (const group of groupData) {
        if (allowedGroupIds.has(group.id)) {
          for (const member of (group.members ?? [])) {
            studentIdsInGroups.add(member.user.id);
          }
        }
      }
      studentUsers = studentUsers.filter((s: any) => studentIdsInGroups.has(s.id));
    }
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
    if (!selectedSubmission) {
      setGradeForm({ grade: '', teacherComment: '', status: 'reviewed' });
      return;
    }
    const currentStatus = selectedSubmission.status;
    setGradeForm({
      grade: selectedSubmission.grade ?? '',
      teacherComment: selectedSubmission.teacherComment ?? '',
      status: currentStatus === 'returned_for_revision' || currentStatus === 'reviewed' ? currentStatus : 'reviewed',
    });
  }, [selectedSubmission]);

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
      setIsManageModalOpen(false);
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

  const onDeleteSubmissionFile = async (fileId: string, fileName: string) => {
    if (!token) return;
    if (!window.confirm(`Открепить файл «${fileName}»?`)) return;
    await deleteSubmissionFile(token, fileId);
    await loadBase();
  };

  const onSubmitSubmission = async () => {
    if (!token) return;
    setIsSubmittingFinal(true);
    try {
      if (submissionFiles.length > 0) {
        await uploadSubmission(token, assignmentId, submissionFiles);
        setSubmissionFiles([]);
        if (submissionInputRef.current) submissionInputRef.current.value = '';
      }
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

  const handleSelectStudent = (studentId: string, submissionId: string) => {
    setSelectedStudentId(studentId);
    setSelectedSubmissionId(submissionId);
  };

  const chatPartnerName = activeStudent?.fullName || activeStudent?.nickname || '';

  return (
    <div className="page col">
      <div className="toolbar">
        <div>
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <h1>{assignment?.title ?? 'Задание'}</h1>
            {isReviewer && (
              <div className="dropdown-container" ref={settingsRef}>
                <button
                  className="icon-ghost-button icon-ghost-accent"
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  title="Настройки задания"
                >
                  ⚙
                </button>
                {isSettingsOpen && (
                  <div className="dropdown-menu">
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setIsManageModalOpen(true);
                      }}
                    >
                      Управление заданием
                    </button>
                    <div className="dropdown-divider" />
                    <button
                      className="dropdown-item dropdown-item-danger"
                      onClick={async () => {
                        setIsSettingsOpen(false);
                        if (!token) return;
                        await trashAssignment(token, assignmentId);
                        window.location.href = `/courses/${courseId}/assignments/trash`;
                      }}
                    >
                      Переместить в корзину
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="muted">
            {assignment ? assignmentStatusLabels[assignment.status] ?? assignment.status : 'Загрузка'}
          </div>
        </div>
        <div className="row">
          <Link to={`/courses/${courseId}`}>Назад к курсу</Link>
          {token && isAdmin && (
            <>
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
              {selectedSubmissionId && (
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
            </>
          )}
        </div>
      </div>

      <div className="grid-2-lms">
        {/* ── Left column ── */}
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
                <div className="row" style={{ gap: 8 }}>
                  {token && (
                    <button
                      className="secondary"
                      onClick={() => void downloadFile(`/assignment-files/${file.id}/download`, token, file.originalName)}
                    >
                      Скачать
                    </button>
                  )}
                  {token && (isAdmin || courseRole === 'teacher') && (
                    <button
                      className="secondary"
                      style={{ color: 'var(--danger)' }}
                      onClick={async () => {
                        if (!window.confirm(`Удалить файл «${file.originalName}»?`)) return;
                        await deleteAssignmentFile(token, file.id);
                        await loadBase();
                      }}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Student view: my work + file versions */}
          {!isReviewer && (
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
                {assignment?.status !== 'closed' && assignment?.status !== 'archived' && (
                  <>
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
                    </div>
                    {submissionFiles.length > 0 && (
                      <div className="col" style={{ gap: 4 }}>
                        {submissionFiles.map((file, index) => (
                          <div key={index} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="muted">{file.name}</span>
                            <button
                              className="secondary"
                              style={{ color: 'var(--danger)', fontSize: 14 }}
                              onClick={() => {
                                setSubmissionFiles((prev) => prev.filter((_, i) => i !== index));
                                if (submissionInputRef.current) submissionInputRef.current.value = '';
                              }}
                              title="Убрать из списка"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      className={isSubmittingFinal ? 'secondary' : ''}
                      disabled={isSubmittingFinal}
                      onClick={() => void onSubmitSubmission()}
                    >
                      {isSubmittingFinal ? 'Сдача...' : 'Сдать работу'}
                    </button>
                  </>
                )}
                {assignment?.status === 'closed' && (
                  <div className="muted">Задание закрыто. Отправка работ недоступна.</div>
                )}
                {assignment?.status === 'archived' && (
                  <div className="muted">Задание в архиве. Отправка работ недоступна.</div>
                )}
              </div>

              {selectedSubmission && (
                <div className="panel col">
                  <h3>Версии моих файлов и комментарии</h3>
                  <div className="panel-fixed">
                    {(selectedSubmission.files ?? []).map((file: any) => (
                      <div key={file.id} className="col card-row" style={{ alignItems: 'stretch' }}>
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{file.originalName}</strong>
                            <div className="muted">{new Date(file.uploadedAt).toLocaleString()}</div>
                          </div>
                          <div className="row" style={{ gap: 8 }}>
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
                            {token &&
                              selectedSubmission &&
                              (selectedSubmission.status === 'draft' ||
                                selectedSubmission.status === 'not_submitted') && (
                                <button
                                  className="secondary"
                                  style={{ color: 'var(--danger)' }}
                                  onClick={() => void onDeleteSubmissionFile(file.id, file.originalName)}
                                  title="Открепить файл"
                                >
                                  ×
                                </button>
                              )}
                          </div>
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
                </div>
              )}
            </>
          )}

          {/* Reviewer view: student file versions */}
          {isReviewer && selectedSubmission && (
            <div className="panel col">
              <h3>Версии файлов студента</h3>
              <div className="panel-fixed">
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
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: 13 }}
                      onClick={() =>
                        setExpandedCommentFiles((prev) => {
                          const next = new Set(prev);
                          next.has(file.id) ? next.delete(file.id) : next.add(file.id);
                          return next;
                        })
                      }
                    >
                      {expandedCommentFiles.has(file.id) ? 'Скрыть комментарий' : 'Добавить комментарий'}
                    </button>
                    {expandedCommentFiles.has(file.id) && (
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
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Private chat — reviewers only in left column */}
          {isReviewer && (
            <div className="panel col">
              <h3>
                Личный чат
                {activeStudent ? ` со студентом ${chatPartnerName}` : ''}
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
                              ✎
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
          )}
        </div>

        {/* ── Right column ── */}
        <div className="col">
          {isReviewer && (
            <div className="panel col">
              <h3>Работы студентов</h3>

              <div className="filters-row">
                <input
                  style={{ flex: 1, minWidth: 180 }}
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Поиск по студентам"
                />
                {groups.length > 0 && (
                  <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                    <option value="all">Все группы</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ overflow: 'auto' }}>
                <table className="student-table">
                  <thead>
                    <tr>
                      <th>Студент</th>
                      <th>Статус</th>
                      <th>Оценка</th>
                      <th>Сдано</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentRows.map((row) => (
                      <tr
                        key={row.student.id}
                        className={selectedStudentId === row.student.id ? 'selected' : ''}
                        onClick={() => handleSelectStudent(row.student.id, row.submissionId ?? '')}
                      >
                        <td>
                          <div className="student-col">
                            <UserAvatar user={row.student} size={32} />
                            <div>
                              <div className="student-name">{row.student.fullName || row.student.nickname}</div>
                              <div className="student-nickname">@{row.student.nickname}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <StatusIcon status={row.status} />{' '}
                          {submissionStatusLabels[row.status] ?? submissionStatusLabels.not_submitted}
                        </td>
                        <td>{row.grade ?? '–'}</td>
                        <td className="muted">
                          {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="table-summary">
                <span><StatusIcon status="not_submitted" /> Не сдано: {statusCounts.not_submitted}</span>
                <span><StatusIcon status="under_review" /> На проверке: {statusCounts.under_review}</span>
                <span><StatusIcon status="reviewed" /> Проверено: {statusCounts.reviewed}</span>
                <span><StatusIcon status="returned_for_revision" /> Доработка: {statusCounts.revision}</span>
              </div>

              {selectedSubmission && (
                <div className="grading-inline">
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
                </div>
              )}
            </div>
          )}

          {isReviewer && selectedSubmission && (
            <div className="panel col">
              <h3
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setIsActivityOpen((prev) => !prev)}
              >
                {isActivityOpen ? '▾' : '▸'} История работы студента
              </h3>
              {isActivityOpen && (
                <>
                  {activity.map((item) => (
                    <div key={item.id} className="card-row">
                      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                        <UserAvatar user={item.actor} size={28} />
                        <div>
                          <strong>{actionTypeLabels[item.actionType] ?? item.actionType}</strong>
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
                </>
              )}
            </div>
          )}

          {isReviewer && (
            <div className="panel col">
              <h3
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setIsAuditOpen((prev) => !prev)}
              >
                {isAuditOpen ? '▾' : '▸'} Аудит задания
              </h3>
              {isAuditOpen && (
                <>
                  {auditLogs.map((item) => (
                    <div key={item.id} className="card-row">
                      <div>
                        <strong>{actionTypeLabels[item.actionType] ?? item.actionType}</strong>
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
                </>
              )}
            </div>
          )}
          {/* Student private chat in right column */}
          {!isReviewer && (
            <div className="panel col">
              <h3>
                Личный чат
                {privateChat ? ' с преподавателем' : ''}
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
                                ✎
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
          )}
        </div>
      </div>

      {/* Management modal */}
      {isManageModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsManageModalOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>Управление заданием</h3>
              <button
                type="button"
                className="icon-ghost-button"
                title="Закрыть"
                onClick={() => setIsManageModalOpen(false)}
              >
                ×
              </button>
            </div>

            {assignment?.status === 'archived' ? (
              <div className="muted">Задание в архиве. Редактирование недоступно.</div>
            ) : (
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
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="secondary" onClick={() => setIsManageModalOpen(false)}>
                    Отмена
                  </button>
                  <button type="submit">Сохранить</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
