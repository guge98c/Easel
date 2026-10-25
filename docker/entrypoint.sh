#!/usr/bin/env bash
# ============================================================
# Easel 容器入口：幂等初始化 + 双进程编排（gateway 后台 / web 前台）
# 进程模型:
#   - OpenClaw gateway（easel profile → 端口 37289，loopback）: web 的 Agent 执行后端
#   - easel web（uvicorn :7860）: 前台进程，容器存活依赖它（restart: unless-stopped 兜底）
# 首次启动初始化（全部幂等，重启不重复执行）:
#   - openclaw profile onboard（~/.openclaw-easel/openclaw.json）
#   - agents/sync.sh 同步 skills 到 agent workspace
# 登录态/产物/画像由 compose 卷挂载持久化:
#   - /home/easel 整个 HOME（含 .openclaw-easel 配置 + .easel-browser-profiles 平台登录态）
#   - /app/outputs（产物，含登录二维码 outputs/_login/*.png）
#   - /app/profiles（账号画像）
# ============================================================
set -euo pipefail

export EASEL_ROOT="${EASEL_ROOT:-/app}"
export HOME="${HOME:-/home/node}"
export PATH="/app/.venv/bin:/usr/local/bin:$PATH"

# ---- 1. 初始化 OpenClaw easel profile（幂等）----
OPENCLAW_HOME="$HOME/.openclaw-easel"
if [ ! -f "$OPENCLAW_HOME/openclaw.json" ]; then
    echo "[easel] 初始化 OpenClaw profile (easel) ..."
    mkdir -p "$OPENCLAW_HOME"
    if openclaw --profile easel onboard --help >/dev/null 2>&1; then
        # 探测可用参数，逐个跳过非必要模块；daemon 相关参数随版本不同
        ARGS=(onboard --non-interactive --mode local --accept-risk)
        for flag in --skip-health --skip-channels --skip-skills --skip-ui --skip-hooks --skip-search --skip-daemon; do
            if openclaw --profile easel onboard --help 2>&1 | grep -q -- "$flag"; then
                ARGS+=("$flag")
            fi
        done
        openclaw --profile easel "${ARGS[@]}" 2>&1 | tail -5 || true
    else
        openclaw --profile easel setup --non-interactive --mode local --accept-risk 2>&1 | tail -5 || true
    fi
    # onboard 失败不致命：gateway 有 --allow-unconfigured，Web 设置里还能补
    echo "[easel] profile 初始化完成（或跳过，gateway 将容错启动）"
else
    echo "[easel] OpenClaw profile 已存在，跳过初始化"
fi

# ---- 2. 同步 skills 到 agent workspace（幂等）----
if [ -x "$EASEL_ROOT/agents/sync.sh" ]; then
    echo "[easel] 同步 skills ..."
    bash "$EASEL_ROOT/agents/sync.sh" >/dev/null 2>&1 || echo "[easel] skills 同步跳过（不阻断启动）"
fi

# ---- 3. 启动 OpenClaw gateway（后台）----
echo "[easel] 启动 gateway ..."
bash "$EASEL_ROOT/scripts/gateway.sh" start >/dev/null 2>&1 || echo "[easel] gateway 启动容错（日志: /tmp/easel-gateway.log）"

# ---- 4. 启动 Web 工作台（前台，容器存活锚点）----
echo "[easel] 启动 Web 工作台 :${EASEL_PORT:-7860} ..."
cd "$EASEL_ROOT"
exec python -m web.app
