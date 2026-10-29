import { useState, useEffect, useCallback } from 'react';
import {
  fetchMaterialTitles, fetchMaterialSnippets, fetchMaterialStats, ingestMaterials,
  type TitleItem, type SnippetItem, type MaterialStats,
} from '../lib/api';
import { IconIdea } from './icons';

const chip = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', borderRadius: 999,
  padding: '1px 8px', fontSize: 11, fontWeight: 600, lineHeight: '18px', flexShrink: 0,
  background: bg, color: fg,
});

const card: React.CSSProperties = {
  position: 'relative', background: '#ffffff', border: '1px solid #e5e7eb',
  borderRadius: 10, padding: '10px 12px',
};

function hoverIn(e: React.MouseEvent<HTMLDivElement>) {
  e.currentTarget.style.borderColor = '#d1d5db';
  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.07)';
}
function hoverOut(e: React.MouseEvent<HTMLDivElement>) {
  e.currentTarget.style.borderColor = '#e5e7eb';
  e.currentTarget.style.boxShadow = 'none';
}

export default function MaterialsPanel() {
  const [titles, setTitles] = useState<TitleItem[]>([]);
  const [snippets, setSnippets] = useState<SnippetItem[]>([]);
  const [stats, setStats] = useState<MaterialStats | null>(null);
  const [tQuery, setTQuery] = useState('');
  const [tFormula, setTFormula] = useState('');
  const [sQuery, setSQuery] = useState('');
  const [sType, setSType] = useState('');
  const [matLoading, setMatLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [ingestMsg, setIngestMsg] = useState('');

  const loadMaterials = useCallback(async () => {
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
  }, [tQuery, tFormula, sQuery, sType]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  const runIngest = async () => {
    setIngesting(true);
    try {
      const r = await ingestMaterials();
      await loadMaterials();
      setIngestMsg(`已补录 ${r.reports} 份报告（标题 +${r.titles} / 切片 +${r.snippets}）`);
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : '补录失败');
    } finally {
      setIngesting(false);
      setTimeout(() => setIngestMsg(''), 3000);
    }
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 1500);
    } catch {
      /* 非安全上下文剪贴板不可用时静默忽略 */
    }
  };

  const copyBtn = (active: boolean): React.CSSProperties => ({
    border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 4px',
    fontSize: 11.5, fontWeight: 600, color: active ? '#16a34a' : '#9ca3af',
  });

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <span><IconIdea size={14} /> 素材库（拆解自动归档）{matLoading && <span style={{ color: '#6b7280', fontSize: 11 }}> 刷新中…</span>}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={loadMaterials} disabled={matLoading}>刷新</button>
          <button className="btn btn-ghost" onClick={runIngest} disabled={ingesting}>{ingesting ? '补录中…' : '补录历史报告'}</button>
        </span>
      </div>

      {ingestMsg && (
        <div style={{ fontSize: 12, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', marginBottom: 12 }}>
          ✓ {ingestMsg}
        </div>
      )}

      {/* 统计：总量 + 公式分布 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={chip('#f3f4f6', '#374151')}>标题 {stats?.titles_total ?? 0}</span>
        <span style={chip('#f3f4f6', '#374151')}>金句/切片 {stats?.snippets_total ?? 0}</span>
        {Object.entries(stats?.title_formulas || {}).map(([k, v]) => (
          <span key={k} style={chip('#fff7ed', '#c2410c')}>{k} · {v}</span>
        ))}
        {Object.entries(stats?.snippet_types || {}).map(([k, v]) => (
          <span key={k} style={chip('#eef2ff', '#4338ca')}>{k} · {v}</span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {/* 标题库 */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: '#111827' }}>标题库（{stats?.titles_total ?? 0}）</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input className="field" placeholder="搜标题…" value={tQuery} onChange={e => setTQuery(e.target.value)} style={{ flex: 1 }} />
            <select className="field" value={tFormula} onChange={e => setTFormula(e.target.value)} style={{ width: 116 }}>
              <option value="">全部公式</option>
              {Object.entries(stats?.title_formulas || {}).map(([k, v]) => (
                <option key={k} value={k}>{k}({v})</option>
              ))}
            </select>
          </div>
          {titles.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 12.5, padding: '18px 2px', textAlign: 'center' }}>暂无标题（拆解完成后自动入库，可点「补录历史报告」）</div>
          ) : (
            <div style={{ maxHeight: 380, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '2px' }}>
              {titles.map(t => (
                <div key={t.id} style={card} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ ...chip('#fff7ed', '#c2410c'), marginTop: 2 }}>{t.formula || '未标注'}</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.55 }}>{t.title}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                    <div style={{ fontSize: 11.5, color: '#9ca3af' }}>{t.account}{t.reads ? ` · 阅读 ${t.reads}` : ''}</div>
                    <button style={copyBtn(copiedId === t.id)} onClick={() => copy(t.title, t.id)}>
                      {copiedId === t.id ? '✓ 已复制' : '复制'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 金句/切片库 */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: '#111827' }}>金句/切片库（{stats?.snippets_total ?? 0}）</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input className="field" placeholder="搜切片…" value={sQuery} onChange={e => setSQuery(e.target.value)} style={{ flex: 1 }} />
            <select className="field" value={sType} onChange={e => setSType(e.target.value)} style={{ width: 116 }}>
              <option value="">全部类型</option>
              {Object.entries(stats?.snippet_types || {}).map(([k, v]) => (
                <option key={k} value={k}>{k}({v})</option>
              ))}
            </select>
          </div>
          {snippets.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 12.5, padding: '18px 2px', textAlign: 'center' }}>暂无切片（拆解完成后自动入库）</div>
          ) : (
            <div style={{ maxHeight: 380, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '2px' }}>
              {snippets.map(s => (
                <div key={s.id} style={card} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ ...chip('#eef2ff', '#4338ca'), marginTop: 2 }}>{s.type || '金句'}</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{s.content}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                    <div style={{ fontSize: 11.5, color: '#9ca3af' }}>来源：{s.source_title || s.account}</div>
                    <button style={copyBtn(copiedId === s.id)} onClick={() => copy(s.content, s.id)}>
                      {copiedId === s.id ? '✓ 已复制' : '复制'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
