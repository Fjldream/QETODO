import type { ConflictResponse } from '@qetodo/contracts';

import type { OutboxOperation } from './outbox.js';

export type ConflictChoice = 'local' | 'server';

export function resolveConflict(
  conflict: ConflictResponse,
  choice: ConflictChoice,
  operationId: string,
): OutboxOperation {
  const selected = choice === 'local' ? conflict.local : conflict.server;
  return {
    operationId,
    taskId: conflict.server.id,
    kind: 'update',
    baseVersion: conflict.server.version,
    data: selected,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
  };
}

interface ConflictResolverProps {
  conflict: ConflictResponse;
  onChoose(choice: ConflictChoice): void;
}

export function ConflictResolver({ conflict, onChoose }: ConflictResolverProps) {
  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet conflict-sheet" role="dialog" aria-modal="true" aria-label="处理同步冲突">
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-header"><h2>选择要保留的版本</h2></header>
        <div className="sheet-body conflict-versions">
          <Version title="手机上的版本" taskTitle={conflict.local.title} description={conflict.local.description} />
          <Version title="服务器版本" taskTitle={conflict.server.title} description={conflict.server.description} />
          <div className="conflict-actions">
            <button className="secondary-button" type="button" onClick={() => onChoose('server')}>保留服务器版本</button>
            <button className="primary-button" type="button" onClick={() => onChoose('local')}>保留手机版本</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Version({ title, taskTitle, description }: { title: string; taskTitle: string; description: string }) {
  return <article className="conflict-version"><h3>{title}</h3><strong>{taskTitle}</strong><p>{description || '无详细说明'}</p></article>;
}
