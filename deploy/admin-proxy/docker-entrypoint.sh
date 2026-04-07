#!/bin/sh
set -eu

server_name="${ADMIN_SERVER_NAME:-_}"
upstream="${ADMIN_UPSTREAM:-http://sub-store:3000}"
enable_tls="$(printf '%s' "${ADMIN_ENABLE_TLS:-false}" | tr '[:upper:]' '[:lower:]')"
cert_path="${ADMIN_TLS_CERT_PATH:-/certs/admin.crt}"
key_path="${ADMIN_TLS_KEY_PATH:-/certs/admin.key}"
conf_path="/etc/nginx/conf.d/default.conf"
main_template="/etc/sub-store/default.conf.tmpl"
tls_template="/etc/sub-store/tls-server.conf.tmpl"

export ADMIN_SERVER_NAME="${server_name}"
export ADMIN_UPSTREAM="${upstream}"
export ADMIN_TLS_CERT_PATH="${cert_path}"
export ADMIN_TLS_KEY_PATH="${key_path}"
export ADMIN_TLS_SERVER_BLOCK=""

if [ "${enable_tls}" = "true" ]; then
    if [ ! -f "${cert_path}" ] || [ ! -f "${key_path}" ]; then
        echo "TLS is enabled but certificate files are missing: ${cert_path}, ${key_path}" >&2
        exit 1
    fi

    ADMIN_TLS_SERVER_BLOCK="$(envsubst '${ADMIN_SERVER_NAME} ${ADMIN_TLS_CERT_PATH} ${ADMIN_TLS_KEY_PATH} ${ADMIN_UPSTREAM}' < "${tls_template}")"
    export ADMIN_TLS_SERVER_BLOCK
fi

# 显式指定变量列表，避免 nginx 原生变量（$host、$remote_addr 等）被误替换
envsubst '${ADMIN_SERVER_NAME} ${ADMIN_UPSTREAM} ${ADMIN_TLS_SERVER_BLOCK}' < "${main_template}" > "${conf_path}"
