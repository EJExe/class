import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { listAuditLogs } from '../services/audit.api';

const actionLabels: Record<string, string> = {
  'course.created': 'Создан курс',
  'course.updated': 'Изменен курс',
  'course.joined': 'Пользователь вступил в курс',
  'course.role_updated': 'Изменена роль участника курса',
  'group.created': 'Создана группа',
  'group.member_added': 'Пользователь добавлен в группу',
  'group.member_removed': 'Пользователь удален из группы',
  'assignment.created': 'Создано задание',
  'assignment.updated': 'Изменено задание',
  'assignment.file_uploaded': 'Загружен файл задания',
  'assignment.file_deleted': 'Удален файл задания',
  'submission.uploaded': 'Загружен файл работы',
  'submission.submitted': 'Работа отправлена на проверку',
  'submission.status_changed': 'Изменен статус работы',
  'submission.graded': 'Работа проверена',
  'assignment_chat.message_created': 'Сообщение в личном чате по заданию',
  'message.created': 'Отправлено сообщение в чате',
  'message.deleted': 'Удалено сообщение в чате',
  'message.reaction_added': 'Добавлена реакция',
  'message.reaction_removed': 'Убрана реакция',
};

function renderAuditDetails(log: any) {
  const meta = log.metadataJson ?? {};
  const details: string[] = [];

  if (meta.title) details.push(`Название: ${meta.title}`);
  if (meta.name) details.push(`Имя: ${meta.name}`);
  if (meta.role) details.push(`Роль: ${meta.role}`);
  if (meta.channelId) details.push(`Канал: ${meta.channelId}`);
  if (meta.courseId) details.push(`Курс: ${meta.courseId}`);
  if (meta.assignmentId) details.push(`Задание: ${meta.assignmentId}`);
  if (meta.inviteCode) details.push(`Код приглашения: ${meta.inviteCode}`);
  if (meta.emoji) details.push(`Реакция: ${meta.emoji}`);
  if (meta.contentPreview) details.push(`Текст: ${meta.contentPreview}`);
  if (meta.attachmentsCount) details.push(`Вложений: ${meta.attachmentsCount}`);
  if (meta.grade) details.push(`Оценка: ${meta.grade}`);
  if (meta.teacherComment) details.push(`Комментарий: ${meta.teacherComment}`);
  if (meta.previousStatus || meta.nextStatus) {
    details.push(`Статус: ${meta.previousStatus ?? '—'} -> ${meta.nextStatus ?? '—'}`);
  }
  if (meta.deletedOwnMessage !== undefined) {
    details.push(meta.deletedOwnMessage ? 'Удалено свое сообщение' : 'Удалено чужое сообщение');
  }
  if (meta.removedAllForEmoji) {
    details.push('Администратор убрал все реакции этого типа');
  }

  return details;
}

export function AuditLogsPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<Array<any>>([]);

  useEffect(() => {
    if (!token) return;
    listAuditLogs(token).then(setLogs).catch(() => setLogs([]));
  }, [token]);

  return (
    <div className="page col">
      <div className="toolbar">
        <h1>Журнал аудита</h1>
        <Link to="/courses">Курсы</Link>
      </div>

      <div className="panel col">
        {logs.map((log) => (
          <div key={log.id} className="card-row">
            <div>
              <strong>{actionLabels[log.actionType] ?? log.actionType}</strong>
              <div className="muted">
                Сущность: {log.entityType} | ID: {log.entityId}
              </div>
              <div className="muted">
                {log.actor?.nickname ?? 'system'} | {new Date(log.createdAt).toLocaleString()}
              </div>
              {renderAuditDetails(log).map((detail) => (
                <div key={`${log.id}-${detail}`} className="muted">
                  {detail}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
