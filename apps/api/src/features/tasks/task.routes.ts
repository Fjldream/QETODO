import {
  createTaskInputSchema,
  mutationAckSchema,
  mutationEnvelopeSchema,
  taskDtoSchema,
  taskTransitionInputSchema,
  updateTaskInputSchema,
} from '@qetodo/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppDatabase } from '../../db/client.js';
import { requireAuth, requireProtectedMutation } from '../auth/auth.guard.js';
import type { SessionService } from '../auth/auth.service.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError } from '../../lib/httpErrors.js';
import { TaskSearchRepository } from './search.repository.js';
import {
  OpenSubtasksConfirmationRequiredError,
  TaskNotFoundError,
  TaskService,
  VersionConflictError,
} from './task.service.js';
import { TrashService } from './trash.service.js';

export interface TaskRouteDependencies {
  appOrigin: string;
  clock: Clock;
  database: AppDatabase;
  sessions: SessionService;
}

const createEnvelopeSchema = mutationEnvelopeSchema(createTaskInputSchema);
const updateEnvelopeSchema = mutationEnvelopeSchema(updateTaskInputSchema);
const transitionEnvelopeSchema = mutationEnvelopeSchema(taskTransitionInputSchema);
const taskAckSchema = mutationAckSchema(taskDtoSchema);
const tagsEnvelopeSchema = mutationEnvelopeSchema(
  z.object({ names: z.array(z.string().trim().min(1).max(50)).max(30) }),
);
const createSubtaskEnvelopeSchema = mutationEnvelopeSchema(
  z.object({
    title: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().nonnegative(),
  }),
);
const updateSubtaskEnvelopeSchema = mutationEnvelopeSchema(
  z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      completed: z.boolean().optional(),
      sortOrder: z.number().int().nonnegative().optional(),
    })
    .refine((value) => Object.keys(value).length > 0),
);
const reorderSubtasksEnvelopeSchema = mutationEnvelopeSchema(
  z.object({ orderedIds: z.array(z.uuid()) }),
);
const activityEnvelopeSchema = mutationEnvelopeSchema(
  z.object({ message: z.string().trim().min(1).max(2_000) }),
);
const emptyEnvelopeSchema = mutationEnvelopeSchema(z.object({}));

export async function registerTaskRoutes(
  app: FastifyInstance,
  dependencies: TaskRouteDependencies,
): Promise<void> {
  app.get('/api/tasks', async (request) => {
    const authenticated = await requireAuth(request, dependencies.sessions);
    const query = request.query as Record<string, string | undefined>;
    const search = new TaskSearchRepository(
      dependencies.database,
      authenticated.user.userId,
    );
    return taskDtoSchema.array().parse(
      search.search({
        ...(query.text ? { text: query.text } : {}),
        ...(query.tag ? { tag: query.tag } : {}),
        ...(query.waitingOn ? { waitingOn: query.waitingOn } : {}),
        ...(query.dueFrom ? { dueFrom: query.dueFrom } : {}),
        ...(query.dueTo ? { dueTo: query.dueTo } : {}),
        includeHistory: query.includeHistory === 'true',
      }),
    );
  });

  app.get('/api/tasks/:id', async (request, reply) => {
    const service = await serviceForRead(request, dependencies);
    try {
      return taskDtoSchema.parse(service.get(taskId(request)));
    } catch (error) {
      return handleTaskError(error, reply);
    }
  });

  app.post('/api/tasks', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(createEnvelopeSchema, request.body);
    if (envelope.baseVersion !== null) {
      throw invalidRequest([{ path: ['baseVersion'], message: '创建任务时基础版本必须为空' }]);
    }

    const task = service.create(envelope.data, envelope.operationId);
    return reply.status(201).send(
      taskAckSchema.parse({ operationId: envelope.operationId, data: task }),
    );
  });

  app.patch('/api/tasks/:id', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(updateEnvelopeSchema, request.body);
    const baseVersion = requireBaseVersion(envelope.baseVersion);

    try {
      const task = service.update(
        taskId(request),
        baseVersion,
        envelope.data,
        envelope.operationId,
      );
      return taskAckSchema.parse({ operationId: envelope.operationId, data: task });
    } catch (error) {
      return handleTaskError(error, reply, envelope.operationId);
    }
  });

  app.post('/api/tasks/:id/transitions', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(transitionEnvelopeSchema, request.body);
    const baseVersion = requireBaseVersion(envelope.baseVersion);

    try {
      const task = service.transition(
        taskId(request),
        baseVersion,
        envelope.data,
        envelope.operationId,
      );
      return taskAckSchema.parse({ operationId: envelope.operationId, data: task });
    } catch (error) {
      return handleTaskError(error, reply, envelope.operationId);
    }
  });

  app.put('/api/tasks/:id/tags', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(tagsEnvelopeSchema, request.body);
    return sendMutation(
      reply,
      envelope.operationId,
      () => service.setTags(taskId(request), requireBaseVersion(envelope.baseVersion), envelope.data.names, envelope.operationId),
    );
  });

  app.post('/api/tasks/:id/subtasks/reorder', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(reorderSubtasksEnvelopeSchema, request.body);
    return sendMutation(reply, envelope.operationId, () =>
      service.reorderSubtasks(
        taskId(request),
        requireBaseVersion(envelope.baseVersion),
        envelope.data.orderedIds,
        envelope.operationId,
      ),
    );
  });

  app.post('/api/tasks/:id/subtasks', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(createSubtaskEnvelopeSchema, request.body);
    return sendMutation(reply, envelope.operationId, () =>
      service.createSubtask(
        taskId(request),
        requireBaseVersion(envelope.baseVersion),
        envelope.data,
        envelope.operationId,
      ),
    );
  });

  app.patch('/api/tasks/:id/subtasks/:subtaskId', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(updateSubtaskEnvelopeSchema, request.body);
    return sendMutation(reply, envelope.operationId, () =>
      service.updateSubtask(
        taskId(request),
        subtaskId(request),
        requireBaseVersion(envelope.baseVersion),
        envelope.data,
        envelope.operationId,
      ),
    );
  });

  app.delete('/api/tasks/:id/subtasks/:subtaskId', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(emptyEnvelopeSchema, request.body);
    return sendMutation(reply, envelope.operationId, () =>
      service.deleteSubtask(
        taskId(request),
        subtaskId(request),
        requireBaseVersion(envelope.baseVersion),
        envelope.operationId,
      ),
    );
  });

  app.post('/api/tasks/:id/activities', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(activityEnvelopeSchema, request.body);
    return sendMutation(reply, envelope.operationId, () =>
      service.addManualActivity(
        taskId(request),
        requireBaseVersion(envelope.baseVersion),
        envelope.data.message,
        envelope.operationId,
      ),
    );
  });

  app.delete('/api/tasks/:id', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(emptyEnvelopeSchema, request.body);
    return sendMutation(reply, envelope.operationId, () =>
      service.softDelete(
        taskId(request),
        requireBaseVersion(envelope.baseVersion),
        envelope.operationId,
      ),
    );
  });

  app.get('/api/trash', async (request) => {
    const authenticated = await requireAuth(request, dependencies.sessions);
    return taskDtoSchema.array().parse(
      new TrashService(dependencies.database, authenticated.user.userId).list(),
    );
  });

  app.post('/api/tasks/:id/restore', async (request, reply) => {
    const service = await serviceForMutation(request, dependencies);
    const envelope = parseEnvelope(emptyEnvelopeSchema, request.body);
    return sendMutation(reply, envelope.operationId, () =>
      service.restoreDeleted(
        taskId(request),
        requireBaseVersion(envelope.baseVersion),
        envelope.operationId,
      ),
    );
  });
}

async function serviceForRead(
  request: FastifyRequest,
  dependencies: TaskRouteDependencies,
): Promise<TaskService> {
  const authenticated = await requireAuth(request, dependencies.sessions);
  return new TaskService(dependencies.database, dependencies.clock, authenticated.user.userId);
}

async function serviceForMutation(
  request: FastifyRequest,
  dependencies: TaskRouteDependencies,
): Promise<TaskService> {
  const authenticated = await requireProtectedMutation(
    request,
    dependencies.sessions,
    dependencies.appOrigin,
  );
  return new TaskService(dependencies.database, dependencies.clock, authenticated.user.userId);
}

function parseEnvelope<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: unknown[] } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw invalidRequest(result.error.issues);
  }
  return result.data;
}

function requireBaseVersion(value: number | null): number {
  if (value === null) {
    throw invalidRequest([{ path: ['baseVersion'], message: '修改任务时必须提供基础版本' }]);
  }
  return value;
}

function taskId(request: FastifyRequest): string {
  return (request.params as { id: string }).id;
}

function subtaskId(request: FastifyRequest): string {
  return (request.params as { subtaskId: string }).subtaskId;
}

function invalidRequest(issues: unknown[]): HttpError {
  return new HttpError(400, 'INVALID_REQUEST', issues);
}

function handleTaskError(
  error: unknown,
  reply: FastifyReply,
  operationId?: string,
) {
  if (error instanceof TaskNotFoundError) {
    return reply.status(404).send({ error: 'TASK_NOT_FOUND' });
  }
  if (error instanceof VersionConflictError && operationId) {
    return reply.status(409).send({
      code: 'VERSION_CONFLICT',
      operationId,
      local: error.local,
      server: error.server,
    });
  }
  if (error instanceof OpenSubtasksConfirmationRequiredError) {
    return reply.status(409).send({
      code: 'OPEN_SUBTASKS_CONFIRMATION_REQUIRED',
      task: error.task,
    });
  }
  throw error;
}

function sendMutation(
  reply: FastifyReply,
  operationId: string,
  mutation: () => ReturnType<TaskService['get']>,
) {
  try {
    const task = mutation();
    return taskAckSchema.parse({ operationId, data: task });
  } catch (error) {
    return handleTaskError(error, reply, operationId);
  }
}
