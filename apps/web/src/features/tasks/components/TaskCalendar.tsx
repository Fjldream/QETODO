import type { TaskDto } from '@qetodo/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { dateKey, taskCalendarDates } from '../taskViewModel.js';

export function TaskCalendar({ tasks, selectedDate, onSelectDate }: { tasks: TaskDto[]; selectedDate: string; onSelectDate(date: string): void }) {
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const first = new Date(`${month}-01T12:00:00Z`);
  const leadingDays = (first.getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const trailingDays = (7 - (leadingDays + dayCount) % 7) % 7;
  const counts = new Map<string, number>();
  for (const task of tasks) for (const date of taskCalendarDates(task)) counts.set(date, (counts.get(date) ?? 0) + 1);
  const today = dateKey(new Date());
  const select = (date: string) => { setMonth(date.slice(0, 7)); onSelectDate(date); };
  const moveMonth = (offset: number) => {
    const next = new Date(first);
    next.setUTCMonth(first.getUTCMonth() + offset);
    select(next.toISOString().slice(0, 10));
  };
  return (
    <section className="month-calendar" aria-label="月历">
      <div className="calendar-toolbar">
        <h2 aria-live="polite">{year}年{monthNumber}月</h2>
        <div className="calendar-navigation">
          <button className="calendar-today text-button" type="button" onClick={() => select(today)}>回到今天</button>
          <button className="calendar-arrow" type="button" aria-label="上个月" onClick={() => moveMonth(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
          <button className="calendar-arrow" type="button" aria-label="下个月" onClick={() => moveMonth(1)}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid" aria-label="选择日期">
        {Array.from({ length: leadingDays }, (_, i) => <span className="calendar-blank" key={`before-${i}`} aria-hidden="true" />)}
        {Array.from({ length: dayCount }, (_, i) => {
          const day = i + 1;
          const key = `${month}-${String(day).padStart(2, '0')}`;
          const count = counts.get(key) ?? 0;
          return <button
            key={key} data-date={key} type="button"
            className={`calendar-day${key === selectedDate ? ' selected' : ''}${key === today ? ' is-today' : ''}`}
            aria-label={`${year}年${monthNumber}月${day}日，${count} 项任务`}
            aria-pressed={key === selectedDate} aria-current={key === today ? 'date' : undefined}
            onClick={() => select(key)}
          ><span>{day}</span>{count ? <small aria-hidden="true">{count}</small> : null}</button>;
        })}
        {Array.from({ length: trailingDays }, (_, i) => <span className="calendar-blank" key={`after-${i}`} aria-hidden="true" />)}
      </div>
      <p className="calendar-caption">右下角数字为计划处理或到期的未完成任务数</p>
    </section>
  );
}
