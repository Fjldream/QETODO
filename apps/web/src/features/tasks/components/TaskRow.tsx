import type { TaskDto } from '@qetodo/contracts';
import { Clock3, MoreHorizontal } from 'lucide-react';

import { formatPlannedDate, formatTaskDate, latestProgress } from '../taskViewModel.js';

interface TaskRowProps {
  task: TaskDto;
  contextLabel?: string;
  onSelect(task: TaskDto): void;
  onPostpone(task: TaskDto): void;
}

export function TaskRow({ task, contextLabel, onSelect, onPostpone }: TaskRowProps) {
  const progress = latestProgress(task);
  return (
    <div className={`task-row priority-${task.priority}`}>
      <button className="task-row-main" type="button" onClick={() => onSelect(task)}>
        <span className={`status-dot status-${task.status}`} aria-hidden="true" />
        <span className="task-row-copy">
          <strong>{task.title}</strong>
          {contextLabel ? <span className="task-row-context">{contextLabel}</span> : null}
          <span>
            {{ pending: '待处理', in_progress: '进行中', waiting: '等待他人', completed: '已完成', cancelled: '已取消' }[task.status]} ·{' '}
            {task.status === 'waiting' && task.waitingOn ? `等待 ${task.waitingOn} · ` : ''}
            {formatTaskDate(task.dueAt ?? task.followUpAt)}
          </span>
          {task.plannedDate ? <span>计划处理：{formatPlannedDate(task.plannedDate)}</span> : null}
          {progress ? <span className="task-row-progress">进展：{progress.message}</span> : null}
        </span>
      </button>
      <button
        className="row-icon-button"
        type="button"
        aria-label={`将“${task.title}”推迟一天`}
        onClick={() => onPostpone(task)}
      >
        {task.dueAt ? <Clock3 size={19} aria-hidden="true" /> : <MoreHorizontal size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
