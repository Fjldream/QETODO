import { randomUUID } from 'node:crypto';

import {
  createTaskInputSchema,
  taskDtoSchema,
  taskTransitionInputSchema,
  updateTaskInputSchema,
  type CreateTaskInput,
  type TaskDto,
  type TaskTransitionInput,
  type UpdateTaskInput,
} from '@qetodo/contracts';

import type { AppDatabase } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { IdempotencyStore } from '../../lib/idempotency.js';
import { ActivityRepository } from './activity.repository.js';
import { TaskRepository } from './task.repository.js';

export class TaskNotFoundError extends Error {}

export class VersionConflictError extends Error {
  constructor(
    readonly local: TaskDto,
    readonly server: TaskDto,
  ) {
    super('VERSION_CONFLICT');
  }
}

export class TaskService {
  private readonly tasks: TaskRepository;
  private readonly activities: ActivityRepository;
  private readonly idempotency: IdempotencyStore;

  constructor(
    private readonly database: AppDatabase,
    private readonly clock: Clock,
    private readonly userId: string,
  ) {
    this.tasks = new TaskRepository(database, userId);
    this.activities = new ActivityRepository(database);
    this.idempotency = new IdempotencyStore(database);
  }

  create(input: CreateTaskInput, operationId: string): TaskDto {
    const replayed = this.replay(operationId);
    if (replayed) return replayed;

    return this.database.sqlite.transaction(() => {
      const parsed = createTaskInputSchema.parse(input);
      const timestamp = this.clock.now().toISOString();
      const task = taskDtoSchema.parse({
        id: randomUUID(),
        ...parsed,
        recurrenceSeriesId: null,
        attachments: [],
        subtasks: [],
        tagIds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        cancelledAt: null,
        deletedAt: null,
        version: 1,
      });

      this.tasks.insert(task);
      this.activities.append(task.id, 'created', this.clock.now().getTime());
      const result = this.get(task.id);
      this.idempotency.record(operationId, this.userId, 'task.create', 201, result, Date.now());
      return result;
    })();
  }

  update(
    id: string,
    baseVersion: number,
    patch: UpdateTaskInput,
    operationId: string,
  ): TaskDto {
    const replayed = this.replay(operationId);
    if (replayed) return replayed;

    return this.mutate(id, baseVersion, patch, operationId, 'updated');
  }

  transition(
    id: string,
    baseVersion: number,
    transition: TaskTransitionInput,
    operationId: string,
  ): TaskDto {
    const parsed = taskTransitionInputSchema.parse(transition);
    const timestamp = this.clock.now().toISOString();
    let patch: UpdateTaskInput;
    switch (parsed.type) {
      case 'start':
        patch = { status: 'in_progress' };
        break;
      case 'complete':
        patch = {
          status: 'completed',
          ...(parsed.completionNote === undefined
            ? {}
            : { completionNote: parsed.completionNote }),
        };
        break;
      case 'cancel':
        patch = { status: 'cancelled' };
        break;
      case 'restore':
        patch = { status: 'pending' };
        break;
      case 'wait':
        patch = {
          status: 'waiting',
          waitingOn: parsed.waitingOn,
          followUpAt: parsed.followUpAt,
        };
        break;
    }

    const replayed = this.replay(operationId);
    if (replayed) return replayed;

    return this.database.sqlite.transaction(() => {
      const current = this.required(id);
      this.assertVersion(current, baseVersion, patch);
      const next = taskDtoSchema.parse({
        ...current,
        ...patch,
        completedAt: parsed.type === 'complete' ? timestamp : null,
        cancelledAt: parsed.type === 'cancel' ? timestamp : null,
        deletedAt: parsed.type === 'restore' ? null : current.deletedAt,
        updatedAt: timestamp,
        version: current.version + 1,
      });
      this.tasks.save(next);
      this.activities.append(next.id, 'status_changed', this.clock.now().getTime(), {
        from: current.status,
        to: next.status,
      });
      const result = this.get(next.id);
      this.idempotency.record(operationId, this.userId, 'task.transition', 200, result, Date.now());
      return result;
    })();
  }

  get(id: string): TaskDto {
    return this.required(id);
  }

  list(): TaskDto[] {
    return this.tasks.list();
  }

  private mutate(
    id: string,
    baseVersion: number,
    patch: UpdateTaskInput,
    operationId: string,
    activityKind: string,
  ): TaskDto {
    return this.database.sqlite.transaction(() => {
      const parsedPatch = updateTaskInputSchema.parse(patch);
      const current = this.required(id);
      this.assertVersion(current, baseVersion, parsedPatch);
      const next = taskDtoSchema.parse({
        ...current,
        ...parsedPatch,
        updatedAt: this.clock.now().toISOString(),
        version: current.version + 1,
      });
      this.tasks.save(next);
      this.activities.append(next.id, activityKind, this.clock.now().getTime());
      const result = this.get(next.id);
      this.idempotency.record(operationId, this.userId, 'task.update', 200, result, Date.now());
      return result;
    })();
  }

  private assertVersion(current: TaskDto, baseVersion: number, patch: UpdateTaskInput): void {
    if (current.version === baseVersion) return;
    const candidate = taskDtoSchema.safeParse({
      ...current,
      ...patch,
      updatedAt: this.clock.now().toISOString(),
      version: baseVersion,
    });
    throw new VersionConflictError(candidate.success ? candidate.data : current, current);
  }

  private required(id: string): TaskDto {
    const task = this.tasks.find(id);
    if (!task) throw new TaskNotFoundError('TASK_NOT_FOUND');
    return task;
  }

  private replay(operationId: string): TaskDto | null {
    const replayed = this.idempotency.find(operationId, this.userId);
    return replayed ? taskDtoSchema.parse(replayed) : null;
  }
}
