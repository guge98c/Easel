import { useState, useEffect } from 'react';
import { listVaultAccounts, retrieveVault, type VaultMaterial } from '../lib/api';

const PLATFORMS: { key: string; label: string }[] = [
  { key: '公众号', label: '🟢 微信公众号' },
  { key: '抖音', label: '🔵 抖音' },
  { key: '小红书', label: '🔴 小红书' },
  { key: '快手', label: '🟠 快手' },
  { key: '视频号', label: '🟣 视频号' },
  { key: '知乎', label: '🔷 知乎' },
  { key: 'B站', label: '🟡 B站' },
];

export interface VaultSelection { platform: string; account: string; }

export default function PlatformPicker({
  topic, onCancel, onConfirm,
}: {
  topic: string;
  onCancel: () => void;
  onConfirm: (sel: VaultSelection | null) => void;
}) {
  const [step, setStep] = useState<'platform' | 'account'>('platform');
  const [platform, setPlatform] = useState<string>('');
  const [accounts, setAccounts] = useState<string[]>([]);
  const [account, setAccount] = useState<string>('');
  const [preview, setPreview] = useState<{ count: number; pitfall: string; items: VaultMaterial[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  useEffect(() => { setStep('platform'); setPlatform(''); setAccounts([]); setAccount(''); setPreview(null); setErr(''); }, [topic]);

  const pickPlatform = async (p: string) => {
    setPlatform(p); setLoading(true); setErr(''); setAccounts([]); setPreview(null);
    try {
      const r = await listVaultAccounts(p);
      setAccounts(r.accounts || []);
      if ((r.accounts || []).length === 0) {
        setErr(`「${p}」下还没有账号素材库（请在 Obsidian 的 Gzh/ 下建账号文件夹并放入 .md）`);
      }
      setStep('account');
    } catch (e) {
      setErr('读取账号列表失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const pickAccount = async (a: string) => {
    setAccount(a); setLoading(true); setErr(''); setPreview(null);
    try {
      const r = await retrieveVault({ platform, account: a, query: topic });
      setPreview({ count: (r.materials || []).length, pitfall: r.pitfall || '', items: r.materials || [] });
    } catch (e) {
      setPreview({ count: 0, pitfall: '', items: [] });
      setErr('检索失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const card: React.CSSProperties = {
    width: 580, maxWidth: '92vw', background: 'var(--surface, #fff)',
    border: '1px solid var(--border, #e5e7eb)', borderRadius: 14, padding: 22,
    boxShadow: '0 20px 60px rgba(0,0,0,.3)', maxHeight: '88vh', overflowY: 'auto',
  };
  const btnBase: React.CSSProperties = {
    textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13.5, fontWeight: 600, border: '1px solid var(--border, #e5e7eb)',
    background: 'var(--surface-2, #f9fafb)', color: 'var(--text-strong, #111827)',
  };
  const btnActive: React.CSSProperties = {
    borderColor: 'var(--accent-end, #4338ca)', background: 'var(--accent-soft, #eef2ff)',
    color: 'var(--accent-end, #4338ca)',
  };
  const btnGhost: React.CSSProperties = {
    padding: '9px 16px', borderRadius: 9, cursor: 'pointer', fontSize: 13,
    border: '1px solid var(--border, #e5e7eb)', background: 'transparent', color: 'var(--text-secondary, #555)',
  };
  const btnPrimary: React.CSSProperties = {
    padding: '9px 16px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700,
    border: 'none', background: 'var(--accent-end, #4338ca)', color: '#fff',
  };

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-strong, #111827)' }}>
          {step === 'platform' ? '选择发布平台' : `选择「${platform}」账号素材库`}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary, #555)', marginTop: 6 }}>
          为热点「<b>{topic}</b>」{step === 'platform'
            ? '选择发布平台，下一步选取对应账号素材库'
            : '选择一个账号（Obsidian 里的账号文件夹），AI 将检索该账号素材 + 避坑红线'}
        </div>

        {step === 'platform' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 16 }}>
              {PLATFORMS.map((p) => (
                <button key={p.key} onClick={() => pickPlatform(p.key)} style={btnBase}>{p.label}</button>
              ))}
            </div>
            <button onClick={() => onConfirm(null)} style={{ ...btnBase, marginTop: 10 }}>
              不使用素材库（纯 AI 写稿）
            </button>
          </>
        )}

        {step === 'account' && (
          <>
            <div style={{ marginTop: 14 }}>
              <button onClick={() => { setStep('platform'); setAccount(''); setPreview(null); setErr(''); }}
                style={{ ...btnGhost, padding: '4px 10px' }}>← 返回平台</button>
            </div>
            {loading && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-tertiary, #888)' }}>读取中…</div>}
            {err && <div style={{ marginTop: 12, fontSize: 12.5, color: '#b91c1c' }}>{err}</div>}
            {!loading && !err && accounts.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 12 }}>
                {accounts.map((a) => (
                  <button key={a} onClick={() => pickAccount(a)}
                    style={{ ...btnBase, ...(account === a ? btnActive : {}) }}>{a}</button>
                ))}
              </div>
            )}

            {preview && !loading && (
              <div style={{
                marginTop: 14, fontSize: 12.5, color: 'var(--text-secondary, #444)',
                background: 'var(--bg-elev, #f6f7f9)', border: '1px solid var(--border, #e5e7eb)',
                borderRadius: 8, padding: '8px 10px',
              }}>
                已从「{platform} / {account}」检索到 <b>{preview.count}</b> 条相关素材
                {preview.pitfall ? '，并已带入避坑红线 ✅' : '（该账号暂无避坑红线）'}，将注入写稿指令：
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {preview.items.slice(0, 3).map((m, i) => (
                    <li key={i}>{m.title.slice(0, 40)}{m.title.length > 40 ? '…' : ''}</li>
                  ))}
                </ul>
                {preview.items[0] && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary, #888)', marginBottom: 4 }}>↑ 命中素材预览（vault 切块后的检索单元）：</div>
                    <pre style={{ margin: 0, padding: '8px 10px', background: '#0f172a', color: '#e2e8f0', borderRadius: 8, fontSize: 11, lineHeight: 1.55, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{preview.items[0].text.slice(0, 400)}</pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onCancel} style={btnGhost}>取消</button>
          {step === 'account' && (
            <button onClick={() => onConfirm({ platform, account })} disabled={!account}
              style={{ ...btnPrimary, opacity: account ? 1 : 0.5 }}>确认并开始写稿</button>
          )}
        </div>
      </div>
    </div>
  );
}
