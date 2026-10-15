import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { HttpClient } from '../api/http.js';
import { App } from './App.js';

const session = {
  userId: '7d831d11-27b9-42f3-bce7-005d4ed3c005',
  username: 'admin',
  csrfToken: 'c'.repeat(32),
  expiresAt: '2026-11-15T02:00:00.000Z',
};

describe('authenticated application shell', () => {
  it('shows only the login screen to an unauthenticated user', async () => {
    const client = fakeClient(async () => {
      throw unauthorized();
    });

    render(
      <MemoryRouter initialEntries={['/today']}>
        <App client={client} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '质量待办' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
  });

  it('provides four accessible 44-pixel tabs and announces selection', async () => {
    const client = fakeClient(async () => session);

    render(
      <MemoryRouter initialEntries={['/today']}>
        <App client={client} />
      </MemoryRouter>,
    );

    const navigation = await screen.findByRole('navigation', { name: '主导航' });
    const labels = ['今日', '任务', '日历', '设置'];
    for (const label of labels) {
      const link = screen.getByRole('link', { name: label });
      expect(link).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
    }
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '今日' })).toHaveAttribute('aria-current', 'page');
  });

  it('returns to login after an expired session without clearing local task data', async () => {
    let requestCount = 0;
    const clearLocalTasks = vi.fn();
    const client = fakeClient(async (path) => {
      requestCount += 1;
      if (requestCount === 1) return session;
      if (path === '/api/auth/revoke-others') throw unauthorized();
      return undefined;
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App client={client} localTaskStore={{ clear: clearLocalTasks }} />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: '撤销其他设备会话' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '质量待办' })).toBeInTheDocument(),
    );
    expect(clearLocalTasks).not.toHaveBeenCalled();
  });
});

function fakeClient(
  implementation: (path: string) => Promise<unknown>,
): HttpClient {
  return {
    request: async <T,>(path: string) => (await implementation(path)) as T,
    setCsrfToken: vi.fn(),
    clearCsrfToken: vi.fn(),
  };
}

function unauthorized() {
  return Object.assign(new Error('登录已失效'), { status: 401, code: 'AUTHENTICATION_REQUIRED' });
}
