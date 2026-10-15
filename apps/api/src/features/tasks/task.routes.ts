import {
  createTaskInputSchema,
  mutationAckSchema,
  mutationEnvelopeSchema,
  taskDtoSchema,
  taskTransitionInputSchema,
  updateTaskInputSchema,
} from '@qetodo/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppDatabase } from '../../db/client.js';
import { requireAuth, requireProtectedMutation } from '../auth/auth.guard.js';
import type { SessionService } from '../auth/auth.service.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError } from '../../lib/httpErrors.js';
import { TaskNotFoundError, TaskService, VersionConflictError } from './task.service.js';

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

export async function registerTaskRoutes(
  app: FastifyInstance,
  dependencies: TaskRouteDependencies,
): Promise<void> {
  app.get('/api/tasks', async (request) => {
    const service = await serviceForRead(request, dependencies);
    return taskDtoSchema.array().parse(service.list());
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
  throw error;
}
