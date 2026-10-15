import { type FormEvent, useState } from 'react';

import type { HttpClient } from '../../api/http.js';
import type { LocalTaskStore } from '../../app/App.js';

interface AccountSettingsProps {
  client: HttpClient;
  localTaskStore?: LocalTaskStore | undefined;
  onLoggedOut(): void;
  onSessionExpired(): void;
}

export function AccountSettings(props: AccountSettingsProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const run = async (action: () => Promise<void>, successMessage: string) => {
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
    } catch (reason) {
      const candidate = reason as { code?: string; message?: string };
      if (candidate.code === 'AUTHENTICATION_REQUIRED') {
        props.onSessionExpired();
        return;
      }
      setError(candidate.message ?? '操作失败，请稍后重试');
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    await run(
      () =>
        props.client.request<void>('/api/auth/password', {
          method: 'POST',
          body: { currentPassword, newPassword },
        }),
      '密码已更新',
    );
  };

  const logout = async () => {
    await run(async () => {
      await props.client.request<void>('/api/auth/logout', { method: 'POST' });
      props.client.clearCsrfToken();
      props.onLoggedOut();
    }, '');
  };

  return (
    <section aria-labelledby="account-title">
      <h2 className="section-heading" id="account-title">账户安全</h2>
      <form className="settings-group" onSubmit={(event) => void changePassword(event)}>
        <label className="settings-field" htmlFor="current-password">
          <span>当前密码</span>
          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="settings-field" htmlFor="new-password">
          <span>新密码</span>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button className="settings-action" type="submit">修改密码</button>
      </form>
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="settings-group standalone-actions">
        <button
          className="settings-action"
          type="button"
          onClick={() => void run(
            () => props.client.request<void>('/api/auth/revoke-others', { method: 'POST' }),
            '其他设备会话已撤销',
          )}
        >
          撤销其他设备会话
        </button>
        <button className="settings-action danger" type="button" onClick={() => void logout()}>
          退出登录
        </button>
      </div>
    </section>
  );
}
