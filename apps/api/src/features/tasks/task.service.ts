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

export class OpenSubtasksConfirmationRequiredError extends Error {
  constructor(readonly task: TaskDto) {
    super('OPEN_SUBTASKS_CONFIRMATION_REQUIRED');
  }
}

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
      if (
        parsed.type === 'complete' &&
        !parsed.confirmOpenSubtasks &&
        this.tasks.hasOpenSubtasks(id)
      ) {
        throw new OpenSubtasksConfirmationRequiredError(current);
      }
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

  setTags(
    id: string,
    baseVersion: number,
    names: string[],
    operationId: string,
  ): TaskDto {
    const seen = new Set<string>();
    const normalized = names
      .map((name) => name.trim())
      .filter((name) => {
        const key = name.toLocaleLowerCase();
        if (!name || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));
    if (normalized.some((name) => name.length > 50)) {
      throw new Error('INVALID_TAG');
    }
    return this.changeDetails(
      id,
      baseVersion,
      operationId,
      'task.tags',
      () => this.tasks.replaceTags(id, normalized, this.clock.now().getTime()),
      'tags_changed',
    );
  }

  createSubtask(
    id: string,
    baseVersion: number,
    input: { title: string; sortOrder: number },
    operationId: string,
  ): TaskDto {
    const title = input.title.trim();
    if (!title || title.length > 200 || !Number.isInteger(input.sortOrder) || input.sortOrder < 0) {
      throw new Error('INVALID_SUBTASK');
    }
    return this.changeDetails(
      id,
      baseVersion,
      operationId,
      'task.subtask.create',
      () => this.tasks.createSubtask(id, title, input.sortOrder, this.clock.now().getTime()),
      'subtask_changed',
    );
  }

  updateSubtask(
    taskId: string,
    subtaskId: string,
    baseVersion: number,
    patch: {
      title?: string | undefined;
      completed?: boolean | undefined;
      sortOrder?: number | undefined;
    },
    operationId: string,
  ): TaskDto {
    return this.changeDetails(
      taskId,
      baseVersion,
      operationId,
      'task.subtask.update',
      () => this.tasks.updateSubtask(taskId, subtaskId, patch, this.clock.now().getTime()),
      'subtask_changed',
    );
  }

  deleteSubtask(
    taskId: string,
    subtaskId: string,
    baseVersion: number,
    operationId: string,
  ): TaskDto {
    return this.changeDetails(
      taskId,
      baseVersion,
      operationId,
      'task.subtask.delete',
      () => this.tasks.deleteSubtask(taskId, subtaskId),
      'subtask_changed',
    );
  }

  reorderSubtasks(
    taskId: string,
    baseVersion: number,
    orderedIds: string[],
    operationId: string,
  ): TaskDto {
    return this.changeDetails(
      taskId,
      baseVersion,
      operationId,
      'task.subtask.reorder',
      () => this.tasks.reorderSubtasks(taskId, orderedIds, this.clock.now().getTime()),
      'subtask_changed',
    );
  }

  addManualActivity(
    id: string,
    baseVersion: number,
    message: string,
    operationId: string,
  ): TaskDto {
    const normalized = message.trim();
    if (!normalized || normalized.length > 2_000) throw new Error('INVALID_ACTIVITY');
    return this.changeDetails(
      id,
      baseVersion,
      operationId,
      'task.activity.manual',
      () =>
        this.activities.append(
          id,
          'manual',
          this.clock.now().getTime(),
          undefined,
          normalized,
        ),
      null,
    );
  }

  softDelete(id: string, baseVersion: number, operationId: string): TaskDto {
    return this.changeDetails(
      id,
      baseVersion,
      operationId,
      'task.delete',
      () => undefined,
      'deleted',
      { deletedAt: this.clock.now().toISOString() },
    );
  }

  restoreDeleted(id: string, baseVersion: number, operationId: string): TaskDto {
    return this.changeDetails(
      id,
      baseVersion,
      operationId,
      'task.restore',
      () => undefined,
      'restored',
      { deletedAt: null },
    );
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
      const statusChanged = parsedPatch.status !== undefined && parsedPatch.status !== current.status;
      if (statusChanged && parsedPatch.status === 'completed' && !parsedPatch.confirmOpenSubtasks && this.tasks.hasOpenSubtasks(id)) {
        throw new OpenSubtasksConfirmationRequiredError(current);
      }
      const timestamp = this.clock.now().toISOString();
      const next = taskDtoSchema.parse({
        ...current,
        ...parsedPatch,
        ...(statusChanged ? {
          completedAt: parsedPatch.status === 'completed' ? timestamp : null,
          cancelledAt: parsedPatch.status === 'cancelled' ? timestamp : null,
        } : {}),
        updatedAt: timestamp,
        version: current.version + 1,
      });
      this.tasks.save(next);
      if (parsedPatch.tagNames !== undefined) {
        const seen = new Set<string>();
        const names = parsedPatch.tagNames.map(name => name.trim()).filter(name => {
          const key = name.toLocaleLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        this.tasks.replaceTags(id, names, this.clock.now().getTime());
        this.activities.append(next.id, 'tags_changed', this.clock.now().getTime());
      }
      this.activities.append(next.id, activityKind, this.clock.now().getTime());
      if (statusChanged) this.activities.append(next.id, 'status_changed', this.clock.now().getTime(), { from: current.status, to: next.status });
      const result = this.get(next.id);
      this.idempotency.record(operationId, this.userId, 'task.update', 200, result, Date.now());
      return result;
    })();
  }

  private changeDetails(
    id: string,
    baseVersion: number,
    operationId: string,
    operationType: string,
    changeRelations: () => void,
    activityKind: string | null,
    patch: Partial<TaskDto> = {},
  ): TaskDto {
    const replayed = this.replay(operationId);
    if (replayed) return replayed;

    return this.database.sqlite.transaction(() => {
      const current = this.required(id);
      this.assertVersion(current, baseVersion, {});
      changeRelations();
      const next = taskDtoSchema.parse({
        ...current,
        ...patch,
        updatedAt: this.clock.now().toISOString(),
        version: current.version + 1,
      });
      this.tasks.save(next);
      if (activityKind) {
        this.activities.append(next.id, activityKind, this.clock.now().getTime());
      }
      const result = this.get(next.id);
      this.idempotency.record(
        operationId,
        this.userId,
        operationType,
        200,
        result,
        this.clock.now().getTime(),
      );
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
