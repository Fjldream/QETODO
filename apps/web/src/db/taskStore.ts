import type { TaskDto } from '@qetodo/contracts';

import type { OutboxOperation } from '../sync/outbox.js';
import { applyQueuedOperation } from '../sync/taskProjection.js';
import type { LocalDatabase } from './localDb.js';

export class LocalTaskStore {
  constructor(private readonly db: LocalDatabase) {}

  async get(id: string): Promise<TaskDto | undefined> {
    const direct = await this.db.tasks.get(id);
    if (direct) return direct;
    const alias = await this.db.metadata.get(`task-alias:${id}`);
    return typeof alias?.value === 'string' ? this.db.tasks.get(alias.value) : undefined;
  }

  async list(): Promise<TaskDto[]> {
    return this.db.tasks.orderBy('updatedAt').reverse().toArray();
  }

  async put(task: TaskDto): Promise<void> {
    await this.db.tasks.put(task);
  }

  async putMany(tasks: TaskDto[]): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.outbox, async () => {
      const pendingIds = new Set((await this.db.outbox.toArray()).map(operation => operation.taskId));
      await this.db.tasks.bulkPut(tasks.filter(task => !pendingIds.has(task.id)));
    });
  }

  async replaceFromAcknowledgement(localId: string, task: TaskDto, operationId?: string): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.outbox, this.db.metadata, async () => {
      const pending = (await this.db.outbox.orderBy('sequence').toArray()).filter(operation => operation.operationId !== operationId && (operation.taskId === localId || operation.taskId === task.id));
      let projected = task;
      for (const operation of pending) {
        if (operation.sequence === undefined) continue;
        const updated = { ...operation, taskId: task.id, baseVersion: projected.version };
        await this.db.outbox.put(updated);
        projected = applyQueuedOperation(projected, updated);
      }
      if (localId !== task.id) await this.db.tasks.delete(localId);
      if (localId !== task.id) await this.db.metadata.put({ key: `task-alias:${localId}`, value: task.id });
      await this.db.tasks.put(projected);
    });
  }

  async applyOptimistic(task: TaskDto, operation: OutboxOperation): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.outbox, async () => {
      await this.db.tasks.put(task);
      const duplicate = await this.db.outbox.where('operationId').equals(operation.operationId).first();
      if (!duplicate) await this.db.outbox.add(operation);
    });
  }

  async deleteOptimistically(taskId: string, operation: OutboxOperation, deletedAt: string): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.outbox, async () => {
      const task = await this.db.tasks.get(taskId);
      if (!task) throw new Error('Task not found in local store');
      await this.db.tasks.put({ ...task, deletedAt, updatedAt: deletedAt });
      const duplicate = await this.db.outbox.where('operationId').equals(operation.operationId).first();
      if (!duplicate) await this.db.outbox.add(operation);
    });
  }

  async clear(): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.outbox, this.db.metadata, async () => {
      await Promise.all([this.db.tasks.clear(), this.db.outbox.clear(), this.db.metadata.clear()]);
    });
  }
}
