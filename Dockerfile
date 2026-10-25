# syntax=docker/dockerfile:1
# ============================================================
# Easel 容器镜像 — 自建（官方无 Docker 支持）
# 基础: node:24-bookworm-slim（Node 24 + Debian 12 + Python 3.11）
#   - openclaw@latest 要求 Node >=24.16（25.x/26.0 被排除）→ 用 Node 24
#   - Python 3.11 对全部重依赖（librosa/faster-whisper/rembg/opencv/biliup）wheel 兼容最好
# 轻量方案（对齐 NAS 部署规则第十一步，规避 playwright 2GB 镜像假死事故）:
#   - 不用 mcr.microsoft.com/playwright 官方大镜像，基础层仅 node:24-bookworm-slim
#   - Chromium 走 PLAYWRIGHT_DOWNLOAD_HOST=npmmirror 镜像（~300MB）
#   - npm 走 registry.npmmirror.com，pip 走清华源
# 构建产物推 ghcr.io/guge98c/easel（由 .github/workflows/build-and-push.yml 驱动）
# ============================================================

# ---- Stage 1: 构建 Web 前端（React production bundle） ----
FROM node:24-bookworm-slim AS frontend-builder
WORKDIR /src
COPY web/frontend/package.json web/frontend/package-lock.json* ./
RUN npm ci --registry https://registry.npmmirror.com --no-audit --no-fund \
    || npm install --registry https://registry.npmmirror.com --no-audit --no-fund
COPY web/frontend/ ./
RUN npm run build
# 产物: /src/dist

# ---- Stage 2: 运行时 ----
FROM node:24-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive

# 系统依赖: Python 3.11 工具链 + FFmpeg + Git + 浏览器运行库（Playwright 依赖列表）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    ffmpeg git curl ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 仓库整体复制（skills/、agents/、scripts/、web/、easel/ 全量；dist 单独覆盖）
COPY . .

# 前端构建产物覆盖（优先于仓库内可能存在的旧 dist）
COPY --from=frontend-builder /src/dist/ /app/web/frontend/dist/

# Python 依赖 + easel CLI（清华源，优先 wheel 避免源码编译）
RUN python3 -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir --prefer-binary -e /app \
        -i https://pypi.tuna.tsinghua.edu.cn/simple

# Playwright Chromium（npmmirror 镜像下载 + install-deps 自动装系统库，~300MB）
ENV PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright
RUN /app/.venv/bin/python -m playwright install chromium \
    && /app/.venv/bin/python -m playwright install-deps chromium

# OpenClaw 执行引擎（npmmirror）
RUN npm install -g openclaw@latest --registry https://registry.npmmirror.com --loglevel warn

# 非 root：镜像自带 node 用户（UID 1000，与 NAS nasweb 对齐）
# 运行时由 compose 指定 user: "1000:1001"；HOME=/home/node 属主 1000，可写
RUN mkdir -p /app/outputs /app/profiles \
    /home/node/.openclaw-easel /home/node/.easel-browser-profiles \
    && chown -R 1000:1000 /app/outputs /app/profiles /home/node

COPY docker/entrypoint.sh /usr/local/bin/easel-entrypoint.sh
RUN chmod +x /usr/local/bin/easel-entrypoint.sh

ENV EASEL_ROOT=/app \
    HOME=/home/node \
    PATH=/app/.venv/bin:/usr/local/bin:$PATH

EXPOSE 7860
ENTRYPOINT ["/usr/local/bin/easel-entrypoint.sh"]
