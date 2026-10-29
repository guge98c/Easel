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
# ⚠ 层稳定纪律（2026-10-29，勿回退）：
#   目标：任何构建路径（custom 分支 push / 上游 merge）产出的镜像，
#   在业务代码之外的层 digest 不变 → NAS 端 docker pull 恒为增量（几十 MB）。
#   三道锁，缺一不可：
#   ① 层顺序：依赖层（venv / playwright / npm -g）必须排在源码 COPY 之前。
#      旧版把 COPY . . 放在依赖层前，改一行代码就导致 ~5GB 依赖层缓存全部失效，
#      NAS 端 docker pull 退化为"拉半个镜像"（GB 级下载），曾把 NAS 拖崩。
#   ② 版本锁定：requirements.txt 锁 pip（123 包）、npm -g 锁死版本号（禁 @latest）、
#      apt 锁 `=版本`、FROM 锁 digest（禁浮动 tag，官方安全更新不自动进，
#      需主动 bump：docker pull node:24-bookworm-slim 后更新两处 digest）。
#   ③ 上游作者改代码（requirements/package.json 除外）→ 只有源码层变 → 增量拉取成立。
# ============================================================

# ---- Stage 1: 构建 Web 前端（React production bundle） ----
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS frontend-builder
WORKDIR /src
COPY web/frontend/package.json web/frontend/package-lock.json* ./
RUN npm ci --registry https://registry.npmjs.org --no-audit --no-fund \
    || npm install --registry https://registry.npmjs.org --no-audit --no-fund
COPY web/frontend/ ./
RUN npm run build
# 产物: /src/dist

# ---- Stage 2: 运行时 ----
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c
ENV DEBIAN_FRONTEND=noninteractive

# 系统依赖: Python 3.11 工具链 + FFmpeg + Git + 浏览器运行库（Playwright 依赖列表）
# 版本锁定（2026-10-29，deb12 当前候选）：防 bookworm 安全更新导致 apt 层 digest 漂移 → 上层全失效
# 升级方式：容器内 apt-get update && apt-cache policy <包> 查新版本后手动 bump
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3=3.11.2-1+b1 python3-pip=23.0.1+dfsg-1 python3-venv=3.11.2-1+b1 \
    ffmpeg=7:5.1.9-0+deb12u1 git=1:2.39.5-0+deb12u3 curl=7.88.1-10+deb12u15 \
    ca-certificates=20250419~deb12u2 build-essential=12.9 \
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
