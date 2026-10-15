import {
  mutationAckSchema,
  taskDtoSchema,
  type CreateTaskInput,
  type TaskDto,
  type TaskTransitionInput,
  type UpdateTaskInput,
} from '@qetodo/contracts';

import type { HttpClient } from './http.js';

const taskAckSchema = mutationAckSchema(taskDtoSchema);

export interface TaskDraft extends CreateTaskInput {
  tags: string[];
  imageFiles: File[];
  confirmOpenSubtasks?: boolean;
}

export function createTasksApi(client: HttpClient) {
  const mutate = async <T extends object>(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    baseVersion: number | null,
    data: T,
  ): Promise<TaskDto> => {
    const result = await client.request<unknown>(path, {
      method,
      body: { operationId: crypto.randomUUID(), baseVersion, data },
    });
    return taskAckSchema.parse(result).data;
  };

  return {
    async list(query: Record<string, string> = {}): Promise<TaskDto[]> {
      const search = new URLSearchParams(query);
      const result = await client.request<unknown>(`/api/tasks${search.size ? `?${search}` : ''}`);
      return taskDtoSchema.array().parse(result);
    },
    async create(draft: TaskDraft): Promise<TaskDto> {
      const input: CreateTaskInput = {
        title: draft.title,
        description: draft.description,
        status: draft.status,
        priority: draft.priority,
        dueAt: draft.dueAt,
        reminderTimes: draft.reminderTimes,
        waitingOn: draft.waitingOn,
        followUpAt: draft.followUpAt,
        reference: draft.reference,
        tagIds: draft.tagIds,
        subtasks: draft.subtasks,
        recurrence: draft.recurrence,
        ...(draft.completionNote === undefined ? {} : { completionNote: draft.completionNote }),
      };
      let task = await mutate('/api/tasks', 'POST', null, input);
      if (draft.tags.length) {
        task = await mutate(`/api/tasks/${task.id}/tags`, 'PUT', task.version, { names: draft.tags });
      }
      return task;
    },
    update(id: string, version: number, patch: UpdateTaskInput): Promise<TaskDto> {
      return mutate(`/api/tasks/${id}`, 'PATCH', version, patch);
    },
    transition(id: string, version: number, transition: TaskTransitionInput): Promise<TaskDto> {
      return mutate(`/api/tasks/${id}/transitions`, 'POST', version, transition);
    },
    remove(id: string, version: number): Promise<TaskDto> {
      return mutate(`/api/tasks/${id}`, 'DELETE', version, {});
    },
    restore(id: string, version: number): Promise<TaskDto> {
      return mutate(`/api/tasks/${id}/restore`, 'POST', version, {});
    },
  };
}
