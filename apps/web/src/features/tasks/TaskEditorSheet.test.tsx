import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TaskEditorSheet } from './components/TaskEditorSheet.js';

describe('TaskEditorSheet', () => {
  it('focuses the title and validates waiting fields inline', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<TaskEditorSheet open onClose={vi.fn()} onSave={onSave} />);

    expect(await screen.findByLabelText('任务标题')).toHaveFocus();
    await user.type(screen.getByLabelText('任务标题'), '等待整改');
    await user.selectOptions(screen.getByLabelText('状态'), 'waiting');
    await user.click(screen.getByRole('button', { name: '保存任务' }));

    expect(screen.getByText('请填写等待对象')).toBeInTheDocument();
    expect(screen.getByText('请选择下次跟进时间')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('adds flexible tags and accepts at most six image placeholders', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<TaskEditorSheet open onClose={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText('任务标题'), '检验记录');
    await user.type(screen.getByLabelText('添加标签'), '钛合金');
    await user.click(screen.getByRole('button', { name: '加入标签' }));
    const files = Array.from({ length: 7 }, (_, index) =>
      new File(['image'], `evidence-${index}.jpg`, { type: 'image/jpeg' }),
    );
    await user.upload(screen.getByLabelText('添加图片'), files);

    expect(screen.getByText('钛合金')).toBeInTheDocument();
    expect(screen.getAllByTestId('image-placeholder')).toHaveLength(6);
    expect(screen.getByRole('alert')).toHaveTextContent('最多添加 6 张图片');
  });

  it('traps focus and closes with Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TaskEditorSheet open onClose={onClose} onSave={vi.fn()} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toHaveClass('motion-safe-sheet');
  });
});
