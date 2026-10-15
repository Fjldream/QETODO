import { describe, expect, it, vi } from 'vitest';

import {
  calculateDimensions,
  compressImage,
  type CompressionRuntime,
} from './imageCompression.js';

describe('image compression', () => {
  it('fits landscape and portrait images inside a 1920-pixel edge without upscaling', () => {
    expect(calculateDimensions(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(calculateDimensions(1200, 2400, 1920)).toEqual({ width: 960, height: 1920 });
    expect(calculateDimensions(800, 600, 1920)).toEqual({ width: 800, height: 600 });
  });

  it('honors image orientation, targets quality 0.78, and falls back from WebP to JPEG', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'evidence.jpg', { type: 'image/jpeg' });
    const decode = vi.fn(async () => ({ width: 2400, height: 1200, source: {}, close: vi.fn() }));
    const encode = vi.fn(async (_source, _dimensions, type: string, quality: number) => {
      expect(quality).toBe(0.78);
      return type === 'image/webp' ? null : new Blob([new Uint8Array(420_000)], { type: 'image/jpeg' });
    });
    const runtime: CompressionRuntime = { decode, encode };

    const result = await compressImage(file, { runtime });

    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(encode).toHaveBeenNthCalledWith(1, expect.anything(), { width: 1920, height: 960 }, 'image/webp', 0.78);
    expect(encode).toHaveBeenNthCalledWith(2, expect.anything(), { width: 1920, height: 960 }, 'image/jpeg', 0.78);
    expect(result).toMatchObject({ mediaType: 'image/jpeg', originalBytes: 3, compressedBytes: 420_000, width: 1920, height: 960 });
  });

  it('rejects non-images and refuses compressed output over 1 MB', async () => {
    await expect(compressImage(new File(['text'], 'note.txt', { type: 'text/plain' }))).rejects.toThrow('请选择图片文件');
    const runtime: CompressionRuntime = {
      decode: vi.fn(async () => ({ width: 1000, height: 1000, source: {}, close: vi.fn() })),
      encode: vi.fn(async () => new Blob([new Uint8Array(1_000_001)], { type: 'image/webp' })),
    };
    await expect(compressImage(new File(['x'], 'large.png', { type: 'image/png' }), { runtime })).rejects.toThrow('压缩后仍超过 1 MB');
  });
});
