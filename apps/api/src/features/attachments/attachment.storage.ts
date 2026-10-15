import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

export interface StoredAttachment {
  storageName: string;
  checksum: string;
}

export class AttachmentStorage {
  constructor(private readonly directory: string) {}

  async save(bytes: Buffer, mediaType: 'image/webp' | 'image/jpeg' | 'image/png'): Promise<StoredAttachment> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const extension = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' }[mediaType];
    const storageName = `${randomUUID()}${extension}`;
    await writeFile(join(this.directory, storageName), bytes, { flag: 'wx', mode: 0o600 });
    return { storageName, checksum: createHash('sha256').update(bytes).digest('hex') };
  }

  read(storageName: string): Promise<Buffer> {
    return readFile(this.pathFor(storageName));
  }

  async delete(storageName: string): Promise<void> {
    await rm(this.pathFor(storageName), { force: true });
  }

  private pathFor(storageName: string): string {
    if (storageName !== storageName.replace(/[^a-zA-Z0-9.-]/g, '') || extname(storageName).length === 0) {
      throw new Error('Invalid storage name');
    }
    return join(this.directory, storageName);
  }
}
