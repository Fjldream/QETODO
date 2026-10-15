import type { TaskPriority, TaskStatus } from '@qetodo/contracts';
import { Search } from 'lucide-react';

export interface TaskFilterValue {
  text: string;
  status: TaskStatus | '';
  priority: TaskPriority | '';
}

export function TaskFilters({ value, onChange }: { value: TaskFilterValue; onChange(value: TaskFilterValue): void }) {
  return (
    <div className="task-filters">
      <label className="search-field" htmlFor="task-search"><Search size={18} /><span className="visually-hidden">搜索任务</span><input id="task-search" type="search" placeholder="搜索标题、标签、编号…" value={value.text} onChange={(event) => onChange({ ...value, text: event.target.value })} /></label>
      <div className="filter-row">
        <label><span className="visually-hidden">筛选状态</span><select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as TaskStatus | '' })}><option value="">全部状态</option><option value="pending">待处理</option><option value="in_progress">进行中</option><option value="waiting">等待他人</option></select></label>
        <label><span className="visually-hidden">筛选优先级</span><select value={value.priority} onChange={(event) => onChange({ ...value, priority: event.target.value as TaskPriority | '' })}><option value="">全部优先级</option><option value="urgent">紧急</option><option value="important">重要</option><option value="normal">普通</option></select></label>
      </div>
    </div>
  );
}
