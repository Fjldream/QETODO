import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import { attachmentDtoSchema, type AttachmentDto } from '@qetodo/contracts';
import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';

import type { Clock } from '../../lib/clock.js';
import { HttpError } from '../../lib/httpErrors.js';
import { AttachmentRepository, type AttachmentRecord } from './attachment.repository.js';
import { AttachmentStorage } from './attachment.storage.js';

const allowedTypes = new Set(['image/webp', 'image/jpeg', 'image/png'] as const);

export class AttachmentService {
  constructor(
    private readonly repository: AttachmentRepository,
    private readonly storage: AttachmentStorage,
    private readonly clock: Clock,
  ) {}

  async attach(userId: string, taskId: string, input: { fileName: string; bytes: Buffer }): Promise<AttachmentDto> {
    if (input.bytes.length === 0 || input.bytes.length > 1_000_000) throw new HttpError(413, 'ATTACHMENT_TOO_LARGE');
    const detected = await fileTypeFromBuffer(input.bytes);
    if (!detected || !allowedTypes.has(detected.mime as 'image/webp' | 'image/jpeg' | 'image/png')) {
      throw new HttpError(415, 'UNSUPPORTED_IMAGE');
    }
    let dimensions: ReturnType<typeof imageSize>;
    try {
      dimensions = imageSize(input.bytes);
    } catch {
      throw new HttpError(415, 'INVALID_IMAGE');
    }
    if (!dimensions.width || !dimensions.height || dimensions.width > 1920 || dimensions.height > 1920) {
      throw new HttpError(413, 'IMAGE_DIMENSIONS_TOO_LARGE');
    }
    const mediaType = detected.mime as AttachmentDto['mediaType'];
    const saved = await this.storage.save(input.bytes, mediaType);
    const record: AttachmentRecord = {
      id: randomUUID(),
      taskId,
      fileName: sanitizeFileName(input.fileName),
      mediaType,
      byteSize: input.bytes.length,
      width: dimensions.width,
      height: dimensions.height,
      createdAt: this.clock.now().toISOString(),
      ...saved,
    };
    try {
      return attachmentDtoSchema.parse(this.repository.insert(userId, record));
    } catch (error) {
      await this.storage.delete(saved.storageName);
      throw error;
    }
  }

  list(userId: string, taskId: string): AttachmentDto[] {
    return attachmentDtoSchema.array().parse(this.repository.list(userId, taskId));
  }

  async read(userId: string, taskId: string, attachmentId: string) {
    const attachment = this.repository.findOwned(userId, taskId, attachmentId);
    if (!attachment) throw new HttpError(404, 'ATTACHMENT_NOT_FOUND');
    return { attachment: attachmentDtoSchema.parse(attachment), bytes: await this.storage.read(attachment.storageName) };
  }

  async delete(userId: string, taskId: string, attachmentId: string): Promise<void> {
    const attachment = this.repository.deleteOwned(userId, taskId, attachmentId);
    if (!attachment) throw new HttpError(404, 'ATTACHMENT_NOT_FOUND');
    await this.storage.delete(attachment.storageName);
  }
}

function sanitizeFileName(value: string): string {
  const clean = [...basename(value)]
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .trim();
  return (clean || 'image').slice(0, 255);
}
