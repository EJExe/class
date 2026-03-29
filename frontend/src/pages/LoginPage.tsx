import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { login, register } from '../services/auth.api';

export function LoginPage() {
  const navigate = useNavigate();
  const { setToken } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const session = await login(loginValue.trim(), password);
      setToken(session.token);
      navigate('/courses');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onRegister = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const session = await register({
        login: loginValue.trim(),
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        birthDate,
        nickname: nickname.trim() || undefined,
      });
      setToken(session.token);
      navigate('/courses');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page page-narrow col">
      <h1>DIPLOM LMS</h1>
      <div className="row">
        <button className={mode === 'login' ? 'pressed' : 'secondary'} onClick={() => setMode('login')}>
          Вход
        </button>
        <button className={mode === 'register' ? 'pressed' : 'secondary'} onClick={() => setMode('register')}>
          Регистрация
        </button>
      </div>

      {mode === 'login' ? (
        <form className="col" onSubmit={onLogin}>
          <input value={loginValue} onChange={(e) => setLoginValue(e.target.value)} placeholder="Логин" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" type="password" required />
          <button type="submit">Войти</button>
        </form>
      ) : (
        <form className="col" onSubmit={onRegister}>
          <input value={loginValue} onChange={(e) => setLoginValue(e.target.value)} placeholder="Логин" required />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ФИО" required />
          <input value={birthDate} onChange={(e) => setBirthDate(e.target.value)} type="date" required />
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Отображаемое имя (необязательно)" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" type="password" required />
          <button type="submit">Зарегистрироваться</button>
        </form>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
