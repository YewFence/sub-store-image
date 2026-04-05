set shell := ["bash", "-euo", "pipefail", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    @just --list

sync:
    node scripts/sync-upstreams.mjs

licenses: sync
    node scripts/collect-licenses.mjs

_prepare-build: licenses

build image="sub-store:dev": _prepare-build
    node scripts/docker-build.mjs --tag {{ image }}

smoke image="sub-store:dev" port="38080": _prepare-build
    node scripts/docker-build.mjs --tag {{ image }}
    node scripts/run-smoke.mjs --image {{ image }} --port {{ port }}

metadata: sync
    node scripts/upstream-metadata.mjs

publish-metadata image="sub-store" build_number="local": sync
    node scripts/publish-metadata.mjs --image {{ image }} --build-number {{ build_number }}

publish image="sub-store" build_number="local": _prepare-build
    node scripts/docker-publish.mjs --image {{ image }} --build-number {{ build_number }}

publish-push image="sub-store" build_number="local": _prepare-build
    node scripts/docker-publish.mjs --image {{ image }} --build-number {{ build_number }} --push
