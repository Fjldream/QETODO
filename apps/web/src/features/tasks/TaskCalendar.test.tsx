import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TaskCalendar } from './components/TaskCalendar.js';
import { taskFixture as task } from './taskFixture.js';

describe('month calendar', () => {
  it('shows every day of the month in Monday-first rows, with per-day deduplicated active counts in Shanghai time', () => {
    render(<TaskCalendar selectedDate="2026-10-15" onSelectDate={vi.fn()} tasks={[
      task('计划和到期同一天', { plannedDate: '2026-10-23', dueAt: '2026-10-22T16:30:00Z' }),
      task('仅计划', { plannedDate: '2026-10-23' }),
      task('已完成', { plannedDate: '2026-10-23', status: 'completed' }),
      task('已取消', { plannedDate: '2026-10-23', status: 'cancelled' }),
      task('已删除', { plannedDate: '2026-10-23', deletedAt: '2026-10-15T00:00:00Z' }),
    ]} />);
    expect(screen.getByRole('heading', { name: '2026年10月' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^2026年10月\d+日/ })).toHaveLength(31);
    expect(screen.getByRole('button', { name: '2026年10月23日，2 项任务' })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: '2026年10月22日，0 项任务' }).querySelector('small')).toBeNull();
    expect(screen.getAllByText(/^[一二三四五六日]$/).map(el => el.textContent)).toEqual(['一', '二', '三', '四', '五', '六', '日']);
    expect(screen.getByRole('button', { name: '2026年10月15日，0 项任务' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('navigates across years, handles leap February, and returns to today', async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn();
    render(<TaskCalendar selectedDate="2027-01-31" onSelectDate={onSelectDate} tasks={[]} />);
    await user.click(screen.getByRole('button', { name: '上个月' }));
    expect(screen.getByRole('heading', { name: '2026年12月' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下个月' }));
    await user.click(screen.getByRole('button', { name: '下个月' }));
    expect(screen.getAllByRole('button', { name: /^2027年2月\d+日/ })).toHaveLength(28);
    await user.click(screen.getByRole('button', { name: '2027年2月28日，0 项任务' }));
    expect(onSelectDate).toHaveBeenLastCalledWith('2027-02-28');
    await user.click(screen.getByRole('button', { name: '回到今天' }));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    expect(onSelectDate).toHaveBeenLastCalledWith(today);
  });

  it('includes February 29 in a leap year', async () => {
    render(<TaskCalendar selectedDate="2028-02-01" onSelectDate={vi.fn()} tasks={[]} />);
    expect(screen.getAllByRole('button', { name: /^2028年2月\d+日/ })).toHaveLength(29);
  });
});
