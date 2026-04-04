set shell := ["bash", "-euo", "pipefail", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    @just --list

sync:
    node scripts/sync-upstreams.mjs

build image="sub-store:dev":
    node scripts/sync-upstreams.mjs
    node scripts/docker-build.mjs --tag {{image}}

smoke image="sub-store:dev" port="38080":
    node scripts/sync-upstreams.mjs
    node scripts/docker-build.mjs --tag {{image}}
    node scripts/run-smoke.mjs --image {{image}} --port {{port}}

metadata:
    node scripts/upstream-metadata.mjs

publish-metadata image="sub-store" build_number="local":
    node scripts/publish-metadata.mjs --image {{image}} --build-number {{build_number}}

publish image="sub-store" build_number="local":
    node scripts/sync-upstreams.mjs
    node scripts/docker-publish.mjs --image {{image}} --build-number {{build_number}}

publish-push image="sub-store" build_number="local":
    node scripts/sync-upstreams.mjs
    node scripts/docker-publish.mjs --image {{image}} --build-number {{build_number}} --push

