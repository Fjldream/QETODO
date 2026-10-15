import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HttpClient } from '../../api/http.js';
import { AccountSettings } from './AccountSettings.js';

describe('AccountSettings', () => {
  it('changes password, revokes other sessions, and logs out', async () => {
    const client = clientWith(vi.fn(async () => undefined));
    const onLoggedOut = vi.fn();
    const user = userEvent.setup();
    render(
      <AccountSettings
        client={client}
        onLoggedOut={onLoggedOut}
        onSessionExpired={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('当前密码'), 'old-password');
    await user.type(screen.getByLabelText('新密码'), 'new-password');
    await user.click(screen.getByRole('button', { name: '修改密码' }));
    await user.click(screen.getByRole('button', { name: '撤销其他设备会话' }));
    await user.click(screen.getByRole('button', { name: '退出登录' }));

    expect(client.request).toHaveBeenCalledWith('/api/auth/password', expect.any(Object));
    expect(client.request).toHaveBeenCalledWith('/api/auth/revoke-others', expect.any(Object));
    expect(client.request).toHaveBeenCalledWith('/api/auth/logout', expect.any(Object));
    expect(onLoggedOut).toHaveBeenCalledOnce();
  });

  it('surfaces API errors and does not clear local task data', async () => {
    const client = clientWith(
      vi.fn(async () => {
        throw Object.assign(new Error('当前密码不正确'), { status: 401, code: 'INVALID_CREDENTIALS' });
      }),
    );
    const clearLocalTasks = vi.fn();
    const user = userEvent.setup();
    render(
      <AccountSettings
        client={client}
        localTaskStore={{ clear: clearLocalTasks }}
        onLoggedOut={vi.fn()}
        onSessionExpired={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('当前密码'), 'wrong-password');
    await user.type(screen.getByLabelText('新密码'), 'new-password');
    await user.click(screen.getByRole('button', { name: '修改密码' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('当前密码不正确');
    expect(clearLocalTasks).not.toHaveBeenCalled();
  });
});

function clientWith(implementation: () => Promise<unknown>): HttpClient {
  return {
    request: vi.fn(async () => implementation()) as unknown as HttpClient['request'],
    setCsrfToken: vi.fn(),
    clearCsrfToken: vi.fn(),
  };
}
