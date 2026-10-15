import { Download, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ExportBundle } from '@qetodo/contracts';
import { exportBundleSchema } from '@qetodo/contracts';

import type { HttpClient } from '../../api/http.js';

export function DataTransfer({ client }: { client: HttpClient }) {
  const [preview, setPreview] = useState<ExportBundle | null>(null);
  const [status, setStatus] = useState<{ lastSuccessAt: string | null; lastFailureAt: string | null } | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { void client.request<typeof status>('/api/transfer/backup-status').then(setStatus).catch(() => undefined); }, [client]);
  const select = async (file: File | undefined) => {
    if (!file) return;
    try { setPreview(exportBundleSchema.parse(JSON.parse(await file.text()))); setMessage(''); }
    catch { setPreview(null); setMessage('文件格式无效，未写入任何数据'); }
  };
  const apply = async () => {
    if (!preview) return;
    const result = await client.request<{ tasks: number; attachments: number }>('/api/transfer/import', { method: 'POST', body: preview });
    setMessage(`已导入 ${result.tasks} 条任务、${result.attachments} 个附件`);
    setPreview(null);
  };
  const backupFailed = Boolean(status?.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt));
  return (
    <section aria-labelledby="transfer-title">
      <h2 className="section-heading" id="transfer-title">数据与备份</h2>
      {backupFailed ? <p className="backup-warning" role="alert">最近一次定时备份失败，请检查服务器磁盘与日志。</p> : null}
      <div className="settings-group transfer-actions">
        <a className="settings-action" href="/api/transfer/export.csv" download><Download size={18} />导出 CSV（查看用）</a>
        <a className="settings-action" href="/api/transfer/export.json" download><Download size={18} />导出 JSON（可恢复）</a>
        <label className="settings-action" htmlFor="import-json"><Upload size={18} />选择 JSON 导入文件</label>
        <input className="visually-hidden" id="import-json" type="file" accept="application/json,.json" onChange={(event) => void select(event.target.files?.[0])} />
      </div>
      {preview ? <div className="import-preview"><strong>导入预览</strong><p>{preview.tasks.length} 条任务，{preview.attachmentFiles.length} 个附件</p><button className="primary-button" type="button" onClick={() => void apply()}>确认替换当前数据</button></div> : null}
      {status?.lastSuccessAt ? <p className="settings-note">最近成功备份：{new Date(status.lastSuccessAt).toLocaleString('zh-CN')}</p> : null}
      {message ? <p className={message.includes('无效') ? 'form-error' : 'form-success'} role="status">{message}</p> : null}
    </section>
  );
}
