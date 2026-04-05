FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS frontend-builder

WORKDIR /build/frontend

COPY Sub-Store-Front-End/package.json ./
COPY Sub-Store-Front-End/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY Sub-Store-Front-End/ ./

ARG FRONTEND_API_BASE=/backend
ARG FRONTEND_PUBLIC_PATH=/

ENV VITE_API_URL="${FRONTEND_API_BASE}"
ENV VITE_PUBLIC_PATH="${FRONTEND_PUBLIC_PATH}"

RUN pnpm build

FROM base AS backend-builder

WORKDIR /build/backend

COPY Sub-Store/backend/package.json ./
COPY Sub-Store/backend/pnpm-lock.yaml ./
COPY Sub-Store/backend/patches ./patches

RUN pnpm install --frozen-lockfile

COPY Sub-Store/backend/ ./

RUN pnpm bundle:esbuild && pnpm prune --prod

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV SUB_STORE_DOCKER=true
ENV SUB_STORE_DATA_BASE_PATH=/app/data
ENV SUB_STORE_BACKEND_API_HOST=0.0.0.0
ENV SUB_STORE_BACKEND_API_PORT=3000
ENV SUB_STORE_BACKEND_MERGE=true
ENV SUB_STORE_FRONTEND_BACKEND_PATH=/backend
ENV SUB_STORE_FRONTEND_PATH=/app/frontend/dist

WORKDIR /app/backend

COPY --from=backend-builder /build/backend/package.json ./
COPY --from=backend-builder /build/backend/node_modules ./node_modules
COPY --from=backend-builder /build/backend/sub-store.min.js ./sub-store.min.js
COPY --from=backend-builder /build/backend/dist ./dist
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

# 添加上游许可证文件
COPY licenses/ /usr/share/licenses/sub-store/

RUN mkdir -p /app/data

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "sub-store.min.js"]
