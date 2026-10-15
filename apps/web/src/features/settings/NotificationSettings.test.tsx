import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HttpClient } from '../../api/http.js';
import { NotificationSettings } from './NotificationSettings.js';

describe('NotificationSettings', () => {
  it('asks for permission only after an explicit action and saves the subscription', async () => {
    const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    const subscribe = vi.fn(async () => ({ toJSON: () => ({ endpoint: 'https://push.example/one', keys: { p256dh: 'key', auth: 'auth' } }) }));
    const client = { request: vi.fn(async (path: string) => path.endsWith('/config') ? { vapidPublicKey: 'AQID', digestTime: '09:00' } : undefined), setCsrfToken: vi.fn(), clearCsrfToken: vi.fn() } as unknown as HttpClient;
    const user = userEvent.setup();
    render(<NotificationSettings client={client} runtime={{ supported: true, standalone: true, permission: 'default', requestPermission, subscribe }} />);

    expect(requestPermission).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: '开启通知' }));

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledOnce();
    expect(client.request).toHaveBeenCalledWith('/api/notifications/subscriptions', expect.objectContaining({ method: 'PUT' }));
    expect(await screen.findByRole('status')).toHaveTextContent('通知已开启');
  });

  it('explains unsupported, denied, and non-installed states without prompting', async () => {
    const client = { request: vi.fn(async () => ({ vapidPublicKey: '', digestTime: '09:00' })), setCsrfToken: vi.fn(), clearCsrfToken: vi.fn() } as unknown as HttpClient;
    const { rerender } = render(<NotificationSettings client={client} runtime={{ supported: false, standalone: false, permission: 'default', requestPermission: vi.fn(), subscribe: vi.fn() }} />);
    expect(await screen.findByText('此浏览器不支持推送通知')).toBeInTheDocument();
    rerender(<NotificationSettings client={client} runtime={{ supported: true, standalone: true, permission: 'denied', requestPermission: vi.fn(), subscribe: vi.fn() }} />);
    expect(screen.getByText('通知已被系统拒绝，请到 iPhone 设置中开启')).toBeInTheDocument();
  });
});
