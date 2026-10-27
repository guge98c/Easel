---
name: skill-tgmeng-trends
description: >-
  抓取糖果梦（tgmeng.com）28 个垂直热榜源，包括豆瓣组（买/拼/爱猫生活/爱猫澡盆）、
  AI 工具资讯（AI工具集/AIHub/36氪/AITNT/钛媒体/OSChina/Hyper/Appinn/2Libra）、
  副业社区（2Libra/V2EX/MiddleFun/人人都是产品经理×2/离谱思维）、
  GitHub Trending、糖果梦毒榜/副业。
  当用户说"豆瓣组""爱猫生活""爱猫澡盆""羊毛""捡垃圾""AI工具""GitHub Trending""开源项目"
  "副业""搞钱""离谱思维""糖果梦"时使用。
  和 skill-trending-topics 的区别：本 SKILL 抓垂直社区/AI/GitHub 垂直源；trending-topics 抓微博抖音知乎大平台热搜。
layer: discover
---

# 糖果梦垂直热榜

> 抓取 28 个垂直热榜源，聚焦 AI 工具、副业、羊毛优惠、开源项目。专为找细分赛道选题设计。

## 输入

用户 prompt 中提供以下信息（全部可选）：

- **源/分类**：豆瓣组 / AI 工具 / 副业 / GitHub / 糖果指数（默认：全部拉一遍）
- **关键词过滤**：如"职场""变现""n8n""扣子"（有则在标题里 grep 过滤）
- **目的**：浏览热点 / 找选题 / 看有什么新 AI 工具 / 捡羊毛

## 数据源

所有数据通过 Easel 本地后端代理拉取（已处理 CORS、缓存 5 分钟）：

**Base URL**: `http://192.168.2.27:7860/api/trends?platforms=<逗号分隔的 key>&limit=100`

### 28 个源 key 清单

| 分类 | key | 说明 |
|---|---|---|
| **媒体** | `tgm_bilibili` | B站 |
| | `tgm_douyin` | 抖音 |
| | `tgm_youtube` | YouTube |
| **羊毛/豆瓣组** | `tgm_maizu` | 豆瓣组·买（买买买小组） |
| | `tgm_pinzu` | 豆瓣组·拼（拼单小组） |
| | `tgm_aimao` | 豆瓣组·爱猫生活 |
| | `tgm_zaopen` | 豆瓣组·爱猫澡盆 |
| **副业** | `tgm_2libra_fuye` | 2Libra·副业 |
| | `tgm_v2ex_fuye` | V2EX·副业 |
| | `tgm_midfun_fuye` | MiddleFun·副业 |
| | `tgm_woshipm_cy` | 人人都是产品经理·创业学院 |
| | `tgm_woshipm_yx` | 人人都是产品经理·营销推广 |
| | `tgm_lipusiwei` | 离谱思维 |
| **AI** | `tgm_agjj` | AI工具集·快讯 |
| | `tgm_aihub` | AIHub·资讯 |
| | `tgm_36keai` | 36氪·AI |
| | `tgm_aitnt` | AITNT·AI |
| | `tgm_taimei` | 钛媒体·AI |
| | `tgm_oschina` | OSChina·AI |
| | `tgm_hyper` | Hyper·AI |
| | `tgm_appinn` | Appinn·AI |
| | `tgm_2libra_ai` | 2Libra·AI |
| **GitHub** | `tgm_gh_daily` | GitHub·Trending 今日 |
| | `tgm_gh_weekly` | GitHub·Trending 本周 |
| | `tgm_gh_day` | GitHub·新仓库日 Star |
| | `tgm_gh_all` | GitHub·Star 总榜 |
| **糖果指数** | `tgm_dubang` | 糖果梦·毒榜（AI 观点金句） |
| | `tgm_tg_sideline` | 糖果梦·副业 |

## 执行步骤

1. **确定要拉哪些源**
   - 用户说"豆瓣组/爱猫/羊毛" → 拉 `tgm_maizu,tgm_pinzu,tgm_aimao,tgm_zaopen`
   - 用户说"AI 工具/AI 新闻" → 拉 9 个 AI 源
   - 用户说"GitHub/开源" → 拉 4 个 GitHub 源
   - 用户说"副业/搞钱" → 拉 6 个副业源 + `tgm_tg_sideline`
   - 用户说"全部/随便看看" → 28 个全拉（一次请求逗号分隔）

2. **用 web_fetch 调本地 API**
   ```
   GET http://192.168.2.27:7860/api/trends?platforms=tgm_maizu,tgm_aimao,tgm_agjj,tgm_gh_daily&limit=100
   ```
   返回结构：
   ```json
   {
     "trends": [
       {"platform": "tgm_maizu", "label": "豆瓣组·买", "items": [{"title":"...","hot":"...","url":"..."}], "ok": true}
     ]
   }
   ```

3. **按关键词过滤**（如果用户给了关键词）
   - 在 `items[].title` 里 grep 用户给的关键词
   - 标注命中的关键词

4. **输出格式**

```markdown
# 🍬 糖果梦垂直热榜
时间: {date}
拉取源: {N} 个

## 🔥 热门条目（按源分组）

### 豆瓣组·买（{n} 条）
1. {标题} — {hot if any}
2. ...

### AI工具集·快讯（{n} 条）
1. {标题}
...

## 🎯 推荐选题（3-5 个）
### 选题 1: {标题}
- 来源: {源 label}
- 切入角度: {怎么切}
- 链接: {url if any}

## 💡 洞察
- 跨源重合的话题
- 突然冒头的新工具/新项目
```

## 注意事项

- 每个源返回条数不固定（14~660 条），不要假设固定条数
- `hot` 字段可能为空（毒榜源没有热度值），`url` 也可能为空（毒榜是 AI 金句，无链接）
- 数据已在后端缓存 5 分钟，短时间内重复拉取不会打爆糖果梦 API
- 如果某个源 `ok=false`，跳过即可，不要报错中断
