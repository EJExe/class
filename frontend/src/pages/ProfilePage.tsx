import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../hooks/useAuth';
import { updateProfile, uploadAvatar } from '../services/auth.api';

export function ProfilePage() {
  const { token, user, reloadMe } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    login: '',
    email: '',
    nickname: '',
    fullName: '',
    birthDate: '',
    currentPassword: '',
    newPassword: '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      login: user?.login ?? '',
      email: user?.email ?? '',
      nickname: user?.nickname ?? '',
      fullName: user?.fullName ?? '',
      birthDate: user?.birthDate ? new Date(user.birthDate).toISOString().slice(0, 10) : '',
      currentPassword: '',
      newPassword: '',
    });
  }, [user]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaved(null);

    try {
      await updateProfile(token, {
        login: form.login.trim(),
        email: form.email.trim(),
        nickname: form.nickname.trim(),
        fullName: form.fullName.trim(),
        birthDate: form.birthDate || undefined,
        currentPassword: form.currentPassword || undefined,
        newPassword: form.newPassword || undefined,
      });
      await reloadMe();
      setForm((prev) => ({ ...prev, currentPassword: '', newPassword: '' }));
      setSaved('Профиль сохранен');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUploadAvatar = async () => {
    if (!token || !avatarFile) return;
    setError(null);
    setSaved(null);
    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(token, avatarFile);
      await reloadMe();
      setAvatarFile(null);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
      setSaved('Фото профиля обновлено');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="page page-narrow col">
      <div className="toolbar">
        <h1>Профиль</h1>
        <Link to="/courses">К курсам</Link>
      </div>

      <div className="panel col">
        <h3>Фото профиля</h3>
        <div className="row" style={{ alignItems: 'center' }}>
          <UserAvatar user={user} size={72} />
          <div className="col" style={{ flex: 1 }}>
            <input
              ref={avatarInputRef}
              className="hidden-file-input"
              type="file"
              accept="image/*"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
            <button type="button" className="link-button" onClick={() => avatarInputRef.current?.click()}>
              Загрузить фото
            </button>
            {avatarFile && (
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">{avatarFile.name}</span>
                <button
                  type="button"
                  className={isUploadingAvatar ? 'secondary pressed' : 'secondary'}
                  disabled={isUploadingAvatar}
                  onClick={() => void onUploadAvatar()}
                >
                  {isUploadingAvatar ? 'Загрузка...' : 'Сохранить фото'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <form className="panel col" onSubmit={onSubmit}>
        <h3>Основные данные</h3>
        <input value={form.login} onChange={(e) => setForm((prev) => ({ ...prev, login: e.target.value }))} placeholder="Логин" required />
        <input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" type="email" required />
        <input value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} placeholder="ФИО" required />
        <input value={form.nickname} onChange={(e) => setForm((prev) => ({ ...prev, nickname: e.target.value }))} placeholder="Отображаемое имя" required />
        <input value={form.birthDate} onChange={(e) => setForm((prev) => ({ ...prev, birthDate: e.target.value }))} type="date" />
        <input
          value={form.currentPassword}
          onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
          placeholder="Текущий пароль"
          type="password"
        />
        <input
          value={form.newPassword}
          onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
          placeholder="Новый пароль"
          type="password"
        />
        <button type="submit">Сохранить изменения</button>
      </form>

      {saved && <p>{saved}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
