# syntax=docker/dockerfile:1
# ============================================================
# Easel 容器镜像 — 自建（官方无 Docker 支持）
# 基础: node:24-bookworm-slim（Node 24 + Debian 12 + Python 3.11）
#   - openclaw@latest 要求 Node >=24.16（25.x/26.0 被排除）→ 用 Node 24
#   - Python 3.11 对全部重依赖（librosa/faster-whisper/rembg/opencv/biliup）wheel 兼容最好
# 构建在 GitHub Actions (us-east runner) 执行 → 一律用官方源，避免走国内镜像抖动卡死
#   npm=registry.npmjs.org / pip=pypi.org / playwright=官方CDN / apt=debian 官方
# 构建产物推 ghcr.io/guge98c/easel（由 .github/workflows/build-and-push.yml 驱动）
# ============================================================

# ---- Stage 1: 构建 Web 前端（React production bundle） ----
FROM node:24-bookworm-slim AS frontend-builder
WORKDIR /src
COPY web/frontend/package.json web/frontend/package-lock.json* ./
RUN npm ci --registry https://registry.npmjs.org --no-audit --no-fund \
    || npm install --registry https://registry.npmjs.org --no-audit --no-fund
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

# Python 依赖 + easel CLI（官方 PyPI，优先 wheel 避免源码编译）
RUN python3 -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir --prefer-binary -e /app \
        -i https://pypi.org/simple

# Playwright Chromium（官方 CDN 下载 + install-deps 自动装系统库）
RUN /app/.venv/bin/python -m playwright install chromium \
    && /app/.venv/bin/python -m playwright install-deps chromium

# OpenClaw 执行引擎（官方 npm）
RUN npm install -g openclaw@latest --registry https://registry.npmjs.org --loglevel warn

# OpenCode 执行引擎（官方 npm；Web 设置 → 执行引擎 可选 OpenCode，原生认证 opencode auth login）
RUN npm install -g @opencode/cli --registry https://registry.npmjs.org --loglevel warn

# 非 root：镜像自带 node 用户（UID 1000，与 NAS nasweb 对齐）
# 运行时由 compose 指定 user: "1000:1001"；HOME=/home/node 属主 1000，可写
RUN mkdir -p /app/outputs /app/profiles \
    /home/node/.openclaw-easel /home/node/.easel-browser-profiles \
    /home/node/.config/opencode /home/node/.local/share/opencode /home/node/.cache/opencode \
    && chown -R 1000:1000 /app/outputs /app/profiles /home/node

COPY docker/entrypoint.sh /usr/local/bin/easel-entrypoint.sh
RUN chmod +x /usr/local/bin/easel-entrypoint.sh

ENV EASEL_ROOT=/app \
    HOME=/home/node \
    PATH=/app/.venv/bin:/usr/local/bin:$PATH

EXPOSE 7860
ENTRYPOINT ["/usr/local/bin/easel-entrypoint.sh"]
