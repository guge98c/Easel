# syntax=docker/dockerfile:1
# ============================================================
# Easel 容器镜像 — 自建（官方无 Docker 支持）
# 基础: node:24-bookworm-slim（Node 24 + Debian 12 + Python 3.11）
#   - openclaw@2026.10.8 要求 Node >=24.16（25.x/26.0 被排除）→ 用 Node 24
#   - Python 3.11 对全部重依赖（librosa/faster-whisper/rembg/opencv/biliup）wheel 兼容最好
# 构建在 GitHub Actions (us-east runner) 执行 → 一律用官方源，避免走国内镜像抖动卡死
#   npm=registry.npmjs.org / pip=pypi.org / playwright=官方CDN / apt=debian 官方
# 构建产物推 ghcr.io/guge98c/easel（由 .github/workflows/build-and-push.yml 驱动）
#
# ⚠ 层顺序纪律（2026-10-29 修复，勿回退）：
#   依赖层（venv / playwright / npm -g）必须排在源码 COPY 之前。
#   旧版把 COPY . . 放在依赖层前，改一行代码就导致 ~5GB 依赖层缓存全部失效，
#   NAS 端 docker pull 退化为"拉半个镜像"（GB 级下载），曾把 NAS 拖崩。
#   依赖版本双保险：requirements.txt 锁 pip 依赖，npm -g 锁死版本号（禁 @latest）。
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

# ===== 依赖层区（只随 requirements.txt / pyproject / 全局工具版本变化，改业务源码不影响）=====
# 1. 包元数据 + easel 包本体（editable 安装需要 easel/ 目录用于 find_packages）
COPY pyproject.toml README.md requirements.txt ./
COPY easel/ ./easel/

# 2. venv + 全部 Python 依赖（requirements.txt 锁死 123 个包，层内容稳定）
RUN python3 -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir --prefer-binary \
        -r requirements.txt -e . \
        -i https://pypi.org/simple

# 3. Playwright Chromium（只依赖 venv 内 playwright 版本）
RUN /app/.venv/bin/python -m playwright install chromium \
    && /app/.venv/bin/python -m playwright install-deps chromium

# 4. OpenClaw 执行引擎（锁版本；禁 @latest —— 上游发版会导致 838MB 层内容漂移）
RUN npm install -g openclaw@2026.10.8 --registry https://registry.npmjs.org --loglevel warn

# 5. OpenCode 执行引擎（锁版本；Web 设置 → 执行引擎 可选 OpenCode，原生认证 opencode auth login）
RUN npm install -g @opencode/cli@2.2.1 --registry https://registry.npmjs.org --loglevel warn

# ===== 源码层区（放最后：以后改业务代码只失效这两层）=====
# 仓库整体复制（skills/、agents/、scripts/、web/ 全量；覆盖上面的 easel/ 为新代码）
COPY . .

# 前端构建产物覆盖（优先于仓库内可能存在的旧 dist）
COPY --from=frontend-builder /src/dist/ /app/web/frontend/dist/

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
