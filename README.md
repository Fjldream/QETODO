# QETODO（质量待办）

面向质量管理员的 iPhone 优先 PWA：把手写便签式工作流变成可检索、可提醒、可离线使用的任务系统。无需 App Store，可从 Safari 添加到主屏幕；数据保存在自有服务器的 SQLite 中，图片先在手机端压缩再上传。

## 初版能力

- 今日 / 全部任务 / 日历 / 搜索 / 回收站
- 优先级、截止时间、等待对象与跟进时间、参考编号、灵活标签
- 子任务、活动记录、完成/取消/恢复与撤销
- 最多 6 张质量证据图片，客户端压缩、私有鉴权访问
- 离线创建、刷新后保留、恢复网络自动同步
- 重复任务、应用内提醒和安装后 Web Push
- JSON/CSV 导出、原子导入、校验备份与恢复
- 单管理员账号、HttpOnly 会话、CSRF/Origin 防护和登录限速

## 本地开发

要求 Node.js 24 和 Corepack。

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm test
corepack pnpm e2e
```

API 运行所需变量见 [`deploy/qetodo.env.example`](deploy/qetodo.env.example)。生产部署、HTTPS、更新和排障见 [`docs/operations/installation.md`](docs/operations/installation.md)，备份恢复见 [`docs/operations/backup-and-recovery.md`](docs/operations/backup-and-recovery.md)，正式交付前必须完成 [`docs/operations/iphone-acceptance.md`](docs/operations/iphone-acceptance.md)。

## 项目结构

- `apps/web`：React + TypeScript 的 iOS 风格 PWA
- `apps/api`：Fastify API、SQLite 数据、附件、通知与备份
- `packages/contracts`：前后端共享校验协议
- `tests/e2e`：Playwright WebKit/iPhone 验收
- `deploy`：Nginx、systemd、安装、更新和烟雾测试

仓库不包含生产密码、VAPID 私钥、数据库、上传文件或备份。
