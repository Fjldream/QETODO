#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-}"
if [[ -z ${base_url} ]]; then
  echo "Usage: deploy/smoke-test.sh <public-base-url>" >&2
  exit 1
fi
base_url="${base_url%/}"
origin="$(node -e 'process.stdout.write(new URL(process.argv[1]).origin)' "${base_url}")"
cookie_jar="$(mktemp)"
response_file="$(mktemp)"
trap 'rm -f "${cookie_jar}" "${response_file}"' EXIT

expect_status() {
  local expected="$1"
  shift
  local actual
  actual="$(curl --silent --show-error --connect-timeout 5 --max-time 15 --retry 5 --retry-connrefused --retry-delay 1 --output "${response_file}" --write-out '%{http_code}' "$@")"
  if [[ ${actual} != "${expected}" ]]; then
    echo "HTTP ${actual}，预期 ${expected}: $*" >&2
    cat "${response_file}" >&2
    exit 1
  fi
}

expect_status 200 "${base_url}/api/health"
node -e 'const fs=require("fs");const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(body.status!=="ok")process.exit(1)' "${response_file}"
echo "✓ API 与数据库健康"

expect_status 200 "${base_url}/manifest.webmanifest"
node -e 'const fs=require("fs");const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!body.name||body.display!=="standalone"||!Array.isArray(body.icons))process.exit(1)' "${response_file}"
echo "✓ PWA manifest 有效"

expect_status 401 --request POST --header 'Content-Type: application/json' --data '{"username":"smoke-invalid","password":"definitely-invalid"}' "${base_url}/api/auth/login"
expect_status 401 "${base_url}/api/tasks/00000000-0000-4000-8000-000000000000/attachments/00000000-0000-4000-8000-000000000000/content"
echo "✓ 登录拒绝与附件访问保护正常"

if [[ -z ${QETODO_SMOKE_PASSWORD:-} ]]; then
  echo "需要设置 QETODO_SMOKE_PASSWORD 才能验证数据库写入" >&2
  exit 1
fi

login_payload="$(node -e 'console.log(JSON.stringify({username:process.argv[1],password:process.argv[2]}))' "${QETODO_SMOKE_USER:-admin}" "${QETODO_SMOKE_PASSWORD}")"
expect_status 200 --cookie-jar "${cookie_jar}" --header 'Content-Type: application/json' --data "${login_payload}" "${base_url}/api/auth/login"
csrf="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).csrfToken)' "${response_file}")"
operation_id="$(node -e 'console.log(crypto.randomUUID())')"
title="部署检查-${operation_id}"
payload="$(node -e 'console.log(JSON.stringify({operationId:process.argv[1],baseVersion:null,data:{title:process.argv[2]}}))' "${operation_id}" "${title}")"
expect_status 201 --cookie "${cookie_jar}" --header "Origin: ${origin}" --header "X-CSRF-Token: ${csrf}" --header 'Content-Type: application/json' --data "${payload}" "${base_url}/api/tasks"
node -e 'const fs=require("fs");const body=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(body.data.title!==process.argv[2])process.exit(1)' "${response_file}" "${title}"
echo "✓ 认证与数据库写入正常"
task_id="$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).data.id)' "${response_file}")"
task_version="$(node -e 'const fs=require("fs");process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).data.version))' "${response_file}")"
cleanup_payload="$(node -e 'console.log(JSON.stringify({operationId:crypto.randomUUID(),baseVersion:Number(process.argv[1]),data:{}}))' "${task_version}")"
expect_status 200 --request DELETE --cookie "${cookie_jar}" --header "Origin: ${origin}" --header "X-CSRF-Token: ${csrf}" --header 'Content-Type: application/json' --data "${cleanup_payload}" "${base_url}/api/tasks/${task_id}"
echo "✓ 检查任务已移入回收站"
echo "QETODO smoke test passed"
