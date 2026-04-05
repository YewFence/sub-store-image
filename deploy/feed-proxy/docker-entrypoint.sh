#!/bin/sh
set -eu

server_name="${FEED_SERVER_NAME:-_}"
public_path="${FEED_PUBLIC_PATH:-/yew-rhizome}"
upstream="${FEED_UPSTREAM:-http://sub-store:3000/backend/api/file/yew-rhizome}"
token="${FEED_TOKEN:-}"
conf_path="/etc/nginx/conf.d/default.conf"
template_path="/etc/sub-store/default.conf.tmpl"

if [ -z "${token}" ]; then
    echo "FEED_TOKEN is required for feed-proxy" >&2
    exit 1
fi

case "${public_path}" in
    /*) ;;
    *)
        echo "FEED_PUBLIC_PATH must start with /" >&2
        exit 1
        ;;
esac

export FEED_SERVER_NAME="${server_name}"
export FEED_PUBLIC_PATH="${public_path}"
export FEED_TOKEN="${token}"
export FEED_UPSTREAM="${upstream}"

# 显式指定变量列表，避免 nginx 原生变量（$host、$remote_addr 等）被误替换
envsubst '${FEED_SERVER_NAME} ${FEED_PUBLIC_PATH} ${FEED_TOKEN} ${FEED_UPSTREAM}' < "${template_path}" > "${conf_path}"
