# syntax=docker/dockerfile:1

# cli: markdown-indexer-cli
# app: the reader, served by server.mjs against a mounted site directory
# runtime (default): publish a vault on startup, then serve the reader

ARG GO_VERSION=1.27
ARG NODE_VERSION=22
ARG MARKDOWN_INDEXER_REPO=https://github.com/dentropy/markdown-indexer.git
ARG MARKDOWN_INDEXER_REF=97074144ba0ca20a00070eb39b1c8f8f3c1290da

FROM golang:${GO_VERSION}-bookworm AS cli-build
ARG MARKDOWN_INDEXER_REPO
ARG MARKDOWN_INDEXER_REF
WORKDIR /src
# This repo does not vendor the CLI. go.mod replace directives need the clone.
RUN git init markdown-indexer \
 && git -C markdown-indexer remote add origin "$MARKDOWN_INDEXER_REPO" \
 && git -C markdown-indexer fetch --depth 1 origin "$MARKDOWN_INDEXER_REF" \
 && git -C markdown-indexer checkout --detach FETCH_HEAD
WORKDIR /src/markdown-indexer/libs/markdown-tools-cli
ENV CGO_ENABLED=0
RUN go build -mod=readonly -trimpath -ldflags='-s -w' -o /out/markdown-indexer-cli .

FROM debian:bookworm-slim AS cli
COPY --from=cli-build /out/markdown-indexer-cli /usr/local/bin/markdown-indexer-cli
ENTRYPOINT ["markdown-indexer-cli"]

FROM node:${NODE_VERSION}-bookworm AS app-build
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS app
WORKDIR /opt/app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY --from=app-build /src/app/dist ./dist
COPY app/server.mjs ./server.mjs
EXPOSE 8080
CMD ["node", "server.mjs"]

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /opt/app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 \
    DATA_ROOT=/data VAULT_DIR=/opt/vault
COPY --from=cli-build /out/markdown-indexer-cli /usr/local/bin/markdown-indexer-cli
COPY --from=app-build /src/app/dist ./dist
COPY app/server.mjs ./server.mjs
COPY examples/vault /opt/vault
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
