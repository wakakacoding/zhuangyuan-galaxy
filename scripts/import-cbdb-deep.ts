// CBDB --deep 全量反查（M5-c 指令 A1）
// 与 import-cbdb.ts 的浅层匹配（人物双键识别）解耦：本模块只消费已确认的 346 个 personid
// （cbdb-match.json 的 1.0/0.95/0.9 + cbdb-match-reviewed.json），对其逐人全量反查
// ASSOC_DATA（社会关系）与 KIN_DATA（亲属），双向索引、去重、按映射表落型并分级置信度。
//
// 产出（干跑）：
//   data/seed/cbdb-deep-relations-draft.yaml   站内关系边候选（去重后）
//   data/seed/cbdb-deep-externals.json         外延候选池（≥2 状元关系者）
//   data/seed/cbdb-deep-review.json            人工复核队列（置信度 <1.0 者全部入队）
//   docs/CBDB-deep-反查报告.md                  统计三数 + 映射统计 + 明细
// 合入（--deep --apply）：读下列人工裁定文件（缺省则全量采纳并告警）
//   data/seed/cbdb-deep-reviewed.json          A3 裁定留痕
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import yaml from 'js-yaml';
import { mapAssocCode, rulesByFamily, type LocalRelationType, type SemanticFamily } from './cbdb-assoc-map';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const seedDir = join(dataDir, 'seed');
const docsDir = join(root, 'docs');
mkdirSync(docsDir, { recursive: true });

// stdout 同步写：保证 --deep 结束后 process.exit 不截断输出
const log = (s = ''): void => { process.stdout.write(s + '\n'); };

interface RosterRow { id: string; name: string; dynasty: string; exam_year: number; birth: string; death: string }
interface BiogRow {
  c_personid: number; c_name_chn: string;
  c_birthyear: number | null; c_deathyear: number | null; c_index_year: number | null;
}
interface Confirmed { zid: string; name: string; confidence: number; via: string }
interface DraftEdge {
  from: string; to: string; type: LocalRelationType; note: string;
  confidence: number; source_id: string; pair_key: string;
  /** CBDB 原始文献注（c_notes），仅入复核队列供裁定，不写入 relations.yaml */
  evidence?: string;
}
interface ExtEdge {
  zid: string; cbdb_id: number; type: LocalRelationType; note: string; confidence: number;
  evidence?: string;
}
interface ExtAcc { info: BiogRow; links: Set<string>; descs: Set<string> }

const pairKey = (a: string, b: string): string => [a, b].sort().join('|');

export function runDeep(): void {
  const applyMode = process.argv.includes('--apply');
  log('===== CBDB --deep 全量反查（M5-c A1）=====');

  // ---------- 0. 名录 + 繁简归一 ----------
  const roster: RosterRow[] = readFileSync(join(seedDir, 'roster.tsv'), 'utf8').split('\n').slice(1)
    .filter(Boolean).map((l) => l.split('\t'))
    .map(([id, name, dynasty, exam_year, reign, birth, death]) =>
      ({ id, name, dynasty, exam_year: Number(exam_year), birth, death }));
  const T2S: Record<string, string> = JSON.parse(readFileSync(join(dataDir, 't2s.json'), 'utf8'));
  const simp = (s: string): string => [...s].map((c) => T2S[c] ?? c).join('');
  const rosterById = new Map(roster.map((r) => [r.id, r]));

  // ---------- 1. 确认集（346）：cbdb-match.json + cbdb-match-reviewed.json ----------
  const confirmed = new Map<number, Confirmed>(); // cbdb personid → 状元
  const matchRaw = JSON.parse(readFileSync(join(seedDir, 'cbdb-match.json'), 'utf8')) as
    Record<string, { cbdbId: number; confidence: number; via?: string }>;
  for (const [zid, v] of Object.entries(matchRaw)) {
    confirmed.set(v.cbdbId, { zid, name: rosterById.get(zid)?.name ?? zid, confidence: v.confidence, via: v.via ?? '双键自动匹配' });
  }
  const reviewedPath = join(seedDir, 'cbdb-match-reviewed.json');
  let reviewedCount = 0;
  if (existsSync(reviewedPath)) {
    const revRaw = JSON.parse(readFileSync(reviewedPath, 'utf8')) as
      Record<string, { cbdbId: number; confidence: number; rationale: string }>;
    for (const [zid, v] of Object.entries(revRaw)) {
      if (zid === '_comment') continue;
      reviewedCount++;
      confirmed.set(v.cbdbId, { zid, name: rosterById.get(zid)?.name ?? zid, confidence: v.confidence, via: `人工复核：${v.rationale}` });
    }
  }
  log(`确认集：${confirmed.size} 人（其中人工复核留痕 ${reviewedCount}）`);

  // ---------- 2. 既有关系边（去重基准） ----------
  interface RelRow { from: string; to: string; type: string }
  const manual = ((yaml.load(readFileSync(join(dataDir, 'relations.yaml'), 'utf8')) ?? []) as RelRow[]);
  const existingPairs = new Set(manual.map((r) => pairKey(r.from, r.to)));
  log(`既有关系边（relations.yaml）：${manual.length} 条，涉及 ${existingPairs.size} 个无序对`);

  // ---------- 3. CBDB ----------
  const db = new DatabaseSync(join(dataDir, 'cbdb', 'cbdb_20261010.sqlite3'), { readOnly: true });
  const biogOf = db.prepare('SELECT c_personid, c_name_chn, c_birthyear, c_deathyear, c_index_year FROM BIOG_MAIN WHERE c_personid = ?');
  const kinDesc = new Map((db.prepare('SELECT c_kincode, c_kinrel_chn FROM KINSHIP_CODES').all() as unknown as Array<{ c_kincode: number; c_kinrel_chn: string }>).map((r) => [r.c_kincode, r.c_kinrel_chn]));
  const assocDesc = new Map((db.prepare('SELECT c_assoc_code, c_assoc_desc_chn FROM ASSOC_CODES').all() as unknown as Array<{ c_assoc_code: number; c_assoc_desc_chn: string }>).map((r) => [r.c_assoc_code, r.c_assoc_desc_chn]));
  // 双向索引：正向（本人为 X）+ 反向（本人为 Y），合并去重后即为该人的完整关系记录集
  const assocOut = db.prepare('SELECT c_assoc_id AS other, c_assoc_code AS code, c_notes AS notes FROM ASSOC_DATA WHERE c_personid = ?');
  const assocIn = db.prepare('SELECT c_personid AS other, c_assoc_code AS code, c_notes AS notes FROM ASSOC_DATA WHERE c_assoc_id = ?');
  const kinOut = db.prepare('SELECT c_kin_id AS other, c_kin_code AS code FROM KIN_DATA WHERE c_personid = ?');
  const kinIn = db.prepare('SELECT c_personid AS other, c_kin_code AS code FROM KIN_DATA WHERE c_kin_id = ?');

  // 亲属码 → 本站型（翁婿 / 父子 / 亲属）
  const mapKinDeep = (desc: string | undefined): LocalRelationType | null => {
    if (!desc || /未詳|missing data|非可用|暫時保留|待刪除/.test(desc)) return null;
    if (/岳父|女婿|岳母|妻父|得許娶|許妻以|妻之父/.test(desc)) return '翁婿';
    if (/族|從|堂|表|伯|叔|姑|舅|姨|甥|姪|侄|姻親|夫之|妻之|妾|姊妹|兄弟|媳|妯娌|連襟|外祖|外孫|同母異父|繼兄弟|繼姊妹/.test(desc)) return '亲属';
    if (/父|母|子|女|孫|祖|兒|嗣|養|繼/.test(desc)) return '父子';
    return '亲属';
  };

  // ---------- 4. 逐 pid 全量反查 ----------
  const edgeAcc = new Map<string, DraftEdge>();   // `${pairKey}|${type}` → 站内边
  const extAcc = new Map<number, ExtAcc>();       // 外延聚合
  const extEdges: ExtEdge[] = [];
  const extEdgeSeen = new Map<string, ExtEdge>();
  const droppedByFamily = new Map<SemanticFamily | '表外码', number>();
  const unmappedCodes = new Map<number, number>(); // 表外码频次（M6 细化输入）
  const codeHits = new Map<number, number>();
  const internalFamily = new Map<string, number>(); // 对端同属确认集的关系记录，按族分布
  let rawRecords = 0, uniqRecords = 0, skippedSameYear = 0, skippedExisting = 0, skippedSelf = 0, noBiog = 0;

  const bump = (m: Map<string | number, number>, k: string | number): void => { m.set(k, (m.get(k) ?? 0) + 1); };

  for (const [pid, c] of confirmed) {
    const recs: Array<{ other: number; code: number; src: 'assoc' | 'kin'; notes?: string | null }> = [];
    for (const a of assocOut.all(pid) as unknown as Array<{ other: number; code: number; notes: string | null }>) recs.push({ ...a, src: 'assoc' });
    for (const a of assocIn.all(pid) as unknown as Array<{ other: number; code: number; notes: string | null }>) recs.push({ ...a, src: 'assoc' });
    for (const k of kinOut.all(pid) as unknown as Array<{ other: number; code: number }>) recs.push({ ...k, src: 'kin' });
    for (const k of kinIn.all(pid) as unknown as Array<{ other: number; code: number }>) recs.push({ ...k, src: 'kin' });
    rawRecords += recs.length;

    const seen = new Set<string>();
    for (const r of recs) {
      if (r.other === pid) { skippedSelf++; continue; }
      const dk = `${r.src}|${r.other}|${r.code}`;
      if (seen.has(dk)) continue;
      seen.add(dk);
      uniqRecords++;

      // 落型
      let type: LocalRelationType | null;
      let note: string;
      let family: SemanticFamily | '亲属';
      // CBDB 原始文献注（裁定依据）：仅入复核队列，帮助 A3 判断矛盾著录
      const evidence = r.notes?.trim() ? r.notes.trim().slice(0, 200) : undefined;
      if (r.src === 'kin') {
        const d = kinDesc.get(r.code);
        type = mapKinDeep(d);
        note = `CBDB 亲属：${d ?? r.code}`;
        family = '姻亲';
      } else {
        const rule = mapAssocCode(r.code);
        const d = assocDesc.get(r.code);
        if (!rule) {
          bump(unmappedCodes, r.code);
          bump(droppedByFamily, '表外码');
          continue;
        }
        bump(codeHits, r.code);
        if (!rule.type) {
          bump(droppedByFamily, rule.family);
          continue;
        }
        type = rule.type;
        note = `CBDB：${d ?? r.code}`;
        family = rule.family;
      }
      if (!type) { bump(droppedByFamily, '其他'); continue; }
      // 同年由 build-data 按科年派生，不重复入库
      if (type === '同年') { skippedSameYear++; continue; }

      const otherZ = confirmed.get(r.other);
      if (otherZ) {
        bump(internalFamily, family);
        const pk = pairKey(c.zid, otherZ.zid);
        if (existingPairs.has(pk)) { skippedExisting++; continue; }
        // 置信度：关系两端均为双键精确匹配者 0.95；任一端为人工消歧（含外延对端）0.8
        const conf = (c.confidence === 1 && otherZ.confidence === 1) ? 0.95 : 0.8;
        const ek = `${pk}|${type}`;
        const prev = edgeAcc.get(ek);
        if (prev) {
          if (!prev.note.includes(note)) prev.note += `；${note}`;
          if (conf < prev.confidence) prev.confidence = conf;
          if (evidence && !prev.evidence?.includes(evidence)) prev.evidence = [prev.evidence, evidence].filter(Boolean).join(' ／ ');
        } else {
          edgeAcc.set(ek, {
            from: c.zid, to: otherZ.zid, type, note, confidence: conf, source_id: 's0010', pair_key: pk, evidence,
          });
        }
      } else {
        const info = biogOf.get(r.other) as unknown as BiogRow | undefined;
        if (!info) { noBiog++; continue; }
        const e = extAcc.get(r.other) ?? { info, links: new Set<string>(), descs: new Set<string>() };
        e.links.add(c.zid);
        e.descs.add(`${c.name}·${note.split('：')[1] ?? note}`);
        extAcc.set(r.other, e);
        // 同 (状元, 对端, 型) 只留一条（KIN 双向记录会成对出现，note 合并）
        const ekExt = `${c.zid}|${r.other}|${type}`;
        const prevE = extEdgeSeen.get(ekExt);
        if (prevE) {
          if (!prevE.note.includes(note)) prevE.note += `；${note}`;
          if (evidence && !prevE.evidence?.includes(evidence)) prevE.evidence = [prevE.evidence, evidence].filter(Boolean).join(' ／ ');
        } else {
          const ne: ExtEdge = { zid: c.zid, cbdb_id: r.other, type, note, confidence: 0.8, evidence };
          extEdgeSeen.set(ekExt, ne);
          extEdges.push(ne);
        }
      }
    }
  }

  const internalEdges = [...edgeAcc.values()].sort((a, b) => a.confidence - b.confidence || a.from.localeCompare(b.from));
  const extList = [...extAcc.values()].map((e) => ({
    cbdb_id: e.info.c_personid,
    name: e.info.c_name_chn,
    birth: e.info.c_birthyear || undefined,
    death: e.info.c_deathyear || undefined,
    index_year: e.info.c_index_year || undefined,
    links: [...e.links],
    link_names: e.links.size,
    link_count: e.links.size,
    rel_descs: [...new Set(e.descs)],
  })).sort((a, b) => b.link_count - a.link_count);
  const extAdopt = extList.filter((e) => e.link_count >= 2);

  // 名录线索：外延对端中，简化名与「尚未确认的状元」同名者（关系反查可为匹配提供旁证，交 A3/A5）
  const confirmedZids = new Set([...confirmed.values()].map((v) => v.zid));
  const pendingNames = new Map<string, string[]>();
  for (const r of roster) {
    if (confirmedZids.has(r.id)) continue;
    const k = simp(r.name);
    pendingNames.set(k, [...(pendingNames.get(k) ?? []), `${r.id}(${r.exam_year})`]);
  }
  const rosterHints = extList
    .filter((e) => pendingNames.has(simp(e.name)))
    .map((e) => ({ cbdb_id: e.cbdb_id, name: e.name, roster_candidates: pendingNames.get(simp(e.name)), link_count: e.link_count }));

  // ---------- 5. 统计三数 ----------
  const adoptedCbdbSet = new Set(extAdopt.map((e) => e.cbdb_id));
  const adoptedExtEdges = extEdges.filter((e) => adoptedCbdbSet.has(e.cbdb_id));

  // 预演 --apply 的去重结果（与 apply 段同口径）：已入库外延的边按 from|to|type 去重，
  // 新增外延的边必不重复。仅作 A5 决策参考，不等同实际采纳率。
  const projectedAppend = ((): number => {
    let ex: Array<{ id: string; cbdb_id: number }> = [];
    try { ex = ((yaml.load(readFileSync(join(dataDir, 'externals.yaml'), 'utf8')) as unknown[]) ?? []) as typeof ex; } catch { /* 表不存在 */ }
    const cbdb2w = new Map(ex.map((e) => [e.cbdb_id, e.id]));
    const relSeen = new Set(manual.map((r) => `${r.from}|${r.to}|${r.type}`));
    let n = 0;
    for (const ee of adoptedExtEdges) {
      const w = cbdb2w.get(ee.cbdb_id);
      if (!w) { n++; continue; }
      const k = `${ee.zid}|${w}|${ee.type}`;
      if (relSeen.has(k)) continue;
      relSeen.add(k); n++;
    }
    for (const e of internalEdges) {
      const k = `${e.from}|${e.to}|${e.type}`;
      if (relSeen.has(k)) continue;
      relSeen.add(k); n++;
    }
    return n;
  })();

  const stats = {
    confirmed: confirmed.size,
    raw_records: rawRecords,
    uniq_records: uniqRecords,
    internal_edge_candidates: internalEdges.length,
    internal_high: internalEdges.filter((e) => e.confidence === 0.95).length,
    internal_low: internalEdges.filter((e) => e.confidence === 0.8).length,
    external_pool: extList.length,
    external_adopt: extAdopt.length,
    external_edges: adoptedExtEdges.length,
    review_queue: internalEdges.length + adoptedExtEdges.length,
    projected_relations: manual.length + projectedAppend,
    skipped_same_year: skippedSameYear,
    skipped_existing_pair: skippedExisting,
    skipped_self: skippedSelf,
    dropped_no_biog: noBiog,
  };
  log(`反查记录 ${rawRecords} 条（去重后 ${uniqRecords}）`);
  log(`【统计三数】候选边 ${stats.internal_edge_candidates}（站内，0.95:${stats.internal_high} / 0.8:${stats.internal_low}）`
    + `｜外延池 ${stats.external_pool}（≥2 门槛采纳 ${stats.external_adopt} 人 / 外延边 ${stats.external_edges}）`
    + `｜复核队列 ${stats.review_queue}`);
  log(`全量采纳预估：relations.yaml ${manual.length} → ${stats.projected_relations} 条（叠加同年派生约 +36 → ${stats.projected_relations + 36}）`);
  log(`跳过：同年派生 ${skippedSameYear}、既有对已有边 ${skippedExisting}、自身 ${skippedSelf}`);

  // ---------- 6. 落盘（draft / review / report） ----------
  // 与现有 externals.yaml 的重合度：区分「已入库」与「本轮新增候选」
  const extOverlap = ((): number => {
    try {
      const ex = (yaml.load(readFileSync(join(dataDir, 'externals.yaml'), 'utf8')) as Array<{ cbdb_id: number }>) ?? [];
      const ids = new Set(ex.map((e) => e.cbdb_id));
      return extAdopt.filter((e) => ids.has(e.cbdb_id)).length;
    } catch { return 0; }
  })();

  const zName = (z: string): string => rosterById.get(z)?.name ?? z;
  const zYear = (z: string): number | undefined => rosterById.get(z)?.exam_year;

  // 同对多型 / 语义冲突检测：CBDB 中同一对人物可能同时著录「政敌」与「门客/同僚」等对立面
  // （多为源文献语境差异或著录误置），人工裁定须择一或核源，故单列提示。
  interface PairAgg { label: string; scope: '站内' | '外延'; types: Map<string, { note: string; evidence?: string }> }
  const pairAgg = new Map<string, PairAgg>();
  const notePair = (key: string, label: string, scope: '站内' | '外延', type: string, note: string, evidence?: string): void => {
    const a = pairAgg.get(key) ?? { label, scope, types: new Map<string, { note: string; evidence?: string }>() };
    a.types.set(type, { note, evidence });
    pairAgg.set(key, a);
  };
  for (const e of internalEdges) {
    notePair(e.pair_key, `${zName(e.from)}(${zYear(e.from)}) ↔ ${zName(e.to)}(${zYear(e.to)})`, '站内', e.type, e.note, e.evidence);
  }
  const adoptedExtCbdb2 = adoptedCbdbSet;
  const extNameByCbdb = new Map(extList.map((e) => [e.cbdb_id, e.name]));
  for (const ee of extEdges) {
    if (!adoptedExtCbdb2.has(ee.cbdb_id)) continue;
    notePair(`${ee.zid}|${ee.cbdb_id}`,
      `${zName(ee.zid)}(${zYear(ee.zid)}) ↔ ${extNameByCbdb.get(ee.cbdb_id) ?? ee.cbdb_id}（外延）`,
      '外延', ee.type, ee.note, ee.evidence);
  }
  const HOSTILE = (types: string[]): boolean => types.includes('政敌') && types.some((t) => t !== '政敌');
  const typeConflicts = [...pairAgg.values()]
    .filter((a) => a.types.size > 1)
    .map((a) => ({
      label: a.label, scope: a.scope, types: [...a.types.keys()],
      tension: HOSTILE([...a.types.keys()]),
      has_evidence: [...a.types.values()].some((v) => Boolean(v.evidence)),
      notes: [...a.types.entries()].map(([t, v]) => `${t}｜${v.note}${v.evidence ? `〔${v.evidence}〕` : ''}`),
    }))
    .sort((a, b) => Number(b.tension) - Number(a.tension));
  if (typeConflicts.length) {
    log(`同对多型提示 ${typeConflicts.length} 组（其中政敌与他型并存 ${typeConflicts.filter((c) => c.tension).length} 组，须人工择一或核源）`);
  }

  writeFileSync(join(seedDir, 'cbdb-deep-relations-draft.yaml'),
    `# CBDB --deep 站内关系边候选（${internalEdges.length} 条）——置信度均 <1.0，须人工复核后 --apply 入库\n` +
    `# 生成：scripts/import-cbdb.ts --deep ｜ 去重基准：data/relations.yaml（${manual.length} 条）+ 同年派生\n` +
    internalEdges.map((e) =>
      `- from: ${e.from}   # ${zName(e.from)}（${zYear(e.from)}）\n` +
      `  to: ${e.to}     # ${zName(e.to)}（${zYear(e.to)}）\n` +
      `  type: ${e.type}\n` +
      `  note: ${e.note}（CBDB 反查，置信度 ${e.confidence}）\n` +
      `  source_id: s0010`).join('\n') + '\n');

  writeFileSync(join(seedDir, 'cbdb-deep-externals.json'), JSON.stringify({
    _comment: 'CBDB --deep 外延候选池：非状元但与 ≥2 名已确认状元有 CBDB 关系记录者；name/link_count/rel_descs 供人工裁定',
    stats: { pool_total: extList.length, adopt: extAdopt.length },
    adopt: extAdopt,
    pool_all: extList.slice(0, 400),
    roster_hints: rosterHints,
  }, null, 1));

  writeFileSync(join(seedDir, 'cbdb-deep-review.json'), JSON.stringify({
    _comment: '待裁定队列（置信度 <1.0 全部入队）。A3 人工裁定后产出 cbdb-deep-reviewed.json：'
      + '{adopted_edges:[{from,to,type,rationale}],rejected_edges:[{from,to,type,reason}],'
      + 'adopted_externals:[{cbdb_id,name}],rejected_externals:[{cbdb_id,reason}]}',
    generated_at: new Date().toISOString().slice(0, 10),
    stats,
    internal_edges: internalEdges.map((e) => ({
      from: e.from, to: e.to, type: e.type,
      names: `${zName(e.from)}（${zYear(e.from)}）↔ ${zName(e.to)}（${zYear(e.to)}）`,
      note: e.note, confidence: e.confidence, evidence: e.evidence,
    })),
    external_edges: adoptedExtEdges,
    externals: extAdopt,
    type_conflicts: typeConflicts,
    roster_hints: rosterHints,
  }, null, 1));

  // ---------- 7. 报告 ----------
  const rep: string[] = [];
  rep.push('# CBDB --deep 全量反查报告（M5-c A1）', '');
  rep.push(`> 库版本 cbdb_20261010 ｜ 确认集 ${confirmed.size} 人 ｜ 复现：\`npx tsx scripts/import-cbdb.ts --deep\``, '');
  rep.push('## 一、统计三数', '', '| 指标 | 数量 |', '|---|---|');
  rep.push(`| 站内关系边候选 | **${stats.internal_edge_candidates}**（0.95 高置信 ${stats.internal_high} / 0.8 单方确认 ${stats.internal_low}） |`);
  rep.push(`| 外延候选池 | **${stats.external_pool}**（其中 ≥2 状元关系者 ${stats.external_adopt} 人 → 外延边 ${stats.external_edges} 条） |`);
  rep.push(`| 人工复核队列 | **${stats.review_queue}**（全部 <1.0，依「宁缺毋错」） |`);
  rep.push(`| 全量采纳后 relations.yaml | ${manual.length} → **${stats.projected_relations}** 条（叠加同年派生 36 → **${stats.projected_relations + 36}**） |`);
  rep.push('', `反查原始记录 ${rawRecords} 条 → 去重 ${uniqRecords} 条；跳过同年派生 ${skippedSameYear}、既有边 ${skippedExisting}、自身 ${skippedSelf}、无生平记录 ${noBiog}`, '');

  rep.push('## 二、类型映射命中与丢弃', '', `映射表规则 ${rulesByFamily().size ? [...rulesByFamily().values()].reduce((a, b) => a + b.length, 0) : 0} 条，按语义族：`, '');
  rep.push('| 语义族 | 登记码数 | 反查命中次数 | 去向 |', '|---|---|---|---|');
  const familyTo = (f: SemanticFamily): string =>
    f === '同年' ? '同年（由 build-data 派生，跳过）'
      : f === '同乡' ? '**丢弃**（本站无「同乡」型，M6 细化候选）'
        : ['师生', '姻亲', '共事', '政敌'].includes(f) ? '入库候选（复核后）'
          : '丢弃';
  for (const [f, codes] of rulesByFamily()) {
    const hits = codes.reduce((a, c) => a + (codeHits.get(c) ?? 0), 0);
    rep.push(`| ${f} | ${codes.length} | ${hits} | ${familyTo(f)} |`);
  }
  rep.push(`| 表外码（未登记） | ${unmappedCodes.size} | ${[...unmappedCodes.values()].reduce((a, b) => a + b, 0)} | 丢弃（未映射） |`, '');
  rep.push(`其他丢弃类合计：文本创作/题跋赠答（占绝大多数）、经济依附、司法程序——见 \`scripts/cbdb-assoc-map.ts\` 说明。`, '');

  const topUnmapped = [...unmappedCodes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (topUnmapped.length) {
    rep.push('### 表外码 TOP25（均为文本交往类，M6 若上线「文献往来」型可回收）', '');
    rep.push('| code | 描述 | 次数 |', '|---|---|---|');
    for (const [c, n] of topUnmapped) rep.push(`| ${c} | ${assocDesc.get(c) ?? '-'} | ${n} |`);
    rep.push('');
  }

  rep.push('## 三、站内关系边候选明细', '');
  rep.push(`确认集内部（状元 ↔ 状元）可映射关系记录共 ${[...internalFamily.values()].reduce((a, b) => a + b, 0)} 条，按族分布：`
    + ([...internalFamily.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join('、') || '无'), '');
  rep.push(`其中 ${skippedExisting} 条已由 relations.yaml 覆盖（既有 CBDB 导入边），新增候选如下：`, '');
  if (!internalEdges.length) rep.push('_无新候选（现有 relations.yaml 已覆盖 CBDB 中的状元间直接关系）_', '');
  else {
    rep.push('| from | to | 型 | 依据 | 置信度 |', '|---|---|---|---|---|');
    for (const e of internalEdges) {
      rep.push(`| ${zName(e.from)}(${zYear(e.from)}) | ${zName(e.to)}(${zYear(e.to)}) | ${e.type} | ${e.note} | ${e.confidence} |`);
    }
    rep.push('');
  }

  rep.push('## 四、外延候选池（≥2 状元关系）', '',
    `共 ${extAdopt.length} 人（池总计 ${extList.length} 人；现有 externals.yaml 已入库 ${extOverlap} 人，本轮新增候选 ${extAdopt.length - extOverlap} 人）。TOP30：`, '');
  rep.push('| CBDB ID | 姓名 | 生卒 | 关联状元数 | 关联状元 | 关系 |', '|---|---|---|---|---|---|');
  for (const e of extAdopt.slice(0, 30)) {
    rep.push(`| ${e.cbdb_id} | ${e.name} | ${e.birth ?? '-'}–${e.death ?? '-'} | ${e.link_count} | ${e.links.map(zName).join('、')} | ${e.rel_descs.slice(0, 3).join('；')} |`);
  }
  rep.push('');

  rep.push('## 五、名录线索（外延池中与「未确认状元」同名者）', '');
  if (rosterHints.length) {
    rep.push('关系反查可反向为人物匹配提供旁证，建议 A3 裁定外延池时一并复核：', '');
    rep.push('| CBDB ID | 姓名 | 关联状元数 | 名录待确认候选 |', '|---|---|---|---|');
    for (const h of rosterHints.slice(0, 40)) rep.push(`| ${h.cbdb_id} | ${h.name} | ${h.link_count} | ${h.roster_candidates?.join('、')} |`);
    rep.push('');
  } else {
    rep.push(`本轮外延池（${extList.length} 人）中**未见**与 ${roster.length - confirmed.size} 名未确认状元同名者——关系反查暂无反向识别人物匹配的线索。`, '');
  }

  if (typeConflicts.length) {
    rep.push('## 六、同对多型冲突提示（A3 裁定须择一或核源）', '',
      `共 ${typeConflicts.length} 组，其中「政敌」与他型并存者 ${typeConflicts.filter((c) => c.tension).length} 组（标注 ⚠）；`
      + `带 CBDB 文献注者 ${typeConflicts.filter((c) => c.has_evidence).length} 组（注为裁定首要依据）：`, '');
    rep.push('| 范围 | 人物对 | 并存型 | 著录依据（〔〕内为 CBDB 文献注） |', '|---|---|---|---|');
    for (const c of typeConflicts.slice(0, 40)) {
      rep.push(`| ${c.scope} | ${c.label} | ${c.tension ? '⚠ ' : ''}${c.types.join(' / ')} | ${c.notes.join('；').slice(0, 260)} |`);
    }
    rep.push('');
  }

  rep.push('## 七、结论与 A5 决策输入', '');
  rep.push(`- **站内边（状元↔状元）候选仅 ${stats.internal_edge_candidates} 条**，其中 0.95 高置信 ${stats.internal_high} 条。CBDB 中已确认状元之间的直接关系，经浅层导入（39 条）后已近穷尽——此路不再有量。`);
  rep.push(`- **外延边（状元↔外延人物）候选 ${stats.external_edges} 条**，对应 ${stats.external_adopt} 名 ≥2 状元关系者。**这才是路径 A 的真正产出。**`);
  rep.push(`- 量级预估：全量采纳后 relations.yaml ${manual.length} → **${stats.projected_relations}** 条；叠加同年派生 36 → 站内关系总数 **${stats.projected_relations + 36}**，距 300 目标缺口降至约 **${300 - stats.projected_relations - 36}**（现状缺口 177）。`);
  rep.push('- 但外延边置信度一律 0.8（单方确认），须经 A3 按「宁缺毋错」逐条裁定；**采纳率直接决定最终增量**。');
  rep.push(`- 站内边 ${stats.internal_high} 条 0.95 者为宋、清两代明确的受业关系（张九成→汪应辰、徐元文→韩菼 等），建议优先核入。`);
  rep.push('- 剩余缺口主攻方向转为**路径 B：复核队列 120 人消歧**（每多确认 1 名状元，其与已确认者及外延池之间的边即解锁）+ 路径 C（档案关系抽取，已并入 M6 常态化）。');
  rep.push(`- 另需留意「同对多型冲突」${typeConflicts.length} 组（政敌与他型并存 ${typeConflicts.filter((c) => c.tension).length} 组），已在复核队列标注，裁定须择一或核源。`);
  writeFileSync(join(docsDir, 'CBDB-deep-反查报告.md'), rep.join('\n') + '\n');
  log('→ data/seed/cbdb-deep-relations-draft.yaml / cbdb-deep-externals.json / cbdb-deep-review.json');
  log('→ docs/CBDB-deep-反查报告.md');

  // ---------- 8. --apply 合入 ----------
  if (!applyMode) {
    log('干跑完成（未入库）。复核后执行：npx tsx scripts/import-cbdb.ts --deep --apply');
    db.close();
    return;
  }

  const extPath = join(dataDir, 'externals.yaml');
  const relPath = join(dataDir, 'relations.yaml');
  interface ExtStub { id: string; name: string; cbdb_id: number; birth_year?: number; death_year?: number; index_year?: number; note: string; source_id: string }
  const existingExt = ((yaml.load(readFileSync(extPath, 'utf8')) as ExtStub[]) ?? []);
  const extIdByCbdb = new Map<number, string>(existingExt.map((e) => [e.cbdb_id, e.id]));
  let nextW = existingExt.length ? Math.max(...existingExt.map((e) => Number(e.id.slice(1)))) + 1 : 1;

  // 人工裁定过滤：cbdb-deep-reviewed.json 存在则按其裁决，否则全量采纳（告警）
  const reviewedDeepPath = join(seedDir, 'cbdb-deep-reviewed.json');
  let adoptedEdges = internalEdges;
  let adoptedExt = extAdopt;
  if (existsSync(reviewedDeepPath)) {
    const rv = JSON.parse(readFileSync(reviewedDeepPath, 'utf8')) as {
      adopted_edges?: Array<{ from: string; to: string; type: string; rationale?: string }>;
      adopted_externals?: Array<{ cbdb_id: number }>;
    };
    const okEdge = new Set((rv.adopted_edges ?? []).map((e) => `${pairKey(e.from, e.to)}|${e.type}`));
    const okExt = new Set((rv.adopted_externals ?? []).map((e) => e.cbdb_id));
    adoptedEdges = internalEdges.filter((e) => okEdge.has(`${e.pair_key}|${e.type}`));
    adoptedExt = extAdopt.filter((e) => okExt.has(e.cbdb_id));
    log(`人工裁定文件在位：采纳边 ${adoptedEdges.length}/${internalEdges.length}，采纳外延 ${adoptedExt.length}/${extAdopt.length}`);
  } else {
    log('⚠ 未发现 cbdb-deep-reviewed.json（A3 裁定留痕），本次全量采纳 —— 建议先完成人工复核');
  }

  const newStubs: ExtStub[] = [];
  for (const e of adoptedExt) {
    if (extIdByCbdb.has(e.cbdb_id)) continue;
    const w = `w${String(nextW++).padStart(4, '0')}`;
    extIdByCbdb.set(e.cbdb_id, w);
    newStubs.push({
      id: w, name: e.name, cbdb_id: e.cbdb_id,
      birth_year: e.birth, death_year: e.death, index_year: e.index_year,
      note: `与状元 ${e.links.map(zName).join('、')} 有 CBDB 记录关系（${e.rel_descs.slice(0, 2).join('；')}）`,
      source_id: 's0010',
    });
  }
  const mergedExt = [...existingExt, ...newStubs];
  if (newStubs.length) {
    writeFileSync(extPath,
      '# 外延人物表（M5 T4 + M5-c A1 deep）：非状元但与 ≥2 名状元有 CBDB 记录关系者；stub 档案，不入星图/统计分母\n'
      + yaml.dump(mergedExt, { lineWidth: 120 }));
  }

  // 关系合并：站内边 + 已采纳外延的边；幂等按 from|to|type
  const relExisting = new Set(manual.map((r) => `${r.from}|${r.to}|${r.type}`));
  const relAppend: Array<{ from: string; to: string; type: string; note: string }> = [];
  for (const e of adoptedEdges) relAppend.push({ from: e.from, to: e.to, type: e.type, note: e.note });
  const adoptedExtIds = new Set(adoptedExt.map((e) => e.cbdb_id));
  for (const ee of extEdges) {
    if (!adoptedExtIds.has(ee.cbdb_id)) continue;
    const w = extIdByCbdb.get(ee.cbdb_id);
    if (!w) continue;
    const k = `${ee.zid}|${w}|${ee.type}`;
    if (relExisting.has(k)) continue;
    relExisting.add(k);
    relAppend.push({ from: ee.zid, to: w, type: ee.type, note: ee.note });
  }
  if (relAppend.length) {
    const relRaw = readFileSync(relPath, 'utf8');
    const wName = new Map(mergedExt.map((m) => [m.id, m.name]));
    const block = '\n# ===== M5-c A1 CBDB --deep 反查导入（置信度 0.8–0.95，source s0010） =====\n'
      + relAppend.map((e) =>
        `- from: ${e.from}   # ${zName(e.from)}\n  to: ${e.to}     # ${wName.get(e.to) ?? zName(e.to)}${wName.has(e.to) ? '（外延）' : ''}\n  type: ${e.type}\n  note: ${e.note}\n  source_id: s0010`).join('\n') + '\n';
    writeFileSync(relPath, relRaw.replace(/\s*$/, '') + block);
  }
  log(`apply 完成：外延 +${newStubs.length}（总 ${mergedExt.length}），关系 +${relAppend.length}（${manual.length} → ${manual.length + relAppend.length}）`);
  db.close();
}
