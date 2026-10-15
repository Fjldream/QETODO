import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TaskDetailSheet } from './components/TaskDetailSheet.js';
import { taskFixture as task } from './taskFixture.js';

describe('TaskDetailSheet', () => {
  it('renders reference, subtasks, attachments, and newest activity first', () => {
    const value = task('查看详情', {
      reference: 'NCR-108',
      subtasks: [{ id: crypto.randomUUID(), title: '复核尺寸', completed: false, sortOrder: 0 }],
      attachments: [{
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        fileName: 'evidence.webp',
        mediaType: 'image/webp',
        byteSize: 50_000,
        width: 800,
        height: 600,
        createdAt: '2026-10-15T02:20:00.000Z',
      }],
      activities: [
        { id: crypto.randomUUID(), kind: 'created', message: null, metadata: null, system: true, createdAt: '2026-10-15T02:00:00.000Z' },
        { id: crypto.randomUUID(), kind: 'manual', message: '已催办', metadata: null, system: false, createdAt: '2026-10-15T03:00:00.000Z' },
      ],
    });

    render(<TaskDetailSheet open task={value} onClose={vi.fn()} onComplete={vi.fn()} onDelete={vi.fn()} onUndo={vi.fn()} />);

    expect(screen.getByText('NCR-108')).toBeInTheDocument();
    expect(screen.getByText('复核尺寸')).toBeInTheDocument();
    expect(screen.getByText('evidence.webp')).toBeInTheDocument();
    expect(screen.getAllByTestId('activity-item').map((item) => item.textContent)).toEqual([
      expect.stringContaining('已催办'),
      expect.stringContaining('创建任务'),
    ]);
  });

  it('confirms completion with open subtasks and offers undo after complete/delete', async () => {
    const onComplete = vi.fn();
    const onDelete = vi.fn();
    const onUndo = vi.fn();
    const user = userEvent.setup();
    const value = task('待确认', {
      subtasks: [{ id: crypto.randomUUID(), title: '未完成项', completed: false, sortOrder: 0 }],
    });
    render(
      <TaskDetailSheet
        open
        task={value}
        onClose={vi.fn()}
        onComplete={onComplete}
        onDelete={onDelete}
        onUndo={onUndo}
      />,
    );

    await user.click(screen.getByRole('button', { name: '完成任务' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '仍然完成' }));
    expect(onComplete).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(onUndo).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '删除任务' }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '撤销' })).toBeInTheDocument();
  });
});
