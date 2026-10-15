import { useSyncExternalStore } from 'react';

import type { ConflictResponse } from '@qetodo/contracts';

import { ConflictResolver, type ConflictChoice } from './conflictResolver.js';
import type { SyncState } from './syncEngine.js';

let currentStatus: SyncState = 'idle';
const listeners = new Set<() => void>();
let currentConflict: { value: ConflictResponse; choose(choice: ConflictChoice): void } | null = null;

export function publishSyncStatus(status: SyncState): void {
  currentStatus = status;
  listeners.forEach((listener) => listener());
}

export function useSyncStatus(): SyncState {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => currentStatus,
    () => 'idle',
  );
}

export function publishConflict(
  conflict: ConflictResponse | null,
  choose?: ((choice: ConflictChoice) => void) | undefined,
): void {
  currentConflict = conflict && choose ? { value: conflict, choose } : null;
  listeners.forEach((listener) => listener());
}

export function ConflictStatus() {
  const conflict = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => currentConflict,
    () => null,
  );
  return conflict ? <ConflictResolver conflict={conflict.value} onChoose={conflict.choose} /> : null;
}

export function SyncStatus() {
  const status = useSyncStatus();
  const labels: Record<SyncState, string> = {
    idle: '已同步',
    syncing: '正在同步…',
    offline: '离线，稍后自动同步',
    'authentication-required': '登录已失效，待重新登录',
    conflict: '有一项冲突需要处理',
  };
  return <span className={`global-sync-status sync-${status}`} role="status">{labels[status]}</span>;
}
