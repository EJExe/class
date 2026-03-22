import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  createPrivateMessage,
  getAssignment,
  getAssignmentAuditLogs,
  getMySubmission,
  getPrivateChat,
  getSubmissionActivity,
  gradeSubmission,
  listPrivateMessages,
  listSubmissions,
  submitSubmission,
  updateAssignment,
  uploadAssignmentFile,
  uploadSubmission,
} from '../services/assignments.api';
import { downloadFile } from '../services/apiClient';
import { getCourse } from '../services/courses.api';
import { assignmentStatusLabels, submissionStatusLabels } from '../utils/lms';

function renderSubmissionActivityDetails(item: any) {
  const meta = item?.metadataJson ?? {};
  const details: string[] = [];

  if (meta.previousStatus || meta.nextStatus) {
    const from = meta.previousStatus ? submissionStatusLabels[meta.previousStatus] ?? meta.previousStatus : null;
    const to = meta.nextStatus ? submissionStatusLabels[meta.nextStatus] ?? meta.nextStatus : null;
    if (from && to) {
      details.push(`Status: ${from} -> ${to}`);
    } else if (to) {
      details.push(`Status: ${to}`);
    }
  }

  if (meta.grade) {
    details.push(`Grade: ${meta.grade}`);
  }

  if (meta.teacherComment) {
    details.push(`Teacher comment: ${meta.teacherComment}`);
  }

  if (meta.originalName) {
    details.push(`File: ${meta.originalName}`);
  }

  return details;
}

export function AssignmentPage() {
  const { courseId = '', assignmentId = '' } = useParams();
  const { token, user } = useAuth();
  const [courseRole, setCourseRole] = useState<string>('student');
  const [assignment, setAssignment] = useState<any | null>(null);
  const [mySubmission, setMySubmission] = useState<any | null>(null);
  const [submissions, setSubmissions] = useState<Array<any>>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('');
  const [privateChat, setPrivateChat] = useState<any | null>(null);
  const [privateMessages, setPrivateMessages] = useState<Array<any>>([]);
  const [activity, setActivity] = useState<Array<any>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<any>>([]);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [privateMessage, setPrivateMessage] = useState('');
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
  const [error, setError] = useState<string | null>(null);

  const isReviewer = ['admin', 'teacher', 'assistant'].includes(courseRole);
  const selectedSubmission = submissions.find((submission) => submission.id === selectedSubmissionId) ?? null;

  const load = async () => {
    if (!token || !assignmentId || !courseId) return;

    const [assignmentData, courseData, mySubmissionData] = await Promise.all([
      getAssignment(token, assignmentId),
      getCourse(token, courseId),
      getMySubmission(token, assignmentId),
    ]);

    setAssignment(assignmentData);
    setMySubmission(mySubmissionData);
    setAuditLogs([]);
    setAssignmentForm({
      title: assignmentData.title,
      description: assignmentData.description ?? '',
      deadlineAt: assignmentData.deadlineAt ? new Date(assignmentData.deadlineAt).toISOString().slice(0, 16) : '',
      status: assignmentData.status,
    });

    const role = courseData.members.find((member: any) => member.user.id === user?.id)?.role ?? 'student';
    setCourseRole(role);

    if (['admin', 'teacher', 'assistant'].includes(role)) {
      const [list, assignmentAuditLogs] = await Promise.all([
        listSubmissions(token, assignmentId),
        getAssignmentAuditLogs(token, assignmentId),
      ]);
      setSubmissions(list.items);
      setAuditLogs(assignmentAuditLogs);
      if (!selectedSubmissionId && list.items[0]) {
        setSelectedSubmissionId(list.items[0].id);
      }
    } else {
      setSubmissions([]);
      setSelectedSubmissionId('');
    }
  };

  useEffect(() => {
    void load();
  }, [token, assignmentId, courseId]);

  useEffect(() => {
    if (!token || !assignmentId) return;

    const studentUserId = isReviewer ? selectedSubmission?.student?.id : undefined;
    if (isReviewer && !studentUserId) {
      setPrivateChat(null);
      setPrivateMessages([]);
      setActivity([]);
      return;
    }

    const run = async () => {
      const chat = await getPrivateChat(token, assignmentId, studentUserId);
      setPrivateChat(chat);
      setPrivateMessages(await listPrivateMessages(token, chat.id));
      if (selectedSubmissionId) {
        setActivity(await getSubmissionActivity(token, selectedSubmissionId));
      } else {
        setActivity([]);
      }
    };

    void run();
  }, [token, assignmentId, isReviewer, selectedSubmissionId, selectedSubmission?.student?.id]);

  const onAssignmentSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      await updateAssignment(token, assignmentId, {
        title: assignmentForm.title,
        description: assignmentForm.description,
        deadlineAt: assignmentForm.deadlineAt ? new Date(assignmentForm.deadlineAt).toISOString() : undefined,
        status: assignmentForm.status,
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUploadMaterial = async () => {
    if (!token || !materialFile) return;
    await uploadAssignmentFile(token, assignmentId, materialFile);
    setMaterialFile(null);
    await load();
  };

  const onUploadSubmission = async () => {
    if (!token || !submissionFile) return;
    await uploadSubmission(token, assignmentId, submissionFile);
    setSubmissionFile(null);
    await load();
  };

  const onSubmitSubmission = async () => {
    if (!token) return;
    await submitSubmission(token, assignmentId);
    await load();
  };

  const onGradeSubmission = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedSubmissionId) return;
    await gradeSubmission(token, selectedSubmissionId, {
      grade: gradeForm.grade,
      teacherComment: gradeForm.teacherComment,
      status: gradeForm.status,
    });
    await load();
  };

  const onSendPrivateMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !privateChat || !privateMessage.trim()) return;
    await createPrivateMessage(token, privateChat.id, privateMessage.trim());
    setPrivateMessage('');
    setPrivateMessages(await listPrivateMessages(token, privateChat.id));
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <div>
          <h1>{assignment?.title ?? 'Assignment'}</h1>
          <div className="muted">
            {assignment ? assignmentStatusLabels[assignment.status] ?? assignment.status : 'Loading'}
          </div>
        </div>
        <Link to={`/courses/${courseId}`}>Back to course</Link>
      </div>

      <div className="grid-2-lms">
        <div className="col">
          <div className="panel col">
            <h3>Assignment details</h3>
            <p>{assignment?.description || 'No description provided.'}</p>
            <div className="muted">
              Deadline: {assignment?.deadlineAt ? new Date(assignment.deadlineAt).toLocaleString() : 'not set'}
            </div>
            <div className="col">
              {assignment?.files?.map((file: any) => (
                <div key={file.id} className="card-row">
                  <span>{file.originalName}</span>
                  {token && (
                    <button
                      className="secondary"
                      onClick={() => void downloadFile(`/assignment-files/${file.id}/download`, token, file.originalName)}
                    >
                      Download
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isReviewer && assignment && (
            <div className="panel col">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Assignment management</h3>
                <button className="secondary" type="button" onClick={() => setIsManageOpen((prev) => !prev)}>
                  {isManageOpen ? 'Hide controls' : 'Open controls'}
                </button>
              </div>
              {isManageOpen && (
                <form className="col" onSubmit={onAssignmentSave}>
                  <input
                    value={assignmentForm.title}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Title"
                  />
                  <textarea
                    rows={5}
                    value={assignmentForm.description}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Description"
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
                  <div className="row">
                    <input type="file" onChange={(e) => setMaterialFile(e.target.files?.[0] ?? null)} />
                    <button className="secondary" type="button" onClick={() => void onUploadMaterial()}>
                      Upload material
                    </button>
                  </div>
                  <button type="submit">Save assignment</button>
                </form>
              )}
            </div>
          )}

          {!isReviewer && (
            <div className="panel col">
              <h3>My submission</h3>
              <div className="muted">
                Status:{' '}
                {mySubmission
                  ? submissionStatusLabels[mySubmission.status] ?? mySubmission.status
                  : submissionStatusLabels.not_submitted}
              </div>
              {mySubmission?.isLate && <div className="error-text">Submitted after deadline</div>}
              {mySubmission?.grade && <div>Grade: {mySubmission.grade}</div>}
              {mySubmission?.teacherComment && <div>Teacher comment: {mySubmission.teacherComment}</div>}
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
                  Download current file
                </button>
              )}
              <div className="row">
                <input type="file" onChange={(e) => setSubmissionFile(e.target.files?.[0] ?? null)} />
                <button className="secondary" onClick={() => void onUploadSubmission()}>
                  Upload draft
                </button>
              </div>
              <button onClick={() => void onSubmitSubmission()}>Submit final</button>
            </div>
          )}
        </div>

        <div className="col">
          {isReviewer && (
            <div className="panel col">
              <h3>Submissions</h3>
              <div className="col">
                {submissions.map((submission) => (
                  <button
                    key={submission.id}
                    className={selectedSubmissionId === submission.id ? '' : 'secondary'}
                    onClick={() => setSelectedSubmissionId(submission.id)}
                  >
                    {submission.student.nickname} | {submissionStatusLabels[submission.status] ?? submission.status}
                  </button>
                ))}
              </div>

              {selectedSubmission && (
                <form className="col" onSubmit={onGradeSubmission}>
                  <div className="card-row">
                    <span>{selectedSubmission.student.nickname}</span>
                    {selectedSubmission.currentFile && token && (
                      <button
                        className="secondary"
                        type="button"
                        onClick={() =>
                          void downloadFile(
                            `/submission-files/${selectedSubmission.currentFile.id}/download`,
                            token,
                            selectedSubmission.currentFile.originalName,
                          )
                        }
                      >
                        Download
                      </button>
                    )}
                  </div>
                  <select
                    value={gradeForm.status}
                    onChange={(e) => setGradeForm((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="returned_for_revision">{submissionStatusLabels.returned_for_revision}</option>
                    <option value="reviewed">{submissionStatusLabels.reviewed}</option>
                  </select>
                  <input
                    value={gradeForm.grade}
                    onChange={(e) => setGradeForm((prev) => ({ ...prev, grade: e.target.value }))}
                    placeholder="Grade"
                  />
                  <textarea
                    rows={4}
                    value={gradeForm.teacherComment}
                    onChange={(e) => setGradeForm((prev) => ({ ...prev, teacherComment: e.target.value }))}
                    placeholder="Teacher comment"
                  />
                  <button type="submit">Save review</button>
                </form>
              )}
            </div>
          )}

          <div className="panel col">
            <h3>Private chat</h3>
            <div className="message-list compact-list">
              {privateMessages.map((message) => (
                <div key={message.id} className="message-item">
                  <strong>{message.author.nickname}</strong>
                  <div>{message.content}</div>
                </div>
              ))}
            </div>
            <form className="row" onSubmit={onSendPrivateMessage}>
              <input
                style={{ flex: 1 }}
                value={privateMessage}
                onChange={(e) => setPrivateMessage(e.target.value)}
                placeholder="Private message"
              />
              <button type="submit">Send</button>
            </form>
          </div>

          {isReviewer && selectedSubmission && (
            <div className="panel col">
              <h3>Submission activity</h3>
              {activity.map((item) => (
                <div key={item.id} className="card-row">
                  <div>
                    <strong>{item.actionType}</strong>
                    <div className="muted">
                      {item.actor?.nickname ?? 'system'} | {new Date(item.occurredAt).toLocaleString()}
                    </div>
                    {renderSubmissionActivityDetails(item).map((detail) => (
                      <div key={detail} className="muted">
                        {detail}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isReviewer && (
            <div className="panel col">
              <h3>Assignment audit</h3>
              {auditLogs.map((item) => (
                <div key={item.id} className="card-row">
                  <div>
                    <strong>{item.actionType}</strong>
                    <div className="muted">
                      {item.actor?.nickname ?? 'system'} | {new Date(item.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
