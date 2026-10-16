// 生卒年单元格解析（M5-d D1）——wiki「生卒年」列 → { birth, death, birth_circa, death_circa }
//
// 修复背景：原实现（parse-wiki.mjs:45）取单元格内首个 3–4 位数字一律当出生年，
// 于是「？－658年」（生年阙如）被读成 birth=658 —— 全站 38 条名录因此出生晚于登科
// （构建产物中 37 人可见，z0454 吴伯宗被深档 YAML 掩盖）。
//
// 实测覆盖 data/seed/wiki_*.txt 里全部非标准形态（共 465 个）：
//   658年－699年 / 621年～714年 / 646年--726年 / 1363年─1402年 / 1402－1449年
//   977年一1038年（汉字「一」误作连接号）        → 生卒俱全
//   ？－658年 / ?-1220年 / ？—798年 / ─1384年 / －1689年 / ？~1030年  → 生年阙如
//   818年－？ / 958年~？ / 1629年－ / 1088-?（缺「年」）              → 卒年阙如
//   728年？－772年 / 约675年~714年 / ？845年－？                     → 约年（circa）
//   ─ / （空单元格）                                                 → 生卒皆阙
//
// 单一真源：parse-wiki.mjs 与 roster-repair-lifespan.mjs 共用本模块，防止两处口径漂移。

// 连接号全家桶：半角/全角连字符、em/en dash、制表符线、波浪号、汉字「至」「一」
export const SEP_RE = /[-－—–─~～至一]+/;
// 「无考」类表述一律视为阙如
const UNKNOWN_RE = /不详|不詳|待考|無考|无考|未知|失考/;
// 约年标记
const CIRCA_RE = /约|約|大约|大約/;

/** 轻量 wiki 标记清洗（不依赖 parse-wiki 的 stripWiki，避免循环依赖） */
export const stripWikiLite = (s) =>
  String(s ?? '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 从连接号一侧的片段里取年份。
 * 无数字（如「？」「」，含「不详」）→ 返回空，绝不把卒年误当生年。
 * 片段内出现「约」或「？」→ 该年标 circa（约年）。
 * @returns {{ year: number | '', circa: boolean }}
 */
const pickPart = (part) => {
  const t = String(part ?? '');
  if (UNKNOWN_RE.test(t)) return { year: '', circa: false };
  const m = t.match(/(\d{3,4})/);
  if (!m) return { year: '', circa: false };
  return { year: Number(m[1]), circa: CIRCA_RE.test(t) || /[?？]/.test(t) };
};

/**
 * 解析生卒年单元格。
 * 关键规则：年份必须落在连接号的**对应侧**才算数——
 * 「？」「─1384年」「－1689年」的生年侧无数字，故 birth 为空，而非把 658/1384 当生年。
 * @param {string} cell 原始单元格文本
 */
export const parseLifespan = (cell) => {
  const out = { birth: '', death: '', birth_circa: false, death_circa: false };
  const s = stripWikiLite(cell);
  if (!s || UNKNOWN_RE.test(s)) return out;
  const parts = s.split(SEP_RE);
  const b = pickPart(parts[0]);
  const d = parts.length > 1 ? pickPart(parts[1]) : { year: '', circa: false };
  out.birth = b.year;
  out.birth_circa = b.year === '' ? false : b.circa;
  out.death = d.year;
  out.death_circa = d.year === '' ? false : d.circa;
  return out;
};
