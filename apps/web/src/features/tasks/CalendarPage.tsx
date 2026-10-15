import type { TaskDto } from '@qetodo/contracts';
import { useEffect, useMemo, useState } from 'react';

import type { HttpClient } from '../../api/http.js';
import { createOfflineTasksApi } from '../../api/offlineTasks.js';
import { TaskCalendar } from './components/TaskCalendar.js';
import { TaskRow } from './components/TaskRow.js';

export function CalendarPage({ client }: { client: HttpClient }) {
  const api = useMemo(() => createOfflineTasksApi(client), [client]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    api.start();
    void api.list().then(setTasks);
    return () => api.stop();
  }, [api]);
  const selected = tasks.filter((task) => task.dueAt?.slice(0, 10) === selectedDate);
  return (
    <section className="page workflow-page">
      <header className="large-title-header"><p className="eyebrow">按日期查看</p><h1>日历</h1></header>
      <TaskCalendar tasks={tasks} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      <div className="task-list calendar-tasks">{selected.map((task) => <TaskRow key={task.id} task={task} onSelect={() => undefined} onPostpone={() => undefined} />)}</div>
    </section>
  );
}
