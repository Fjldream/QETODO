import type { TaskDto } from '@qetodo/contracts';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { createTasksApi, type TaskDraft } from '../../api/tasks.js';
import type { HttpClient } from '../../api/http.js';
import { TaskDetailSheet } from './components/TaskDetailSheet.js';
import { TaskEditorSheet } from './components/TaskEditorSheet.js';
import { TaskSection } from './components/TaskSection.js';
import { groupTasksForToday } from './taskViewModel.js';

interface TodayPageProps {
  client: HttpClient;
  initialTasks?: TaskDto[];
  now?: Date;
}

export function TodayPage({ client, initialTasks, now = new Date() }: TodayPageProps) {
  const api = useMemo(() => createTasksApi(client), [client]);
  const [tasks, setTasks] = useState<TaskDto[]>(initialTasks ?? []);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<TaskDto | null>(null);
  const [syncMessage, setSyncMessage] = useState(initialTasks ? '已同步' : '正在同步…');

  useEffect(() => {
    if (initialTasks) return;
    let active = true;
    void api.list().then((items) => {
      if (!active) return;
      setTasks(items);
      setSyncMessage('已同步');
    }).catch(() => active && setSyncMessage('暂时离线'));
    return () => { active = false; };
  }, [api, initialTasks]);

  const groups = groupTasksForToday(tasks, now, 'Asia/Shanghai');
  const replaceTask = (task: TaskDto) => {
    setTasks((items) => [task, ...items.filter(({ id }) => id !== task.id)]);
    setSelected((current) => current?.id === task.id ? task : current);
  };
  const save = async (draft: TaskDraft) => {
    replaceTask(await api.create(draft));
    setEditorOpen(false);
  };
  const postpone = async (task: TaskDto) => {
    const basis = task.dueAt ? new Date(task.dueAt) : new Date(now);
    basis.setDate(basis.getDate() + 1);
    replaceTask(await api.update(task.id, task.version, { dueAt: basis.toISOString() }));
  };

  return (
    <section className="page workflow-page">
      <header className="page-toolbar large-title-header">
        <div><p className="eyebrow">{formatToday(now)}</p><h1>今日</h1><p className="sync-state">{syncMessage}</p></div>
        <button className="add-button" type="button" aria-label="新建任务" onClick={() => setEditorOpen(true)}><Plus /></button>
      </header>
      {groups.length ? groups.map((group) => (
        <TaskSection key={group.key} title={group.title} tasks={group.tasks} onSelect={setSelected} onPostpone={(task) => void postpone(task)} />
      )) : (
        <div className="empty-state"><span className="empty-state-symbol">✓</span><h2>今天安排清楚了</h2><p>点右上角“添加”记录第一条任务。</p></div>
      )}
      <TaskEditorSheet
        open={editorOpen}
        defaultDueAt={todayDefaultDueAt(now, 'Asia/Shanghai')}
        onClose={() => setEditorOpen(false)}
        onSave={save}
      />
      {selected ? (
        <TaskDetailSheet
          open
          task={selected}
          onClose={() => setSelected(null)}
          onComplete={async (confirmOpenSubtasks) => replaceTask(await api.transition(selected.id, selected.version, { type: 'complete', confirmOpenSubtasks }))}
          onDelete={async () => replaceTask(await api.remove(selected.id, selected.version))}
          onUndo={async () => {
            const restored = selected.deletedAt
              ? await api.restore(selected.id, selected.version)
              : await api.transition(selected.id, selected.version, { type: 'restore' });
            replaceTask(restored);
          }}
        />
      ) : null}
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
