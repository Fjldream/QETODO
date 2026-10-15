# QETODO 服务器安装与更新

本文面向一台轻量 Linux 服务器（Debian/Ubuntu 风格），采用 Node.js 24、systemd、Nginx 和 SQLite，不需要 Docker。正式环境必须使用独立域名和 HTTPS；iPhone 主屏幕安装与 Web Push 都依赖 HTTPS。

## 1. 准备服务器

1. 将域名 A/AAAA 记录指向服务器，并开放 TCP 80、443。
2. 安装 Git、curl、Nginx、Node.js 24 和 Corepack；运行 `corepack enable`。
3. 在 `/opt/qetodo/source` 克隆仓库：

   ```bash
   sudo mkdir -p /opt/qetodo
   sudo git clone https://github.com/Fjldream/QETODO.git /opt/qetodo/source
   cd /opt/qetodo/source
   ```

4. 运行一次安装脚本。第一次会创建 `/etc/qetodo/qetodo.env` 后停止，不会覆盖已有配置：

   ```bash
   sudo bash deploy/install.sh
   sudoedit /etc/qetodo/qetodo.env
   ```

5. 至少修改 `APP_ORIGIN`、`ADMIN_PASSWORD` 和 `VAPID_SUBJECT`。`APP_ORIGIN` 必须与最终 HTTPS 地址完全一致且末尾不要加 `/`。如需推送通知，使用 `npx web-push generate-vapid-keys` 生成公私钥并填入；私钥不得提交到 Git。
6. 再次运行 `sudo bash deploy/install.sh`。脚本会校验 Node 24、安装锁定依赖、构建、迁移数据库、创建管理员、安装并启动 systemd 服务与备份定时器。
7. 确认服务：

   ```bash
   systemctl status qetodo.service
   systemctl status qetodo-backup.timer
   journalctl -u qetodo.service -n 100 --no-pager
   ```

管理员首次创建成功后，从 `/etc/qetodo/qetodo.env` 删除 `ADMIN_PASSWORD`，避免长期保存明文；文件权限必须保持 `0600`。以后改密码优先在应用“设置”中完成。

## 2. 配置 Nginx 和 HTTPS

先取得证书（例如使用 Certbot），再复制模板。将模板内所有 `todo.example.com` 替换为真实域名：

```bash
sudo cp deploy/nginx/qetodo.conf /etc/nginx/sites-available/qetodo.conf
sudo ln -s /etc/nginx/sites-available/qetodo.conf /etc/nginx/sites-enabled/qetodo.conf
sudo nginx -t
sudo systemctl reload nginx
```

模板只公开构建后的网页并反向代理 `/api/`；SQLite 和上传目录均不在 Web 根目录。上传在浏览器端压缩，API 再限制单文件不超过 1 MB。导入备份可能更大，因此 Nginx 请求上限为 52 MB。

## 3. 上线检查

```bash
QETODO_SMOKE_USER=admin \
QETODO_SMOKE_PASSWORD='本次临时提供的密码' \
bash deploy/smoke-test.sh https://你的域名
```

检查完成后清除 shell 历史中的密码。脚本验证健康检查、PWA manifest、错误登录拒绝、附件权限和一次真实数据库写入；检查任务会自动移入回收站。

## 4. 更新和回滚

服务器能够访问 GitHub SSH 仓库时，执行：

```bash
sudo env QETODO_REPOSITORY=git@github.com:Fjldream/QETODO.git \
  QETODO_SMOKE_PASSWORD='管理员密码' \
  bash /opt/qetodo/current/deploy/update.sh main
```

更新脚本在新 release 目录完成 lint、类型检查、测试、构建和迁移，然后原子切换 `current`。切换后的烟雾检查若失败，会自动将 `current` 指回上一版本并重启。数据库迁移不会自动降级，所以高风险升级前必须先运行并验证备份。

手动回滚代码：

```bash
sudo ln -sfn /opt/qetodo/releases/上一版本 /opt/qetodo/current
sudo systemctl restart qetodo.service
```

## 5. 日常排查

```bash
journalctl -u qetodo.service --since today
journalctl -u qetodo-backup.service -n 100 --no-pager
systemctl list-timers qetodo-backup.timer
curl -fsS https://你的域名/api/health
```

若登录突然失效，先检查 iPhone 日期时间、HTTPS 证书和 `APP_ORIGIN`；若离线任务暂未上传，不要清除 Safari 网站数据，恢复网络并重新打开应用即可。
