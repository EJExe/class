import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications.api';

export function NotificationsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Array<any>>([]);

  const load = async () => {
    if (!token) return;
    setItems(await listNotifications(token));
  };

  useEffect(() => {
    void load();
  }, [token]);

  const onRead = async (id: string) => {
    if (!token) return;
    await markNotificationRead(token, id);
    await load();
  };

  const onReadAll = async () => {
    if (!token) return;
    await markAllNotificationsRead(token);
    await load();
  };

  return (
    <div className="page col">
      <div className="toolbar">
        <h1>Notifications</h1>
        <div className="row">
          <Link to="/courses">Courses</Link>
          <button className="secondary" onClick={() => void onReadAll()}>
            Mark all read
          </button>
        </div>
      </div>

      <div className="panel col">
        {items.map((item) => (
          <div key={item.id} className="card-row">
            <div>
              <strong>{item.title}</strong>
              <div>{item.body}</div>
              <div className="muted">{new Date(item.createdAt).toLocaleString()}</div>
            </div>
            {!item.isRead && (
              <button className="secondary" onClick={() => void onRead(item.id)}>
                Read
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
