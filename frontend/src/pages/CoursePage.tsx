import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createChannel, listChannels } from '../services/channels.api';
import { getCourse } from '../services/courses.api';
import { deleteMessage, getMessages } from '../services/messages.api';
import { useAuth } from '../hooks/useAuth';
import { wsService } from '../services/ws.service';

export function CoursePage() {
  const { courseId = '' } = useParams();
  const { token, user } = useAuth();
  const [course, setCourse] = useState<any | null>(null);
  const [channels, setChannels] = useState<Array<any>>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [channelName, setChannelName] = useState('');
  const [messages, setMessages] = useState<Array<any>>([]);
  const [messageText, setMessageText] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deleteTimers = useRef<Record<string, number>>({});

  const mergeMessages = (current: Array<any>, incoming: Array<any>) => {
    const map = new Map<string, any>();
    for (const msg of current) map.set(msg.id, msg);
    for (const msg of incoming) map.set(msg.id, msg);
    return Array.from(map.values()).sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  };

  const scheduleRemoveDeletedMessage = (messageId: string) => {
    if (deleteTimers.current[messageId]) {
      return;
    }
    deleteTimers.current[messageId] = window.setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      delete deleteTimers.current[messageId];
    }, 10000);
  };

  const isOwner = useMemo(() => course?.ownerUserId === user?.id, [course, user]);

  const loadCourseData = async () => {
    if (!token || !courseId) return;
    const [courseData, channelData] = await Promise.all([
      getCourse(token, courseId),
      listChannels(token, courseId),
    ]);
    setCourse(courseData);
    setChannels(channelData);
    if (!activeChannelId && channelData[0]) {
      setActiveChannelId(channelData[0].id);
    }
  };

  useEffect(() => {
    void loadCourseData();
  }, [courseId, token]);

  useEffect(() => {
    return () => {
      Object.values(deleteTimers.current).forEach((timer) => window.clearTimeout(timer));
      deleteTimers.current = {};
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
    void loadMessages(true);
    if (!token || !activeChannelId) return;

    const socket = wsService.connect(token);

    const joinCurrentChannel = () => {
      socket.emit('chat:join', { channelId: activeChannelId });
    };

    const onNew = (event: { channelId: string; message: any }) => {
      if (event.channelId !== activeChannelId) return;
      setMessages((prev) => [...prev, event.message]);
    };

    const onDeleted = (event: { channelId: string; messageId: string; deletedAt: string }) => {
      if (event.channelId !== activeChannelId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === event.messageId ? { ...m, deletedAt: event.deletedAt, content: '[удалено]' } : m,
        ),
      );
      scheduleRemoveDeletedMessage(event.messageId);
    };

    socket.on('connect', joinCurrentChannel);
    socket.on('chat:message:new', onNew);
    socket.on('chat:message:deleted', onDeleted);

    if (socket.connected) {
      joinCurrentChannel();
    }

    const poll = window.setInterval(async () => {
      try {
        const payload = await getMessages(token, activeChannelId);
        setMessages((prev) => mergeMessages(prev, payload.items));
        setNextCursor(payload.nextCursor);
      } catch {
        // no-op
      }
    }, 1500);

    return () => {
      window.clearInterval(poll);
      socket.emit('chat:leave', { channelId: activeChannelId });
      socket.off('connect', joinCurrentChannel);
      socket.off('chat:message:new', onNew);
      socket.off('chat:message:deleted', onDeleted);
    };
  }, [token, activeChannelId]);

  const onCreateChannel = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !courseId) return;
    try {
      const channel = await createChannel(token, courseId, channelName);
      setChannelName('');
      setChannels((prev) => [...prev, channel]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onSendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !activeChannelId || !messageText.trim()) return;
    const socket = wsService.connect(token);
    socket.emit('chat:message', { channelId: activeChannelId, content: messageText.trim() });
    setMessageText('');
  };

  const onDelete = async (messageId: string) => {
    if (!token || !activeChannelId) return;
    try {
      const socket = wsService.connect(token);
      socket.emit('chat:message:delete', { channelId: activeChannelId, messageId });
    } catch {
      await deleteMessage(token, messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), content: '[удалено]' } : m,
        ),
      );
      scheduleRemoveDeletedMessage(messageId);
    }
  };

  return (
    <div className="page col">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>{course?.title ?? 'Курс'}</h2>
          <div style={{ color: 'var(--muted)' }}>invite: {course?.inviteCode}</div>
        </div>
        <div className="row">
          <Link to="/courses">К списку курсов</Link>
          <Link to={`/courses/${courseId}/members`}>Участники</Link>
          <Link to={`/courses/${courseId}/video`}>Видеокомната</Link>
        </div>
      </div>

      <div className="chat-layout">
        <div className="panel col">
          <h3>Каналы</h3>
          {channels.map((channel) => (
            <button
              key={channel.id}
              className={activeChannelId === channel.id ? '' : 'secondary'}
              onClick={() => setActiveChannelId(channel.id)}
            >
              # {channel.name}
            </button>
          ))}

          {isOwner && (
            <form className="col" onSubmit={onCreateChannel}>
              <input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Новый канал"
                required
              />
              <button type="submit">Создать канал</button>
            </form>
          )}
        </div>

        <div className="panel col">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Чат</h3>
            <button className="secondary" disabled={!nextCursor} onClick={() => void loadMessages(false)}>
              Загрузить старые
            </button>
          </div>

          <div className="message-list">
            {messages.map((msg) => (
              <div key={msg.id} className="message-item">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{msg.author?.nickname ?? 'user'}</strong>
                  {msg.authorUserId === user?.id && !msg.deletedAt && (
                    <button className="danger" onClick={() => void onDelete(msg.id)}>
                      Удалить
                    </button>
                  )}
                </div>
                <div>{msg.deletedAt ? '[удалено]' : msg.content}</div>
              </div>
            ))}
          </div>

          <form className="row" onSubmit={onSendMessage}>
            <input
              style={{ flex: 1 }}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Сообщение"
            />
            <button type="submit">Отправить</button>
          </form>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
