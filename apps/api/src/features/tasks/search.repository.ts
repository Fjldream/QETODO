import type { TaskDto, TaskPriority, TaskStatus } from '@qetodo/contracts';

import type { AppDatabase } from '../../db/client.js';
import { TaskRepository } from './task.repository.js';

export interface TaskSearchQuery {
  text?: string;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  tag?: string;
  dueFrom?: string;
  dueTo?: string;
  waitingOn?: string;
  includeHistory?: boolean;
}

export class TaskSearchRepository {
  private readonly tasks: TaskRepository;

  constructor(
    private readonly database: AppDatabase,
    private readonly userId: string,
  ) {
    this.tasks = new TaskRepository(database, userId);
  }

  search(query: TaskSearchQuery): TaskDto[] {
    const conditions = ['tasks.user_id = ?', 'tasks.deleted_at IS NULL'];
    const parameters: Array<string | number> = [this.userId];
    const text = query.text?.trim();

    if (text) {
      if ([...text].length >= 3) {
        conditions.push(
          `tasks.rowid IN (
             SELECT rowid FROM task_search WHERE task_search MATCH ?
           )`,
        );
        parameters.push(`"${text.replaceAll('"', '""')}"`);
      } else {
        conditions.push(
          `(tasks.title LIKE ? OR tasks.description LIKE ? OR tasks.reference LIKE ?
            OR tasks.waiting_on LIKE ? OR tasks.search_tags LIKE ?)`,
        );
        const pattern = `%${text}%`;
        parameters.push(pattern, pattern, pattern, pattern, pattern);
      }
    }

    if (query.statuses?.length) {
      conditions.push(`tasks.status IN (${placeholders(query.statuses.length)})`);
      parameters.push(...query.statuses);
    } else if (!query.includeHistory) {
      conditions.push("tasks.status NOT IN ('completed', 'cancelled')");
    }

    if (query.priorities?.length) {
      conditions.push(`tasks.priority IN (${placeholders(query.priorities.length)})`);
      parameters.push(...query.priorities);
    }
    if (query.tag) {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM task_tags
           JOIN tags ON tags.id = task_tags.tag_id
           WHERE task_tags.task_id = tasks.id AND tags.name = ? COLLATE NOCASE
         )`,
      );
      parameters.push(query.tag);
    }
    if (query.dueFrom) {
      conditions.push('tasks.due_at >= ?');
      parameters.push(new Date(query.dueFrom).getTime());
    }
    if (query.dueTo) {
      conditions.push('tasks.due_at < ?');
      parameters.push(new Date(query.dueTo).getTime());
    }
    if (query.waitingOn) {
      conditions.push('tasks.waiting_on = ? COLLATE NOCASE');
      parameters.push(query.waitingOn);
    }

    const rows = this.database.sqlite
      .prepare(
        `SELECT tasks.id FROM tasks
         WHERE ${conditions.join(' AND ')}
         ORDER BY tasks.due_at IS NULL, tasks.due_at, tasks.created_at DESC`,
      )
      .all(...parameters) as Array<{ id: string }>;

    return rows.map(({ id }) => this.tasks.find(id)).filter((task): task is TaskDto => task !== null);
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
