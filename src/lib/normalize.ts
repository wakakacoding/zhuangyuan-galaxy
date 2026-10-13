// 繁简归一（前端）：与构建期共用单一真源 data/t2s.json
// 查询词归一后在 person-index 的 search_key 字段上匹配
import T2S_RAW from '../../data/t2s.json';

const T2S: Record<string, string> = T2S_RAW as Record<string, string>;

export const simp = (s: string): string => [...s].map((c) => T2S[c] ?? c).join('');

// 查询词归一：繁转简 + 小写 + 去空白
export const normalizeQuery = (s: string): string => simp(s).toLowerCase().replace(/\s+/g, '');
