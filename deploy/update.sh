#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "请使用 root 运行 deploy/update.sh" >&2
  exit 1
fi

install_root="${QETODO_INSTALL_ROOT:-/opt/qetodo}"
config_file="${QETODO_ENV_FILE:-/etc/qetodo/qetodo.env}"
repository="${QETODO_REPOSITORY:-git@github.com:Fjldream/QETODO.git}"
revision="${1:-main}"
release_id="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="${install_root}/releases/${release_id}"
previous_target="$(readlink -f "${install_root}/current")"
requested_smoke_password="${QETODO_SMOKE_PASSWORD:-}"

install -d -o root -g root -m 0755 "${install_root}/releases"
git clone --depth 1 --branch "${revision}" "${repository}" "${release_dir}"
chown -R qetodo:qetodo "${release_dir}"
runuser -u qetodo -- bash -c "cd '${release_dir}' && corepack pnpm install --frozen-lockfile && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build"

set -a
# shellcheck disable=SC1090
source "${config_file}"
set +a
systemctl start qetodo-backup.service
runuser -u qetodo -- env DATABASE_PATH="${DATABASE_PATH}" corepack pnpm --dir "${release_dir}" --filter @qetodo/api migrate

candidate_link="${install_root}/.current-${release_id}"
ln -s "${release_dir}" "${candidate_link}"
mv -Tf "${candidate_link}" "${install_root}/current"
systemctl restart qetodo.service
smoke_password="${requested_smoke_password:-${ADMIN_PASSWORD:-}}"
if ! QETODO_SMOKE_USER="${ADMIN_USERNAME:-admin}" QETODO_SMOKE_PASSWORD="${smoke_password}" "${release_dir}/deploy/smoke-test.sh" "${APP_ORIGIN}"; then
  rollback_link="${install_root}/.rollback-${release_id}"
  ln -s "${previous_target}" "${rollback_link}"
  mv -Tf "${rollback_link}" "${install_root}/current"
  systemctl restart qetodo.service
  echo "更新检查失败，已回滚到 ${previous_target}" >&2
  exit 1
fi

echo "更新完成：${release_dir}"
