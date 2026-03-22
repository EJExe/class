import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createSession } from '../services/auth.api';

export function LoginPage() {
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const session = await createSession(nickname.trim(), password || undefined);
      setToken(session.token);
      navigate('/courses');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page page-narrow col">
      <h1>DIPLOM LMS</h1>
      <p className="muted">Sign in with nickname. Password is optional in local mode.</p>
      <form className="col" onSubmit={onSubmit}>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname" required />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
        />
        <button type="submit">Open workspace</button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
