import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../hooks/useAuth';
import { downloadFile } from '../services/apiClient';
import { createChannel, listChannels } from '../services/channels.api';
import { getCourse, listGroups } from '../services/courses.api';
import {
  addMessageReaction,
  deleteMessage,
  getMessages,
  markChannelRead,
  removeMessageReaction,
  searchMessages,
  sendMessage,
  updateMessage,
} from '../services/messages.api';
import { wsService } from '../services/ws.service';

const REACTION_OPTIONS = ['👍', '❤️', '🔥', '👏', '😂'];

function SmallBadge() {
  return (
    <span className="mini-badge" aria-hidden="true">
      !
    </span>
  );
}

export function CoursePage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [course, setCourse] = useState<any | null>(null);
  const [channels, setChannels] = useState<Array<any>>([]);
  const [groups, setGroups] = useState<Array<any>>([]);
  const [activeChannelId, setActiveChannelId] = useState('');
  const [messages, setMessages] = useState<Array<any>>([]);
  const [messageText, setMessageText] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChannelFormOpen, setIsChannelFormOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [mentionQuery, setMentionQuery] = useState('');
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionPage, setMentionPage] = useState(0);
  const [reactionMenuMessageId, setReactionMenuMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [channelForm, setChannelForm] = useState({
    name: '',
    description: '',
    type: 'text' as 'text' | 'assignment',
    assignmentDeadlineAt: '',
    groupIds: [] as string[],
  });

  const myRole = course?.currentUserRole ?? '';
  const isManager = ['admin', 'teacher'].includes(myRole);
  const isAdmin = myRole === 'admin';
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? null;
  const groupNamesById = new Map(groups.map((group) => [group.id, group.name]));

  const filteredChannels = useMemo(() => {
    if (!isManager || groupFilter === 'all') {
      return channels;
    }
    if (groupFilter === 'unassigned') {
      return channels.filter((channel) => !channel.groupAccess?.length);
    }
    return channels.filter((channel) => channel.groupAccess?.some((entry: any) => entry.groupId === groupFilter));
  }, [channels, groupFilter, isManager]);

  const mergeMessages = (current: Array<any>, incoming: Array<any>) => {
    const map = new Map<string, any>();
    for (const item of current) map.set(item.id, item);
    for (const item of incoming) map.set(item.id, item);
    return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  const aggregateReactions = (message: any) => {
    const counts = new Map<string, number>();
    (message.reactions ?? []).forEach((reaction: any) => {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([emoji, count]) => ({
      emoji,
      count,
      active: (message.reactions ?? []).some(
        (reaction: any) => reaction.emoji === emoji && reaction.userId === user?.id,
      ),
    }));
  };

  const loadCourse = async () => {
    if (!token || !courseId) return;
    const [courseData, channelData, groupData] = await Promise.all([
      getCourse(token, courseId),
      listChannels(token, courseId),
      listGroups(token, courseId),
    ]);
    setCourse(courseData);
    setChannels(channelData);
    setGroups(groupData);

    if (!activeChannelId) {
      const nextTextChannel = channelData.find((channel: any) => channel.type === 'text');
      if (nextTextChannel) {
        setActiveChannelId(nextTextChannel.id);
      }
    }
  };

  useEffect(() => {
    void loadCourse();
  }, [token, courseId]);

  const loadMessages = async (reset = true) => {
    if (!token || !activeChannelId) return;

    if (messageSearch.trim()) {
      const results = await searchMessages(token, activeChannelId, messageSearch.trim(), 50);
      setMessages(results);
      setNextCursor(null);
      return;
    }

    const payload = await getMessages(token, activeChannelId, reset ? undefined : nextCursor ?? undefined, 30);
    setMessages((prev) => (reset ? payload.items : [...payload.items, ...prev]));
    setNextCursor(payload.nextCursor);
  };

  useEffect(() => {
    if (!token || !activeChannelId || activeChannel?.type !== 'text') return;
    void loadMessages(true);
  }, [token, activeChannelId, activeChannel?.type, messageSearch]);

  useEffect(() => {
    if (!token || !activeChannelId || activeChannel?.type !== 'text' || messageSearch.trim()) return;

    const socket = wsService.connect(token);
    const joinChannel = () => socket.emit('chat:join', { channelId: activeChannelId });
    const onNew = (event: { channelId: string; message: any }) => {
      if (event.channelId !== activeChannelId) return;
      setMessages((prev) => mergeMessages(prev, [event.message]));
    };
    const onUpdated = (event: { channelId: string; message: any }) => {
      if (event.channelId !== activeChannelId) return;
      setMessages((prev) => prev.map((message) => (message.id === event.message.id ? event.message : message)));
      setEditingMessageId((current) => (current === event.message.id ? null : current));
    };
    const onDeleted = (event: { channelId: string; messageId: string }) => {
      if (event.channelId !== activeChannelId) return;
      setMessages((prev) => prev.filter((message) => message.id !== event.messageId));
      setReactionMenuMessageId((current) => (current === event.messageId ? null : current));
      setEditingMessageId((current) => (current === event.messageId ? null : current));
    };

    socket.on('connect', joinChannel);
    socket.on('chat:message:new', onNew);
    socket.on('chat:message:updated', onUpdated);
    socket.on('chat:message:deleted', onDeleted);

    if (socket.connected) {
      joinChannel();
    }

    return () => {
      socket.emit('chat:leave', { channelId: activeChannelId });
      socket.off('connect', joinChannel);
      socket.off('chat:message:new', onNew);
      socket.off('chat:message:updated', onUpdated);
      socket.off('chat:message:deleted', onDeleted);
    };
  }, [token, activeChannelId, activeChannel?.type, messageSearch]);

  useEffect(() => {
    if (!token || !activeChannelId) return;
    void markChannelRead(token, activeChannelId).catch(() => undefined);
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === activeChannelId ? { ...channel, hasUnreadMessages: false } : channel,
      ),
    );
  }, [token, activeChannelId]);

  const availableMentionMembers = useMemo(() => {
    if (!course?.members || !activeChannel) {
      return [];
    }

    const memberById = new Map(course.members.map((member: any) => [member.user.id, member.user]));
    if (!activeChannel.groupAccess?.length) {
      return Array.from(memberById.values());
    }

    const allowedUserIds = new Set<string>();
    course.members.forEach((member: any) => {
      if (['admin', 'teacher', 'assistant'].includes(member.role)) {
        allowedUserIds.add(member.user.id);
      }
    });

    for (const access of activeChannel.groupAccess) {
      const group = groups.find((item) => item.id === access.groupId);
      group?.members?.forEach((member: any) => allowedUserIds.add(member.user.id));
    }

    return Array.from(allowedUserIds).map((id) => memberById.get(id)).filter(Boolean);
  }, [course, activeChannel, groups]);

  const mentionSuggestions = useMemo(() => {
    const normalized = mentionQuery.trim().toLowerCase();
    return availableMentionMembers
      .filter((member: any) => member.id !== user?.id)
      .filter((member: any) => (normalized ? member.nickname.toLowerCase().includes(normalized) : true))
      .sort((a: any, b: any) => a.nickname.localeCompare(b.nickname, 'ru'));
  }, [availableMentionMembers, mentionQuery, user?.id]);

  const mentionPageSize = 6;
  const mentionPageCount = Math.max(1, Math.ceil(mentionSuggestions.length / mentionPageSize));
  const pagedMentionSuggestions = mentionSuggestions.slice(
    mentionPage * mentionPageSize,
    mentionPage * mentionPageSize + mentionPageSize,
  );

  useEffect(() => {
    setMentionPage(0);
  }, [mentionQuery, activeChannelId]);

  const handleMessageChange = (value: string) => {
    setMessageText(value);
    const match = value.match(/(?:^|\s)@([^\s@]*)$/u);
    setMentionQuery(match ? match[1] : '');
    setIsMentionOpen(Boolean(match));
  };

  const insertMention = (nickname: string) => {
    setMessageText((prev) =>
      prev.replace(/(?:^|\s)@([^\s@]*)$/u, (match) => match.replace(/@([^\s@]*)$/, `@${nickname} `)),
    );
    setMentionQuery('');
    setIsMentionOpen(false);
  };

  const onCreateChannel = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      const payload =
        channelForm.type === 'assignment'
          ? {
              name: channelForm.name.trim(),
              description: channelForm.description,
              type: channelForm.type,
              groupIds: channelForm.groupIds,
              assignmentTitle: channelForm.name.trim(),
              assignmentDescription: channelForm.description,
              assignmentDeadlineAt: channelForm.assignmentDeadlineAt || undefined,
            }
          : {
              name: channelForm.name.trim(),
              description: channelForm.description,
              type: channelForm.type,
              groupIds: channelForm.groupIds,
            };
      await createChannel(token, courseId, payload);
      setChannelForm({
        name: '',
        description: '',
        type: 'text',
        assignmentDeadlineAt: '',
        groupIds: [],
      });
      await loadCourse();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onSendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !activeChannelId || (!messageText.trim() && pendingFiles.length === 0)) return;
    setIsSendingMessage(true);
    try {
      const message = await sendMessage(token, activeChannelId, messageText.trim(), pendingFiles);
      setMessages((prev) => mergeMessages(prev, [message]));
      setMessageText('');
      setPendingFiles([]);
      setMentionQuery('');
      setIsMentionOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const onDeleteMessage = async (messageId: string) => {
    if (!token || !activeChannelId) return;
    try {
      wsService.connect(token).emit('chat:message:delete', { channelId: activeChannelId, messageId });
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
    } catch {
      await deleteMessage(token, messageId);
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
    }
  };

  const startEditing = (message: any) => {
    setEditingMessageId(message.id);
    setEditingText(message.content ?? '');
    setReactionMenuMessageId(null);
  };

  const saveMessageEdit = async (messageId: string) => {
    if (!token || !activeChannelId || !editingText.trim()) return;
    const socket = wsService.connect(token);
    if (socket.connected) {
      socket.emit('chat:message:update', {
        channelId: activeChannelId,
        messageId,
        content: editingText.trim(),
      });
    } else {
      const updated = await updateMessage(token, messageId, editingText.trim());
      setMessages((prev) => prev.map((message) => (message.id === updated.id ? updated : message)));
    }
    setEditingMessageId(null);
    setEditingText('');
  };

  const onToggleReaction = async (message: any, emoji: string) => {
    if (!token) return;
    const alreadyReacted = message.reactions?.some(
      (reaction: any) => reaction.emoji === emoji && reaction.userId === user?.id,
    );
    const updated =
      alreadyReacted || isAdmin
        ? await removeMessageReaction(token, message.id, emoji)
        : await addMessageReaction(token, message.id, emoji);

    if (updated) {
      setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      if (fileInputRef.current && next.length === 0) {
        fileInputRef.current.value = '';
      }
      return next;
    });
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <div>
          <h1>{course?.title ?? 'Курс'}</h1>
          <p className="muted">{course?.description ?? 'Пространство курса'}</p>
          <p className="muted">Код приглашения: {course?.inviteCode}</p>
        </div>
        <div className="row">
          <Link to="/courses">Все курсы</Link>
          <Link to={`/courses/${courseId}/members`}>Участники</Link>
          {isManager && <Link to={`/courses/${courseId}/groups`}>Группы</Link>}
          {isManager && <Link to={`/courses/${courseId}/gradebook`}>{'\u0412\u0435\u0434\u043e\u043c\u043e\u0441\u0442\u044c'}</Link>}
          {isManager && <Link to={`/courses/${courseId}/assignments/trash`}>{'\u041a\u043e\u0440\u0437\u0438\u043d\u0430'}</Link>}
          {token && isAdmin && (
            <>
              <button className="secondary" onClick={() => void downloadFile(`/courses/${courseId}/export`, token, 'course.csv')}>
                Экспорт курса CSV
              </button>
              <button className="secondary" onClick={() => void downloadFile(`/courses/${courseId}/review-log/export`, token, 'review-log.csv')}>
                Экспорт журнала проверок
              </button>
            </>
          )}
        </div>
      </div>


      <div className="course-layout">
        <aside className="panel col">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="row">
              <h3>Каналы</h3>
              {isManager && (
                <button
                  type="button"
                  className="icon-ghost-button"
                  title="Управление каналами"
                  onClick={() => setIsChannelFormOpen(true)}
                >
                  ✎
                </button>
              )}
            </div>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="all">Все группы</option>
              <option value="unassigned">Без группы</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col">
            <button className="secondary" onClick={() => navigate(`/courses/${courseId}/video`)}>
              {'\u0412\u0438\u0434\u0435\u043e\u043a\u043e\u043c\u043d\u0430\u0442\u0430'}
            </button>
          </div>

          {filteredChannels.map((channel) => {
            const hasIndicator = Boolean(channel.hasUnreadMessages || channel.assignment?.hasUnread);
            const accessText = channel.groupAccess?.length
              ? channel.groupAccess
                  .map((entry: any) => groupNamesById.get(entry.groupId) ?? 'Неизвестная группа')
                  .join(', ')
              : 'всем студентам';

            if (channel.type === 'assignment' && channel.assignment) {
              return (
                <Link key={channel.id} className="channel-link" to={`/courses/${courseId}/assignments/${channel.assignment.id}`}>
                  <div className="col" style={{ gap: 4 }}>
                    <span>
                      # {channel.name} {hasIndicator && <SmallBadge />}
                    </span>
                    <small className="muted">Задание</small>
                    {isManager && <small className="muted">Доступ: {accessText}</small>}
                  </div>
                </Link>
              );
            }

            return (
              <div key={channel.id} className="col">
                <button className={activeChannelId === channel.id ? '' : 'secondary'} onClick={() => setActiveChannelId(channel.id)}>
                  # {channel.name} {channel.hasUnreadMessages && <SmallBadge />}
                </button>
                {isManager && <small className="muted">Доступ: {accessText}</small>}
              </div>
            );
          })}
        </aside>

        <main className="col">
          {activeChannel?.type === 'text' ? (
            <div className="panel col">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{activeChannel.name}</h3>
                <button
                  className="secondary"
                  disabled={!nextCursor || Boolean(messageSearch.trim())}
                  onClick={() => void loadMessages(false)}
                >
                  Загрузить старые
                </button>
              </div>

              <input
                value={messageSearch}
                onChange={(e) => setMessageSearch(e.target.value)}
                placeholder="Поиск по сообщениям текущего чата"
              />

              <div className="message-list">
                {messages.map((message) => {
                  const reactions = aggregateReactions(message);
                  const canEdit = message.authorUserId === user?.id;

                  return (
                    <div key={message.id} className="message-item">
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                          <UserAvatar user={message.author} size={30} />
                          <strong>{message.author?.nickname ?? 'Пользователь'}</strong>
                        </span>
                        <div className="row" style={{ gap: 8 }}>
                          {canEdit && (
                            <button
                              type="button"
                              className="message-delete-cross"
                              onClick={() => startEditing(message)}
                              title="Редактировать сообщение"
                            >
                              ✎
                            </button>
                          )}
                          {(message.authorUserId === user?.id || isAdmin) && (
                            <button
                              type="button"
                              className="message-delete-cross"
                              onClick={() => void onDeleteMessage(message.id)}
                              title="Удалить сообщение"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>

                      {editingMessageId === message.id ? (
                        <div className="col" style={{ gap: 8 }}>
                          <textarea rows={3} value={editingText} onChange={(e) => setEditingText(e.target.value)} />
                          <div className="row">
                            <button type="button" onClick={() => void saveMessageEdit(message.id)}>
                              Сохранить
                            </button>
                            <button className="secondary" type="button" onClick={() => setEditingMessageId(null)}>
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="message-body interactive"
                          onClick={() => setReactionMenuMessageId((current) => (current === message.id ? null : message.id))}
                        >
                          {message.content || '[вложение]'} {message.editedAt && <span className="muted">(изменено)</span>}
                        </div>
                      )}

                      {message.attachments?.length > 0 && (
                        <div className="attachment-list">
                          {message.attachments.map((attachment: any) => (
                            <a
                              key={attachment.id}
                              href="#"
                              className="attachment-link"
                              onClick={(event) => {
                                event.preventDefault();
                                if (!token) return;
                                void downloadFile(`/message-files/${attachment.id}/download`, token, attachment.originalName);
                              }}
                            >
                              {attachment.originalName}
                            </a>
                          ))}
                        </div>
                      )}

                      {reactionMenuMessageId === message.id && editingMessageId !== message.id && (
                        <div className="reaction-picker">
                          {REACTION_OPTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="secondary icon-button"
                              onClick={() => {
                                void onToggleReaction(message, emoji);
                                setReactionMenuMessageId(null);
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {reactions.length > 0 && (
                        <div className="reaction-row">
                          {reactions.map((reaction) => (
                            <button
                              key={reaction.emoji}
                              type="button"
                              className={`reaction-chip ${reaction.active ? 'active' : ''}`}
                              onClick={() => void onToggleReaction(message, reaction.emoji)}
                            >
                              {reaction.emoji} {reaction.count}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <form className="col" onSubmit={onSendMessage}>
                <div className="chat-compose-row">
                  <input
                    style={{ flex: 1 }}
                    value={messageText}
                    onChange={(e) => handleMessageChange(e.target.value)}
                    placeholder="Сообщение. Для упоминания введите @"
                  />
                  <input
                    ref={fileInputRef}
                    className="hidden-file-input"
                    type="file"
                    multiple
                    onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))}
                  />
                  <button
                    type="button"
                    className="secondary icon-button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Прикрепить файл"
                  >
                    +
                  </button>
                  <button type="submit" disabled={isSendingMessage}>
                    {isSendingMessage ? 'Отправка...' : 'Отправить'}
                  </button>
                </div>

                {pendingFiles.length > 0 && (
                  <div className="attachment-list">
                    {pendingFiles.map((file, index) => (
                      <span key={`${file.name}-${file.size}-${index}`} className="attachment-chip">
                        {file.name}
                        <button type="button" className="chip-remove" onClick={() => removePendingFile(index)} title="Убрать файл">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {mentionSuggestions.length > 0 && isMentionOpen && (
                  <div className="mention-box">
                    <ul className="mention-list" role="listbox" aria-label="Доступные пользователи">
                      {pagedMentionSuggestions.map((member: any) => (
                        <li
                          key={member.id}
                          className="mention-item"
                          role="option"
                          tabIndex={0}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            insertMention(member.nickname);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              insertMention(member.nickname);
                            }
                          }}
                        >
                          @{member.nickname}
                        </li>
                      ))}
                    </ul>
                    {mentionSuggestions.length > mentionPageSize && (
                      <div className="mention-pagination">
                        <button
                          type="button"
                          className="secondary"
                          disabled={mentionPage === 0}
                          onClick={() => setMentionPage((prev) => Math.max(prev - 1, 0))}
                        >
                          Назад
                        </button>
                        <span className="muted">
                          Страница {mentionPage + 1} из {mentionPageCount}
                        </span>
                        <button
                          type="button"
                          className="secondary"
                          disabled={mentionPage >= mentionPageCount - 1}
                          onClick={() => setMentionPage((prev) => Math.min(prev + 1, mentionPageCount - 1))}
                        >
                          Вперед
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
          ) : (
            <div className="panel col">
              <h3>Обзор курса</h3>
              <p className="muted">
                Выберите текстовый канал для общения или откройте задание для материалов, сдачи и проверки работ.
              </p>
            </div>
          )}
        </main>
      </div>

      {isManager && isChannelFormOpen && (
        <div className="modal-backdrop" onClick={() => setIsChannelFormOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h3>Управление каналами</h3>
                <p className="muted">Создайте новый чат или задание и сразу настройте доступ для групп.</p>
              </div>
              <button
                type="button"
                className="icon-ghost-button"
                title="Закрыть"
                onClick={() => setIsChannelFormOpen(false)}
              >
                ×
              </button>
            </div>

            <form className="col" onSubmit={onCreateChannel}>
              <div className="grid-2">
                <input
                  value={channelForm.name}
                  onChange={(e) => setChannelForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={channelForm.type === 'assignment' ? 'Название задания' : 'Название канала'}
                  required
                />
                <select
                  value={channelForm.type}
                  onChange={(e) => setChannelForm((prev) => ({ ...prev, type: e.target.value as 'text' | 'assignment' }))}
                >
                  <option value="text">Текстовый канал</option>
                  <option value="assignment">Задание</option>
                </select>
              </div>

              <textarea
                rows={3}
                value={channelForm.description}
                onChange={(e) => setChannelForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={channelForm.type === 'assignment' ? 'Описание задания' : 'Описание канала'}
              />

              {channelForm.type === 'assignment' && (
                <input
                  type="datetime-local"
                  value={channelForm.assignmentDeadlineAt}
                  onChange={(e) => setChannelForm((prev) => ({ ...prev, assignmentDeadlineAt: e.target.value }))}
                />
              )}

              <div className="chip-list">
                {groups.map((group) => (
                  <label key={group.id} className="chip">
                    <input
                      type="checkbox"
                      checked={channelForm.groupIds.includes(group.id)}
                      onChange={(e) =>
                        setChannelForm((prev) => ({
                          ...prev,
                          groupIds: e.target.checked
                            ? [...prev.groupIds, group.id]
                            : prev.groupIds.filter((id) => id !== group.id),
                        }))
                      }
                    />
                    {group.name}
                  </label>
                ))}
              </div>

              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="secondary" onClick={() => setIsChannelFormOpen(false)}>
                  Отмена
                </button>
                <button type="submit">Создать</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

