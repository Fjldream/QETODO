import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../attachments/imageCompression.js', () => ({
  compressImage: vi.fn(async (file: File) => ({
    file,
    mediaType: 'image/jpeg',
    originalBytes: file.size,
    compressedBytes: file.size,
    width: 100,
    height: 100,
  })),
}));

import { TaskEditorSheet } from './components/TaskEditorSheet.js';
import { taskFixture } from './taskFixture.js';

describe('TaskEditorSheet', () => {
  it('edits or clears a planned date without changing the deadline', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<TaskEditorSheet open task={taskFixture('提前推进', { plannedDate: '2026-10-15', dueAt: '2026-10-23T08:45:00.000Z' })} onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByLabelText('计划处理日期')).toHaveValue('2026-10-15');
    await user.clear(screen.getByLabelText('计划处理日期'));
    await user.type(screen.getByLabelText('计划处理日期'), '2026-10-16');
    await user.click(screen.getByRole('button', { name: '保存任务' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ plannedDate: '2026-10-16', dueAt: '2026-10-23T08:45:00.000Z' }));
    await user.clear(screen.getByLabelText('计划处理日期'));
    await user.click(screen.getByRole('button', { name: '保存任务' }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ plannedDate: null }));
  });

  it('prefills an existing task and lets the user edit fields, state, and initial tags', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const existing = taskFixture('原检验任务', { description: '现有说明', reference: 'NCR-001', dueAt: '2026-10-15T10:00:00.000Z' });
    render(<TaskEditorSheet open task={existing} onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByLabelText('任务标题')).toHaveValue('原检验任务');
    expect(screen.getByLabelText('详细说明')).toHaveValue('现有说明');
    expect(screen.getByLabelText('关联编号')).toHaveValue('NCR-001');
    await user.clear(screen.getByLabelText('任务标题'));
    await user.type(screen.getByLabelText('任务标题'), '复核检验任务');
    await user.selectOptions(screen.getByLabelText('状态'), 'cancelled');
    await user.click(screen.getByRole('button', { name: '质量异常' }));
    await user.click(screen.getByRole('button', { name: '保存任务' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: '复核检验任务', status: 'cancelled', reference: 'NCR-001', tags: ['质量异常'] }));
  });

  it('keeps a failed edit open with its input and a retryable error', async () => {
    const user = userEvent.setup();
    render(<TaskEditorSheet open task={taskFixture('保留输入')} onClose={vi.fn()} onSave={async () => { throw new Error('保存失败，请重试'); }} />);
    await user.click(screen.getByRole('button', { name: '保存任务' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败，请重试');
    expect(screen.getByLabelText('任务标题')).toHaveValue('保留输入');
  });
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
    expect(screen.getByRole('alert')).toHaveTextContent('每个任务最多保留 6 张图片');
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
