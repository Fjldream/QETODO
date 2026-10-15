import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { HttpClient } from '../../api/http.js';
import { TaskDialogs } from './components/TaskDialogs.js';
import { TaskFilters, type TaskFilterValue } from './components/TaskFilters.js';
import { TaskRow } from './components/TaskRow.js';
import { useTaskWorkspace } from './useTaskWorkspace.js';

export function TasksPage({ client }: { client: HttpClient }) {
  const workspace = useTaskWorkspace(client);
  const [filters, setFilters] = useState<TaskFilterValue>({ text: '', status: '', priority: '' });
  const text = filters.text.trim().toLocaleLowerCase();
  const visible = workspace.tasks.filter(task => !task.deletedAt
    && (filters.status ? task.status === filters.status : !['completed', 'cancelled'].includes(task.status))
    && (!filters.priority || task.priority === filters.priority)
    && (!text || [task.title, task.description, task.reference, task.waitingOn, ...task.tags.map(tag => tag.name)].filter(Boolean).join(' ').toLocaleLowerCase().includes(text)));
  return (
    <section className="page workflow-page">
      <header className="page-toolbar large-title-header"><div><p className="eyebrow">全部工作</p><h1>任务</h1></div><button className="add-button" type="button" aria-label="新建任务" onClick={workspace.openCreate}><Plus /></button></header>
      <TaskFilters value={filters} onChange={setFilters} />
      <div className="task-scroll" role="region" aria-label="任务列表" tabIndex={0}>
      <div className="task-list all-task-list">{visible.map(task => <TaskRow key={task.id} task={task} onSelect={workspace.openTask} onPostpone={task => void workspace.postpone(task)} />)}</div>
      {!visible.length ? <p className="empty-state">当前筛选下没有任务</p> : null}
      </div>
      {workspace.error ? <p role="alert" className="inline-error">{workspace.error}</p> : null}
      <TaskDialogs workspace={workspace} />
    </section>
  );
}
