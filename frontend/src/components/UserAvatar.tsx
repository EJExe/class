const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

type AvatarUser = {
  id?: string;
  nickname?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
};

function initialsFromUser(user?: AvatarUser | null) {
  const source = user?.fullName?.trim() || user?.nickname?.trim() || 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function UserAvatar({
  user,
  size = 36,
  className = '',
}: {
  user?: AvatarUser | null;
  size?: number;
  className?: string;
}) {
  const avatarUrl = user?.avatarUrl
    ? user.avatarUrl.startsWith('http')
      ? user.avatarUrl
      : `${API_ORIGIN}${user.avatarUrl}`
    : null;

  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={user?.nickname ?? 'avatar'}
      className={`user-avatar ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={`user-avatar user-avatar-fallback ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initialsFromUser(user)}
    </span>
  );
}
