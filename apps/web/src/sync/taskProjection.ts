import type { TaskDto, TaskTransitionInput, UpdateTaskInput } from '@qetodo/contracts';

import type { OutboxOperation } from './outbox.js';

export function applyTaskPatch(task: TaskDto, patch: UpdateTaskInput, now: string): TaskDto {
  const statusChanged = patch.status !== undefined && patch.status !== task.status;
  return {
    ...task,
    ...patch,
    ...(patch.tagNames ? { tags: patch.tagNames.map(name => task.tags.find(tag => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? { id: crypto.randomUUID(), name, color: null }) } : {}),
    ...(statusChanged ? {
      completedAt: patch.status === 'completed' ? now : null,
      cancelledAt: patch.status === 'cancelled' ? now : null,
    } : {}),
    version: task.version + 1,
    updatedAt: now,
  } as TaskDto;
}

export function applyQueuedOperation(task: TaskDto, operation: OutboxOperation): TaskDto {
  const now = operation.createdAt;
  if (operation.kind === 'update') return applyTaskPatch(task, operation.data as UpdateTaskInput, now);
  if (operation.kind === 'edit') return applyTaskPatch(task, (operation.data as { patch: UpdateTaskInput }).patch, now);
  if (operation.kind === 'activity') return {
    ...task, version: task.version + 1, updatedAt: now,
    activities: [...task.activities, { id: operation.operationId, kind: 'manual', message: (operation.data as { message: string }).message, metadata: null, system: false, createdAt: now }],
  };
  if (operation.kind === 'transition') {
    const change = operation.data as TaskTransitionInput;
    const patch: UpdateTaskInput = change.type === 'wait'
      ? { status: 'waiting', waitingOn: change.waitingOn, followUpAt: change.followUpAt }
      : { status: { start: 'in_progress', complete: 'completed', cancel: 'cancelled', restore: 'pending' }[change.type] as TaskDto['status'] };
    return applyTaskPatch(task, patch, now);
  }
  if (operation.kind === 'delete' || operation.kind === 'restore') {
    return { ...task, version: task.version + 1, updatedAt: now, deletedAt: operation.kind === 'delete' ? now : null };
  }
  return task;
}
