import { useState, useEffect } from 'react';
import {
  runAgent, createIdea, fetchAizcArticle, markAizc,
  fetchMaterialTitles, fetchMaterialSnippets, fetchMaterialStats, ingestMaterials,
  type AizcPickItem, type TitleItem, type SnippetItem, type MaterialStats,
} from '../lib/api';
import { renderMarkdown } from '../lib/sanitize';
import { IconFire, IconIdea, IconSkills } from './icons';
import AizcRail from './AizcRail';

interface BreakdownPageProps {
  persona: string;
}

export default function BreakdownPage({ persona }: BreakdownPageProps) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  // Aizc 爆款库：当前选中爆款（选中后正文灌入输入框、情报拼进提示词）
  const [active, setActive] = useState<AizcPickItem | null>(null);
  const [railRefresh, setRailRefresh] = useState(0);

  const pickArticle = async (it: AizcPickItem) => {
    setActive(it);
    setResult('');
    setInput('');
    try {
      const d = await fetchAizcArticle(it.sn);
      setInput(d.item.body || '');
      if (!d.item.body) setToast('该条目暂无正文，可手动粘贴内容');
    } catch (e) {
      setToast(e instanceof Error ? e.message : '取正文失败，可手动粘贴内容');
    } finally {
      setTimeout(() => setToast(''), 2600);
    }
  };

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true); setResult('');
    const intel = active
      ? `【爆款情报卡】账号：${active.account}` +
        `${active.accountGrade ? `（账号档位 ${active.accountGrade}）` : ''}` +
        `${active.articleGrade ? `｜文章档位 ${active.articleGrade}` : ''}` +
        `｜爆因：${active.reason || '未标注'}` +
        `${active.interactionRate ? `｜互动率 ${active.interactionRate}` : ''}` +
        `${active.collectRate ? `｜收藏率 ${active.collectRate}` : ''}` +
        `${active.reads ? `｜阅读 ${active.reads}` : ''}` +
        `${active.publishTime ? `｜发布 ${active.publishTime}` : ''}\n`
      : '';
    const prompt =
      `你是爆款内容拆解专家。拆解下面这条内容，用中文分点输出：\n` +
      `1. **一句话概括**\n` +
      `2. **钩子拆解**：开头为什么抓人\n` +
      `3. **结构套路**：分段/节奏/信息编排\n` +
      `4. **为什么会火**：情绪/共鸣/实用/争议点${active ? '（结合上方情报卡的爆因与互动数据）' : ''}\n` +
      `5. **可复制模板**：把套路抽象成我能直接套用的结构框架\n` +
      `6. **借这个套路${persona ? `、结合我的画像「${persona}」` : ''}可做的 3 个选题**\n\n` +
      `${intel}待拆解内容：\n${input}`;
    try {
      const res = await runAgent(prompt, persona);
      setResult(res.response);
    } catch (e) {
      setResult(e instanceof Error ? e.message : '拆解失败，请重试');
    } finally { setLoading(false); }
  };

  const saveToIdeas = async () => {
    if (!result) return;
    const firstLine = input.trim().split('\n')[0].slice(0, 24);
    await createIdea({
      title: active ? `拆解：${active.account}《${active.title.slice(0, 24)}》` : `拆解模板：${firstLine}`,
      note: active ? `${result}\n\n---\n来源：${active.account} ${active.url}` : result,
      source: active ? 'Aizc爆款库' : '爆款拆解',
      status: 'pending',
    });
    setToast('已存入选题库');
    setTimeout(() => setToast(''), 2200);
  };

  const markDone = async () => {
    if (!active) return;
    try {
      await markAizc(active.sn, '已拆');
      setToast('已标记为已拆');
      setRailRefresh(n => n + 1);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '标记失败，请重试');
    } finally {
      setTimeout(() => setToast(''), 2200);
    }
  };

  // ── 素材库（标题库 + 金句/切片库）：拆解副产品，自动归档，可筛选 ──
  const [titles, setTitles] = useState<TitleItem[]>([]);
  const [snippets, setSnippets] = useState<SnippetItem[]>([]);
  const [stats, setStats] = useState<MaterialStats | null>(null);
  const [tQuery, setTQuery] = useState('');
  const [tFormula, setTFormula] = useState('');
  const [sQuery, setSQuery] = useState('');
  const [sType, setSType] = useState('');
  const [matLoading, setMatLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);

  const loadMaterials = async () => {
    setMatLoading(true);
    try {
      const [t, s, st] = await Promise.all([
        fetchMaterialTitles(tQuery, tFormula),
        fetchMaterialSnippets(sQuery, sType),
        fetchMaterialStats(),
      ]);
      setTitles(t.items); setSnippets(s.items); setStats(st);
    } catch {
      /* 素材库读失败不打断拆解主流程 */
    } finally {
      setMatLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tQuery, tFormula, sQuery, sType]);

  const runIngest = async () => {
    setIngesting(true);
    try {
      const r = await ingestMaterials();
      await loadMaterials();
      setToast(`已补录 ${r.reports} 份报告（标题 +${r.titles} / 切片 +${r.snippets}）`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '补录失败');
    } finally {
      setIngesting(false);
      setTimeout(() => setToast(''), 2600);
    }
  };

  return (
    <div className="page-scroll breakdown-page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><IconFire size={21} /> 爆款拆解</h1>
          <p className="page-subtitle">贴一条对标/爆款内容，AI 拆出钩子、结构、火的原因，并给你可复制的模板与选题。</p>
        </div>
      </div>

      <div className="breakdown-body" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <AizcRail activeSn={active?.sn || ''} refreshToken={railRefresh} onPick={pickArticle} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea className="field" style={{ minHeight: 160 }} value={input}
            placeholder="左侧点一条爆款自动灌入正文，或把对标账号的爆款文案粘贴进来…"
            onChange={(e) => setInput(e.target.value)} />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={loading || !input.trim()} onClick={run}>
              <IconSkills size={15} /> {loading ? '拆解中…' : '开始拆解'}
            </button>
            {result && <button className="btn" onClick={saveToIdeas}><IconIdea size={14} /> 存入选题库</button>}
            {active && result && !loading && (
              <button className="btn" onClick={markDone} title="记录到 Easel 侧进度（不改动 CSV）">标记已拆</button>
            )}
            {result && <button className="btn btn-ghost" onClick={() => { setResult(''); setInput(''); }}>清空</button>}
          </div>

          {loading && <div className="loading" style={{ padding: 40 }}><div className="spinner" />AI 正在拆解…</div>}
          {result && !loading && (
            <div className="panel" style={{ marginTop: 18 }}>
              <div className="panel-title"><IconFire size={14} /> 拆解结果</div>
              <div className="skill-body-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(result) }} />
            </div>
          )}
        </div>
      </div>

      {/* 素材库：标题库 + 金句/切片库（拆解副产品，行业素材分层） */}
      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <span><IconIdea size={14} /> 素材库（拆解自动归档）{matLoading && <span style={{ color: '#6b7280', fontSize: 11 }}> 刷新中…</span>}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" onClick={loadMaterials} disabled={matLoading}>刷新</button>
            <button className="btn btn-ghost" onClick={runIngest} disabled={ingesting}>{ingesting ? '补录中…' : '补录历史报告'}</button>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {/* 标题库 */}
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>标题库（{stats?.titles_total ?? 0}）</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="field" placeholder="搜标题…" value={tQuery} onChange={e => setTQuery(e.target.value)} style={{ flex: 1 }} />
              <select className="field" value={tFormula} onChange={e => setTFormula(e.target.value)} style={{ width: 116 }}>
                <option value="">全部公式</option>
                {Object.entries(stats?.title_formulas || {}).map(([k, v]) => (
                  <option key={k} value={k}>{k}({v})</option>
                ))}
              </select>
            </div>
            {titles.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 12.5, padding: '8px 2px' }}>暂无标题（拆解完成后自动入库，可点「补录历史报告」）</div>
            ) : (
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                {titles.map(t => (
                  <div key={t.id} style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 2px', fontSize: 12.5 }}>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div style={{ color: '#6b7280', marginTop: 1 }}>
                      <span style={{ background: '#fff7ed', borderRadius: 6, padding: '0 6px', fontSize: 11, color: '#c2410c' }}>{t.formula}</span>
                      {' '}{t.account}{t.reads ? `｜阅读 ${t.reads}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* 金句/切片库 */}
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>金句/切片库（{stats?.snippets_total ?? 0}）</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="field" placeholder="搜切片…" value={sQuery} onChange={e => setSQuery(e.target.value)} style={{ flex: 1 }} />
              <select className="field" value={sType} onChange={e => setSType(e.target.value)} style={{ width: 116 }}>
                <option value="">全部类型</option>
                {Object.entries(stats?.snippet_types || {}).map(([k, v]) => (
                  <option key={k} value={k}>{k}({v})</option>
                ))}
              </select>
            </div>
            {snippets.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 12.5, padding: '8px 2px' }}>暂无切片（拆解完成后自动入库）</div>
            ) : (
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                {snippets.map(s => (
                  <div key={s.id} style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 2px', fontSize: 12.5 }}>
                    <span style={{ background: '#eef2ff', borderRadius: 6, padding: '0 6px', fontSize: 11, color: '#4338ca' }}>{s.type}</span>{' '}
                    <span>{s.content}</span>
                    <div style={{ color: '#6b7280', marginTop: 2, fontSize: 11.5 }}>来源：{s.source_title || s.account}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="toast ok"><span className="toast-icon">✓</span>{toast}</div>}
    </div>
  );
}
