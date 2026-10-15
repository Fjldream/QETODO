import {
  mutationAckSchema,
  taskDtoSchema,
  type CreateTaskInput,
  type MutationAck,
  type TaskDto,
  type TaskTransitionInput,
  type UpdateTaskInput,
} from '@qetodo/contracts';

import { localDb, type LocalDatabase } from '../db/localDb.js';
import { LocalTaskStore } from '../db/taskStore.js';
import { publishConflict, publishSyncStatus } from '../sync/SyncStatus.js';
import { resolveConflict } from '../sync/conflictResolver.js';
import { OutboxRepository, type OutboxOperation } from '../sync/outbox.js';
import { SyncEngine } from '../sync/syncEngine.js';
import type { HttpClient } from './http.js';
import { createTasksApi, type TaskDraft } from './tasks.js';

const taskAckSchema = mutationAckSchema(taskDtoSchema);

interface QueuedCreate {
  input: CreateTaskInput;
  tags: string[];
  tagsOperationId: string;
}

export function createOfflineTasksApi(client: HttpClient, db: LocalDatabase = localDb) {
  const online = createTasksApi(client);
  const tasks = new LocalTaskStore(db);
  const outbox = new OutboxRepository(db);
  let seedPromise: Promise<void> = Promise.resolve();
  const send = (operation: OutboxOperation) => sendOperation(client, operation);
  const engine = new SyncEngine({
    outbox,
    tasks,
    send,
    onStatus: publishSyncStatus,
    onConflict: (conflict) => {
      publishConflict(conflict, async (choice) => {
        await outbox.ack(conflict.operationId);
        await outbox.enqueue(resolveConflict(conflict, choice, crypto.randomUUID()));
        publishConflict(null);
        await engine.resumeAfterConflict();
      });
    },
  });

  const queue = async (task: TaskDto, operation: OutboxOperation): Promise<TaskDto> => {
    await tasks.applyOptimistic(task, operation);
    void engine.flush();
    return task;
  };

  return {
    start(): void { engine.start(); },
    stop(): void { engine.stop(); },
    seed(initialTasks: TaskDto[]): Promise<void> {
      seedPromise = seedPromise.then(() => tasks.putMany(initialTasks));
      return seedPromise;
    },
    async list(query: Record<string, string> = {}): Promise<TaskDto[]> {
      try {
        const remote = await online.list(query);
        await tasks.putMany(remote);
        return remote;
      } catch {
        const local = await tasks.list();
        const text = query.text?.toLocaleLowerCase();
        return text
          ? local.filter((task) => `${task.title} ${task.description} ${task.reference ?? ''}`.toLocaleLowerCase().includes(text))
          : local;
      }
    },
    async create(draft: TaskDraft): Promise<TaskDto> {
      const now = new Date().toISOString();
      const input = draftToInput(draft);
      const task = optimisticTask(draft, now);
      return queue(task, operation(task.id, 'create', null, {
        input,
        tags: draft.tags,
        tagsOperationId: crypto.randomUUID(),
      } satisfies QueuedCreate));
    },
    async update(id: string, version: number, patch: UpdateTaskInput): Promise<TaskDto> {
      await seedPromise;
      const existing = await requireTask(tasks, id);
      const updated = { ...existing, ...patch, version: version + 1, updatedAt: new Date().toISOString() } as TaskDto;
      return queue(updated, operation(id, 'update', version, patch));
    },
    async transition(id: string, version: number, transition: TaskTransitionInput): Promise<TaskDto> {
      await seedPromise;
      const existing = await requireTask(tasks, id);
      const updated = applyTransition(existing, transition);
      return queue(updated, operation(id, 'transition', version, transition));
    },
    async remove(id: string, version: number): Promise<TaskDto> {
      await seedPromise;
      const existing = await requireTask(tasks, id);
      const now = new Date().toISOString();
      const updated = { ...existing, deletedAt: now, updatedAt: now, version: version + 1 };
      return queue(updated, operation(id, 'delete', version, {}));
    },
    async restore(id: string, version: number): Promise<TaskDto> {
      await seedPromise;
      const existing = await requireTask(tasks, id);
      const updated = { ...existing, deletedAt: null, updatedAt: new Date().toISOString(), version: version + 1 };
      return queue(updated, operation(id, 'restore', version, {}));
    },
  };
}

async function sendOperation(client: HttpClient, operation: OutboxOperation): Promise<MutationAck<TaskDto>> {
  const routes = {
    update: [`/api/tasks/${operation.taskId}`, 'PATCH'],
    transition: [`/api/tasks/${operation.taskId}/transitions`, 'POST'],
    delete: [`/api/tasks/${operation.taskId}`, 'DELETE'],
    restore: [`/api/tasks/${operation.taskId}/restore`, 'POST'],
  } as const;
  if (operation.kind === 'create') {
    const queued = operation.data as QueuedCreate;
    let acknowledgement = taskAckSchema.parse(await client.request('/api/tasks', {
      method: 'POST',
      body: { operationId: operation.operationId, baseVersion: null, data: queued.input },
    }));
    if (queued.tags.length) {
      acknowledgement = taskAckSchema.parse(await client.request(`/api/tasks/${acknowledgement.data.id}/tags`, {
        method: 'PUT',
        body: {
          operationId: queued.tagsOperationId,
          baseVersion: acknowledgement.data.version,
          data: { names: queued.tags },
        },
      }));
    }
    return acknowledgement;
  }
  const [path, method] = routes[operation.kind];
  return taskAckSchema.parse(await client.request(path, {
    method,
    body: { operationId: operation.operationId, baseVersion: operation.baseVersion, data: operation.data },
  }));
}

function operation(taskId: string, kind: OutboxOperation['kind'], baseVersion: number | null, data: unknown): OutboxOperation {
  return { operationId: crypto.randomUUID(), taskId, kind, baseVersion, data, createdAt: new Date().toISOString(), retryCount: 0, lastError: null };
}

function draftToInput(draft: TaskDraft): CreateTaskInput {
  return {
    title: draft.title,
    description: draft.description,
    status: draft.status,
    priority: draft.priority,
    dueAt: draft.dueAt,
    reminderTimes: draft.reminderTimes,
    waitingOn: draft.waitingOn,
    followUpAt: draft.followUpAt,
    reference: draft.reference,
    tagIds: draft.tagIds,
    subtasks: draft.subtasks,
    recurrence: draft.recurrence,
    ...(draft.completionNote === undefined ? {} : { completionNote: draft.completionNote }),
  };
}

function optimisticTask(draft: TaskDraft, now: string): TaskDto {
  const recurrence = !draft.recurrence || draft.recurrence.kind === 'none'
    ? { kind: 'none' as const }
    : { kind: draft.recurrence.kind, interval: draft.recurrence.interval ?? 1 };
  return {
    id: crypto.randomUUID(),
    title: draft.title,
    description: draft.description ?? '',
    status: draft.status ?? 'pending',
    priority: draft.priority ?? 'normal',
    dueAt: draft.dueAt ?? null,
    reminderTimes: draft.reminderTimes ?? [],
    waitingOn: draft.waitingOn ?? null,
    followUpAt: draft.followUpAt ?? null,
    reference: draft.reference ?? null,
    tags: draft.tags.map((name) => ({ id: crypto.randomUUID(), name, color: null })),
    tagIds: [],
    subtasks: (draft.subtasks ?? []).map((subtask, index) => ({ id: crypto.randomUUID(), title: subtask.title, completed: false, sortOrder: index })),
    activities: [],
    attachments: [],
    recurrence,
    recurrenceSeriesId: null,
    createdAt: now,
    updatedAt: now,
    completedAt: draft.status === 'completed' ? now : null,
    cancelledAt: draft.status === 'cancelled' ? now : null,
    deletedAt: null,
    version: 1,
    ...(draft.completionNote === undefined ? {} : { completionNote: draft.completionNote }),
  };
}

async function requireTask(store: LocalTaskStore, id: string): Promise<TaskDto> {
  const task = await store.get(id);
  if (!task) throw new Error('本地任务尚未载入，请联网刷新后重试');
  return task;
}

function applyTransition(task: TaskDto, transition: TaskTransitionInput): TaskDto {
  const now = new Date().toISOString();
  const common = { updatedAt: now, version: task.version + 1 };
  switch (transition.type) {
    case 'start': return { ...task, ...common, status: 'in_progress' };
    case 'complete': return { ...task, ...common, status: 'completed', completedAt: now, completionNote: transition.completionNote };
    case 'cancel': return { ...task, ...common, status: 'cancelled', cancelledAt: now };
    case 'restore': return { ...task, ...common, status: 'pending', completedAt: null, cancelledAt: null };
    case 'wait': return { ...task, ...common, status: 'waiting', waitingOn: transition.waitingOn, followUpAt: transition.followUpAt };
  }
}
