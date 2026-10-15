interface ReminderEditorProps {
  dueAt: string;
  value: string[];
  onChange(value: string[]): void;
}

export function ReminderEditor({ dueAt, value, onChange }: ReminderEditorProps) {
  const selected = reminderOffset(dueAt, value[0]);
  const choose = (offset: string) => {
    if (!dueAt || offset === '') { onChange([]); return; }
    const date = new Date(dueAt);
    date.setMinutes(date.getMinutes() - Number(offset));
    onChange([date.toISOString()]);
  };
  return (
    <label className="editor-field" htmlFor="task-reminder">
      <span>提醒</span>
      <select id="task-reminder" value={selected} onChange={(event) => choose(event.target.value)} disabled={!dueAt}>
        <option value="">不提醒</option><option value="0">到期时</option><option value="30">提前 30 分钟</option><option value="1440">提前 1 天</option>
      </select>
      {!dueAt ? <small>设置截止时间后可开启提醒</small> : null}
    </label>
  );
}

function reminderOffset(dueAt: string, reminder: string | undefined): string {
  if (!dueAt || !reminder) return '';
  return String(Math.round((new Date(dueAt).getTime() - new Date(reminder).getTime()) / 60_000));
}
