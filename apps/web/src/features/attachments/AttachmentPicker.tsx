import { ImagePlus, X } from 'lucide-react';
import { useState } from 'react';

import { compressImage, type CompressedImage } from './imageCompression.js';

interface AttachmentPickerProps {
  value: CompressedImage[];
  existingCount?: number;
  onChange(images: CompressedImage[]): void;
}

export function AttachmentPicker({ value, existingCount = 0, onChange }: AttachmentPickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const select = async (files: FileList | null) => {
    if (!files) return;
    const available = Math.max(0, 6 - existingCount - value.length);
    const selected = Array.from(files).slice(0, available);
    if (files.length > available) setError('每个任务最多保留 6 张图片');
    else setError('');
    setBusy(true);
    try {
      const compressed = [];
      for (const file of selected) compressed.push(await compressImage(file));
      onChange([...value, ...compressed]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图片处理失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="attachment-picker">
      <label className="image-picker" htmlFor="attachment-input"><ImagePlus size={20} />{busy ? '正在压缩…' : '添加图片'}</label>
      <input className="visually-hidden" id="attachment-input" type="file" accept="image/*" multiple disabled={busy} onChange={(event) => void select(event.target.files)} />
      <div className="compressed-image-list">
        {value.map((image, index) => (
          <div className="compressed-image-row" data-testid="image-placeholder" key={`${image.file.name}-${index}`}>
            <span>{image.file.name}<small>{formatBytes(image.originalBytes)} → {formatBytes(image.compressedBytes)}</small></span>
            <button type="button" aria-label={`移除${image.file.name}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button>
          </div>
        ))}
      </div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
