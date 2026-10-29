import { useEffect, useState } from 'react';
import {
  importBenchmark, fetchBenchmarkAccounts, fetchBenchmarkAccount, analyzeBenchmarkAccount,
  type BenchmarkAccount, type BenchmarkAccountDetail, type BenchmarkWork,
} from '../lib/api';
import { IconRadar, IconRefresh, IconSkills } from './icons';

/** 对标雷达（存量版）：从 articles_records.csv 导入公众号对标账号 → 规则判定 → 作者分析。 */
export default function BenchmarkPage() {
  const [accounts, setAccounts] = useState<BenchmarkAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BenchmarkAccountDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [imported, setImported] = useState<string>('');

  const loadAccounts = async () => {
    setError('');
    try {
      const d = await fetchBenchmarkAccounts();
      setAccounts(d.accounts || []);
      if (!d.accounts?.length) setError('尚未导入对标账号，点「导入 articles_records.csv」建档');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载对标账号失败');
    }
  };

  useEffect(() => { loadAccounts(); }, []);

  const loadDetail = async (id: string) => {
    setActiveId(id);
    setDetail(null);
    try {
      setDetail(await fetchBenchmarkAccount(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载账号详情失败');
    }
  };

  const doImport = async () => {
    setBusy('import'); setError('');
    try {
      const r = await importBenchmark();
      setImported(`导入完成：${r.imported_accounts} 个账号、${r.imported_works} 条作品${r.skipped ? `（跳过 ${r.skipped} 条重复/无效）` : ''}`);
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败');
    } finally { setBusy(''); }
  };

  const doAnalyze = async (id: string) => {
    setAnalyzing(true); setError('');
    try {
      const a = await analyzeBenchmarkAccount(id);
      const d = await fetchBenchmarkAccount(id);
      setDetail(d);
      if (a.cached) setError('已使用缓存的分析结果（作品集未变化）');
    } catch (e) {
      setError(e instanceof Error ? e.message : '作者分析失败');
    } finally { setAnalyzing(false); }
  };

  const hotOf = (score: number, acct: BenchmarkAccount | null) =>
    acct && acct.threshold != null && score > 0 && score >= acct.threshold;

  return (
    <div className="benchmark-page" style={{ display: 'flex', gap: 14, padding: 14, minHeight: 0 }}>
      {/* 左栏：账号列表 */}
      <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '76vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><IconRadar size={13} /> 对标账号</strong>
          <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }}
            onClick={loadAccounts} title="重新读取">↻ 刷新</button>
        </div>
        <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={doImport} disabled={busy === 'import'}>
          {busy === 'import' ? '导入中…' : '导入 articles_records.csv'}
        </button>
        {imported && <div style={{ fontSize: 12, color: '#059669' }}>{imported}</div>}
        {!error && accounts.length === 0 && (
          <div style={{ fontSize: 12, opacity: 0.6, padding: 8 }}>暂无账号。跑完采集管道后点「导入」建档。</div>
        )}
        {accounts.map((a) => (
          <button key={a.id} className="panel" onClick={() => loadDetail(a.id)}
            style={{ textAlign: 'left', padding: 8, cursor: 'pointer',
              border: activeId === a.id ? '1.5px solid currentColor' : undefined }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
            <div style={{ fontSize: 11.5, opacity: 0.75, display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
              <span>作品 {a.works_count}</span>
              {a.hot_count > 0 && <span style={{ color: '#ef4444' }}>爆款 {a.hot_count}</span>}
              <span>中位分 {a.median_score}</span>
              <span>均分 {a.avg_score}</span>
            </div>
          </button>
        ))}
      </div>

      {/* 右栏：账号详情 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <div className="panel" style={{ padding: 10, fontSize: 12, opacity: 0.85 }}>{error}</div>}
        {!detail && !error && (
          <div className="dash-empty" style={{ padding: 40 }}>选择左侧账号查看作品与作者分析</div>
        )}
        {detail && (
          <>
            <div className="panel" style={{ padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{detail.name}</strong>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{detail.platform}</span>
                <button className="btn btn-primary" style={{ padding: '3px 12px', fontSize: 12, marginLeft: 'auto' }}
                  onClick={() => doAnalyze(detail.id)} disabled={analyzing}>
                  <IconSkills size={13} /> {analyzing ? '分析中…' : (detail.analysis ? '重新分析' : '作者分析')}
                </button>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <span>作品 {detail.works_count}</span>
                <span>中位分 {detail.median_score}</span>
                <span>均分 {detail.avg_score}</span>
                <span>爆款阈值 {detail.threshold ?? '—'}</span>
                <span style={{ color: '#ef4444' }}>爆款 {detail.hot_count}（{(detail.works_count ? Math.round(detail.hot_count / detail.works_count * 100) : 0)}%）</span>
              </div>
            </div>

            {detail.analysis && (
              <div className="panel" style={{ padding: 12 }}>
                <div className="panel-title"><IconRadar size={14} /> 作者分析 {detail.analysis.cached ? '（缓存）' : ''}</div>
                <div style={{ fontSize: 12.5, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div><b>赛道定位：</b>{detail.analysis.reading.positioning || '—'}</div>
                  <div><b>内容公式：</b>{detail.analysis.reading.content_formula || '—'}</div>
                  <div><b>优势：</b>{detail.analysis.reading.strengths?.join('；') || '—'}</div>
                  <div><b>短板：</b>{detail.analysis.reading.weaknesses?.join('；') || '—'}</div>
                  <div><b>可学：</b>{detail.analysis.reading.learn_from?.join('；') || '—'}</div>
                  <div><b>避免：</b>{detail.analysis.reading.avoid?.join('；') || '—'}</div>
                  <div style={{ opacity: 0.6, fontSize: 11 }}>{detail.analysis.engine} · 分析 {detail.analysis.metrics.works_analyzed} 条 · 爆款率 {detail.analysis.metrics.hot_ratio}% · 收藏率 {detail.analysis.metrics.collect_rate}%</div>
                </div>
              </div>
            )}

            {detail.works.length > 0 && (
              <div className="panel" style={{ padding: 12 }}>
                <div className="panel-title"><IconRefresh size={14} /> 作品明细（按阅读量降序）</div>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 6 }}>
                  <thead>
                    <tr style={{ opacity: 0.7, textAlign: 'left' }}>
                      <th style={{ padding: '4px 6px' }}>标题</th>
                      <th style={{ padding: '4px 6px' }}>发布</th>
                      <th style={{ padding: '4px 6px' }}>阅读</th>
                      <th style={{ padding: '4px 6px' }}>赞</th>
                      <th style={{ padding: '4px 6px' }}>评</th>
                      <th style={{ padding: '4px 6px' }}>藏</th>
                      <th style={{ padding: '4px 6px' }}>转发+在看</th>
                      <th style={{ padding: '4px 6px' }}>分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.works.slice(0, 20).map((w: BenchmarkWork) => (
                      <tr key={w.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 6px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a href={w.url} target="_blank" rel="noreferrer" style={{ color: 'var(--fg)' }}>{w.title}</a>
                        </td>
                        <td style={{ padding: '5px 6px', whiteSpace: 'nowrap', opacity: 0.7 }}>{w.published_at}</td>
                        <td style={{ padding: '5px 6px' }}>{w.plays}</td>
                        <td style={{ padding: '5px 6px' }}>{w.likes}</td>
                        <td style={{ padding: '5px 6px' }}>{w.comments}</td>
                        <td style={{ padding: '5px 6px' }}>{w.collects}</td>
                        <td style={{ padding: '5px 6px' }}>{w.shares}</td>
                        <td style={{ padding: '5px 6px', fontWeight: 700, color: hotOf(w.score, detail) ? '#ef4444' : undefined }}>
                          {w.score}{hotOf(w.score, detail) ? ' 🔥' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
