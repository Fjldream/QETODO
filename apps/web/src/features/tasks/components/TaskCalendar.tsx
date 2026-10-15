import type { TaskDto } from '@qetodo/contracts';

export function TaskCalendar({ tasks, selectedDate, onSelectDate }: { tasks: TaskDto[]; selectedDate: string; onSelectDate(date: string): void }) {
  const base = new Date(`${selectedDate}T12:00:00+08:00`);
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(base);
    date.setDate(base.getDate() + offset - 3);
    const key = date.toISOString().slice(0, 10);
    return { key, day: date.getDate(), count: tasks.filter((task) => task.dueAt?.slice(0, 10) === key).length };
  });
  return (
    <div className="calendar-strip" aria-label="选择日期">
      {days.map(({ key, day, count }) => (
        <button key={key} type="button" className={key === selectedDate ? 'selected' : ''} aria-pressed={key === selectedDate} onClick={() => onSelectDate(key)}><span>{day}</span>{count ? <small>{count}</small> : null}</button>
      ))}
    </div>
  );
}
