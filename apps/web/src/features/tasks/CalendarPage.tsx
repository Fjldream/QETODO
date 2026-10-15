import { useState } from 'react';

import type { HttpClient } from '../../api/http.js';
import { TaskDialogs } from './components/TaskDialogs.js';
import { TaskCalendar } from './components/TaskCalendar.js';
import { TaskRow } from './components/TaskRow.js';
import { useTaskWorkspace } from './useTaskWorkspace.js';
import { calendarReasons, dateKey, formatPlannedDate, isActiveTask, taskCalendarDates } from './taskViewModel.js';

export function CalendarPage({ client }: { client: HttpClient }) {
  const workspace = useTaskWorkspace(client);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const tasks = workspace.tasks.filter(isActiveTask);
  const selected = tasks.filter(task => taskCalendarDates(task).includes(selectedDate));
  return (
    <section className="page workflow-page calendar-page">
      <header className="large-title-header"><p className="eyebrow">按日期查看</p><h1>日历</h1></header>
      <TaskCalendar tasks={tasks} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      <header className="calendar-agenda-heading"><h2>{formatPlannedDate(selectedDate)}的任务</h2><span>{selected.length} 项</span></header>
      <div className="task-scroll" role="region" aria-label="任务列表" tabIndex={0} key={selectedDate}>
        <div className="task-list calendar-tasks">{selected.map(task => <TaskRow key={task.id} task={task} contextLabel={calendarReasons(task, selectedDate)} onSelect={workspace.openTask} onPostpone={task => void workspace.postpone(task)} />)}</div>
        {!selected.length ? <p className="calendar-empty">这一天没有计划处理或到期的任务</p> : null}
      </div>
      {workspace.error ? <p role="alert" className="inline-error">{workspace.error}</p> : null}
      <TaskDialogs workspace={workspace} />
    </section>
  );
}
