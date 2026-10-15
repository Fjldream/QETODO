import { useState } from 'react';

import type { HttpClient } from '../../api/http.js';
import { TaskDialogs } from './components/TaskDialogs.js';
import { TaskCalendar } from './components/TaskCalendar.js';
import { TaskRow } from './components/TaskRow.js';
import { useTaskWorkspace } from './useTaskWorkspace.js';

export function CalendarPage({ client }: { client: HttpClient }) {
  const workspace = useTaskWorkspace(client);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const tasks = workspace.tasks.filter(task => !task.deletedAt && !['completed', 'cancelled'].includes(task.status));
  const selected = tasks.filter((task) => task.dueAt?.slice(0, 10) === selectedDate);
  return (
    <section className="page workflow-page">
      <header className="large-title-header"><p className="eyebrow">按日期查看</p><h1>日历</h1></header>
      <TaskCalendar tasks={tasks} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      <div className="task-list calendar-tasks">{selected.map(task => <TaskRow key={task.id} task={task} onSelect={workspace.openTask} onPostpone={task => void workspace.postpone(task)} />)}</div>
      <TaskDialogs workspace={workspace} />
    </section>
  );
}
