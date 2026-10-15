import type { TaskDto } from '@qetodo/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { HttpClient } from '../../api/http.js';
import { createOfflineTasksApi } from '../../api/offlineTasks.js';
import type { TaskDraft } from '../../api/tasks.js';

export function useTaskWorkspace(client: HttpClient, initialTasks?: TaskDto[]) {
  const api = useMemo(() => createOfflineTasksApi(client), [client]);
  const [tasks, setTasks] = useState<TaskDto[]>(initialTasks ?? []);
  const [selected, setSelected] = useState<TaskDto | null>(null);
  const selectedId = useRef<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDto | undefined>();
  const [syncMessage, setSyncMessage] = useState(initialTasks ? '已同步' : '正在同步…');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    api.start();
    void (async () => {
      if (initialTasks) await api.seed(initialTasks);
      if (!active) return;
      unsubscribe = api.subscribe(items => {
        if (!active) return;
        setTasks(items);
        const id = selectedId.current;
        if (id) void api.get(id).then(current => {
          if (active && selectedId.current === id && current) {
            selectedId.current = current.id;
            setSelected(current);
          }
        });
      });
      if (!initialTasks) {
        await api.list({ includeHistory: 'true' });
        if (active) setSyncMessage(navigator.onLine ? '已同步' : '暂时离线');
      }
    })().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '任务载入失败'); });
    return () => { active = false; unsubscribe?.(); api.stop(); };
  }, [api, initialTasks]);

  const replaceTask = (task: TaskDto) => {
    setTasks(items => [task, ...items.filter(item => item.id !== task.id)]);
    if (selectedId.current === task.id) setSelected(task);
  };
  const openTask = (task: TaskDto) => {
    selectedId.current = task.id;
    setSelected(task);
    setError('');
  };
  const closeTask = () => { selectedId.current = null; setSelected(null); };
  const openCreate = () => { setEditingTask(undefined); setEditorOpen(true); };
  const openEdit = () => { if (selected) { setEditingTask(selected); setEditorOpen(true); } };
  const closeEditor = () => { setEditorOpen(false); setEditingTask(undefined); };
  const save = async (draft: TaskDraft) => {
    const task = editingTask ? await api.edit(editingTask.id, editingTask.version, draft) : await api.create(draft);
    replaceTask(task);
    if (editingTask) { selectedId.current = task.id; setSelected(task); }
    closeEditor();
  };
  const postpone = async (task: TaskDto) => {
    try {
      const basis = task.dueAt ? new Date(task.dueAt) : new Date();
      basis.setDate(basis.getDate() + 1);
      replaceTask(await api.update(task.id, task.version, { dueAt: basis.toISOString() }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '改期失败'); }
  };
  return { api, tasks, selected, editorOpen, editingTask, syncMessage, error, replaceTask, openTask, closeTask, openCreate, openEdit, closeEditor, save, postpone };
}
