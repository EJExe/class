import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications.api';
import { wsService } from '../services/ws.service';

export function NotificationsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Array<any>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = async (cursor?: string) => {
    if (!token) return;
    const page = await listNotifications(token, cursor, 20);
    setItems((prev) => (cursor ? [...prev, ...page] : page));
    setNextCursor(page.length === 20 ? page[page.length - 1]?.createdAt ?? null : null);
  };

  useEffect(() => {
    void load(undefined);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = wsService.connect(token);
    const onNew = (item: any) => {
      setItems((prev) => [item, ...prev.filter((existing) => existing.id !== item.id)]);
    };
    const onRead = (payload: { id: string }) => {
      setItems((prev) => prev.map((item) => (item.id === payload.id ? { ...item, isRead: true } : item)));
    };
    const onReadAll = () => {
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    };

    socket.on('notification:new', onNew);
    socket.on('notification:read', onRead);
    socket.on('notification:read-all', onReadAll);

    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:read', onRead);
      socket.off('notification:read-all', onReadAll);
    };
  }, [token]);

  const onRead = async (id: string) => {
    if (!token) return;
    await markNotificationRead(token, id);
  };

  const onReadAll = async () => {
    if (!token) return;
    await markAllNotificationsRead(token);
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <h1>Уведомления</h1>
        <div className="row">
          <Link to="/courses">Курсы</Link>
          <button className="secondary" onClick={() => void onReadAll()}>
            Отметить все прочитанным
          </button>
        </div>
      </div>

      <div className="panel col">
        {items.map((item) => (
          <div key={item.id} className="card-row">
            <div>
              <strong>{item.title}</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{item.body}</div>
              <div className="muted">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
            {!item.isRead && (
              <button className="secondary" onClick={() => void onRead(item.id)}>
                Прочитано
              </button>
            )}
          </div>
        ))}
        {nextCursor && (
          <button className="secondary" onClick={() => void load(nextCursor)}>
            Показать еще
          </button>
        )}
      </div>
    </div>
  );
}
