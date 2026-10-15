# 与 HaulHub 共用服务器

用户选择复用现有 HTTPS 域名，QETODO 入口为 `https://haulhub.neosober.tech/qetodo/`。现有证书覆盖此入口，无需新增域名。

隔离配置：QETODO 独立系统用户 `qetodo`、API 监听 `127.0.0.1:3100`、数据库和上传目录 `/var/lib/qetodo`、备份目录 `/var/backups/qetodo`。HaulHub 保持原 PM2、系统 Node 20 和 3000/4000 端口。QETODO 独立 Node 24 在 `/opt/qetodo/runtime`，systemd 的 ExecStart 和 PATH 均指向它；备份服务同样使用该运行时。

## 构建与路由

```bash
VITE_BASE_PATH=/qetodo/ corepack pnpm build
VITE_BASE_PATH=/qetodo/ corepack pnpm e2e
```

应用的路由、接口、导出、图片、manifest、图标、Service Worker 和通知跳转均以 `/qetodo/` 为作用范围。`APP_ORIGIN` 仍应设置为 `https://haulhub.neosober.tech`（仅 origin，不包含路径）。

将 `deploy/nginx/qetodo-subpath.locations.conf` 复制为 `/etc/nginx/snippets/qetodo.locations.conf`，在现有 HTTPS server 中增加一行：

```nginx
include /etc/nginx/snippets/qetodo.locations.conf;
```

现有 HTTP server 只新增 `/qetodo` 路径的 HTTPS 跳转；原 `/api/`、`/files/`、`/app/` 和 `/` 的配置保持原值。修改前备份原文件，先执行 `nginx -t`，成功后平滑 reload。

## 运行与验收

QETODO API 通过 systemd 启动，限制为单核 CPU 和 384 MB 内存。每天 02:30 上海时间运行校验备份并保留 14 份。服务器上的密码和 VAPID 私钥保存在 `/etc/qetodo`，不要复制到仓库。

验证 QETODO 登录、任务、图片和离线使用之后，再核对 HaulHub 的 PM2 PID、重启计数、监听端口和 HTTPS 响应，确认现有应用正常。

此服务器更新时必须继续使用独立 Node 24、`VITE_BASE_PATH=/qetodo/` 和端口 3100，不能直接套用默认的根路径/3000 端口安装配置。
