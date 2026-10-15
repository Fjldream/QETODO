export const DEFAULT_IMAGE_QUALITY = 0.78;
export const DEFAULT_MAX_EDGE = 1920;
export const DEFAULT_MAX_BYTES = 1_000_000;

export interface DecodedImage {
  width: number;
  height: number;
  source: unknown;
  close(): void;
}

export interface CompressionRuntime {
  decode(file: File, options: { imageOrientation: 'from-image' }): Promise<DecodedImage>;
  encode(
    source: unknown,
    dimensions: { width: number; height: number },
    mediaType: 'image/webp' | 'image/jpeg',
    quality: number,
  ): Promise<Blob | null>;
}

export interface CompressedImage {
  file: File;
  mediaType: 'image/webp' | 'image/jpeg';
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
}

export interface CompressionOptions {
  maxEdge?: number;
  quality?: number;
  maxBytes?: number;
  runtime?: CompressionRuntime;
}

export function calculateDimensions(width: number, height: number, maxEdge: number) {
  if (width <= 0 || height <= 0 || maxEdge <= 0) throw new Error('图片尺寸无效');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressImage(file: File, options: CompressionOptions = {}): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  const runtime = options.runtime ?? browserRuntime;
  const decoded = await runtime.decode(file, { imageOrientation: 'from-image' });
  try {
    const dimensions = calculateDimensions(decoded.width, decoded.height, options.maxEdge ?? DEFAULT_MAX_EDGE);
    const quality = Math.min(0.9, Math.max(0.6, options.quality ?? DEFAULT_IMAGE_QUALITY));
    let mediaType: CompressedImage['mediaType'] = 'image/webp';
    let blob = await runtime.encode(decoded.source, dimensions, mediaType, quality);
    if (!blob || blob.type !== mediaType) {
      mediaType = 'image/jpeg';
      blob = await runtime.encode(decoded.source, dimensions, mediaType, quality);
    }
    if (!blob) throw new Error('此设备无法压缩图片');
    if (blob.size > (options.maxBytes ?? DEFAULT_MAX_BYTES)) throw new Error('压缩后仍超过 1 MB，请裁剪后重试');
    const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
    const compressedFile = new File([blob], `${stem}.${mediaType === 'image/webp' ? 'webp' : 'jpg'}`, {
      type: mediaType,
      lastModified: Date.now(),
    });
    return {
      file: compressedFile,
      mediaType,
      originalBytes: file.size,
      compressedBytes: blob.size,
      ...dimensions,
    };
  } finally {
    decoded.close();
  }
}

const browserRuntime: CompressionRuntime = {
  async decode(file, options) {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file, options);
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight, source: image, close: () => undefined };
    } finally {
      URL.revokeObjectURL(url);
    }
  },
  async encode(source, dimensions, mediaType, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('此设备无法处理图片');
    context.drawImage(source as CanvasImageSource, 0, 0, dimensions.width, dimensions.height);
    return new Promise((resolve) => canvas.toBlob(resolve, mediaType, quality));
  },
};
