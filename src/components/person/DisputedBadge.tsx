// 身份存疑 badge：人物页、浮层、关系区、搜索建议、星图/网络 tooltip 共用同一文案。
// 语义边界（契约 §2.2）：存疑指"状元身份有异说"，不表示此人伪造，也不表示整理状态。
export const DISPUTED_BADGE = '状元身份存疑';

export const DISPUTED_HINT = '本站收录该人，但其状元身份存在异说；这不表示人物不存在，也不表示整份档案都不可信。';

export default function DisputedBadge({ note, className = '' }: { note?: string; className?: string }) {
  return (
    <span
      data-disputed-badge="1"
      title={note?.trim() || DISPUTED_HINT}
      className={`inline-block shrink-0 rounded border border-zhusha/60 px-1.5 py-0.5 font-serif text-[10px] leading-4 text-zhusha ${className}`}
    >
      {DISPUTED_BADGE}
    </span>
  );
}
