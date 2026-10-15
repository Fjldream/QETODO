import type { TaskDto } from '@qetodo/contracts';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { HttpClient } from '../../api/http.js';
import { createOfflineTasksApi } from '../../api/offlineTasks.js';
import type { TaskDraft } from '../../api/tasks.js';
import { TaskEditorSheet } from './components/TaskEditorSheet.js';
import { TaskFilters, type TaskFilterValue } from './components/TaskFilters.js';
import { TaskRow } from './components/TaskRow.js';

export function TasksPage({ client }: { client: HttpClient }) {
  const api = useMemo(() => createOfflineTasksApi(client), [client]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [filters, setFilters] = useState<TaskFilterValue>({ text: '', status: '', priority: '' });
  const [editorOpen, setEditorOpen] = useState(false);
  useEffect(() => {
    api.start();
    return () => api.stop();
  }, [api]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api.list(filters.text ? { text: filters.text } : {}).then(setTasks);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [api, filters.text]);
  const visible = tasks.filter((task) => (!filters.status || task.status === filters.status) && (!filters.priority || task.priority === filters.priority));
  const save = async (draft: TaskDraft) => {
    const task = await api.create(draft);
    setTasks((items) => [task, ...items]);
    setEditorOpen(false);
  };
  return (
    <section className="page workflow-page">
      <header className="page-toolbar large-title-header"><div><p className="eyebrow">全部工作</p><h1>任务</h1></div><button className="add-button" type="button" aria-label="新建任务" onClick={() => setEditorOpen(true)}><Plus /></button></header>
      <TaskFilters value={filters} onChange={setFilters} />
      <div className="task-list all-task-list">{visible.map((task) => <TaskRow key={task.id} task={task} onSelect={() => undefined} onPostpone={() => undefined} />)}</div>
      <TaskEditorSheet open={editorOpen} onClose={() => setEditorOpen(false)} onSave={save} />
    </section>
  );
}
