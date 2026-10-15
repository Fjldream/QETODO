interface UpdatePromptProps {
  needRefresh: boolean;
  editorDirty: boolean;
  writesInFlight: number;
  onUpdate(): void;
  onDismiss?(): void;
}

export function UpdatePrompt({ needRefresh, editorDirty, writesInFlight, onUpdate, onDismiss }: UpdatePromptProps) {
  if (!needRefresh) return null;
  const busy = editorDirty || writesInFlight > 0;
  return (
    <aside className="update-prompt" role="status">
      <div><strong>新版本已准备好</strong><p>{busy ? '完成当前编辑和同步后即可更新' : '现在更新不会影响待办数据'}</p></div>
      <div className="update-actions">
        {onDismiss ? <button type="button" className="text-button" onClick={onDismiss}>稍后</button> : null}
        <button type="button" className="primary-button" disabled={busy} onClick={onUpdate}>立即更新</button>
      </div>
    </aside>
  );
}
