// 证据性质分区：把人物页的条目按"凭什么这么说"分成三类，而不是把 C 级一律当传说。
//
// 分区口径（与 docs/勘误处理流程.md「裁定规则 3」一致）：
//   1. 事件类型为「轶事」→ 轶事区（哪怕挂了 A 级出处，它记录的仍是轶事）
//   2. 唯一出处为 C 级（笔记/传说）→ 轶事区，标「笔记/传说性质」；
//      这是按来源等级分区，不是判定内容为假——笔记小说同样可能有史料价值
//   3. 无出处（或出处 id 在本人出处表里查不到）→ 待证区，标「尚无出处」
//   4. 其余（A/B 级出处）→ 史实区
// 身份/夺魁层面的异说（disputed / dispute_claims）不在这里判，它由人物数据独立表达。

export type EvidenceSection = 'fact' | 'anecdote' | 'pending';

export interface EvidenceEventLike {
  type?: string;
  source_id?: string;
}

export interface EvidenceSourceLike {
  id: string;
  tier?: string;
}

export const SECTION_META: Record<EvidenceSection, { title: string; note: string; short: string }> = {
  fact: {
    title: '史实与生平',
    note: '以下条目挂 A 级（正史/碑录/朱卷）、A− 级（权威学术编纂）或 B 级（方志/年谱/整理名录）出处。出处等级只说明来源类型，不等于本站已逐条复核原文。',
    short: '挂 A/B 级出处；等级只说明来源类型，不等于已逐条复核原文。',
  },
  anecdote: {
    title: '笔记与传说',
    note: '以下条目出自笔记小说或属轶事类记载，标注「笔记/传说性质」，作参考而不作史实断言。C 级不等于虚构：笔记里常有正史不载的细节，只是需要别的材料佐证。',
    short: '笔记/传说性质：可参考，不作史实断言；C 级不等于虚构。',
  },
  pending: {
    title: '待证',
    note: '以下条目目前没有挂出处。按契约，缺出处的条目按「待证」展示，不默认当作已核。',
    short: '尚无出处，按待证展示。',
  },
};

export function eventSection(
  e: EvidenceEventLike,
  sourceById: ReadonlyMap<string, EvidenceSourceLike>,
): EvidenceSection {
  if (e.type === '轶事') return 'anecdote';
  const src = e.source_id ? sourceById.get(e.source_id) : undefined;
  if (!src) return 'pending';
  if (src.tier === 'C') return 'anecdote';
  return 'fact';
}

export function groupBySection<T extends EvidenceEventLike>(
  events: T[],
  sourceById: ReadonlyMap<string, EvidenceSourceLike>,
): Record<EvidenceSection, T[]> {
  const out: Record<EvidenceSection, T[]> = { fact: [], anecdote: [], pending: [] };
  for (const e of events) out[eventSection(e, sourceById)].push(e);
  return out;
}

export const TIER_LABEL: Record<string, string> = {
  A: '正史/碑录',
  'A-': '学术编纂',
  B: '方志/年谱',
  C: '笔记/传说',
};

/** 出处等级统计，用于「这份档案凭什么」的一句话说明 */
export function tierSummary(sources: EvidenceSourceLike[]): { A: number; Am: number; B: number; C: number; total: number } {
  const out = { A: 0, Am: 0, B: 0, C: 0, total: sources.length };
  for (const s of sources) {
    if (s.tier === 'A') out.A += 1;
    else if (s.tier === 'A-') out.Am += 1;
    else if (s.tier === 'B') out.B += 1;
    else if (s.tier === 'C') out.C += 1;
  }
  return out;
}
