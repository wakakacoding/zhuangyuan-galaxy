import { useState } from 'react';

const SHARE_KEYS = ['dyn', 'q', 'p', 'slice', 'region', 'ego', 'nt', 'nx'];

export function shareUrl(current: URL, anchor?: string): string {
  const params = new URLSearchParams();
  for (const key of SHARE_KEYS) {
    const value = current.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const hash = anchor ? '#' + anchor : current.hash;
  const search = params.toString();
  return `${current.origin}${current.pathname}${search ? '?' + search : ''}${hash}`;
}

export async function copyText(text: string, writer?: (value: string) => Promise<void>): Promise<boolean> {
  try {
    if (writer) await writer(text);
    else await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ShareButton({
  anchor,
  label = '分享',
  className = '',
}: {
  anchor?: string;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [manualUrl, setManualUrl] = useState('');

  const share = async () => {
    const url = shareUrl(new URL(window.location.href), anchor);
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    const ok = await copyText(url);
    if (ok) {
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2000);
      return;
    }
    setManualUrl(url);
    setStatus('manual');
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={share}
        aria-live="polite"
        className={`inline-flex items-center gap-1 rounded-full border border-miDim/30 min-h-11 px-3 py-2 font-serif text-sm text-miDim transition hover:border-jin/60 hover:text-jin ${className}`}
        title="分享当前筛选、人物、地图或网络选择和问答位置。不包含悬停和临时图形位置。"
      >
        {status === 'copied' ? '已复制' : label}
      </button>
      {status === 'manual' && (
        <input aria-label="手动复制链接" readOnly value={manualUrl} className="w-40 rounded border border-jin/30 bg-transparent px-2 py-1 font-serif text-[11px] text-mi" onFocus={(e) => e.currentTarget.select()} />
      )}
    </span>
  );
}
