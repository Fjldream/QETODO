# 备份与恢复

QETODO 的完整数据由 SQLite 数据库和私有附件目录组成。systemd 定时器每天 02:30（Asia/Shanghai）创建一致性快照、生成 SHA-256 清单并立即验证，默认只保留最近 14 份已验证备份。

## 查看和手动备份

```bash
systemctl list-timers qetodo-backup.timer
sudo systemctl start qetodo-backup.service
sudo journalctl -u qetodo-backup.service -n 100 --no-pager
sudo find /var/backups/qetodo -maxdepth 2 -name manifest.json -print
```

至少每周将最新备份复制到另一台机器或对象存储；同一块服务器磁盘上的备份不能防止整盘损坏。复制后保留目录结构和权限。

## 恢复演练

不要直接在运行中的生产库上试恢复。先在空目录验证：

```bash
sudo install -d -o qetodo -g qetodo -m 0700 /var/lib/qetodo-restore-test/uploads
sudo -u qetodo /opt/qetodo/current/node_modules/.bin/tsx \
  /opt/qetodo/current/apps/api/scripts/restore.ts \
  /var/backups/qetodo/备份目录 \
  /var/lib/qetodo-restore-test/qetodo.sqlite \
  /var/lib/qetodo-restore-test/uploads
```

然后用 SQLite 的 `PRAGMA integrity_check;` 检查，并抽查任务、活动、标签、子任务、提醒和附件数量。恢复程序会先验证清单、哈希和 SQLite 完整性，验证失败不会替换目标数据。

## 正式恢复

1. 记录当前版本和目标备份路径。
2. 停止 API，防止恢复期间继续写入。
3. 将当前数据库和附件做一次额外的离线拷贝。
4. 运行恢复脚本。
5. 启动服务并执行烟雾检查。

```bash
sudo systemctl stop qetodo.service
set -a; source /etc/qetodo/qetodo.env; set +a
sudo -u qetodo /opt/qetodo/current/node_modules/.bin/tsx \
  /opt/qetodo/current/apps/api/scripts/restore.ts \
  /var/backups/qetodo/目标备份 \
  "$DATABASE_PATH" "$UPLOAD_DIR"
sudo systemctl start qetodo.service
```

若恢复失败，脚本会回滚到替换前的数据；仍应保留第 3 步的额外副本，直到业务抽查完成。
