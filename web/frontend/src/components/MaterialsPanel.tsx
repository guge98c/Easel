import { useState, useEffect, useCallback } from 'react';
import {
  listVaultTree, fetchVaultFile,
  type VaultPlatformNode, type VaultFileNode,
} from '../lib/api';
import { IconLayers, IconIdea } from './icons';

const pill = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', borderRadius: 999,
  padding: '1px 8px', fontSize: 11, fontWeight: 600, lineHeight: '18px', flexShrink: 0,
  background: bg, color: fg,
});

const card: React.CSSProperties = {
  background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 12, padding: '12px 14px',
};

function hoverIn(e: React.MouseEvent<HTMLDivElement>) {
  e.currentTarget.style.borderColor = 'var(--accent-end, #4338ca)';
  e.currentTarget.style.boxShadow = '0 2px 10px rgba(67,56,202,.10)';
}
function hoverOut(e: React.MouseEvent<HTMLDivElement>) {
  e.currentTarget.style.borderColor = 'var(--border, #e5e7eb)';
  e.currentTarget.style.boxShadow = 'none';
}

export default function MaterialsPanel() {
  const [tree, setTree] = useState<VaultPlatformNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [openAcc, setOpenAcc] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<{ platform: string; account: string; file: VaultFileNode } | null>(null);
  const [content, setContent] = useState('');
  const [loadingFile, setLoadingFile] = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await listVaultTree();
      if (r.error) setErr(r.error as string);
      setTree(r.tree || []);
    } catch (e) {
      setErr('读取素材库失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openFile = async (platform: string, account: string, file: VaultFileNode) => {
    setSel({ platform, account, file });
    setLoadingFile(true); setContent('');
    try {
      const r = await fetchVaultFile(platform, account, file.rel);
      setContent(r.content || '（空文件）');
    } catch (e) {
      setContent('读取失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoadingFile(false);
    }
  };

  const toggleAcc = (key: string) => setOpenAcc((m) => ({ ...m, [key]: !m[key] }));

  const wrap: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)', gap: 16,
    alignItems: 'start',
  };
  const fileRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8,
    cursor: 'pointer', fontSize: 13, border: '1px solid transparent',
  };

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary, #555)' }}>
          这是你的 <b>Obsidian 素材库</b>（挂载进容器的只读副本）。每个账号下都含素材 .md，以及两份硬性红线：
          <span style={{ ...pill('#fef2f2', '#b91c1c'), margin: '0 4px' }}>避坑红线.md</span>
          <span style={{ ...pill('#fef2f2', '#b91c1c'), margin: '0 4px' }}>C级避坑清单.md</span>
          —— AI 写稿时会强制带入，且绝不当成正向素材。
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading} style={{ flexShrink: 0 }}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {err && (
        <div style={{ fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          ⚠ {err}
        </div>
      )}

      {!loading && !err && tree.length === 0 && (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 4px', textAlign: 'center' }}>
          素材库为空。请在 Obsidian 的 vault 里建 <code>Gzh/&lt;账号&gt;/</code> 文件夹并放入 .md 素材。
        </div>
      )}

      <div style={wrap}>
        {/* 左：目录树 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tree.map((pf) => (
            <div key={pf.folder} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <IconLayers size={16} />
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong, #111827)' }}>{pf.platform}</span>
                <span style={{ ...pill('#eef2ff', '#4338ca') }}>{pf.folder}</span>
                <span style={{ fontSize: 11.5, color: '#9ca3af' }}>{pf.accounts.length} 个账号</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pf.accounts.map((acc) => {
                  const key = pf.folder + '/' + acc.account;
                  const open = !!openAcc[key];
                  const pitCnt = acc.files.filter((f) => f.kind === 'pitfall').length;
                  const matCnt = acc.files.length - pitCnt;
                  return (
                    <div key={key} style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, overflow: 'hidden' }}>
                      <div
                        onClick={() => toggleAcc(key)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: 'pointer', background: 'var(--surface-2, #f9fafb)' }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-strong, #111827)', flex: 1 }}>{acc.account}</span>
                        <span style={{ ...pill('#f3f4f6', '#374151') }}>素材 {matCnt}</span>
                        <span style={{ ...pill('#fef2f2', '#b91c1c') }}>避坑 {pitCnt}</span>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{open ? '▾' : '▸'}</span>
                      </div>
                      {open && (
                        <div style={{ padding: '6px 8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {acc.files.map((f) => {
                            const active = sel && sel.account === acc.account && sel.file.rel === f.rel;
                            return (
                              <div
                                key={f.rel}
                                onClick={() => openFile(pf.folder === 'Gzh' ? '公众号' : pf.platform, acc.account, f)}
                                onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                                style={{
                                  ...fileRow,
                                  background: active ? 'var(--accent-soft, #eef2ff)' : 'transparent',
                                  borderColor: active ? 'var(--accent-end, #4338ca)' : 'transparent',
                                }}
                              >
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                {f.kind === 'pitfall'
                                  ? <span style={{ ...pill('#fef2f2', '#b91c1c') }}>⚠ 避坑</span>
                                  : <span style={{ ...pill('#f3f4f6', '#6b7280') }}>素材</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 右：文件正文预览 */}
        <div style={{ ...card, minHeight: 320, position: 'sticky', top: 12 }}>
          {!sel && (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: '40px 8px', textAlign: 'center' }}>
              从左侧点开某个账号，再点任意 .md 文件查看正文。<br />避坑文件会在写稿时被 AI 强制带入。
            </div>
          )}
          {sel && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <IconIdea size={15} />
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong, #111827)' }}>{sel.file.name}</span>
                <span style={{ fontSize: 11.5, color: '#9ca3af' }}>{sel.platform} / {sel.account}</span>
                {sel.file.kind === 'pitfall' && <span style={{ ...pill('#fef2f2', '#b91c1c') }}>⚠ 避坑红线</span>}
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.75, color: 'var(--text-strong, #1f2937)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '62vh', overflow: 'auto',
                background: 'var(--bg-elev, #f6f7f9)', border: '1px solid var(--border, #e5e7eb)',
                borderRadius: 10, padding: '12px 14px',
              }}>
                {loadingFile ? '加载中…' : content}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
