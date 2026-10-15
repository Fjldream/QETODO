import type { ConflictResponse, MutationAck, TaskDto } from '@qetodo/contracts';

import { ApiError } from '../api/http.js';
import type { LocalTaskStore } from '../db/taskStore.js';
import type { OutboxOperation, OutboxRepository } from './outbox.js';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'authentication-required' | 'conflict';

interface SyncEngineOptions {
  outbox: OutboxRepository;
  tasks: LocalTaskStore;
  send(operation: OutboxOperation): Promise<MutationAck<TaskDto>>;
  onConflict?(conflict: ConflictResponse): void;
  onStatus?(status: SyncState): void;
}

export class SyncEngine {
  private status: SyncState = 'idle';
  private running = false;
  private flushing: Promise<void> | null = null;
  private retryTimer: number | undefined;
  private readonly online = () => void this.flush();

  constructor(private readonly options: SyncEngineOptions) {}

  getStatus(): SyncState {
    return this.status;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    window.addEventListener('online', this.online);
    void this.flush();
  }

  stop(): void {
    this.running = false;
    window.removeEventListener('online', this.online);
    if (this.retryTimer !== undefined) window.clearTimeout(this.retryTimer);
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.status === 'authentication-required' || this.status === 'conflict') return Promise.resolve();
    this.flushing = this.flushQueue().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async resumeAfterAuthentication(): Promise<void> {
    this.setStatus('idle');
    await this.flush();
  }

  async resumeAfterConflict(): Promise<void> {
    this.setStatus('idle');
    await this.flush();
  }

  private async flushQueue(): Promise<void> {
    while (true) {
      const operation = (await this.options.outbox.peek(1))[0];
      if (!operation) {
        this.setStatus('idle');
        return;
      }
      this.setStatus('syncing');
      try {
        const acknowledgement = await this.options.send(operation);
        if (acknowledgement.operationId !== operation.operationId) {
          throw new Error('Server acknowledged an unexpected operation');
        }
        await this.options.tasks.replaceFromAcknowledgement(operation.taskId, acknowledgement.data);
        await this.options.outbox.ack(operation.operationId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          this.setStatus('authentication-required');
          return;
        }
        if (error instanceof ApiError && error.status === 409) {
          this.setStatus('conflict');
          this.options.onConflict?.(error.details as ConflictResponse);
          return;
        }
        await this.options.outbox.fail(operation.operationId, error instanceof Error ? error.message : '同步失败');
        this.setStatus('offline');
        this.scheduleRetry(operation.retryCount + 1);
        return;
      }
    }
  }

  private scheduleRetry(retryCount: number): void {
    if (!this.running) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(retryCount, 5));
    this.retryTimer = window.setTimeout(() => void this.flush(), delay);
  }

  private setStatus(status: SyncState): void {
    this.status = status;
    this.options.onStatus?.(status);
  }
}
