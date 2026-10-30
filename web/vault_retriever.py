"""Easel 素材库检索模块 (vault-retriever)

把 Obsidian vault 当成素材库，真实目录结构：
    平台 -> 账号文件夹 -> 赛道子文件夹(可选)
例如：  easel/Gzh/职场秘境/干货拆解/xxx.md
        easel/Gzh/情感陪伴/避坑红线.md

读取 .md 切块，混合「向量语义 + jieba 中文 BM25」双路召回，RRF 融合，
天然按账号/赛道文件夹隔离（IMA 做不到的两点：读正文全文 + 按文件夹精确过滤）。

依赖：lancedb / fastembed / jieba —— 已验证可在 easel 容器内运行，
需写进 requirements.txt 走 CI 持久化（见对话）。
"""
from __future__ import annotations
import os, re, hashlib
from pathlib import Path
from typing import Optional

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

import jieba
from fastembed import TextEmbedding
import lancedb
from lancedb.pydantic import LanceModel, Vector

# 平台 -> vault 顶层文件夹名（一个平台一个文件夹；多账号时在该文件夹下分账号子目录）
PLATFORM_FOLDER = {
    "公众号": "Gzh",
    "微信公众号": "Gzh",
    "小红书": "Xhs",
    "抖音": "Douyin",
    "视频号": "Video",
    "知乎": "Zhihu",
    "B站": "Bili",
    "快手": "Kuaishou",
}

EMBED_MODEL = os.environ.get("VAULT_EMBED_MODEL", "BAAI/bge-small-zh-v1.5")
# 写稿时强制注入（量少可控，始终携带）
_ALWAYS_PITFALL_FILES = ("避坑红线.md",)
# 写稿时不自动注入（内容会随时间膨胀），需显式请求才加载
_C_LEVEL_FILES = ("C级避坑清单.md",)
_ALL_PITFALL_FILES = _ALWAYS_PITFALL_FILES + _C_LEVEL_FILES
_RRF_K = 60
# 相关性阈值：RRF 分数低于此值的 chunk 视为不相关（要求向量+BM25 双路都至少有所命中）。
# 生产环境素材量大时 top_k 自然过滤；小库演示靠此阈值保证"选了职场只出职场"的干净隔离。
# 可调：想更宽松就调小（如 0.015），想更严格就调大。
MIN_SCORE = 0.02


class _Chunk(LanceModel):
    source: str
    title: str
    text: str
    fts: str
    vector: Vector(512)  # 与 EMBED_MODEL 维度一致


_model: Optional[TextEmbedding] = None


def _get_model() -> TextEmbedding:
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=EMBED_MODEL)
    return _model


def _safe_name(name: str, what: str) -> str:
    """校验平台/账号/赛道名，禁止路径分隔符与 . / ..（防路径穿越读到 vault 外的文件）。"""
    n = (name or "").strip()
    if not n or n in (".", "..") or "/" in n or "\\" in n or "\x00" in n:
        raise ValueError(f"非法的{what}名：{name!r}")
    return n


def _account_dir(platform: str, account: str, root: str = "/data/vault") -> Path:
    pf = PLATFORM_FOLDER.get((platform or "").strip())
    if pf is None:
        # 未知平台绝不静默回落到 Gzh——否则可能因拼错平台而读到别的素材库
        raise ValueError(f"未知平台：{platform}（已知：{'/'.join(PLATFORM_FOLDER)}）")
    return Path(root) / pf / _safe_name(account, "账号")


def list_accounts(platform: str, root: str = "/data/vault") -> list[str]:
    """列出某平台下的全部账号文件夹（第二级选择器数据源）。"""
    pf = PLATFORM_FOLDER.get((platform or "").strip())
    if pf is None:
        return []
    base = Path(root) / pf
    if not base.exists():
        return []
    return sorted(p.name for p in base.iterdir() if p.is_dir())


def list_tracks(platform: str, account: str, root: str = "/data/vault") -> list[str]:
    """列出某账号下的赛道子文件夹（若账号直接放素材则可为空）。"""
    base = _account_dir(platform, account, root)
    if not base.exists():
        return []
    return sorted(p.name for p in base.iterdir() if p.is_dir())


def _chunk_markdown(text: str, source: str):
    """按 #/##/### 标题切块，保留标题作为 chunk 标题。"""
    chunks = []
    cur_title = None
    cur_lines = []
    for line in text.splitlines():
        if re.match(r"^#{1,3}\s", line):
            if cur_lines:
                chunks.append((cur_title or source, "\n".join(cur_lines)))
            cur_title = line.strip()
            cur_lines = [line]
        else:
            cur_lines.append(line)
    if cur_lines:
        chunks.append((cur_title or source, "\n".join(cur_lines)))
    return [(t, b.strip()) for t, b in chunks if b.strip()]


def _load_chunks(folder: Path):
    out = []
    if not folder.exists():
        return out
    for md in sorted(folder.rglob("*.md")):
        if md.name in _ALL_PITFALL_FILES:
            continue  # 避坑文件单独走 retrieve_pitfall
        try:
            text = md.read_text(encoding="utf-8")
        except Exception:
            continue
        for title, body in _chunk_markdown(text, md.stem):
            out.append({
                "source": str(md),
                "title": title,
                "text": body,
                "fts": " ".join(jieba.lcut(body)),
            })
    return out


def _folder_signature(folder: Path) -> str:
    """目录内容指纹：文件名+大小+修改时间。素材没变就不用重新向量化。"""
    h = hashlib.md5()
    h.update(EMBED_MODEL.encode("utf-8"))
    for md in sorted(folder.rglob("*.md")):
        try:
            st = md.stat()
        except OSError:
            continue
        if md.name in _ALL_PITFALL_FILES:
            continue
        h.update(f"{md}|{st.st_size}|{st.st_mtime_ns}".encode("utf-8"))
    return h.hexdigest()


# folder str -> (signature, table)：素材不变则复用已建好的索引，避免每问一次都重算一遍向量
_index_cache: dict[str, tuple[str, object]] = {}


def _get_table(folder: Path):
    """取得该目录已建好的检索表（向量 + 中文 BM25 FTS），带内容指纹缓存。"""
    sig = _folder_signature(folder)
    key = str(folder)
    hit = _index_cache.get(key)
    if hit and hit[0] == sig:
        return hit[1]

    chunks = _load_chunks(folder)
    if not chunks:
        return None

    model = _get_model()
    vecs = list(model.embed([c["text"] for c in chunks]))
    cache = "/tmp/vr_cache_" + hashlib.md5(key.encode()).hexdigest()[:12]
    db = lancedb.connect(cache)
    try:
        db.drop_table("chunks")
    except Exception:
        pass
    rows = [dict(c, vector=v.tolist()) for c, v in zip(chunks, vecs)]
    tbl = db.create_table("chunks", data=rows, mode="overwrite")
    try:
        tbl.create_fts_index("fts")  # 中文 BM25 关键词召回（jieba 已分词）
    except Exception:
        pass

    _index_cache[key] = (sig, tbl)
    return tbl


def retrieve(platform: str, account: str, query: str, top_k: int = 8,
             root: str = "/data/vault", track: Optional[str] = None) -> list[dict]:
    """检索某平台某账号下的素材（可选限定赛道子文件夹）。
    返回 [{source,title,text,score}] 按相关性降序。"""
    base = _account_dir(platform, account, root)
    folder = base / _safe_name(track, "赛道") if track else base
    tbl = _get_table(folder)
    if tbl is None:
        return []

    model = _get_model()
    qv = list(model.embed([query]))[0].tolist()
    qfts = " ".join(jieba.lcut(query))

    vec_res = tbl.search(qv, vector_column_name="vector").limit(top_k * 2).to_list()
    try:
        fts_res = tbl.search(qfts, query_type="fts").limit(top_k * 2).to_list()
    except Exception:
        fts_res = []  # FTS 不可用时降级为纯向量召回

    scores = {}
    meta = {}
    for rank, r in enumerate(vec_res):
        key = r["source"] + r["title"]
        scores[key] = scores.get(key, 0) + 1.0 / (rank + _RRF_K)
        meta[key] = r
    for rank, r in enumerate(fts_res):
        key = r["source"] + r["title"]
        scores[key] = scores.get(key, 0) + 1.0 / (rank + _RRF_K)
        meta[key] = r

    ordered = sorted(scores.items(), key=lambda x: -x[1])[:top_k]
    return [{
        "source": m["source"],
        "title": m["title"],
        "text": m["text"],
        "score": round(s, 4),
    } for _, s in ordered if s >= MIN_SCORE for m in [meta[_]]]


def retrieve_pitfall(platform: str, account: str, root: str = "/data/vault",
                     track: Optional[str] = None,
                     include_c_level: bool = False) -> str:
    """读取该账号(或赛道)下的避坑文件全文。
    默认只返回 避坑红线.md（写稿时强制注入，量少可控）。
    当 include_c_level=True 时才额外加载 C级避坑清单.md（按需，避免膨胀）。"""
    base = _account_dir(platform, account, root)
    candidates = [base / _safe_name(track, "赛道")] if track else [base]
    files_to_load = list(_ALWAYS_PITFALL_FILES)
    if include_c_level:
        files_to_load = files_to_load + list(_C_LEVEL_FILES)
    parts = []
    for folder in candidates:
        if not folder.exists():
            continue
        for name in files_to_load:
            p = folder / name
            if p.is_file():
                parts.append(p.read_text(encoding="utf-8"))
    if not parts:
        for folder in candidates:
            for md in folder.rglob("*.md"):
                if any(k in md.name for k in ("避坑", "红线")) and md.name not in _ALL_PITFALL_FILES:
                    parts.append(md.read_text(encoding="utf-8"))
                elif include_c_level and "C级" in md.name and md.name not in _ALL_PITFALL_FILES:
                    parts.append(md.read_text(encoding="utf-8"))
    return "\n\n---\n\n".join(parts)



def compose_context(materials: list[dict], pitfall: str,
                    include_c_level: bool = False) -> str:
    """把「已检索到的素材 + 避坑红线」拼成注入写稿的上下文（不重复检索）。
    include_c_level=True 时额外附带 C级避坑清单（按需加载，避免膨胀）。"""
    lines = ["【素材库检索结果（来自 Obsidian 素材库，仅供参考，按需取用）】"]
    if materials:
        for i, m in enumerate(materials, 1):
            lines.append(f"\n--- 素材 {i} | {m['title']} (相关度 {m['score']}) ---")
            lines.append(m["text"])
    else:
        lines.append("\n（该账号下未检索到相关素材）")

    if pitfall:
        label = "⚠️ 避坑红线（写稿时严禁违反，不得作为正向素材引用）"
        if include_c_level:
            label += " / C级反面案例"
        lines.append(f"\n\n【{label}】")
        lines.append(pitfall)

    return "\n".join(lines)


def retrieve_bundle(platform: str, account: str, query: str, top_k: int = 8,
                    root: str = "/data/vault", track: Optional[str] = None,
                    include_c_level: bool = False) -> dict:
    """一次搞定：检索素材+读避坑+拼上下文（全流程只做一遍向量化）。
    返回 {materials, pitfall, context}，供 /api/vault/retrieve 直接使用。
    include_c_level=True 时额外加载 C级避坑清单（按需，避免自动注入膨胀）。"""
    mats = retrieve(platform, account, query, top_k=top_k, root=root, track=track)
    pit = retrieve_pitfall(platform, account, root=root, track=track,
                           include_c_level=include_c_level)
    return {"materials": mats, "pitfall": pit,
            "context": compose_context(mats, pit, include_c_level=include_c_level)}


def assemble_context(platform: str, account: str, query: str,
                    root: str = "/data/vault", track: Optional[str] = None,
                    top_k: int = 8) -> str:
    """保留兼容：给定查询，一条龙产出写稿上下文（不含 C级）。"""
    return retrieve_bundle(platform, account, query, top_k=top_k, root=root, track=track,
                           include_c_level=False)["context"]



def tree(root: str = "/data/vault") -> list[dict]:
    """素材库完整结构：平台 -> 账号 -> 文件（标注 pitfall/material）。供前端 素材库 页面展示。"""
    label = {v: k for k, v in PLATFORM_FOLDER.items()}
    result = []
    known = set(PLATFORM_FOLDER.values())
    root_path = Path(root)
    if not root_path.exists():
        return result
    for pf in sorted(p for p in root_path.iterdir() if p.is_dir()):
        if pf.name not in known:
            continue
        accounts = []
        for acc in sorted(a for a in pf.iterdir() if a.is_dir()):
            files = []
            for md in sorted(acc.rglob("*.md")):
                rel = str(md.relative_to(acc))
                is_pit = md.name in _ALL_PITFALL_FILES or any(k in md.name for k in ("避坑", "红线", "C级"))
                files.append({"name": md.name, "rel": rel, "kind": ("pitfall" if is_pit else "material"), "size": md.stat().st_size})
            accounts.append({"account": acc.name, "files": files})
        result.append({"platform": label.get(pf.name, pf.name), "folder": pf.name, "accounts": accounts})
    return result

if __name__ == "__main__":
    import sys
    plat, acc, q = sys.argv[1], sys.argv[2], sys.argv[3]
    rt = sys.argv[4] if len(sys.argv) > 4 else "/data/vault"
    trk = sys.argv[5] if len(sys.argv) > 5 else None
    print("== 账号列表 ==")
    print("  " + " / ".join(list_accounts(plat, root=rt)) or "(无)")
    res = retrieve(plat, acc, q, root=rt, track=trk)
    print(f"\n平台={plat} 账号={acc} 赛道={trk} 查询={q} 命中={len(res)}")
    for r in res:
        print(f"  [{r['score']}] {r['title'][:30]}  <- {r['source'].split('/')[-1]}")
        print("     " + r["text"][:80].replace("\n", " "))
    pit = retrieve_pitfall(plat, acc, root=rt, track=trk, include_c_level=False)
    if pit:
        print(f"\n避坑红线预览({len(pit)}字): {pit[:120]}")
