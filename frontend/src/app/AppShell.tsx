import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../hooks/useAuth';

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <>
      {user && (
        <div className="current-user-badge">
          <Link to="/profile" className="current-user-link">
            <UserAvatar user={user} size={36} />
            <span>{user.nickname}</span>
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
