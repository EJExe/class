import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession } from '../services/auth.api';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { setToken } = useAuth();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const session = await createSession(nickname, password || undefined);
      setToken(session.token);
      navigate('/courses');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 460 }}>
      <h2>Вход</h2>
      <form className="col" onSubmit={submit}>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname" required />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (optional)"
          type="password"
        />
        <button type="submit">Войти</button>
      </form>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}

