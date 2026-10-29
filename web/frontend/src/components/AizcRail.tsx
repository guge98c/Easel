import { useEffect, useState } from 'react';
import { fetchAizcPick, fetchAizcAutoStatus, triggerAizcAuto, fetchAizcPitfall, fetchAizcRetention,
  type AizcPickItem, type AizcAutoStatus, type PitfallResponse, type RetentionItem } from '../lib/api';
import { IconFire } from './icons';

interface AizcRailProps {
  activeSn: string;
  refreshToken: number;
  onPick: (item: AizcPickItem) => void;
}

type StatusFilter = '待拆' | '已拆' | '全部';

/** 状态标签：拆解中=蓝、失败=红、已拆/不拆=灰，其余默认。 */
const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  '待拆': { color: 'var(--fg)', label: '待拆' },
  '拆解中': { color: '#3b82f6', label: '拆解中' },
  '拆解失败': { color: '#ef4444', label: '拆解失败' },
  '已拆': { color: '#9ca3af', label: '已拆' },
  '不拆': { color: '#9ca3af', label: '不拆' },
};

/** 爆款库左栏：Aizc_pick.csv 的货架（情报+进度），点一条把正文+情报喂给右侧拆解引擎。 */
export default function AizcRail({ activeSn, refreshToken, onPick }: AizcRailProps) {
  const [items, setItems] = useState<AizcPickItem[]>([]);
  const [auto, setAuto] = useState<AizcAutoStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('待拆');
  const [q, setQ] = useState('');
  // 避坑红线（C级）+ 腰部留存（A/B级）—— 2026-10-29 追加
  const [pitfall, setPitfall] = useState<PitfallResponse | null>(null);
  const [retention, setRetention] = useState<{ a: RetentionItem[]; b: RetentionItem[] } | null>(null);
  const [showPitfall, setShowPitfall] = useState(false);
  const [showRetention, setShowRetention] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const d = await fetchAizcPick();
      setItems(d.items || []);
      if (d.error) setError(d.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载爆款库失败');
    } finally {
      setLoading(false);
    }
    try { setPitfall(await fetchAizcPitfall()); } catch { /* 忽略 */ }
    try { setRetention(await fetchAizcRetention()); } catch { /* 忽略 */ }
  };

  const loadAuto = async () => {
    try {
      setAuto(await fetchAizcAutoStatus());
    } catch { /* 状态接口失败不打断列表 */ }
  };

  // 刷新信号（手动标记/外部）触发一次全量刷新
  useEffect(() => { load(); loadAuto(); }, [refreshToken]);

  // 自动拆解运行中：8s 轮询状态与列表（拆解中→已拆 自动变化）
  useEffect(() => {
    if (!auto?.running && !auto?.current?.sn) return;
    const t = window.setInterval(() => { load(); loadAuto(); }, 8000);
    return () => window.clearInterval(t);
  }, [auto?.running, auto?.current?.sn]);

  const trigger = async () => {
    try {
      await triggerAizcAuto();
      setTimeout(() => { loadAuto(); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '触发自动拆解失败');
    }
  };

  const keyword = q.trim();
  const inPending = (st: string) => st === '待拆' || st === '拆解中' || st === '拆解失败';
  const shown = items.filter(it =>
    (filter === '全部' || (filter === '待拆' ? inPending(it.status) : (it.status === '已拆' || it.status === '不拆'))) &&
    (!keyword || (it.title + it.account + it.reason).includes(keyword)));
  const pending = items.filter(it => inPending(it.status)).length;
  const running = auto?.running || !!auto?.current?.sn;
  const failCount = auto?.counts?.['拆解失败'] || 0;

  return (
    <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '72vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><IconFire size={13} /> 我的爆款库</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>待拆 {pending}</span>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }}
          onClick={load} title="重新读取 Aizc_pick.csv">↻ 刷新</button>
      </div>
      {/* 自动拆解状态条 */}
      <div className="panel" style={{ padding: '8px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {running ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#3b82f6' }}>
              拆解中：{auto?.current?.title || '…'}
            </span>
          </span>
        ) : (
          <span style={{ flex: 1, minWidth: 0, opacity: 0.8 }}>
            自动拆解{auto?.sleeping === false ? '未启动' : '待命中'}
            {failCount > 0 ? `，失败 ${failCount} 篇待重试` : ''}
          </span>
        )}
        <button className="btn" style={{ padding: '2px 10px', fontSize: 12, flexShrink: 0 }} onClick={trigger} disabled={running}>
          {running ? '…' : '立即拆解'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {(['待拆', '已拆', '全部'] as StatusFilter[]).map(f => (
          <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <input className="field" style={{ padding: '2px 8px', fontSize: 12, flex: 1, minWidth: 0 }}
          placeholder="搜标题/账号/爆因" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {loading && <div className="loading" style={{ padding: 16 }}><div className="spinner" />加载中…</div>}
      {!loading && error && (
        <div className="panel" style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>
          {error}
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            先在 Windows 跑完采集+分级管道，并确认 NAS compose 已挂载 aizc 目录（AIZC_PICK_DIR）。
          </div>
        </div>
      )}
      {!loading && !error && shown.length === 0 && (
        <div style={{ fontSize: 12, opacity: 0.6, padding: 8 }}>
          暂无条目。跑完管道、等目录同步后点「刷新」。
        </div>
      )}
      {!loading && shown.map(it => {
        const st = STATUS_STYLE[it.status] || { color: 'var(--fg)', label: it.status };
        return (
          <button key={it.sn || it.url} className="panel" onClick={() => onPick(it)}
            style={{ textAlign: 'left', padding: 8, cursor: 'pointer',
              border: activeSn === it.sn ? '1.5px solid currentColor' : undefined }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, marginBottom: 4 }}>{it.title}</div>
            <div style={{ fontSize: 11.5, opacity: 0.75, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <span>{it.account}</span>
              {it.articleGrade && <span>文章{it.articleGrade}</span>}
              {it.accountGrade && <span>账号{it.accountGrade}</span>}
              {it.reason && <span>{it.reason}</span>}
              {it.interactionRate && <span>互动{it.interactionRate}</span>}
              {it.collectRate && <span>收藏{it.collectRate}</span>}
            </div>
            <div style={{ fontSize: 11, marginTop: 4, color: st.color }}>
              {st.label}{it.hasBody ? '' : '（无正文）'}
            </div>
          </button>
        );
      })}
      {/* 避坑红线（C级）+ 腰部留存（A/B级）：写作前对照自查 + 已验证腰部池 */}
      {pitfall && pitfall.found && (
        <div className="panel" style={{ padding: '8px 10px', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => setShowPitfall((v) => !v)}>
            <span style={{ fontWeight: 600, color: '#ef4444' }}>⚠ 避坑红线（C级）</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{showPitfall ? '▲' : '▼'}</span>
          </div>
          {showPitfall && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.9 }}>
              {pitfall.items.map((it, i) => (
                <div key={i} style={{ lineHeight: 1.4 }}>· {it}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {retention && (retention.a.length > 0 || retention.b.length > 0) && (
        <div className="panel" style={{ padding: '8px 10px', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => setShowRetention((v) => !v)}>
            <span style={{ fontWeight: 600, color: '#3b82f6' }}>腰部留存（A/B 已发布样本）</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{showRetention ? '▲' : '▼'}</span>
          </div>
          {showRetention && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {retention.a.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, opacity: 0.8 }}>A 级（选题被验证）</div>
                  {retention.a.slice(0, 6).map((r, i) => (
                    <div key={i} style={{ lineHeight: 1.4, opacity: 0.9 }}>
                      · {r.标题}（阅读 {r.阅读数}）
                    </div>
                  ))}
                </div>
              )}
              {retention.b.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, opacity: 0.8 }}>B 级（观察池）</div>
                  {retention.b.slice(0, 6).map((r, i) => (
                    <div key={i} style={{ lineHeight: 1.4, opacity: 0.9 }}>
                      · {r.标题}（阅读 {r.阅读数}）
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
