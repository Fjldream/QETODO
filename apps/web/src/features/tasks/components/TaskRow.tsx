import type { TaskDto } from '@qetodo/contracts';
import { Clock3, MoreHorizontal } from 'lucide-react';

import { formatTaskDate } from '../taskViewModel.js';

interface TaskRowProps {
  task: TaskDto;
  onSelect(task: TaskDto): void;
  onPostpone(task: TaskDto): void;
}

export function TaskRow({ task, onSelect, onPostpone }: TaskRowProps) {
  return (
    <div className={`task-row priority-${task.priority}`}>
      <button className="task-row-main" type="button" onClick={() => onSelect(task)}>
        <span className={`status-dot status-${task.status}`} aria-hidden="true" />
        <span className="task-row-copy">
          <strong>{task.title}</strong>
          <span>
            {task.status === 'waiting' && task.waitingOn ? `等待 ${task.waitingOn} · ` : ''}
            {formatTaskDate(task.dueAt ?? task.followUpAt)}
          </span>
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
