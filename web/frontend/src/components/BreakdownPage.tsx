import { useState } from 'react';
import { runAgent, createIdea, fetchAizcArticle, markAizc, type AizcPickItem } from '../lib/api';
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

      {toast && <div className="toast ok"><span className="toast-icon">✓</span>{toast}</div>}
    </div>
  );
}
