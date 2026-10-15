#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "请使用 root 运行 deploy/install.sh" >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ ${node_major} != 24 ]]; then
  echo "需要 Node.js 24，当前为 $(node --version)" >&2
  exit 1
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${QETODO_INSTALL_ROOT:-/opt/qetodo}"
data_dir="${QETODO_DATA_DIR:-/var/lib/qetodo}"
backup_dir="${QETODO_BACKUP_DIR:-/var/backups/qetodo}"
config_dir="${QETODO_CONFIG_DIR:-/etc/qetodo}"
env_file="${config_dir}/qetodo.env"

id qetodo >/dev/null 2>&1 || useradd --system --home-dir "${data_dir}" --shell /usr/sbin/nologin qetodo
install -d -o qetodo -g qetodo -m 0750 "${data_dir}" "${data_dir}/uploads" "${backup_dir}"
install -d -o root -g qetodo -m 0750 "${config_dir}"
install -d -o root -g root -m 0755 "${install_root}"

if [[ ! -e ${env_file} ]]; then
  install -o root -g qetodo -m 0600 "${repo_dir}/deploy/qetodo.env.example" "${env_file}"
  echo "已创建 ${env_file}；请先修改域名、管理员密码和 VAPID 配置，再重新运行本脚本。"
  exit 2
fi

if [[ -e ${install_root}/current && ! -L ${install_root}/current ]]; then
  echo "${install_root}/current 已存在且不是符号链接，已停止以避免覆盖" >&2
  exit 1
fi

corepack pnpm install --frozen-lockfile
corepack pnpm build
set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a
corepack pnpm --filter @qetodo/api migrate
if [[ -n ${ADMIN_PASSWORD:-} ]]; then
  corepack pnpm --filter @qetodo/api admin:set-password
fi

ln -sfn "${repo_dir}" "${install_root}/current"
chown -h qetodo:qetodo "${install_root}/current"
install -o root -g root -m 0644 "${repo_dir}/deploy/systemd/qetodo.service" /etc/systemd/system/qetodo.service
install -o root -g root -m 0644 "${repo_dir}/deploy/systemd/qetodo-backup.service" /etc/systemd/system/qetodo-backup.service
install -o root -g root -m 0644 "${repo_dir}/deploy/systemd/qetodo-backup.timer" /etc/systemd/system/qetodo-backup.timer
systemctl daemon-reload
systemctl enable --now qetodo.service qetodo-backup.timer
echo "QETODO 服务已安装。按 docs/operations/installation.md 配置 Nginx 与 HTTPS。"
