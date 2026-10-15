import type { TaskPriority, TaskStatus } from '@qetodo/contracts';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { TaskDraft } from '../../../api/tasks.js';
import { AttachmentPicker } from '../../attachments/AttachmentPicker.js';
import type { CompressedImage } from '../../attachments/imageCompression.js';

interface TaskEditorSheetProps {
  open: boolean;
  defaultDueAt?: string | undefined;
  onClose(): void;
  onSave(draft: TaskDraft): Promise<void> | void;
}

export function TaskEditorSheet({ open, defaultDueAt, onClose, onSave }: TaskEditorSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueAt, setDueAt] = useState(defaultDueAt ?? '');
  const [waitingOn, setWaitingOn] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const addTag = () => {
    const next = tagInput.trim();
    if (!next) return;
    if (!tags.some((tag) => tag.toLocaleLowerCase() === next.toLocaleLowerCase())) {
      setTags((current) => [...current, next]);
    }
    setTagInput('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = '请填写任务标题';
    if (status === 'waiting' && !waitingOn.trim()) nextErrors.waitingOn = '请填写等待对象';
    if (status === 'waiting' && !followUpAt) nextErrors.followUpAt = '请选择下次跟进时间';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    await onSave({
      title: title.trim(),
      description,
      status,
      priority,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      reminderTimes: [],
      waitingOn: status === 'waiting' ? waitingOn.trim() : null,
      followUpAt: status === 'waiting' ? new Date(followUpAt).toISOString() : null,
      reference: null,
      tagIds: [],
      subtasks: [],
      recurrence: { kind: 'none' },
      tags,
      imageFiles: images.map(({ file }) => file),
    });
  };

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="bottom-sheet motion-safe-sheet large-text-layout"
        role="dialog"
        aria-modal="true"
        aria-label="编辑任务"
        onKeyDown={(event) => handleDialogKey(event, dialogRef.current, onClose)}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-header">
          <button className="text-button" type="button" onClick={onClose}>取消</button>
          <h2>新建任务</h2>
          <button className="text-button strong" type="submit" form="task-editor">保存</button>
        </header>
        <form id="task-editor" className="sheet-body" onSubmit={(event) => void submit(event)}>
          <label className="editor-title" htmlFor="task-title">
            <span className="visually-hidden">任务标题</span>
            <input
              ref={titleRef}
              id="task-title"
              placeholder="要处理什么？"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {errors.title ? <p className="inline-error">{errors.title}</p> : null}
          <label className="editor-field" htmlFor="task-description">
            <span>详细说明</span>
            <textarea id="task-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="editor-grid">
            <label className="editor-field" htmlFor="task-status">
              <span>状态</span>
              <select id="task-status" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
                <option value="pending">待处理</option>
                <option value="in_progress">进行中</option>
                <option value="waiting">等待他人</option>
              </select>
            </label>
            <label className="editor-field" htmlFor="task-priority">
              <span>优先级</span>
              <select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                <option value="normal">普通</option>
                <option value="important">重要</option>
                <option value="urgent">紧急</option>
              </select>
            </label>
          </div>
          <label className="editor-field" htmlFor="task-due">
            <span>截止时间</span>
            <input id="task-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </label>
          {status === 'waiting' ? (
            <div className="conditional-fields">
              <label className="editor-field" htmlFor="waiting-on">
                <span>等待对象</span>
                <input id="waiting-on" value={waitingOn} onChange={(event) => setWaitingOn(event.target.value)} />
                {errors.waitingOn ? <small className="inline-error">{errors.waitingOn}</small> : null}
              </label>
              <label className="editor-field" htmlFor="follow-up-at">
                <span>下次跟进时间</span>
                <input id="follow-up-at" type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
                {errors.followUpAt ? <small className="inline-error">{errors.followUpAt}</small> : null}
              </label>
            </div>
          ) : null}
          <div className="editor-field">
            <span>标签</span>
            <div className="inline-input">
              <label className="visually-hidden" htmlFor="tag-input">添加标签</label>
              <input
                id="tag-input"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
              />
              <button type="button" aria-label="加入标签" onClick={addTag}><Plus size={18} /></button>
            </div>
            <div className="tag-list">
              {tags.map((tag) => (
                <button key={tag} type="button" onClick={() => setTags((items) => items.filter((item) => item !== tag))}>
                  {tag}<X size={13} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <div className="editor-field">
            <span>图片</span>
            <AttachmentPicker value={images} onChange={setImages} />
          </div>
          <button className="primary-button sheet-save" type="submit">保存任务</button>
        </form>
      </div>
    </div>
  );
}

export function handleDialogKey(
  event: React.KeyboardEvent,
  dialog: HTMLElement | null,
  onClose: () => void,
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== 'Tab' || !dialog) return;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'),
  );
  if (!focusable.length) return;
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
