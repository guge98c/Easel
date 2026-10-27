import { useEffect, useState } from 'react';
import { fetchAizcPick, type AizcPickItem } from '../lib/api';
import { IconFire } from './icons';

interface AizcRailProps {
  activeSn: string;
  refreshToken: number;
  onPick: (item: AizcPickItem) => void;
}

type StatusFilter = '待拆' | '已拆' | '全部';

/** 爆款库左栏：Aizc_pick.csv 的货架（情报+进度），点一条把正文+情报喂给右侧拆解引擎。 */
export default function AizcRail({ activeSn, refreshToken, onPick }: AizcRailProps) {
  const [items, setItems] = useState<AizcPickItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('待拆');
  const [q, setQ] = useState('');

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
  };

  useEffect(() => { load(); }, [refreshToken]);

  const keyword = q.trim();
  const shown = items.filter(it =>
    (filter === '全部' || it.status === filter) &&
    (!keyword || (it.title + it.account + it.reason).includes(keyword)));
  const pending = items.filter(it => it.status === '待拆').length;

  return (
    <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '72vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><IconFire size={13} /> 我的爆款库</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>待拆 {pending}</span>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }}
          onClick={load} title="重新读取 Aizc_pick.csv">↻ 刷新</button>
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
      {!loading && shown.map(it => (
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
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
            {it.status}{it.hasBody ? '' : '（无正文）'}
          </div>
        </button>
      ))}
    </div>
  );
}
