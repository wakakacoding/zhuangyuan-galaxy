import { useEffect, useRef, useState } from 'react';

// 读图指南：图表左上角的「?」按钮，点开讲这张图在讲什么历史规律 + 数据覆盖局限
// inline=true 时内联嵌入标题文本流（用于人物帖等窄栏场景）
export default function GuidePopover({
  title,
  children,
  inline = false,
}: {
  title: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={inline ? 'relative inline-block' : 'absolute left-3 top-3 z-20'}>
      <button
        type="button"
        aria-label={`读图指南：${title}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center rounded-full border font-serif transition ${
          inline ? 'h-11 w-11 align-middle text-sm' : 'h-11 w-11 text-sm'
        } ${
          open
            ? 'border-jin bg-jin/20 text-jin'
            : 'border-miDim/40 text-miDim hover:border-jin/70 hover:text-jin'
        }`}
      >
        ?
      </button>
      {open && (
        <div className={`${inline ? 'absolute left-0 top-6' : 'mt-2'} z-20 w-72 max-w-[calc(100vw-48px)] rounded-lg border border-jin/30 bg-dai/95 p-4 shadow-xl backdrop-blur`}>
          <div className="border-l-2 border-jin pl-2 font-serif text-sm font-bold text-jin">{title}</div>
          <div className="mt-2 font-serif text-xs leading-6 text-miDim">{children}</div>
        </div>
      )}
    </div>
  );
}
