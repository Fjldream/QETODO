import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HttpClient } from '../../api/http.js';
import { groupTasksForToday } from './taskViewModel.js';
import { TodayPage } from './TodayPage.js';
import { taskFixture as task } from './taskFixture.js';

const now = new Date('2026-10-15T04:00:00.000Z');

describe('groupTasksForToday', () => {
  it('shows today and unfinished past plans even when their deadline is more than seven days away', () => {
    const tasks = [
      task('今天推进', { plannedDate: '2026-10-15', dueAt: '2026-10-23T08:45:00Z' }),
      task('昨天未完', { plannedDate: '2026-10-14' }),
      task('还未安排', { plannedDate: '2026-10-16', dueAt: '2026-11-01T08:00:00Z' }),
      task('已完成计划', { plannedDate: '2026-10-15', status: 'completed' }),
    ];
    expect(groupTasksForToday(tasks, now, 'Asia/Shanghai').map(group => ({ key: group.key, titles: group.tasks.map(t => t.title) }))).toEqual([
      { key: 'planned', titles: ['昨天未完', '今天推进'] },
    ]);
  });

  it('shows a task only once when it is both planned and due today', () => {
    const groups = groupTasksForToday([task('同时到期', { plannedDate: '2026-10-15', dueAt: '2026-10-15T08:00:00Z' })], now, 'Asia/Shanghai');
    expect(groups.map(group => group.key)).toEqual(['today']);
    expect(groups.flatMap(group => group.tasks)).toHaveLength(1);
  });

  it('orders overdue, today, waiting follow-ups, then the next seven days', () => {
    const tasks = [
      task('future', { dueAt: '2026-10-18T02:00:00.000Z' }),
      task('waiting', {
        status: 'waiting',
        waitingOn: '供应商',
        followUpAt: '2026-10-16T02:00:00.000Z',
      }),
      task('today', { dueAt: '2026-10-15T08:00:00.000Z' }),
      task('overdue', { dueAt: '2026-10-14T02:00:00.000Z' }),
    ];

    const groups = groupTasksForToday(tasks, now, 'Asia/Shanghai');

    expect(groups.map(({ key }) => key)).toEqual(['overdue', 'today', 'waiting', 'upcoming']);
  });

  it('places all overdue work before non-overdue work and sorts equal risk by priority', () => {
    const tasks = [
      task('normal today', { priority: 'normal', dueAt: '2026-10-15T05:00:00.000Z' }),
      task('urgent today', { priority: 'urgent', dueAt: '2026-10-15T05:00:00.000Z' }),
      task('normal overdue', { priority: 'normal', dueAt: '2026-10-14T02:00:00.000Z' }),
    ];

    const groups = groupTasksForToday(tasks, now, 'Asia/Shanghai');

    expect(groups.flatMap(({ tasks: items }) => items.map(({ title }) => title))).toEqual([
      'normal overdue',
      'urgent today',
      'normal today',
    ]);
  });

  it('excludes completed, cancelled, and deleted tasks', () => {
    const tasks = [
      task('completed', { status: 'completed', completedAt: now.toISOString() }),
      task('cancelled', { status: 'cancelled', cancelledAt: now.toISOString() }),
      task('deleted', { deletedAt: now.toISOString() }),
    ];

    expect(groupTasksForToday(tasks, now, 'Asia/Shanghai')).toEqual([]);
  });
});

describe('TodayPage interactions', () => {
  it('defaults quick creation to the current local day', async () => {
    let submittedDueAt: string | null | undefined;
    const request = vi.fn(async (_path: string, options?: unknown) => {
      const body = (options as { body: { data: { dueAt?: string | null } } }).body;
      submittedDueAt = body.data.dueAt;
      return {
        operationId: crypto.randomUUID(),
        data: task('今日新任务', { dueAt: submittedDueAt ?? null }),
      };
    });
    const user = userEvent.setup();
    render(<TodayPage client={mockClient(request)} initialTasks={[]} now={now} />);

    await user.click(screen.getByRole('button', { name: '新建任务' }));
    await user.type(screen.getByLabelText('任务标题'), '今日新任务');
    await user.click(screen.getByRole('button', { name: '保存任务' }));

    await waitFor(() => expect(submittedDueAt).toMatch(/^2026-10-15T/));
    expect(await screen.findByText('今日新任务')).toBeInTheDocument();
  });

  it('postpones a task from its row without opening the editor', async () => {
    const request = vi.fn(async () => ({
      operationId: crypto.randomUUID(),
      data: task('待改期', { dueAt: '2026-10-15T05:00:00.000Z', version: 2 }),
    }));
    const client = mockClient(request);
    const user = userEvent.setup();
    render(<TodayPage client={client} initialTasks={[task('待改期', { dueAt: '2026-10-15T05:00:00.000Z' })]} now={now} />);

    await user.click(screen.getByRole('button', { name: '将“待改期”推迟一天' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('/api/tasks/'), expect.objectContaining({ method: 'PATCH' })));
    expect(screen.queryByRole('dialog', { name: '编辑任务' })).not.toBeInTheDocument();
  });
});

function mockClient(implementation: (path: string, options?: unknown) => Promise<unknown>): HttpClient {
  return {
    request: (async <T,>(path: string, options?: unknown) =>
      (await implementation(path, options)) as T) as HttpClient['request'],
    setCsrfToken: vi.fn(),
    clearCsrfToken: vi.fn(),
  };
}
