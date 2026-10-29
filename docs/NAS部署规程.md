# Easel NAS 部署规程（SOP）

> 2026-10-29 立。背景：当天一次 `docker compose pull && up -d` 的违规操作，
> 叠加镜像层顺序缺陷，导致 GB 级下载把 NAS（192.168.2.27）拖崩重启
> （无 shutdown 记录的崩溃式重启）。本规程 + Dockerfile 层顺序纪律，双保险防复发。

## 一、标准部署五步（每次上线照做，一步都不能省）

```
① 查状态   ssh nasweb@192.168.2.27 "uptime; df -h /vol1 | tail -1"
           → 负载 < 1、剩余空间 > 50G 才继续；负载高就等
② 拉镜像   ssh nasweb@192.168.2.27 "cd /vol1/1000/Docker/easel && \
              nohup docker compose pull > /tmp/easel_pull.log 2>&1 &"
           → 放远端后台跑，本地隔一会 cat /tmp/easel_pull.log 轮询
           → ⚠ 绝不把 pull 和 up -d 串成一条命令；绝不设 SSH 超时打断它
③ 验镜像   docker image inspect ghcr.io/guge98c/easel:custom --format '{{.Id}}'
           → 对比拉取前的 Id，确认真的换了新镜像再往下
④ 重建     ssh ... "cd /vol1/1000/Docker/easel && docker compose up -d"
⑤ 验证     docker ps --filter name=easel（Up 状态）
           curl -s -o /dev/null -w '%{http_code}' http://192.168.2.27:7860/
           → 200 才算完
```

## 二、铁律（每一条都对应一次真实事故）

| # | 铁律 | 反面教材 |
|---|---|---|
| 1 | 拉之前必查负载和空间 | 容器在跑自动拆解（有基础负载）时直接开拉 |
| 2 | `pull` 和 `up -d` 必须是两条独立命令 | 串成 `pull && up -d`，一断全断 |
| 3 | 长命令放远端后台 + 轮询日志 | SSH 前台等，工具超时 SIGTERM 把远端拉取打断 |
| 4 | 打断后不许立刻重连猛拉 | 反复重连重试，中间态叠中间态 |
| 5 | 确认镜像 Id 真变了再重建 | 没验证就 up，白重建 |

## 三、镜像层顺序纪律（为什么 NAS 不该拉大镜像）

Docker 增量拉取按"层"不按"代码"：层内容 sha256 与本地一致才跳过。
旧 Dockerfile 把 `COPY . .`（源码层 475MB）排在依赖层前面：

```
旧: COPY . . → venv(1.77GB) → playwright(808MB) → openclaw(838MB) → opencode(1.48GB)
    改一行代码 ↑ 以上 4 层全部失效重建 → NAS 拉半个镜像(GB级) → 拖崩
新: venv/playwright/npm-g(依赖层，锁版本) → COPY . .(源码层，放最后)
    改代码只重建最后一层(几十MB) → NAS 秒拉
```

配套锁定（缺一不可）：
- `requirements.txt`：pip freeze 123 个包。pyproject 的 `>=x,<y` 范围版本
  每次构建可能解析到不同小版本，venv 层会漂移——必须锁。
- `openclaw@2026.10.8` / `@opencode/cli@2.2.1`：禁 `@latest`。
  npm `-g latest` 是浮动层，上游一发版层内容就变。

**gha 缓存误区**：`cache-from/to: type=gha` 只加速 GitHub Actions 云端构建，
与 NAS 拉取量无关。NAS 拉多少只看 ghcr 新镜像与本地旧镜像的层共享度。

## 四、应急：拉取中断 / NAS 无响应

1. 先探活：`ping 192.168.2.27` + `curl -m 8 http://192.168.2.27:7860/`
   - ping 通、web 通：SSH 可能只是没起来，等 1-2 分钟再连（MCP 单会话僵死同理，等会自愈）
   - 全不通：NAS 在重启，等它起来（容器 unless-stopped 会自动拉起）
2. 起来后先查：`uptime`（看重启时间）、`docker images`（确认本地镜像没被半截层污染）
3. **不要立刻重拉**。确认 docker daemon 正常（`docker ps` 不卡）再按五步走

## 五、自动更新工作流（n8n "easel 镜像自动更新"）

- 每 3 天：compare 检查上游 ZJU-REAL/Easel → 有更新则 merge-upstream 同步进
  fork 的 main → 触发构建 **main 分支**
- 用户拓展在 **custom 分支**：main 的新上游代码经 PR 合入 custom（webhook 链路）
- ⚠ 该工作流只负责"同步上游 + 构建"，**NAS 拉取更新不在其内**，按本规程人工执行
