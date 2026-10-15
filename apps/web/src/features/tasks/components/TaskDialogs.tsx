import type { useTaskWorkspace } from '../useTaskWorkspace.js';
import { TaskDetailSheet } from './TaskDetailSheet.js';
import { TaskEditorSheet } from './TaskEditorSheet.js';

interface TaskDialogsProps {
  workspace: ReturnType<typeof useTaskWorkspace>;
  defaultDueAt?: string | undefined;
}

export function TaskDialogs({ workspace: w, defaultDueAt }: TaskDialogsProps) {
  const selected = w.selected;
  return <>
    <TaskEditorSheet open={w.editorOpen} task={w.editingTask} defaultDueAt={defaultDueAt} suggestedTags={[...new Set(w.tasks.flatMap(task => task.tags.map(tag => tag.name)))]} onClose={w.closeEditor} onSave={w.save} />
    {!w.editorOpen && selected ? <TaskDetailSheet
      open task={selected} onClose={w.closeTask} onEdit={w.openEdit}
      onComplete={async confirmOpenSubtasks => w.replaceTask(await w.api.transition(selected.id, selected.version, { type: 'complete', confirmOpenSubtasks }))}
      onDelete={async () => w.replaceTask(await w.api.remove(selected.id, selected.version))}
      onUndo={async () => w.replaceTask(selected.deletedAt ? await w.api.restore(selected.id, selected.version) : await w.api.transition(selected.id, selected.version, { type: 'restore' }))}
      onAddProgress={async message => w.replaceTask(await w.api.addProgress(selected.id, selected.version, message))}
    /> : null}
  </>;
}
