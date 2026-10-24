// 仕途四维的读取层（展示用）：把契约 v1 §3.2 的三种数据形态翻成三种页面状态。
//
// 契约来源：docs/数据契约-v1.md §三
//   - 字段不存在        → 「尚未整理」（本站还没做这一维，不等于"无"）
//   - status: unknown   → 「已检索，未见记载」+ note（做过检索，没找到）
//   - status: recorded  → 正常展示值 + 时间精度 + 出处
//
// 这一层只读产物 JSON，不改 schema、不推导：绝不从 career.final_* 生成任何一维。
// 产物尚未迁移四维时（当前 656 人全部 missing），四维一律显示「尚未整理」。

export type CareerDim = 'highest' | 'last' | 'whereabouts' | 'death';
export type CareerFactState = 'missing' | 'unknown' | 'recorded';

/** 产物里四维字段的形状（与 schema.ts 的 CareerFactSchema 对齐，这里只读不校验） */
export interface CareerFactInput {
  status?: 'recorded' | 'unknown';
  office?: string;
  category?: string;
  year?: number;
  year_label?: string;
  precision?: 'exact' | 'circa' | 'range';
  source_id?: string;
  note?: string;
}

export interface CareerFactView {
  dim: CareerDim;
  label: string;
  state: CareerFactState;
  /** 主文案：有值时为官职/去向/死事，否则为状态词 */
  text: string;
  /** 时间说明（只有 recorded 且有年份时才有） */
  timeText?: string;
  /** unknown 的检索说明，或 recorded 的备注（如「赠官不计」） */
  note?: string;
  sourceId?: string;
}

export const CAREER_DIM_META: { dim: CareerDim; label: string; hint: string }[] = [
  { dim: 'highest', label: '最高官', hint: '一生所任最高职事，赠官另注' },
  { dim: 'last', label: '末任', hint: '最后一个实际官职，不含追赠与虚衔' },
  { dim: 'whereabouts', label: '去向', hint: '致仕或去职之后的着落' },
  { dim: 'death', label: '死亡', hint: '卒年与死事性质' },
];

export const STATE_TEXT: Record<CareerFactState, string> = {
  missing: '尚未整理',
  unknown: '已检索，未见记载',
  recorded: '',
};

/** 时间精度说人话：约年写「约」，范围写「前后（范围记载）」，不把约年当确切年 */
export function factTimeText(f: CareerFactInput): string | undefined {
  if (f.year_label) {
    return f.precision === 'circa' ? `约${f.year_label}` : f.year_label;
  }
  if (typeof f.year !== 'number') return undefined;
  if (f.precision === 'circa') return `约 ${f.year} 年`;
  if (f.precision === 'range') return `${f.year} 年前后（范围记载）`;
  return `${f.year} 年`;
}

function asFact(raw: unknown): CareerFactInput | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CareerFactInput;
}

/** 单维读取：唯一入口，页面与浮层都走这里，避免两处判定不一致 */
export function readCareerFact(career: unknown, dim: CareerDim): CareerFactView {
  const meta = CAREER_DIM_META.find((m) => m.dim === dim)!;
  const container = career && typeof career === 'object' ? (career as Record<string, unknown>) : {};
  const fact = asFact(container[dim]);

  if (!fact) {
    return { dim, label: meta.label, state: 'missing', text: STATE_TEXT.missing };
  }
  if (fact.status === 'unknown') {
    return {
      dim,
      label: meta.label,
      state: 'unknown',
      text: STATE_TEXT.unknown,
      note: fact.note?.trim() || undefined,
    };
  }
  const value = [fact.office?.trim(), fact.category?.trim()].filter(Boolean).join(' · ');
  // recorded 却没有任何值：按 missing 处理，宁可显示"还没做"，也不假装有值
  if (!value) {
    return { dim, label: meta.label, state: 'missing', text: STATE_TEXT.missing };
  }
  return {
    dim,
    label: meta.label,
    state: 'recorded',
    text: value,
    timeText: factTimeText(fact),
    note: fact.note?.trim() || undefined,
    sourceId: fact.source_id,
  };
}

export function readCareerFacts(career: unknown): CareerFactView[] {
  return CAREER_DIM_META.map((m) => readCareerFact(career, m.dim));
}
