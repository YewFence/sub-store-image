#!/bin/sh
set -eu

server_name="${FEED_SERVER_NAME:-_}"
routes="${FEED_ROUTES:-}"
conf_path="/etc/nginx/conf.d/default.conf"
template_path="/etc/sub-store/default.conf.tmpl"
blocks_file="/tmp/feed-location-blocks.conf"

trim() {
    printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

require_absolute_path() {
    case "$1" in
        /*) ;;
        *)
            echo "$2 must start with /" >&2
            exit 1
            ;;
    esac
}

require_clean_path() {
    case "$1" in
        *' '*|*'	'*|*'?'*|*'#'*)
            echo "$2 contains unsupported characters: $1" >&2
            exit 1
            ;;
    esac
}

require_clean_segment() {
    case "$1" in
        *' '*|*'	'*|*'/'*|*'?'*|*'#'*)
            echo "$2 contains unsupported characters: $1" >&2
            echo "$2 如需包含特殊字符，请先做 URL 编码" >&2
            exit 1
            ;;
    esac
}

normalize_type() {
    case "$1" in
        sub|subscription)
            printf 'sub'
            ;;
        col|collection)
            printf 'col'
            ;;
        file)
            printf 'file'
            ;;
        *)
            echo "Unsupported feed route type: $1" >&2
            exit 1
            ;;
    esac
}

append_common_proxy_directives() {
    cat >>"${blocks_file}" <<'EOF'
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
EOF
}

append_share_location() {
    route_public_path="$1"
    route_type="$2"
    route_name="$3"
    route_target="$4"
    route_upstream="http://sub-store:3000/share/${route_type}/${route_name}"

    if [ -n "${route_target}" ]; then
        route_upstream="${route_upstream}/${route_target}"
    fi

    cat >>"${blocks_file}" <<EOF
    location = ${route_public_path} {
        limit_except GET HEAD {
            deny all;
        }

        if (\$arg_token = "") {
            return 401;
        }

        add_header Cache-Control "no-store" always;
        proxy_pass ${route_upstream}?token=\$arg_token;
EOF
    append_common_proxy_directives
    cat >>"${blocks_file}" <<'EOF'
    }
EOF
}

: >"${blocks_file}"

if [ -z "${routes}" ]; then
    echo "FEED_ROUTES is required for feed-proxy" >&2
    echo "Expected format: /public-path|sub|name|target(optional)" >&2
    exit 1
fi

seen_public_paths='|'
route_count=0
old_ifs="${IFS}"
IFS=';'
for raw_entry in ${routes}; do
    entry="$(trim "${raw_entry}")"
    if [ -z "${entry}" ]; then
        continue
    fi

    route_public_path=''
    route_type=''
    route_name=''
    route_target=''
    route_extra=''
    IFS='|' read -r route_public_path route_type route_name route_target route_extra <<EOF
${entry}
EOF
    IFS=';'

    route_public_path="$(trim "${route_public_path}")"
    route_type="$(trim "${route_type}")"
    route_name="$(trim "${route_name}")"
    route_target="$(trim "${route_target}")"
    route_extra="$(trim "${route_extra}")"

    if [ -n "${route_extra}" ]; then
        echo "Invalid FEED_ROUTES entry: ${entry}" >&2
        echo "Expected format: /public-path|sub|name|target(optional)" >&2
        exit 1
    fi

    if [ -z "${route_public_path}" ] || [ -z "${route_type}" ] || [ -z "${route_name}" ]; then
        echo "Invalid FEED_ROUTES entry: ${entry}" >&2
        echo "Expected format: /public-path|sub|name|target(optional)" >&2
        exit 1
    fi

    require_absolute_path "${route_public_path}" "FEED_ROUTES public path"
    require_clean_path "${route_public_path}" "FEED_ROUTES public path"
    require_clean_segment "${route_name}" "FEED_ROUTES resource name"
    if [ -n "${route_target}" ]; then
        require_clean_segment "${route_target}" "FEED_ROUTES target"
    fi

    route_type="$(normalize_type "${route_type}")"
    if [ "${route_type}" = "file" ] && [ -n "${route_target}" ]; then
        echo "FEED_ROUTES target is only supported for sub/col routes: ${entry}" >&2
        exit 1
    fi

    case "${seen_public_paths}" in
        *"|${route_public_path}|"*)
            echo "Duplicated FEED_ROUTES public path: ${route_public_path}" >&2
            exit 1
            ;;
    esac
    seen_public_paths="${seen_public_paths}${route_public_path}|"

    append_share_location \
        "${route_public_path}" \
        "${route_type}" \
        "${route_name}" \
        "${route_target}"
    route_count=$((route_count + 1))
done
IFS="${old_ifs}"
if [ "${route_count}" -eq 0 ]; then
    echo "FEED_ROUTES is set but contains no valid entries" >&2
    exit 1
fi

export FEED_SERVER_NAME="${server_name}"
export FEED_LOCATION_BLOCKS="$(cat "${blocks_file}")"

# 显式指定变量列表，避免 nginx 原生变量（$host、$remote_addr 等）被误替换
envsubst '${FEED_SERVER_NAME} ${FEED_LOCATION_BLOCKS}' < "${template_path}" > "${conf_path}"
