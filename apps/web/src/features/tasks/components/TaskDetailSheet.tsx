import type { TaskDto } from '@qetodo/contracts';
import { Check, FileImage, RotateCcw, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { formatTaskDate } from '../taskViewModel.js';
import { handleDialogKey } from './TaskEditorSheet.js';

interface TaskDetailSheetProps {
  open: boolean;
  task: TaskDto;
  onClose(): void;
  onComplete(confirmOpenSubtasks: boolean): Promise<void> | void;
  onDelete(): Promise<void> | void;
  onUndo(): Promise<void> | void;
}

export function TaskDetailSheet(props: TaskDetailSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [undoMessage, setUndoMessage] = useState('');
  if (!props.open) return null;

  const complete = async (confirmed: boolean) => {
    await props.onComplete(confirmed);
    setConfirming(false);
    setUndoMessage('任务已完成');
  };
  const remove = async () => {
    await props.onDelete();
    setUndoMessage('任务已移入回收站');
  };
  const undo = async () => {
    await props.onUndo();
    setUndoMessage('');
  };
  const openSubtasks = props.task.subtasks.some(({ completed }) => !completed);
  const activities = [...props.task.activities].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <div className="sheet-backdrop">
      <div
        ref={dialogRef}
        className="bottom-sheet detail-sheet motion-safe-sheet large-text-layout"
        role="dialog"
        aria-modal="true"
        aria-label="任务详情"
        onKeyDown={(event) => handleDialogKey(event, dialogRef.current, props.onClose)}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="detail-header">
          <div>
            <span className={`status-badge status-${props.task.status}`}>{statusLabel(props.task.status)}</span>
            <h2>{props.task.title}</h2>
            <p>{formatTaskDate(props.task.dueAt)}</p>
          </div>
          <button className="round-button" type="button" aria-label="关闭详情" onClick={props.onClose}><X size={20} /></button>
        </header>
        <div className="sheet-body detail-body">
          {props.task.description ? <p className="task-description">{props.task.description}</p> : null}
          {props.task.reference ? <DetailRow label="关联编号" value={props.task.reference} /> : null}
          {props.task.tags.length ? <DetailRow label="标签" value={props.task.tags.map(({ name }) => name).join(' · ')} /> : null}

          {props.task.subtasks.length ? (
            <section className="detail-section">
              <h3>子任务</h3>
              {props.task.subtasks.map((subtask) => (
                <div className="subtask-row" key={subtask.id}>
                  <span className={subtask.completed ? 'subtask-check checked' : 'subtask-check'}><Check size={13} /></span>
                  <span>{subtask.title}</span>
                </div>
              ))}
            </section>
          ) : null}

          {props.task.attachments.length ? (
            <section className="detail-section">
              <h3>图片附件</h3>
              <div className="attachment-list">
                {props.task.attachments.map((attachment) => (
                  <div key={attachment.id}><FileImage size={19} /><span>{attachment.fileName}</span></div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="detail-section">
            <h3>处理动态</h3>
            <div className="timeline">
              {activities.map((activity) => (
                <div data-testid="activity-item" className="timeline-item" key={activity.id}>
                  <span />
                  <div><strong>{activity.message ?? activityLabel(activity.kind)}</strong><time>{formatTaskDate(activity.createdAt)}</time></div>
                </div>
              ))}
            </div>
          </section>
        </div>
        {confirming ? (
          <div className="confirmation-panel" role="alertdialog" aria-label="仍有未完成子任务">
            <p>仍有未完成子任务，确定要完成主任务吗？</p>
            <button type="button" onClick={() => void complete(true)}>仍然完成</button>
            <button type="button" onClick={() => setConfirming(false)}>返回检查</button>
          </div>
        ) : null}
        {undoMessage ? (
          <div className="undo-bar" role="status"><span>{undoMessage}</span><button type="button" onClick={() => void undo()}><RotateCcw size={16} />撤销</button></div>
        ) : null}
        <footer className="detail-actions">
          <button type="button" onClick={() => openSubtasks ? setConfirming(true) : void complete(false)}><Check size={18} />完成任务</button>
          <button className="danger" type="button" onClick={() => void remove()}><Trash2 size={18} />删除任务</button>
        </footer>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>;
}

function statusLabel(status: TaskDto['status']): string {
  return { pending: '待处理', in_progress: '进行中', waiting: '等待他人', completed: '已完成', cancelled: '已取消' }[status];
}

function activityLabel(kind: string): string {
  return { created: '创建任务', updated: '更新任务', status_changed: '状态已变化', tags_changed: '标签已更新', subtask_changed: '子任务已更新', deleted: '删除任务', restored: '恢复任务' }[kind] ?? kind;
}
