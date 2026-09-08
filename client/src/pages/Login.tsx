import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n';
import { ApiError } from '../lib/api';

export default function Login() {
  const { user, login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[#0b1220] bg-cover bg-center p-4"
      style={{ backgroundImage: "linear-gradient(rgba(11,18,32,0.55), rgba(11,18,32,0.75)), url('/hero.jpg')" }}
    >
      <form onSubmit={submit} className="card w-full max-w-sm p-6 shadow-2xl backdrop-blur">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <img src="/canva-logo.png" alt="logo" className="h-20 w-20 drop-shadow" />
          <h1 className="text-xl font-bold text-slate-900">{t('app.title')}</h1>
          <p className="text-sm text-slate-500">{t('login.title')}</p>
        </div>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="label">{t('login.username')}</label>
        <input className="input mb-3" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label className="label">{t('login.password')}</label>
        <input className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn-primary w-full" disabled={busy}>
          {t('login.submit')}
        </button>
      </form>
    </div>
  );
}
