// CBDB 社会关系导入（M5 T3）
// 匹配策略（方案既定）：姓名（繁体）+ 科年双键
//   1.0 姓名命中 + 进士 entry 科年精确一致 → 自动入
//   0.9 科年 ±2 年内 → 人工复核队列
//   0.7 仅姓名命中 → 人工复核队列
//   <0.7 / 多候选无法消歧 → 丢弃（宁缺毋错）
// 输出：data/seed/cbdb-match.json / cbdb-relations-draft.yaml / cbdb-review.json
//       / externals-candidates.json / docs/CBDB匹配报告.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import yaml from 'js-yaml';
import { mapAssocCode, rulesByFamily, ruleCount, TEXTUAL_DISCARD, type LocalRelationType } from './cbdb-assoc-map';
import { runDeep } from './import-cbdb-deep';

// --deep 模式（M5-c A1）：走独立模块，直接消费 cbdb-match*.json 中已确认的 personid，
// 不重跑人物匹配、不覆写浅层产物；完成后立即退出，浅层逻辑不执行。
if (process.argv.includes('--deep')) {
  runDeep();
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedDir = join(root, 'data', 'seed');
mkdirSync(join(root, 'docs'), { recursive: true });

// ---------- 名录与已有关系 ----------
interface RosterRow { id: string; name: string; dynasty: string; exam_year: number; birth: string; death: string }
interface RelRow { from: string; to: string; type: string; note?: string; source_id?: string }
interface BiogRow { c_personid: number; c_name_chn: string; c_birthyear: number | null; c_deathyear: number | null; c_index_year: number | null }
interface EntryRow { c_year: number | null; c_entry_code: number; c_exam_rank: string | null }

const roster: RosterRow[] = readFileSync(join(seedDir, 'roster.tsv'), 'utf8').split('\n').slice(1)
  .filter(Boolean).map((l) => l.split('\t'))
  .map(([id, name, dynasty, exam_year, reign, birth, death]) =>
    ({ id, name, dynasty, exam_year: Number(exam_year), birth, death }));
const manual = (yaml.load(readFileSync(join(root, 'data', 'relations.yaml'), 'utf8')) ?? []) as RelRow[];
const pairKey = (a: string, b: string) => [a, b].sort().join('|');
const existingPairs = new Set(manual.map((r: RelRow) => pairKey(r.from, r.to)));

// ---------- 简→繁变体（t2s 反向，多值展开，上限 32 防爆） ----------
const T2S = JSON.parse(readFileSync(join(root, 'data', 't2s.json'), 'utf8'));
const S2T = new Map();
for (const [t, s] of Object.entries(T2S)) {
  if (!S2T.has(s)) S2T.set(s, []);
  S2T.get(s).push(t);
}
const variants = (name: string): string[] => {
  const out: string[] = [];
  const build = (prefix: string, idx: number): void => {
    if (out.length >= 32) return;
    if (idx === name.length) { out.push(prefix); return; }
    const c = name[idx];
    for (const o of [c, ...(S2T.get(c) ?? [])]) build(prefix + o, idx + 1);
  };
  build('', 0);
  return [...new Set(out)];
};

// ---------- CBDB ----------
const db = new DatabaseSync(join(root, 'data', 'cbdb', 'cbdb_20261010.sqlite3'), { readOnly: true });
const jinshiCodes = (db.prepare("SELECT c_entry_code FROM ENTRY_CODES WHERE c_entry_desc_chn LIKE '%進士%'")
  .all() as unknown as Array<{ c_entry_code: number }>).map((r) => r.c_entry_code);
const jinshiSet = new Set(jinshiCodes);
const kinDesc = new Map((db.prepare('SELECT c_kincode, c_kinrel_chn FROM KINSHIP_CODES').all() as unknown as Array<{ c_kincode: number; c_kinrel_chn: string }>).map((r) => [r.c_kincode, r.c_kinrel_chn]));
const assocDesc = new Map((db.prepare('SELECT c_assoc_code, c_assoc_desc_chn FROM ASSOC_CODES').all() as unknown as Array<{ c_assoc_code: number; c_assoc_desc_chn: string }>).map((r) => [r.c_assoc_code, r.c_assoc_desc_chn]));

const findByName = db.prepare('SELECT c_personid, c_name_chn, c_birthyear, c_deathyear, c_index_year FROM BIOG_MAIN WHERE c_name_chn = ?');
const entriesOf = db.prepare('SELECT c_year, c_entry_code, c_exam_rank FROM ENTRY_DATA WHERE c_personid = ?');
const kinOf = db.prepare('SELECT c_kin_id, c_kin_code FROM KIN_DATA WHERE c_personid = ?');
const assocOf = db.prepare('SELECT c_assoc_id, c_assoc_code, c_assoc_first_year FROM ASSOC_DATA WHERE c_personid = ?');
const biogOf = db.prepare('SELECT c_personid, c_name_chn, c_birthyear, c_deathyear, c_index_year FROM BIOG_MAIN WHERE c_personid = ?');

// ---------- 类型映射（CBDB 关系描述 → 本站五型扩展七型） ----------
const mapKin = (desc: string | undefined): string | null => {
  if (!desc) return null;
  if (/父子|之父|其子|父女|母女|母子/.test(desc)) return '父子';
  if (/翁婿|岳父|女婿|妻之父|壻/.test(desc)) return '翁婿';
  if (/兄|弟|姊|妹|叔|侄|舅|甥|祖|孫|孙|族|堂|從|从/.test(desc)) return '亲属';
  return '亲属';
};
const mapAssoc = (desc: string | undefined): string | null => {
  if (!desc) return null;
  if (/同年友/.test(desc)) return '同年';
  if (/門生|门生|恩主|座主|座師|座师|師|师/.test(desc)) return '师生';
  if (/彈劾|弹劾|攻訐|政敵|政敌|排斥/.test(desc)) return '政敌';
  if (/友|同僚|共事|幕|屬下|属下|上司/.test(desc)) return '同僚';
  return null; // 无法映射的类型丢弃
};

// ---------- 主循环：双键匹配 ----------
// 人工复核确认队列（cbdb-match-reviewed.json）直接并入 matches，不再进复核队列
const reviewedPath = join(seedDir, 'cbdb-match-reviewed.json');
const reviewed = new Map<string, { cbdbId: number; confidence: number; rationale: string }>();
try {
  const raw = JSON.parse(readFileSync(reviewedPath, 'utf8'));
  for (const [k, v] of Object.entries(raw)) {
    if (k === '_comment') continue;
    reviewed.set(k, v as { cbdbId: number; confidence: number; rationale: string });
  }
} catch { /* 文件不存在 */ }
if (reviewed.size) console.log(`人工复核已确认 ${reviewed.size} 人并入`);

const matches = new Map<string, { cbdbId: number; confidence: number; via: string }>(); // zid → 匹配结果
for (const [zid, r] of reviewed) {
  matches.set(zid, { cbdbId: r.cbdbId, confidence: r.confidence, via: `人工复核：${r.rationale}` });
}
const reviewQueue: Array<Record<string, unknown>> = [];
for (const p of roster) {
  if (reviewed.has(p.id)) continue; // 已人工确认
  let cands: BiogRow[] = [];
  for (const v of variants(p.name)) cands.push(...(findByName.all(v) as unknown as BiogRow[]));
  // 去重
  const seenPid = new Set();
  cands = cands.filter((c) => !seenPid.has(c.c_personid) && seenPid.add(c.c_personid));
  if (!cands.length) continue;

  let best: { cbdbId: number; confidence: number; via: string } | null = null;
  for (const c of cands) {
    const ents = (entriesOf.all(c.c_personid) as unknown as EntryRow[]).filter((e) => jinshiSet.has(e.c_entry_code));
    for (const e of ents) {
      if (e.c_year === p.exam_year) { best = { cbdbId: c.c_personid, confidence: 1.0, via: `entry ${e.c_year} ${e.c_exam_rank ?? ''}` }; break; }
      if (e.c_year && Math.abs(e.c_year - p.exam_year) <= 2 && (!best || best.confidence < 0.9)) {
        best = { cbdbId: c.c_personid, confidence: 0.9, via: `entry ${e.c_year}（±2y）` };
      }
    }
    if (best?.confidence === 1.0) break;
  }
  if (best) {
    if (best.confidence === 1.0) matches.set(p.id, best);
    else reviewQueue.push({ id: p.id, name: p.name, exam_year: p.exam_year, ...best, reason: '科年 ±2 年' });
  } else {
    // 生卒年辅助消歧：名录有生卒且唯一候选吻合 → 标 vita_match 供复核提速（仍须人工确认，不自动入）
    const rosterP = p;
    const withVita = cands.map((c) => ({
      cbdbId: c.c_personid, birth: c.c_birthyear, death: c.c_deathyear, index_year: c.c_index_year,
      vita_match: Boolean(
        (rosterP.birth && c.c_birthyear === Number(rosterP.birth)) ||
        (rosterP.death && c.c_deathyear === Number(rosterP.death))),
    }));
    const vitaHits = withVita.filter((c) => c.vita_match);
    reviewQueue.push({
      id: p.id, name: p.name, exam_year: p.exam_year, reason: cands.length > 1 ? `同名 ${cands.length} 人待消歧` : '仅姓名命中',
      vita_hint: vitaHits.length === 1 ? `唯一生卒吻合候选 cbdb:${vitaHits[0].cbdbId}` : undefined,
      candidates: withVita.slice(0, 5),
    });
  }
}
const autoCount = [...matches.values()].filter((m) => m.confidence === 1.0).length;
console.log(`匹配：1.0 自动入 ${autoCount} 人 + 复核确认 ${reviewed.size} 人 = ${matches.size}；复核队列 ${reviewQueue.length} 人`);

// ---------- 关系提取（仅 1.0 匹配者） ----------
const zidByCbdb = new Map([...matches.entries()].map(([z, m]) => [m.cbdbId, z]));
interface DraftEdge { from: string; to: string; type: string; note: string; confidence: number; source_id: string }
const newEdges = new Map<string, DraftEdge>(); // pairKey → edge
interface ExtEdge { zid: string; cbdbId: number; type: string; desc: string }
interface ExtAcc { info: BiogRow; links: Set<string>; descs: Set<string> }
const externals = new Map<number, ExtAcc>(); // cbdbId → 聚合
const extEdges: ExtEdge[] = [];                // 逐条外延边草稿

const addEdge = (from: string, to: string, type: string, note: string, conf: number): void => {
  if (from === to) return;
  const k = pairKey(from, to);
  if (existingPairs.has(k) || newEdges.has(k)) return;
  newEdges.set(k, { from, to, type, note, confidence: conf, source_id: 's0010' });
};

for (const [zid, m] of matches) {
  // 亲属
  for (const k of kinOf.all(m.cbdbId) as unknown as Array<{ c_kin_id: number; c_kin_code: number }>) {
    const other = biogOf.get(k.c_kin_id) as unknown as BiogRow | undefined;
    if (!other) continue;
    const otherZid = zidByCbdb.get(k.c_kin_id);
    const type = mapKin(kinDesc.get(k.c_kin_code));
    if (otherZid) {
      if (type) addEdge(zid, otherZid, type, `CBDB 亲属：${kinDesc.get(k.c_kin_code)}`, 1.0);
    } else {
      const e = externals.get(k.c_kin_id) ?? { info: other, links: new Set<string>(), descs: new Set<string>() };
      e.links.add(zid); e.descs.add(`亲属:${kinDesc.get(k.c_kin_code) ?? k.c_kin_code}`);
      externals.set(k.c_kin_id, e);
      if (type) extEdges.push({ zid, cbdbId: k.c_kin_id, type, desc: `CBDB 亲属：${kinDesc.get(k.c_kin_code) ?? k.c_kin_code}` });
    }
  }
  // 社会关系
  for (const a of assocOf.all(m.cbdbId) as unknown as Array<{ c_assoc_id: number; c_assoc_code: number; c_assoc_first_year: number | null }>) {
    const other = biogOf.get(a.c_assoc_id) as unknown as BiogRow | undefined;
    if (!other) continue;
    const otherZid = zidByCbdb.get(a.c_assoc_id);
    const desc = assocDesc.get(a.c_assoc_code);
    const type = mapAssoc(desc);
    if (otherZid) {
      // 同年已由 build-data 派生，跳过；其余入库
      if (type && type !== '同年') {
        addEdge(zid, otherZid, type, `CBDB：${desc}${a.c_assoc_first_year ? `（${a.c_assoc_first_year}）` : ''}`, 1.0);
      }
    } else if (type) {
      const e = externals.get(a.c_assoc_id) ?? { info: other, links: new Set<string>(), descs: new Set<string>() };
      e.links.add(zid); e.descs.add(desc ?? '');
      externals.set(a.c_assoc_id, e);
      extEdges.push({ zid, cbdbId: a.c_assoc_id, type, desc: `CBDB：${desc}${(a.c_assoc_first_year ?? 0) > 0 ? `（${a.c_assoc_first_year}）` : ''}` });
    }
  }
}
console.log(`新关系边 ${newEdges.size} 条；外延人物候选池 ${externals.size} 人`);

// ---------- 外延人物门槛（M5 计划 §2.3：≥2 状元关系，或 1 状元但暂列复核） ----------
const extList = [...externals.values()].map((e) => ({
  cbdb_id: e.info.c_personid,
  name: e.info.c_name_chn,
  birth: e.info.c_birthyear || undefined, death: e.info.c_deathyear || undefined, index_year: e.info.c_index_year || undefined,
  links: [...e.links], link_count: e.links.size,
  rel_descs: [...e.descs],
})).sort((a, b) => b.link_count - a.link_count);
const extAdopt = extList.filter((e) => e.link_count >= 2).slice(0, 80);

// ---------- 外延 stub + 边草稿 / --apply 合并入库 ----------
const applyMode = process.argv.includes('--apply');
const extIdByCbdb = new Map<number, string>();
interface ExtStub { id: string; name: string; cbdb_id: number; birth_year?: number; death_year?: number; index_year?: number; note: string; source_id: string }
{
  // 既有 externals.yaml 的 cbdb_id → w 号映射（幂等）
  const extPath = join(root, 'data', 'externals.yaml');
  let existing: ExtStub[] = [];
  try { existing = (yaml.load(readFileSync(extPath, 'utf8')) as ExtStub[]) ?? []; } catch { /* 文件不存在 */ }
  for (const e of existing) extIdByCbdb.set(e.cbdb_id, e.id);
  let nextW = existing.length
    ? Math.max(...existing.map((e) => Number(e.id.slice(1)))) + 1 : 1;
  const adoptedCbdb = new Set(extAdopt.map((e) => e.cbdb_id));
  const newStubs: ExtStub[] = [];
  for (const e of extAdopt) {
    if (extIdByCbdb.has(e.cbdb_id)) continue;
    const w = `w${String(nextW++).padStart(4, '0')}`;
    extIdByCbdb.set(e.cbdb_id, w);
    const linkNames = e.links.map((z) => roster.find((r) => r.id === z)?.name).filter(Boolean).join('、');
    newStubs.push({
      id: w, name: e.name, cbdb_id: e.cbdb_id,
      birth_year: e.birth ?? undefined, death_year: e.death ?? undefined, index_year: e.index_year ?? undefined,
      note: `与状元 ${linkNames} 有${[...new Set(e.rel_descs.map((d) => d.split(':')[0]))].join('/')}关系（CBDB）`,
      source_id: 's0010',
    });
  }
  // 采纳外延的边（去重：同 zid+w+type 仅一条）
  const extEdgeSeen = new Set<string>();
  const adoptedEdges: Array<{ from: string; to: string; type: string; note: string; source_id: string }> = [];
  for (const ee of extEdges) {
    if (!adoptedCbdb.has(ee.cbdbId)) continue;
    const w = extIdByCbdb.get(ee.cbdbId);
    const k = `${ee.zid}|${w}|${ee.type}`;
    if (extEdgeSeen.has(k)) continue;
    extEdgeSeen.add(k);
    adoptedEdges.push({ from: ee.zid, to: w!, type: ee.type, note: ee.desc, source_id: 's0010' });
  }
  if (applyMode && (newStubs.length || adoptedEdges.length)) {
    const merged = [...existing, ...newStubs];
    writeFileSync(extPath,
      `# 外延人物表（M5 T4）：非状元但与 ≥2 名状元有 CBDB 记录关系者；stub 档案，不入星图/统计分母\n` +
      yaml.dump(merged, { lineWidth: 120 }));
    // 关系并入 relations.yaml（幂等：按 from|to|type 去重）
    const relPath = join(root, 'data', 'relations.yaml');
    const relRaw = readFileSync(relPath, 'utf8');
    const relExisting = new Set(manual.map((r) => `${r.from}|${r.to}|${r.type}`));
    const toAppend = adoptedEdges.filter((e) => !relExisting.has(`${e.from}|${e.to}|${e.type}`));
    if (toAppend.length) {
      const zName = (z: string) => roster.find((r) => r.id === z)?.name ?? z;
      const wName = new Map(merged.map((m) => [m.id, m.name]));
      const block = '\n# ===== M5 CBDB 导入（外延人物边，置信度 1.0，source s0010） =====\n' +
        toAppend.map((e) =>
          `- from: ${e.from}   # ${zName(e.from)}\n  to: ${e.to}     # ${wName.get(e.to) ?? e.to}（外延）\n  type: ${e.type}\n  note: ${e.note}\n  source_id: s0010`
        ).join('\n') + '\n';
      writeFileSync(relPath, relRaw.replace(/\s*$/, '') + block);
    }
    console.log(`apply: externals +${newStubs.length}（总 ${merged.length}），关系 +${toAppend.length}`);
  } else {
    // 草稿模式
    writeFileSync(join(seedDir, 'cbdb-externals-draft.yaml'),
      `# 外延人物草稿（${newStubs.length} 新增 + ${adoptedEdges.length} 边）——复核后 --apply 入库\nexternals:\n` +
      yaml.dump(newStubs, { lineWidth: 120 }).split('\n').map((l) => '  ' + l).join('\n') +
      '\nedges:\n' + yaml.dump(adoptedEdges, { lineWidth: 120 }).split('\n').map((l) => '  ' + l).join('\n'));
  }
}

// ---------- 产出 ----------
writeFileSync(join(seedDir, 'cbdb-match.json'), JSON.stringify(
  Object.fromEntries([...matches.entries()].map(([z, m]) => [z, m])), null, 1));
writeFileSync(join(seedDir, 'cbdb-review.json'), JSON.stringify(reviewQueue, null, 1));
writeFileSync(join(seedDir, 'cbdb-relations-draft.yaml'),
  `# CBDB 导入关系草稿（${newEdges.size} 条，置信度均 1.0，source s0010）——复核后并入 relations.yaml\n` +
  [...newEdges.values()].map((e) => {
    const f = roster.find((r) => r.id === e.from), t = roster.find((r) => r.id === e.to);
    return `- from: ${e.from}   # ${f?.name}（${f?.exam_year}）\n  to: ${e.to}     # ${t?.name}（${t?.exam_year}）\n  type: ${e.type}\n  note: ${e.note}\n  source_id: s0010`;
  }).join('\n') + '\n');
writeFileSync(join(seedDir, 'externals-candidates.json'), JSON.stringify({ adopt: extAdopt, pool_total: extList.length, all: extList.slice(0, 300) }, null, 1));

const rep: string[] = [];
rep.push('# CBDB 匹配报告（M5 T3）', '', `> 库版本 cbdb_20261010；名录 ${roster.length} 人`, '');
rep.push('| 项 | 数量 |', '|---|---|');
rep.push(`| 双键精确匹配（1.0） | ${matches.size} |`);
rep.push(`| 人工复核队列（0.7–0.9/消歧） | ${reviewQueue.length} |`);
rep.push(`| 未命中 | ${roster.length - matches.size - reviewQueue.length} |`);
rep.push(`| 新关系边（去重后，1.0） | ${newEdges.size} |`);
rep.push(`| 外延人物候选池 | ${extList.length} |`);
rep.push(`| 外延人物拟采纳（≥2 状元关系，≤80） | ${extAdopt.length} |`, '');
rep.push('## 新关系边明细', '');
for (const e of newEdges.values()) {
  const f = roster.find((r) => r.id === e.from), t = roster.find((r) => r.id === e.to);
  rep.push(`- ${f?.name}（${f?.exam_year}）↔ ${t?.name}（${t?.exam_year}）【${e.type}】${e.note}`);
}
writeFileSync(join(root, 'docs', 'CBDB匹配报告.md'), rep.join('\n') + '\n');
console.log('→ data/seed/cbdb-*.json|yaml / docs/CBDB匹配报告.md');
