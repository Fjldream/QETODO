import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TaskRow } from './components/TaskRow.js';
import { TaskDetailSheet } from './components/TaskDetailSheet.js';
import { taskFixture } from './taskFixture.js';

describe('task progress history', () => {
  const task = taskFixture('供应商整改', { activities: [
    { id: crypto.randomUUID(), kind: 'manual', message: '已联系供应商', metadata: null, system: false, createdAt: '2026-10-15T02:00:00Z' },
    { id: crypto.randomUUID(), kind: 'manual', message: '整改报告已收到', metadata: null, system: false, createdAt: '2026-10-15T03:00:00Z' },
  ] });

  it('shows the latest progress in the task row without substituting its workflow state', () => {
    render(<TaskRow task={task} onSelect={vi.fn()} onPostpone={vi.fn()} />);
    expect(screen.getByText('供应商整改').closest('button')).toHaveTextContent('整改报告已收到');
  });

  it('summarizes the latest note while retaining every dated history entry', () => {
    render(<TaskDetailSheet open task={task} onClose={vi.fn()} onComplete={vi.fn()} onDelete={vi.fn()} onUndo={vi.fn()} />);
    expect(screen.getByRole('region', { name: '最新进展' })).toHaveTextContent('整改报告已收到');
    expect(screen.getAllByTestId('activity-item')).toHaveLength(2);
  });
});
