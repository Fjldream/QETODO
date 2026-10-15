import type { SessionDto } from '@qetodo/contracts';
import { ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { HttpClient } from '../../api/http.js';

interface LoginPageProps {
  client: HttpClient;
  onAuthenticated(session: SessionDto): void;
}

export function LoginPage({ client, onAuthenticated }: LoginPageProps) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const session = await client.request<SessionDto>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      onAuthenticated(session);
      navigate('/today', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="app-mark" aria-hidden="true">
          <ShieldCheck size={30} />
        </div>
        <p className="eyebrow">QUALITY WORKFLOW</p>
        <h1 id="login-title">质量待办</h1>
        <p className="secondary-text">把每天的跟进、提醒与处理记录收进一个清晰的工作台。</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field-label" htmlFor="username">用户名</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <label className="field-label" htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? '正在登录…' : '登录'}
          </button>
        </form>
        <p className="privacy-note">数据仅保存到你的服务器，不接入第三方分析服务。</p>
      </section>
    </main>
  );
}
