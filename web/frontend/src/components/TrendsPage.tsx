import { useState, useEffect, useCallback } from 'react';
import { fetchTrends, createIdea } from '../lib/api';
import type { TrendGroup } from '../lib/api';
import { IconFire, IconRefresh, IconBookmark, IconCheck } from './icons';

interface TrendsPageProps {
  onUseTopic: (title: string) => void;   // 一键做成内容 → 跳 chat
}

const ALL_PLATFORMS: { key: string; label: string }[] = [
  // 媒体
  { key: 'tgm_bilibili',    label: 'B站' },
  { key: 'tgm_douyin',      label: '抖音' },
  { key: 'tgm_youtube',     label: 'YouTube' },
  // 羊毛（豆瓣组）
  { key: 'tgm_maizu',       label: '豆瓣组·买' },
  { key: 'tgm_pinzu',       label: '豆瓣组·拼' },
  { key: 'tgm_aimao',       label: '豆瓣组·爱猫生活' },
  { key: 'tgm_zaopen',      label: '豆瓣组·爱猫澡盆' },
  // 副业
  { key: 'tgm_2libra_fuye', label: '2Libra·副业' },
  { key: 'tgm_v2ex_fuye',   label: 'V2EX·副业' },
  { key: 'tgm_midfun_fuye', label: 'MiddleFun·副业' },
  { key: 'tgm_woshipm_cy',  label: '人人都是产品经理·创业学院' },
  { key: 'tgm_woshipm_yx',  label: '人人都是产品经理·营销推广' },
  { key: 'tgm_lipusiwei',   label: '离谱思维' },
  // AI
  { key: 'tgm_agjj',        label: 'AI工具集·快讯' },
  { key: 'tgm_aihub',       label: 'AIHub·资讯' },
  { key: 'tgm_36keai',      label: '36氪·AI' },
  { key: 'tgm_aitnt',       label: 'AITNT·AI' },
  { key: 'tgm_taimei',      label: '钛媒体·AI' },
  { key: 'tgm_oschina',     label: 'OSChina·AI' },
  { key: 'tgm_hyper',       label: 'Hyper·AI' },
  { key: 'tgm_appinn',      label: 'Appinn·AI' },
  { key: 'tgm_2libra_ai',   label: '2Libra·AI' },
  // GitHub
  { key: 'tgm_gh_daily',    label: 'GitHub·Trending今日' },
  { key: 'tgm_gh_weekly',   label: 'GitHub·Trending本周' },
  { key: 'tgm_gh_day',      label: 'GitHub·新仓库日Star' },
  { key: 'tgm_gh_all',      label: 'GitHub·Star总榜' },
  // 糖果指数
  { key: 'tgm_dubang',      label: '糖果梦·毒榜' },
  { key: 'tgm_tg_sideline', label: '糖果梦·副业' },
];

export default function TrendsPage({ onUseTopic }: TrendsPageProps) {
  const [selected, setSelected] = useState<string[]>(['tgm_maizu', 'tgm_aimao', 'tgm_agjj', 'tgm_gh_daily']);
  const [groups, setGroups] = useState<TrendGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(0);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const save = async (title: string, source: string) => {
    if (saved.has(title)) return;
    try {
      await createIdea({ title, source: `${source}热搜`, status: 'pending' });
      setSaved((prev) => new Set(prev).add(title));
    } catch { /* ignore */ }
  };

  const load = useCallback((pfs: string[]) => {
    if (pfs.length === 0) { setGroups([]); return; }
    setLoading(true);
    setError('');
    fetchTrends(pfs.join(','), 100)
      .then((d) => { setGroups(d.trends); setUpdated(d.updated); })
      .catch(() => setError('热点拉取失败——请确认已配置外网代理（EASEL_PROXY）。'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(selected); }, [load, selected]);

  const toggle = (k: string) =>
    setSelected((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);

  return (
    <div className="page-scroll trends-page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><IconFire size={22} /> 热点雷达</h1>
          <p className="page-subtitle">
            多平台实时热搜，挑值得蹭的选题，一键交给 AI 做成你的内容。
            {updated > 0 && <span style={{ color: 'var(--text-tertiary)' }}> · {new Date(updated * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新</span>}
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => load(selected)} disabled={loading}>
          <IconRefresh size={14} /> {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      <div className="trend-platforms">
        {ALL_PLATFORMS.map((p) => (
          <button key={p.key} className={`chip ${selected.includes(p.key) ? 'active' : ''}`}
            onClick={() => toggle(p.key)}>{p.label}</button>
        ))}
      </div>

      {error && <div className="notice-error">{error}</div>}

      <div className="trend-grid">
        {groups.map((g) => (
          <div key={g.platform} className="card trend-col">
            <div className="trend-col-head">{g.label}<span className="trend-count">{g.items.length}</span></div>
            <div className="trend-list">
              {g.items.length === 0 && !loading && (
                <div className="trend-empty">
                  {g.ok === false ? '该平台暂时取不到（数据源不可用）' : '暂无数据'}
                </div>
              )}
              {g.items.map((it, i) => (
                <div key={i} className="trend-item">
                  <span className={`trend-rank ${i < 3 ? 'top' : ''}`}>{i + 1}</span>
                  <div className="trend-main">
                    <a className="trend-title" href={it.url || undefined} target="_blank" rel="noreferrer"
                      title={it.title}>{it.title}</a>
                    {it.hot && <span className="trend-hot">{it.hot}</span>}
                  </div>
                  <button className="trend-save" title={saved.has(it.title) ? '已收藏到选题库' : '收藏到选题库'}
                    onClick={() => save(it.title, g.label)}>
                    {saved.has(it.title) ? <IconCheck size={14} /> : <IconBookmark size={14} />}
                  </button>
                  <button className="trend-use" title="做成内容"
                    onClick={() => onUseTopic(it.title)}>做内容</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
