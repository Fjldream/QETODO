import type { TaskDto } from '@qetodo/contracts';
import Dexie, { type EntityTable } from 'dexie';

import type { OutboxOperation } from '../sync/outbox.js';

export interface LocalMetadata {
  key: string;
  value: unknown;
}

export class LocalDatabase extends Dexie {
  tasks!: EntityTable<TaskDto, 'id'>;
  outbox!: EntityTable<OutboxOperation, 'sequence'>;
  metadata!: EntityTable<LocalMetadata, 'key'>;

  constructor(name = 'qetodo') {
    super(name);
    this.version(1).stores({
      tasks: 'id, updatedAt, deletedAt',
      outbox: '++sequence, &operationId, taskId, createdAt',
      metadata: 'key',
    });
  }
}

export function createLocalDb(name?: string): LocalDatabase {
  return new LocalDatabase(name);
}

export const localDb = createLocalDb();
