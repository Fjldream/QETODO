import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { HttpClient } from '../../api/http.js';
import { App } from '../../app/App.js';

describe('LoginPage', () => {
  it('routes a successful login to Today without storing credentials', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const client: HttpClient = {
      request: vi.fn(async (path: string) => {
        if (path === '/api/auth/session') {
          throw Object.assign(new Error('未登录'), { status: 401 });
        }
        return {
          userId: '7d831d11-27b9-42f3-bce7-005d4ed3c005',
          username: 'admin',
          csrfToken: 'c'.repeat(32),
          expiresAt: '2026-11-15T02:00:00.000Z',
        };
      }) as unknown as HttpClient['request'],
      setCsrfToken: vi.fn(),
      clearCsrfToken: vi.fn(),
    };
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <App client={client} />
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText('用户名'), 'admin');
    await user.type(screen.getByLabelText('密码'), 'quality-pass');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('heading', { name: '今日' })).toBeInTheDocument();
    expect(client.setCsrfToken).toHaveBeenCalledWith('c'.repeat(32));
    expect(storageSpy).not.toHaveBeenCalled();
    storageSpy.mockRestore();
  });
});
