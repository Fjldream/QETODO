import type { TaskDto } from '@qetodo/contracts';

import { TaskRow } from './TaskRow.js';

interface TaskSectionProps {
  title: string;
  tasks: TaskDto[];
  onSelect(task: TaskDto): void;
  onPostpone(task: TaskDto): void;
}

export function TaskSection(props: TaskSectionProps) {
  return (
    <section className="task-section">
      <h2>{props.title}<span>{props.tasks.length}</span></h2>
      <div className="task-list">
        {props.tasks.map((task) => (
          <TaskRow key={task.id} task={task} onSelect={props.onSelect} onPostpone={props.onPostpone} />
        ))}
      </div>
    </section>
  );
}
