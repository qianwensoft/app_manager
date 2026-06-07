# syntax=docker/dockerfile:1

# ── 前端：Vue shell + SCADA + Form App ─────────────────────────────────────
FROM node:20-alpine AS web-builder
WORKDIR /build

COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web/ ./web/
RUN cd web && npm run build

COPY scada-editor/package.json scada-editor/package-lock.json ./scada-editor/
RUN cd scada-editor && npm ci
COPY scada-editor/ ./scada-editor/
RUN cd scada-editor && npm run build \
  && rm -rf /build/web/dist/scada-editor \
  && cp -R /build/scada-editor/dist /build/web/dist/scada-editor

COPY form-app/package.json form-app/package-lock.json ./form-app/
RUN cd form-app && npm ci
COPY form-app/ ./form-app/
RUN cd form-app && npm run build \
  && rm -rf /build/web/dist/form-app \
  && cp -R /build/form-app/dist /build/web/dist/form-app

# ── Go 服务端（纯 Go SQLite，无需 CGO）────────────────────────────────────
FROM golang:1.25-alpine AS go-builder
WORKDIR /build/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags "-s -w" -o /app-manager .

# ── 运行镜像 ───────────────────────────────────────────────────────────────
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata wget
WORKDIR /app

COPY --from=go-builder /app-manager ./app-manager
COPY --from=web-builder /build/web/dist ./web/dist
COPY server/config.docker.yaml ./server/config.docker.yaml
COPY docker/entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh ./app-manager

EXPOSE 8080
VOLUME ["/app/data", "/app/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/setup/status >/dev/null || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["./app-manager", "server/config.docker.yaml"]
