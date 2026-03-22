import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createChannel, listChannels } from '../services/channels.api';
import { getCourse, listGroups } from '../services/courses.api';
import { deleteMessage, getMessages } from '../services/messages.api';
import { wsService } from '../services/ws.service';
import { useAuth } from '../hooks/useAuth';

export function CoursePage() {
  const { courseId = '' } = useParams();
  const { token, user } = useAuth();
  const [course, setCourse] = useState<any | null>(null);
  const [channels, setChannels] = useState<Array<any>>([]);
  const [groups, setGroups] = useState<Array<any>>([]);
  const [activeChannelId, setActiveChannelId] = useState('');
  const [messages, setMessages] = useState<Array<any>>([]);
  const [messageText, setMessageText] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChannelFormOpen, setIsChannelFormOpen] = useState(false);
  const deleteTimers = useRef<Record<string, number>>({});

  const [channelForm, setChannelForm] = useState({
    name: '',
    description: '',
    type: 'text' as 'text' | 'assignment',
    assignmentTitle: '',
    assignmentDescription: '',
    assignmentDeadlineAt: '',
    groupIds: [] as string[],
  });

  const isManager = ['admin', 'teacher'].includes(
    course?.members?.find((member: any) => member.user.id === user?.id)?.role ?? '',
  );
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? null;
  const groupNamesById = new Map(groups.map((group) => [group.id, group.name]));

  const mergeMessages = (current: Array<any>, incoming: Array<any>) => {
    const map = new Map<string, any>();
    for (const item of current) map.set(item.id, item);
    for (const item of incoming) map.set(item.id, item);
    return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  const scheduleDeletedRemoval = (messageId: string) => {
    if (deleteTimers.current[messageId]) return;
    deleteTimers.current[messageId] = window.setTimeout(() => {
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
      delete deleteTimers.current[messageId];
    }, 10000);
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

    const nextTextChannel = channelData.find((channel: any) => channel.type === 'text');
    if (!activeChannelId && nextTextChannel) {
      setActiveChannelId(nextTextChannel.id);
    }
  };

  useEffect(() => {
    void loadCourse();
  }, [token, courseId]);

  useEffect(() => {
    return () => {
      Object.values(deleteTimers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const loadMessages = async (reset = true) => {
    if (!token || !activeChannelId) return;
    const payload = await getMessages(token, activeChannelId, reset ? undefined : nextCursor ?? undefined);
    if (reset) {
      setMessages(payload.items);
    } else {
      setMessages((prev) => [...payload.items, ...prev]);
    }
    setNextCursor(payload.nextCursor);
  };

  useEffect(() => {
    if (!token || !activeChannelId || activeChannel?.type !== 'text') return;
    void loadMessages(true);

    const socket = wsService.connect(token);
    const joinChannel = () => socket.emit('chat:join', { channelId: activeChannelId });
    const onNew = (event: { channelId: string; message: any }) => {
      if (event.channelId !== activeChannelId) return;
      setMessages((prev) => mergeMessages(prev, [event.message]));
    };
    const onDeleted = (event: { channelId: string; messageId: string; deletedAt: string }) => {
      if (event.channelId !== activeChannelId) return;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === event.messageId ? { ...message, deletedAt: event.deletedAt, content: '[deleted]' } : message,
        ),
      );
      scheduleDeletedRemoval(event.messageId);
    };

    socket.on('connect', joinChannel);
    socket.on('chat:message:new', onNew);
    socket.on('chat:message:deleted', onDeleted);

    if (socket.connected) {
      joinChannel();
    }

    const poll = window.setInterval(async () => {
      try {
        const payload = await getMessages(token, activeChannelId);
        setMessages((prev) => mergeMessages(prev, payload.items));
      } catch {
        // ignore poll error
      }
    }, 2000);

    return () => {
      window.clearInterval(poll);
      socket.emit('chat:leave', { channelId: activeChannelId });
      socket.off('connect', joinChannel);
      socket.off('chat:message:new', onNew);
      socket.off('chat:message:deleted', onDeleted);
    };
  }, [token, activeChannelId, activeChannel?.type]);

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
              assignmentTitle: channelForm.assignmentTitle.trim() || channelForm.name.trim(),
              assignmentDescription: channelForm.assignmentDescription,
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
        assignmentTitle: '',
        assignmentDescription: '',
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
    if (!token || !activeChannelId || !messageText.trim()) return;
    const socket = wsService.connect(token);
    socket.emit('chat:message', { channelId: activeChannelId, content: messageText.trim() });
    setMessageText('');
  };

  const onDeleteMessage = async (messageId: string) => {
    if (!token || !activeChannelId) return;
    try {
      wsService.connect(token).emit('chat:message:delete', { channelId: activeChannelId, messageId });
    } catch {
      await deleteMessage(token, messageId);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, deletedAt: new Date().toISOString(), content: '[deleted]' } : message,
        ),
      );
      scheduleDeletedRemoval(messageId);
    }
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <div>
          <h1>{course?.title ?? 'Course'}</h1>
          <p className="muted">{course?.description ?? 'Course workspace'}</p>
          <p className="muted">Invite code: {course?.inviteCode}</p>
        </div>
        <div className="row">
          <Link to="/courses">All courses</Link>
          <Link to={`/courses/${courseId}/members`}>Members</Link>
          {isManager && <Link to={`/courses/${courseId}/groups`}>Groups</Link>}
          <Link to={`/courses/${courseId}/video`}>Video room</Link>
        </div>
      </div>

      <div className="course-layout">
        <aside className="panel col">
          <h3>Channels</h3>
          {channels.map((channel) =>
            channel.type === 'assignment' && channel.assignment ? (
              <Link key={channel.id} className="channel-link" to={`/courses/${courseId}/assignments/${channel.assignment.id}`}>
                <span># {channel.name}</span>
                <small className="muted">assignment</small>
                {isManager && (
                  <small className="muted">
                    Access:{' '}
                    {channel.groupAccess?.length
                      ? channel.groupAccess
                          .map((entry: any) => groupNamesById.get(entry.groupId) ?? 'Unknown group')
                          .join(', ')
                      : 'all students'}
                  </small>
                )}
              </Link>
            ) : (
              <div key={channel.id} className="col">
                <button
                  className={activeChannelId === channel.id ? '' : 'secondary'}
                  onClick={() => setActiveChannelId(channel.id)}
                >
                  # {channel.name}
                </button>
                {isManager && (
                  <small className="muted">
                    Access:{' '}
                    {channel.groupAccess?.length
                      ? channel.groupAccess
                          .map((entry: any) => groupNamesById.get(entry.groupId) ?? 'Unknown group')
                          .join(', ')
                      : 'all students'}
                  </small>
                )}
              </div>
            ),
          )}
        </aside>

        <main className="col">
          {isManager && (
            <div className="panel col">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Channel management</h3>
                <button className="secondary" type="button" onClick={() => setIsChannelFormOpen((prev) => !prev)}>
                  {isChannelFormOpen ? 'Hide controls' : 'Open controls'}
                </button>
              </div>
              {isChannelFormOpen && (
                <form className="col" onSubmit={onCreateChannel}>
                  <div className="grid-2">
                    <input
                      value={channelForm.name}
                      onChange={(e) => setChannelForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Channel name"
                      required
                    />
                    <select
                      value={channelForm.type}
                      onChange={(e) =>
                        setChannelForm((prev) => ({ ...prev, type: e.target.value as 'text' | 'assignment' }))
                      }
                    >
                      <option value="text">Text</option>
                      <option value="assignment">Assignment</option>
                    </select>
                  </div>
                  <textarea
                    rows={3}
                    value={channelForm.description}
                    onChange={(e) => setChannelForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Description"
                  />

                  {channelForm.type === 'assignment' && (
                    <>
                      <input
                        value={channelForm.assignmentTitle}
                        onChange={(e) => setChannelForm((prev) => ({ ...prev, assignmentTitle: e.target.value }))}
                        placeholder="Assignment title"
                      />
                      <textarea
                        rows={4}
                        value={channelForm.assignmentDescription}
                        onChange={(e) =>
                          setChannelForm((prev) => ({ ...prev, assignmentDescription: e.target.value }))
                        }
                        placeholder="Assignment description"
                      />
                      <input
                        type="datetime-local"
                        value={channelForm.assignmentDeadlineAt}
                        onChange={(e) =>
                          setChannelForm((prev) => ({ ...prev, assignmentDeadlineAt: e.target.value }))
                        }
                      />
                    </>
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

                  <button type="submit">Create channel</button>
                </form>
              )}
            </div>
          )}

          {activeChannel?.type === 'text' ? (
            <div className="panel col">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{activeChannel.name}</h3>
                <button className="secondary" disabled={!nextCursor} onClick={() => void loadMessages(false)}>
                  Load older
                </button>
              </div>
              <div className="message-list">
                {messages.map((message) => (
                  <div key={message.id} className="message-item">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{message.author?.nickname ?? 'user'}</strong>
                      {message.authorUserId === user?.id && !message.deletedAt && (
                        <button className="danger" onClick={() => void onDeleteMessage(message.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                    <div>{message.deletedAt ? '[deleted]' : message.content}</div>
                  </div>
                ))}
              </div>
              <form className="row" onSubmit={onSendMessage}>
                <input
                  style={{ flex: 1 }}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Message"
                />
                <button type="submit">Send</button>
              </form>
            </div>
          ) : (
            <div className="panel col">
              <h3>Course overview</h3>
              <p className="muted">
                Choose a text channel to chat or open an assignment channel to manage coursework, files and submissions.
              </p>
              <div className="grid-3">
                <div className="stat-card">
                  <strong>{channels.length}</strong>
                  <span>Channels</span>
                </div>
                <div className="stat-card">
                  <strong>{groups.length}</strong>
                  <span>Groups</span>
                </div>
                <div className="stat-card">
                  <strong>{course?.members?.length ?? 0}</strong>
                  <span>Members</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
