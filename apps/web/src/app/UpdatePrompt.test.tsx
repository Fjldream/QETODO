import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UpdatePrompt } from './UpdatePrompt.js';

describe('UpdatePrompt', () => {
  it('defers activation while editing or outbox writes are in flight', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <UpdatePrompt needRefresh editorDirty writesInFlight={1} onUpdate={onUpdate} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('完成当前编辑和同步后即可更新');
    expect(screen.getByRole('button', { name: '立即更新' })).toBeDisabled();

    rerender(<UpdatePrompt needRefresh editorDirty={false} writesInFlight={0} onUpdate={onUpdate} />);
    await user.click(screen.getByRole('button', { name: '立即更新' }));
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('stays hidden when no service-worker update is waiting', () => {
    render(<UpdatePrompt needRefresh={false} editorDirty={false} writesInFlight={0} onUpdate={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
