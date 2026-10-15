import type { RecurrenceRule } from '@qetodo/contracts';

interface RecurrenceEditorProps { value: RecurrenceRule; onChange(value: RecurrenceRule): void }

export function RecurrenceEditor({ value, onChange }: RecurrenceEditorProps) {
  return (
    <div className="editor-grid recurrence-editor">
      <label className="editor-field" htmlFor="task-recurrence"><span>重复</span><select id="task-recurrence" value={value.kind} onChange={(event) => {
        const kind = event.target.value as RecurrenceRule['kind'];
        onChange(kind === 'none' ? { kind: 'none' } : { kind, interval: 1 });
      }}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label>
      {value.kind !== 'none' ? <label className="editor-field" htmlFor="recurrence-interval"><span>间隔</span><input id="recurrence-interval" type="number" min="1" max="365" value={value.interval} onChange={(event) => onChange({ ...value, interval: Math.max(1, Number(event.target.value)) })} /></label> : null}
    </div>
  );
}
