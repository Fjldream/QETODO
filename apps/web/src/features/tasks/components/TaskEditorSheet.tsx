import type { RecurrenceRule, TaskDto, TaskPriority, TaskStatus } from '@qetodo/contracts';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { TaskDraft } from '../../../api/tasks.js';
import { AttachmentPicker } from '../../attachments/AttachmentPicker.js';
import { AttachmentGallery } from '../../attachments/AttachmentGallery.js';
import type { CompressedImage } from '../../attachments/imageCompression.js';
import { RecurrenceEditor } from './RecurrenceEditor.js';
import { ReminderEditor } from './ReminderEditor.js';

interface TaskEditorSheetProps {
  open: boolean;
  defaultDueAt?: string | undefined;
  task?: TaskDto | undefined;
  suggestedTags?: string[] | undefined;
  onClose(): void;
  onSave(draft: TaskDraft): Promise<void> | void;
}

const initialTags = ['检验检测', '质量异常', '整改跟进', '供应商', '外协', '体系审核', '资料报告', '会议沟通'];

export function TaskEditorSheet(props: TaskEditorSheetProps) {
  if (!props.open) return null;
  return <TaskEditorForm key={props.task?.id ?? 'new'} {...props} />;
}

function TaskEditorForm({ task, defaultDueAt, suggestedTags = [], onClose, onSave }: TaskEditorSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [reference, setReference] = useState(task?.reference ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'pending');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal');
  const [dueAt, setDueAt] = useState(task ? localDateTime(task.dueAt) : defaultDueAt ?? '');
  const [waitingOn, setWaitingOn] = useState(task?.waitingOn ?? '');
  const [followUpAt, setFollowUpAt] = useState(localDateTime(task?.followUpAt));
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(task?.tags.map(tag => tag.name) ?? []);
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [reminderTimes, setReminderTimes] = useState<string[]>(task?.reminderTimes ?? []);
  const [recurrence, setRecurrence] = useState<RecurrenceRule>(task?.recurrence ?? { kind: 'none' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const suggestions = [...new Set([...initialTags, ...suggestedTags])];

  useEffect(() => {
    const timer = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const addTag = () => {
    const next = tagInput.trim();
    if (!next) return;
    if (!tags.some((tag) => tag.toLocaleLowerCase() === next.toLocaleLowerCase())) {
      setTags((current) => [...current, next]);
    }
    setTagInput('');
  };

  const save = async (confirmed = false) => {
    if (savingRef.current) return;
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = '请填写任务标题';
    if (status === 'waiting' && !waitingOn.trim()) nextErrors.waitingOn = '请填写等待对象';
    if (status === 'waiting' && !followUpAt) nextErrors.followUpAt = '请选择下次跟进时间';
    if (recurrence.kind !== 'none' && !dueAt) nextErrors.dueAt = '重复任务必须设置截止时间';
    const selectedTags = [...new Set([...tags, ...(tagInput.trim() ? [tagInput.trim()] : [])])];
    if (selectedTags.length > 30 || selectedTags.some(tag => tag.length > 50)) nextErrors.tags = '最多 30 个标签，每个不超过 50 字';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!confirmed && status === 'completed' && task?.status !== 'completed' && task?.subtasks.some(item => !item.completed)) {
      setConfirming(true);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try { await onSave({
      title: title.trim(),
      description,
      status,
      priority,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      reminderTimes,
      waitingOn: status === 'waiting' ? waitingOn.trim() : null,
      followUpAt: status === 'waiting' ? new Date(followUpAt).toISOString() : null,
      reference: reference.trim() || null,
      tagIds: task?.tagIds ?? [],
      subtasks: [],
      recurrence,
      tags: selectedTags,
      imageFiles: images.map(({ file }) => file),
      ...(confirmed ? { confirmOpenSubtasks: true } : {}),
    }); } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : '保存失败，请重试');
    } finally {
      savingRef.current = false;
      setSaving(false);
      setConfirming(false);
    }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void save(); };
  const close = () => { if (!savingRef.current) onClose(); };

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div
        ref={dialogRef}
        className="bottom-sheet motion-safe-sheet large-text-layout"
        role="dialog"
        aria-modal="true"
        aria-label="编辑任务"
        onKeyDown={(event) => handleDialogKey(event, dialogRef.current, close)}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-header">
          <button className="text-button" type="button" disabled={saving} onClick={close}>取消</button>
          <h2>{task ? '编辑任务' : '新建任务'}</h2>
          <button className="text-button strong" type="submit" form="task-editor" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
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
                {task ? <option value="completed">已完成</option> : null}
                {task ? <option value="cancelled">已取消</option> : null}
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
            <input id="task-due" type="datetime-local" value={dueAt} onChange={(event) => {
              const next = event.target.value;
              if (!next) setReminderTimes([]);
              else if (dueAt) {
                const delta = new Date(next).getTime() - new Date(dueAt).getTime();
                setReminderTimes(items => items.map(item => new Date(new Date(item).getTime() + delta).toISOString()));
              }
              setDueAt(next);
            }} />
          </label>
          {errors.dueAt ? <p className="inline-error">{errors.dueAt}</p> : null}
          <ReminderEditor dueAt={dueAt} value={reminderTimes} onChange={setReminderTimes} />
          <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
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
          <label className="editor-field" htmlFor="task-reference">
            <span>关联编号</span>
            <input id="task-reference" value={reference} maxLength={200} placeholder="如 NCR、检验单或项目编号" onChange={event => setReference(event.target.value)} />
          </label>
          <div className="editor-field">
            <span>标签</span>
            <div className="tag-suggestions" aria-label="常用标签">
              {suggestions.map(tag => <button key={tag} type="button" aria-pressed={tags.includes(tag)} onClick={() => setTags(items => items.includes(tag) ? items.filter(item => item !== tag) : [...items, tag])}>{tag}</button>)}
            </div>
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
                  <span>{tag}</span><X size={13} aria-hidden="true" />
                </button>
              ))}
            </div>
            {errors.tags ? <p className="inline-error">{errors.tags}</p> : null}
          </div>
          <div className="editor-field">
            <span>图片</span>
            {task?.attachments.length ? <AttachmentGallery attachments={task.attachments} /> : null}
            <AttachmentPicker value={images} existingCount={task?.attachments.length ?? 0} onChange={setImages} />
          </div>
          {saveError ? <p className="inline-error" role="alert">{saveError}</p> : null}
          <button className="primary-button sheet-save" type="submit" disabled={saving}>{saving ? '保存中…' : '保存任务'}</button>
        </form>
        {confirming ? <div className="confirmation-panel" role="alertdialog" aria-label="仍有未完成子任务"><p>仍有未完成子任务，确定要完成主任务吗？</p><button type="button" onClick={() => void save(true)}>仍然完成</button><button type="button" onClick={() => setConfirming(false)}>返回检查</button></div> : null}
      </div>
    </div>
  );
}

function localDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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
