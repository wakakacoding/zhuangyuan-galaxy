import { useState } from 'react';

// 分享按钮：URL 即现场（筛选/选中人物/ego/地图切片全编码在 URL），一键复制或调起系统分享
export default function ShareButton({
  anchor,
  label = '分享',
  className = '',
}: {
  anchor?: string; // 可选锚点（问答页各答案卡用 #q1 等）
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${anchor ? `#${anchor}` : window.location.hash}`;
    const shareData = { title: document.title, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // 用户取消系统分享或不支持，落回复制
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 剪贴板 API 不可用（非安全上下文）时的兜底
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={share}
      className={`inline-flex items-center gap-1 rounded-full border border-miDim/30 px-2.5 py-1 font-serif text-[11px] text-miDim transition hover:border-jin/60 hover:text-jin ${className}`}
      title="复制本画面链接，打开即是当前现场"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 6.5 5 9.5 10 2.5"/></svg>
          已复制
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="9.5" cy="2.5" r="1.6" /><circle cx="2.5" cy="6" r="1.6" /><circle cx="9.5" cy="9.5" r="1.6" />
            <path d="m4 5 3.8-2M4 7l3.8 2" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
