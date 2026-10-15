import type { AttachmentDto } from '@qetodo/contracts';
import { Trash2 } from 'lucide-react';

interface AttachmentGalleryProps {
  attachments: AttachmentDto[];
  onDelete?(attachment: AttachmentDto): void;
}

export function AttachmentGallery({ attachments, onDelete }: AttachmentGalleryProps) {
  if (!attachments.length) return null;
  return (
    <div className="attachment-gallery" aria-label="任务图片">
      {attachments.map((attachment) => (
        <figure key={attachment.id}>
          <img
            src={`/api/tasks/${attachment.taskId}/attachments/${attachment.id}/content`}
            alt={attachment.fileName}
            loading="lazy"
            width={attachment.width}
            height={attachment.height}
          />
          <figcaption>{attachment.fileName}</figcaption>
          {onDelete ? <button type="button" aria-label={`删除${attachment.fileName}`} onClick={() => onDelete(attachment)}><Trash2 size={16} /></button> : null}
        </figure>
      ))}
    </div>
  );
}
