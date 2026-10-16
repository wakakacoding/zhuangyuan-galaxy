// M5-d D1 · 生卒列一次性修复（三方比对）
//
// 根因：parse-wiki.mjs 原实现取「生卒年」单元格内首个 3–4 位数字当出生年，
// 于是「？－658年」「─1384年」「－1689年」「？~1030年」等**生年阙如**形态被误植为出生年，
// 全站 38 条名录出生晚于登科（构建产物中 37 人可见，z0454 吴伯宗被深档 YAML 掩盖）。
//
// 三方比对：
//   ① roster.tsv 现值（含历史人工修订）
//   ② wiki-parsed.tsv 新解析值（parse-wiki.mjs 重跑产物，附 life_raw 原始单元格 + circa 标记）
//   ③ data/persons/*.yaml 深档 —— **显式**声明 birth_year / death_year 者优先反向校正 roster
//
// 用法：
//   node scripts/parse-wiki.mjs                      # 先重跑解析（本脚本会校验产物新鲜度）
//   node scripts/roster-repair-lifespan.mjs          # 干跑：仅出报告与留痕 JSON
//   node scripts/roster-repair-lifespan.mjs --apply  # 回写 roster.tsv
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedDir = join(root, 'data', 'seed');
const personsDir = join(root, 'data', 'persons');
const apply = process.argv.includes('--apply');

// 繁简归一（与 build-data 同一真源）
const T2S = JSON.parse(readFileSync(join(root, 'data', 't2s.json'), 'utf8'));
const simp = (s) => [...String(s ?? '')].map((c) => T2S[c] ?? c).join('');
const num = (v) => (v === '' || v === undefined || v === null ? '' : String(v));

const readTsv = (p) =>
  readFileSync(p, 'utf8').split('\n').slice(1)
    .filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t'));

// ---------- ① roster 现值 ----------
const roster = readTsv(join(seedDir, 'roster.tsv')).map((c) => ({
  id: c[0], name: c[1], dynasty: c[2], exam_year: Number(c[3]), reign: c[4] ?? '',
  birth: c[5] ?? '', death: c[6] ?? '', native_hist: c[7] ?? '', tags: c[8] ?? '',
  birth_circa: c[9] === '1', death_circa: c[10] === '1',
}));

// ---------- ② wiki 新解析 ----------
const wikiFile = join(seedDir, 'wiki-parsed.tsv');
const wikiMtime = statSync(wikiFile).mtimeMs;
const staleSrc = readdirSync(seedDir)
  .filter((f) => f.startsWith('wiki_') && f.endsWith('.txt'))
  .filter((f) => statSync(join(seedDir, f)).mtimeMs > wikiMtime);
if (staleSrc.length) {
  console.error(`✗ wiki-parsed.tsv 比源文件旧（${staleSrc.join(', ')}），请先运行：node scripts/parse-wiki.mjs`);
  process.exit(1);
}
const wiki = readTsv(wikiFile).map((c) => ({
  name: c[0], dynasty: c[1], exam_year: Number(c[2]), birth: c[4] ?? '', death: c[5] ?? '',
  birth_circa: c[8] === '1', death_circa: c[9] === '1', life_raw: c[10] ?? '',
}));
const wikiByKey = new Map();
const wikiByName = new Map();
for (const w of wiki) {
  wikiByKey.set(`${simp(w.name)}|${w.exam_year}`, w);
  const k = simp(w.name);
  if (!wikiByName.has(k)) wikiByName.set(k, []);
  wikiByName.get(k).push(w);
}
const matchWiki = (r) => {
  const exact = wikiByKey.get(`${simp(r.name)}|${r.exam_year}`);
  if (exact) return { w: exact, how: 'name+year' };
  const cands = wikiByName.get(simp(r.name)) ?? [];
  if (cands.length === 1) return { w: cands[0], how: 'name' };
  return { w: null, how: null };
};

// ---------- ③ 深档 YAML（显式键才作数） ----------
const profiles = new Map();
const hasKey = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== null && o[k] !== undefined;
for (const f of readdirSync(personsDir).filter((f) => f.endsWith('.yaml'))) {
  const p = yaml.load(readFileSync(join(personsDir, f), 'utf8'));
  profiles.set(p.id, {
    file: f,
    hasBirth: hasKey(p, 'birth_year'), birth_year: p.birth_year,
    hasDeath: hasKey(p, 'death_year'), death_year: p.death_year,
    // circa 仅在 YAML **显式写出该键**时才算深档裁定；未写出则沿用维基解析结果
    hasBirthCirca: hasKey(p, 'birth_circa'), birth_circa: p.birth_circa === true,
    hasDeathCirca: hasKey(p, 'death_circa'), death_circa: p.death_circa === true,
  });
}

// ---------- 逐人重估 ----------
const patternOf = (raw) => {
  if (!raw) return '空单元格（生卒皆阙）';
  if (/^[?？]/.test(raw)) return '生年阙如（？－NNNN年）';
  if (/^[-－—–─~～]/.test(raw)) return '生年阙如（缺生年段）';
  if (/[?？]\s*[-－—–─~～]|[?？]$|[-－—–─~～一至]$/.test(raw)) return '卒年阙如（NNNN年－？）';
  if (/约|[0-9]\s*[?？]/.test(raw)) return '约年（circa）';
  return '生卒俱全';
};

const people = [];
const changedFields = [];
const unmatched = [];
const deepOverride = new Set();

for (const r of roster) {
  const { w, how } = matchWiki(r);
  if (!w) unmatched.push({ id: r.id, name: r.name, dynasty: r.dynasty, exam_year: r.exam_year });
  const p = profiles.get(r.id);

  const newBirth = p?.hasBirth ? num(p.birth_year) : (w ? num(w.birth) : r.birth);
  const newDeath = p?.hasDeath ? num(p.death_year) : (w ? num(w.death) : r.death);
  const newBirthCirca = p?.hasBirthCirca ? p.birth_circa : (w ? w.birth_circa : r.birth_circa);
  const newDeathCirca = p?.hasDeathCirca ? p.death_circa : (w ? w.death_circa : r.death_circa);
  const basisMap = {
    birth: p?.hasBirth ? 'deep-profile' : (w ? 'wiki-cell' : 'roster'),
    death: p?.hasDeath ? 'deep-profile' : (w ? 'wiki-cell' : 'roster'),
    birth_circa: p?.hasBirthCirca ? 'deep-profile' : (w ? 'wiki-cell' : 'roster'),
    death_circa: p?.hasDeathCirca ? 'deep-profile' : (w ? 'wiki-cell' : 'roster'),
  };
  const basisOf = (field) => basisMap[field];

  const oldV = { birth: num(r.birth), death: num(r.death), birth_circa: r.birth_circa, death_circa: r.death_circa };
  const newV = { birth: newBirth, death: newDeath, birth_circa: newBirthCirca, death_circa: newDeathCirca };
  const dirty = oldV.birth !== newV.birth || oldV.death !== newV.death
    || oldV.birth_circa !== newV.birth_circa || oldV.death_circa !== newV.death_circa;

  if (!dirty) continue;
  for (const field of ['birth', 'death', 'birth_circa', 'death_circa']) {
    if (oldV[field] !== newV[field]) {
      changedFields.push({ id: r.id, name: r.name, field, old: oldV[field], new: newV[field], basis: basisOf(field) });
      if (basisOf(field) === 'deep-profile') deepOverride.add(r.id);
    }
  }
  people.push({
    id: r.id, name: r.name, dynasty: r.dynasty, exam_year: r.exam_year,
    old: oldV, new: newV,
    wiki_cell: w?.life_raw ?? null,
    wiki_match: how,
    pattern: w ? patternOf(w.life_raw) : '无维基对应行',
    basis: (() => {
      const s = new Set(['birth', 'death', 'birth_circa', 'death_circa'].map(basisOf).filter((x) => x !== 'roster'));
      return s.size === 0 ? 'roster' : [...s].sort().join('+');
    })(),
    deep_profile: p?.file ?? null,
    born_after_exam_before: num(r.birth) !== '' && Number(r.birth) > r.exam_year,
    born_after_exam_after: newBirth !== '' && Number(newBirth) > r.exam_year,
  });
}

// 已知修复前后口径
const beforeAfter = roster.filter((r) => num(r.birth) !== '' && Number(r.birth) > r.exam_year);

// 无新证据、但 roster 有值而 wiki 为空（潜在人工修订被抹掉的风险项，须人工确认）
const silentWipeRisk = roster.filter((r) => {
  const { w } = matchWiki(r);
  const p = profiles.get(r.id);
  return w && num(r.birth) !== '' && num(w.birth) === '' && !p?.hasBirth;
}).map((r) => ({ id: r.id, name: r.name, exam_year: r.exam_year, roster_birth: r.birth, wiki_cell: matchWiki(r).w.life_raw }));

const summary = {
  roster_total: roster.length,
  wiki_total: wiki.length,
  wiki_matched: roster.length - unmatched.length,
  wiki_unmatched: unmatched.length,
  changed_people: people.length,
  changed_fields: changedFields.length,
  born_after_exam_before: beforeAfter.length,
  born_after_exam_after: people.filter((p) => p.born_after_exam_after).length,
  deep_profile_override: deepOverride.size,
  silent_wipe_risk: silentWipeRisk.length,
};

const out = {
  generated_at: new Date().toISOString(),
  task: 'M5-d D1 · 生卒解析修复 + 名录一次性修复',
  root_cause: 'parse-wiki.mjs 原实现取生卒年单元格内首个 3–4 位数字当出生年，「？－658年」「─1384年」「－1689年」「？~1030年」等生年阙如形态被误植为出生年',
  parse_fix: 'scripts/lib/lifespan.mjs parseLifespan —— 年份必须落在连接号对应侧才算数，生年侧无数字则生年为空；「约」或同位「？」标 circa',
  inputs: {
    roster: 'data/seed/roster.tsv',
    wiki_parsed: 'data/seed/wiki-parsed.tsv',
    profiles_dir: 'data/persons/*.yaml',
  },
  precedence: ['deep-profile（YAML 显式 birth_year/death_year）', 'wiki-cell（重解析生卒列）', 'roster（无新证据则维持）'],
  summary,
  pattern_histogram: Object.entries(
    people.reduce((m, p) => { m[p.pattern] = (m[p.pattern] ?? 0) + 1; return m; }, {})
  ).sort((a, b) => b[1] - a[1]).map(([pattern, count]) => ({ pattern, count })),
  people,
  changed_fields: changedFields,
  silent_wipe_risk: silentWipeRisk,
  unmatched_roster_rows: unmatched,
};

writeFileSync(join(seedDir, 'lifespan-repair.json'), JSON.stringify(out, null, 2) + '\n');

console.log(`roster ${summary.roster_total} / wiki ${summary.wiki_total}（未匹配 ${summary.wiki_unmatched}）/ 人员变更 ${summary.changed_people} / 字段变更 ${summary.changed_fields}`);
console.log(`birth>exam：修复前 ${summary.born_after_exam_before} → 修复后 ${summary.born_after_exam_after}；深档反向校正 ${summary.deep_profile_override} 人`);
console.log('形态分布：' + out.pattern_histogram.map((h) => `${h.pattern}×${h.count}`).join('；'));
if (unmatched.length) console.log(`未匹配名录行：${unmatched.map((u) => `${u.id} ${u.name}`).join('、')}`);
if (silentWipeRisk.length) console.log(`⚠ 需人工确认的「roster 有生年而 wiki 阙如」：${silentWipeRisk.map((s) => `${s.id} ${s.name}(${s.roster_birth})`).join('、')}`);
console.log('→ data/seed/lifespan-repair.json');

if (apply) {
  const header = 'id\tname\tdynasty\texam_year\treign\tbirth\tdeath\tnative_hist\ttags\tbirth_circa\tdeath_circa';
  const changed = new Map(people.map((p) => [p.id, p.new]));
  const lines = roster.map((r) => {
    const v = changed.get(r.id) ?? {
      birth: r.birth, death: r.death, birth_circa: r.birth_circa, death_circa: r.death_circa,
    };
    return [r.id, r.name, r.dynasty, r.exam_year, r.reign, v.birth, v.death, r.native_hist, r.tags,
      v.birth_circa ? '1' : '', v.death_circa ? '1' : ''].join('\t');
  });
  writeFileSync(join(seedDir, 'roster.tsv'), [header, ...lines].join('\n') + '\n');
  console.log(`applied：roster.tsv 已回写（${changed.size} 人生卒修订，新增 birth_circa/death_circa 两列）`);
}
