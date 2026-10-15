import type { TaskDto } from '@qetodo/contracts';
import { Plus } from 'lucide-react';

import type { HttpClient } from '../../api/http.js';
import { TaskDialogs } from './components/TaskDialogs.js';
import { TaskSection } from './components/TaskSection.js';
import { groupTasksForToday } from './taskViewModel.js';
import { useTaskWorkspace } from './useTaskWorkspace.js';

interface TodayPageProps {
  client: HttpClient;
  initialTasks?: TaskDto[];
  now?: Date;
}

export function TodayPage({ client, initialTasks, now = new Date() }: TodayPageProps) {
  const workspace = useTaskWorkspace(client, initialTasks);
  const groups = groupTasksForToday(workspace.tasks, now, 'Asia/Shanghai');

  return (
    <section className="page workflow-page">
      <header className="page-toolbar large-title-header">
        <div><p className="eyebrow">{formatToday(now)}</p><h1>今日</h1><p className="sync-state">{workspace.syncMessage}</p></div>
        <button className="add-button" type="button" aria-label="新建任务" onClick={workspace.openCreate}><Plus /></button>
      </header>
      {groups.length ? groups.map((group) => (
        <TaskSection key={group.key} title={group.title} tasks={group.tasks} onSelect={workspace.openTask} onPostpone={task => void workspace.postpone(task)} />
      )) : (
        <div className="empty-state"><span className="empty-state-symbol">✓</span><h2>今天安排清楚了</h2><p>点右上角“添加”记录第一条任务。</p></div>
      )}
      {workspace.error ? <p role="alert" className="inline-error">{workspace.error}</p> : null}
      <TaskDialogs workspace={workspace} defaultDueAt={todayDefaultDueAt(now, 'Asia/Shanghai')} />
    </section>
  );
}

function formatToday(value: Date): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(value);
}

function todayDefaultDueAt(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T18:00`;
}
