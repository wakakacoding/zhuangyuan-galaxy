// 数据构建管线：YAML/TSV 源 → 校验 → 地理回填 → 丰富度评分 → JSON 分包
// 用法：tsx scripts/build-data.ts
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import {
  PersonSchema, DynastySchema, SourceSchema, RelationSchema, CareerSchema, ExternalSchema, ReadingSchema,
  RELATION_TYPES, CAREER_STAGE_CATEGORIES, CAREER_FINAL_CATEGORIES,
  type Person, type Dynasty, type Source, type Relation, type PersonIndexEntry, type External, type Reading,
  type Career, type EdgesFile, type Community,
} from '../src/lib/schema';
import { enteredAnyGroup, splitCareer } from '../src/lib/careerSplit';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// D5 负向测试：BUILD_DATA_DIR / BUILD_OUT_DIR 指向隔离副本，默认仍是仓库 data 与 public/data。
const dataDir = process.env.BUILD_DATA_DIR ? join(process.env.BUILD_DATA_DIR) : join(root, 'data');
const outDir = process.env.BUILD_OUT_DIR ? join(process.env.BUILD_OUT_DIR) : join(root, 'public', 'data');
const docsDir = process.env.BUILD_DOCS_DIR ? join(process.env.BUILD_DOCS_DIR) : join(root, 'docs');

let errors = 0;
const err = (msg: string) => { console.error('  \u2717 ' + msg); errors++; };

// M5-d D5: validate fully, then write. A failed run must not mkdir or writeFile.
// This does not promise rollback if the disk fails mid-write.
const assertClean = () => {
  if (!errors) return;
  console.error('\n\u6784\u5efa\u5931\u8d25\uff1a' + errors + ' \u4e2a\u9519\u8bef\uff08\u672a\u5199\u5165\u4efb\u4f55\u4ea7\u7269\uff09');
  process.exit(1);
};
const warn = (msg: string) => console.warn(`  ⚠ ${msg}`);

// ---------- 干支 ----------
const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const ganzhi = (year: number) =>
  STEMS[(year - 4) % 10] + BRANCHES[(year - 4) % 12];

// ---------- 繁简归一（地名匹配 + 搜索索引用，单一真源：data/t2s.json） ----------
// 地名与人名用字合并表；前端 src/lib/normalize.ts 直接 import 同一 JSON，改表只改一处
const T2S: Record<string, string> = JSON.parse(readFileSync(join(dataDir, 't2s.json'), 'utf8'));
const simp = (s: string) => [...s].map((c) => T2S[c] ?? c).join('');

// ---------- 1. 朝代 ----------
const dynasties = (yaml.load(readFileSync(join(dataDir, 'dynasties.yaml'), 'utf8')) as unknown[])
  .map((d) => DynastySchema.parse(d));
const dynastyByKey = new Map(dynasties.map((d) => [d.key, d]));
console.log(`✓ 朝代 ${dynasties.length}`);

// ---------- 2. 出处 ----------
const sources = (yaml.load(readFileSync(join(dataDir, 'sources.yaml'), 'utf8')) as unknown[])
  .map((s) => SourceSchema.parse(s));
const sourceById = new Map(sources.map((s) => [s.id, s]));
console.log(`✓ 出处 ${sources.length}`);

// ---------- 3. 骨架名录（roster.tsv） ----------
// 列：id name dynasty exam_year reign birth death native_hist tags birth_circa death_circa
// birth_circa/death_circa 为 M5-d D1 追加（追加在末尾，兼容所有按位读取的历史脚本）
const tsv = readFileSync(join(dataDir, 'seed', 'roster.tsv'), 'utf8');
const rosterLines = tsv.split('\n').slice(1).filter(Boolean);
const persons: Person[] = rosterLines.map((line) => {
  const [id, name, dynasty, exam_year, reign, birth, death, native_hist, tags, birth_circa, death_circa] = line.split('\t');
  return PersonSchema.parse({
    id, name, dynasty,
    exam_year: Number(exam_year),
    reign: reign || undefined,
    birth_year: birth ? Number(birth) : undefined,
    death_year: death ? Number(death) : undefined,
    birth_circa: birth_circa === '1',
    death_circa: death_circa === '1',
    native_hist: native_hist || '',
    tags: tags ? tags.split(/[;,，；]/) : [],
    events: [],
    source_id: undefined,
  });
});
console.log(`✓ 骨架名录 ${persons.length}`);
const personById = new Map(persons.map((p) => [p.id, p]));

// ---------- 3b. 考据补录表（roster-supplements.tsv） ----------
// M5-d D3 新增：补录行的 source_note 是「异说并存」类身份争议的**考据依据唯一来源**
//（roster.tsv 只承载 tag 与结构化字段，不承载长文本），构建期据此回填 dispute_note。
const suppPath = join(dataDir, 'seed', 'roster-supplements.tsv');
const supplements = existsSync(suppPath)
  ? readFileSync(suppPath, 'utf8').split('\n').slice(1)
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => {
        const [name, dynasty, exam_year, reign, birth, death, native_hist, tags, source_note] = l.split('\t');
        return {
          name, dynasty, exam_year: Number(exam_year), reign, birth, death,
          native_hist: native_hist ?? '', tags: tags ?? '', source_note: source_note ?? '',
        };
      })
  : [];
const suppKey = (name: string, dynasty: string, examYear: number) => `${simp(name)}|${dynasty}|${examYear}`;
const rosterKeySet = new Set(persons.map((p) => suppKey(p.name, p.dynasty, p.exam_year)));
// 补录表是「待合并」清单：每行都应已由 `roster-diff.mjs --apply` 并入名录。行只存在于补录表
// 正是历史上补录人被漏收的形态，故直接 err，而不是静默当作「尚未合并」放过。
for (const s of supplements) {
  if (!rosterKeySet.has(suppKey(s.name, s.dynasty, s.exam_year))) {
    err(`补录表「${s.name}」（${s.dynasty} ${s.exam_year}）尚未并入名录——请先运行 node scripts/roster-diff.mjs --apply`);
  }
}
const suppNoteByKey = new Map(supplements.map((s) => [suppKey(s.name, s.dynasty, s.exam_year), s.source_note]));
const personBySuppKey = new Map(persons.map((p) => [suppKey(p.name, p.dynasty, p.exam_year), p]));
if (supplements.length) console.log(`✓ 考据补录表 ${supplements.length} 行（已并入名录）`);

// ---------- 4. 深度档案合并 ----------
const profileFiles = readdirSync(join(dataDir, 'persons')).filter((f) => f.endsWith('.yaml'));
// 7e 守卫用：合并前快照名录侧籍贯（合并后 persons.native_hist 已被深档覆盖，无法回查）
const rosterNativeById = new Map(persons.map((p) => [p.id, p.native_hist]));
// 记录每个深档在 career 下**显式写出**的字段：4b 节据此区分「深档值」与「回填值」，
// 否则两个回填文件（careers.yaml / careers-mined-qing.yaml）之间的取值差会被误判为深档冲突
const deepCareerKeys = new Map<string, Set<string>>();
for (const f of profileFiles) {
  const fp = join(dataDir, 'persons', f);
  const raw = yaml.load(readFileSync(fp, 'utf8')) as Record<string, unknown>;
  const profile = PersonSchema.parse(raw);
  const base = personById.get(profile.id);
  if (!base) { err(`深度档案 ${f} 的 id ${profile.id} 不在骨架名录中`); continue; }
  // 深度档案覆盖骨架字段（以 YAML 为准）——但**只覆盖 YAML 里显式写出的字段**。
  // M5-d D1：zod 的 default() 会把未写出的 birth_circa/death_circa 等填成默认值，
  // 若无条件 Object.assign，深档未写 circa 者会把名录侧维基解析出的 circa 静默清零。
  for (const k of Object.keys(raw)) {
    if (k in profile) (base as unknown as Record<string, unknown>)[k] = (profile as unknown as Record<string, unknown>)[k];
  }
  if (raw.career && typeof raw.career === 'object') deepCareerKeys.set(profile.id, new Set(Object.keys(raw.career as object)));
}
console.log(`✓ 深度档案 ${profileFiles.length}`);

// ---------- 4b. 仕途轻量字段回填（挖掘底稿 + 人工考据，聚合桑基数据源） ----------
// 优先级：深度档案 YAML > careers.yaml（人工考据）> careers-mined-qing.yaml（脚本挖掘）
// M5-d D2 修复：回填**仅补缺**——深档已写出的字段一律不被覆盖。
// 旧实现 `{...p.career, ...parsed}` 会让回填顶掉深档，与上面这行优先级正相反（周延儒深档 final_category=宰辅
// 被 careers.yaml 的「其他」顶掉即由此而来）。冲突不再静默：逐条留痕，构建末尾产出 docs/career-冲突裁定表.md。
const CAREER_FIELDS = ['first_office', 'first_category', 'mid_office', 'mid_category', 'final_office', 'final_category'] as const;
type CareerField = (typeof CAREER_FIELDS)[number];
type ConflictResolution = 'deep-kept' | 'backfill-applied' | 'pending';
type CareerConflict = {
  id: string; name: string; field: CareerField;
  deep: string; backfill: string; sources: string[]; alt: string[];
  resolution: ConflictResolution; reason?: string;
};
type OverrideEntry = { id: string; field: CareerField; value: string; reason: string };
type ReviewHint = { id: string; field: CareerField; advice: 'deep' | 'backfill'; confidence: string; why: string };

// 裁定表（data/seed/career-override-reviewed.json）：overrides = 显式覆写，kept_deep = 已裁定保留深档
//（可带 reason 作为复核理由，报告 §三 会显示为「显式保留深档」），review_hints = 待 X2 确认的建议复核项
const overridePath = join(dataDir, 'seed', 'career-override-reviewed.json');
const reviewFile = existsSync(overridePath)
  ? (JSON.parse(readFileSync(overridePath, 'utf8')) as {
      policy?: string; decided_at?: string; overrides?: OverrideEntry[];
      kept_deep?: { id: string; field: CareerField; reason?: string }[];
      review_hints?: ReviewHint[];
    })
  : {};
const careerOverrides = new Map<string, OverrideEntry>();
for (const o of reviewFile.overrides ?? []) {
  const key = `${o.id}#${o.field}`;
  if (!personById.has(o.id)) { err(`career-override-reviewed.json: id ${o.id} 不在骨架名录中`); continue; }
  if (!(CAREER_FIELDS as readonly string[]).includes(o.field)) { err(`career-override-reviewed.json: ${key} 字段名非法`); continue; }
  if (!o.reason || !o.reason.trim()) { err(`career-override-reviewed.json: ${key} 缺 reason——显式覆写必须写明理由`); continue; }
  const allowed: readonly string[] = o.field === 'final_category' ? CAREER_FINAL_CATEGORIES
    : o.field.endsWith('_category') ? CAREER_STAGE_CATEGORIES : [];
  if (allowed.length && !allowed.includes(o.value)) { err(`career-override-reviewed.json: ${key} 的值「${o.value}」不在该字段合法取值内`); continue; }
  if (careerOverrides.has(key)) { err(`career-override-reviewed.json: ${key} 重复裁定`); continue; }
  careerOverrides.set(key, o);
}
const keptDeep = new Map<string, string | undefined>(
  (reviewFile.kept_deep ?? []).map((k) => [`${k.id}#${k.field}`, k.reason] as [string, string | undefined]),
);

const careerConflicts = new Map<string, CareerConflict>();
let careerCount = 0;
let careerFilled = 0;
// 高优先级文件在前 + 仅补缺 → 天然实现 深档 > 人工考据 > 脚本挖掘
for (const rel of ['careers.yaml', 'seed/careers-mined-qing.yaml']) {
  const fp = join(dataDir, rel);
  if (!existsSync(fp)) continue;
  const careerRows = (yaml.load(readFileSync(fp, 'utf8')) as unknown[]) ?? [];
  for (const row of careerRows) {
    const { id, source_id, note, ...careerFields } = row as Record<string, unknown> & { id: string; source_id?: string; note?: string };
    const p = personById.get(id);
    if (!p) { err(`${rel}: id ${id} 不在骨架名录中`); continue; }
    if (source_id && !sourceById.has(source_id)) { err(`${rel}: ${id} 引用不存在出处 ${source_id}`); continue; }
    const parsed = CareerSchema.parse(careerFields) as Record<string, string | undefined>;
    const current = (p.career ?? {}) as Record<string, string | undefined>;
    const merged: Record<string, string | undefined> = { ...current };
    for (const f of CAREER_FIELDS) {
      const bv = parsed[f];
      if (bv === undefined) continue;
      const dv = current[f];
      if (dv === undefined) { merged[f] = bv; careerFilled++; continue; } // 无值（深档未写/写了留空）→ 补缺
      if (!deepCareerKeys.get(p.id)?.has(f)) continue; // 有值但非深档所出 → 高优先级回填文件已填，按既定优先级保持且不报冲突
      if (dv === bv) continue;                                          // 两处同值 → 非冲突
      const key = `${p.id}#${f}`;
      let ov = careerOverrides.get(key);
      if (ov && ov.value !== dv && ov.value !== bv) {
        err(`career-override-reviewed.json: ${key} 的裁定值「${ov.value}」既不等于深档值「${dv}」也不等于回填值「${bv}」——必须在两者中择一`);
        ov = undefined; // 裁定失效，回落默认口径，但冲突本身仍照常留痕（不得因此静默消失）
      }
      const applyBackfill = ov?.value === bv;
      const resolution: ConflictResolution = applyBackfill ? 'backfill-applied'
        : (ov || keptDeep.has(key)) ? 'deep-kept' : 'pending';
      merged[f] = applyBackfill ? bv : dv;
      const prev = careerConflicts.get(key);
      if (prev) {
        if (!prev.sources.includes(rel)) prev.sources.push(rel);
        if (prev.backfill !== bv) prev.alt.push(`${rel}：${bv}`);
      } else {
        careerConflicts.set(key, {
          id: p.id, name: p.name, field: f, deep: dv, backfill: bv,
          sources: [rel], alt: [], resolution, reason: ov?.reason ?? keptDeep.get(key),
        });
      }
    }
    p.career = merged as Career;
    careerCount++;
  }
}
for (const key of careerOverrides.keys()) {
  if (!careerConflicts.has(key)) warn(`career-override-reviewed.json: ${key} 无对应冲突（深档与回填已一致或字段缺失）——裁定已失效，建议清理`);
}
const conflictList = [...careerConflicts.values()].sort((a, b) =>
  a.id.localeCompare(b.id) || CAREER_FIELDS.indexOf(a.field) - CAREER_FIELDS.indexOf(b.field));
const pendingConflicts = conflictList.filter((c) => c.resolution === 'pending');
const appliedConflicts = conflictList.filter((c) => c.resolution === 'backfill-applied');
const keptConflicts = conflictList.filter((c) => c.resolution === 'deep-kept');
console.log(`✓ 仕途回填 ${careerCount} 条记录（补缺 ${careerFilled} 字段；冲突 ${conflictList.length} 条：保留深档 ${keptConflicts.length} / 覆写 ${appliedConflicts.length} / 待裁定 ${pendingConflicts.length}）`);
if (pendingConflicts.length) warn(`careers 冲突待裁定 ${pendingConflicts.length} 条：${pendingConflicts.map((c) => `${c.name}.${c.field}`).join('、')}——见 docs/career-冲突裁定表.md`);

// ---------- 4c. 异说身份判定（M5-d D3） ----------
// 背景：z0656 陆器 名录 tag 标「异说并存」却未映射为 disputed，且与 z0108 李从实（同为开成五年庚申科）
// 被同年派生逻辑连出一条「840 年同科」假边——两人是同一科的**异说竞争者**，不是同榜同年。
// 三条来源：
//   ① 名录 tag「异说并存」（人工标注）→ disputed=true，dispute_note 取补录表同行 source_note
//   ② data/seed/dispute-reviewed.json 显式登记 → 用于「同科异说的另一方」（名录行无 tag 者），详情页须互见
//   ③ 深档 YAML 的 disputed 字段（既有 7 人：婁師德/员半千/陳伯玉/郭元振/張九齡/崔液/王维）
// 铁律：disputed=true 必须带 dispute_note；同一人不得有两个来源；争议类 tag 未映射一律 err。
const DISPUTE_TAG = '异说并存';
const DISPUTE_PATTERN = /异说|異説|异説|存疑|待考|待攷|阙疑|闕疑|两说|兩說|说法不一|說法不一|异闻|異聞|互歧|异辞|異辭/;

const disputePath = join(dataDir, 'seed', 'dispute-reviewed.json');
const disputeFile = existsSync(disputePath)
  ? (JSON.parse(readFileSync(disputePath, 'utf8')) as {
      policy?: string; decided_at?: string;
      notes?: { id: string; dispute_note: string; reason: string }[];
    })
  : {};
const disputeRegistered = new Map<string, { dispute_note: string; reason: string }>();
for (const n of disputeFile.notes ?? []) {
  if (!personById.has(n.id)) { err(`dispute-reviewed.json: id ${n.id} 不在骨架名录中`); continue; }
  if (!n.dispute_note?.trim()) { err(`dispute-reviewed.json: ${n.id} 缺 dispute_note`); continue; }
  if (!n.reason?.trim()) { err(`dispute-reviewed.json: ${n.id} 缺 reason——显式登记必须写明异说依据`); continue; }
  if (disputeRegistered.has(n.id)) { err(`dispute-reviewed.json: ${n.id} 重复登记`); continue; }
  disputeRegistered.set(n.id, n);
}

// 同类排查（指令 D3 步骤 4）：补录表考据说明已述异说、名录行却未挂 tag 者 → 拦截
// （补录表只回填新增行，不会给既有行补 tags，故这里必须比对“合并后的名录行”，而非补录表自身 tags 列）
for (const s of supplements) {
  if (!DISPUTE_PATTERN.test(s.source_note)) continue;
  const p = personBySuppKey.get(suppKey(s.name, s.dynasty, s.exam_year));
  if (p && !p.tags.includes(DISPUTE_TAG)) {
    err(`补录表「${s.name}」的考据说明已述异说，但名录 ${p.id} 的 tags 未挂「${DISPUTE_TAG}」——请补齐 tag`);
  }
}

const disputeSource = new Map<string, string>(); // id → 来源（报告留痕）
const suppressedEdges: { from: string; to: string; note: string }[] = [];
for (const p of persons) {
  for (const t of p.tags) {
    if (t !== DISPUTE_TAG && DISPUTE_PATTERN.test(t)) {
      err(`${p.name}(${p.id}) 名录 tag「${t}」属争议类但未映射为 disputed——请统一改用「${DISPUTE_TAG}」或补进 build-data 映射`);
    }
  }
  const tagged = p.tags.includes(DISPUTE_TAG);
  const reg = disputeRegistered.get(p.id);
  const deepDisputed = p.disputed;     // 此刻为真 ⇒ 来源必是深档 YAML（名录侧无 disputed 列）
  const deepNote = p.dispute_note;
  if (tagged && reg) {
    err(`${p.name}(${p.id}) 的争议身份有两个来源（名录 tag「${DISPUTE_TAG}」+ dispute-reviewed.json）——择一留痕`);
  } else if (reg && deepDisputed) {
    err(`${p.name}(${p.id}) 已由深档 YAML 标 disputed，dispute-reviewed.json 重复登记——择一留痕`);
  }
  if (!tagged && !deepDisputed && !reg) continue;
  p.disputed = true;
  // 优先级：深档 YAML 说明（最详） > 补录表 source_note > 显式登记说明
  p.dispute_note = deepNote?.trim()
    || (tagged ? suppNoteByKey.get(suppKey(p.name, p.dynasty, p.exam_year))?.trim() : undefined)
    || reg?.dispute_note?.trim();
  if (!p.dispute_note) {
    err(`${p.name}(${p.id}) disputed=true 但缺 dispute_note——存疑结论必须写明依据（tag 来源请补 roster-supplements.tsv 的 source_note）`);
  }
  disputeSource.set(p.id, deepDisputed ? '深档 YAML' : tagged ? '名录 tag' : 'dispute-reviewed.json');
}
const disputedPersons = persons.filter((p) => p.disputed);
{
  const bySrc = (s: string) => disputedPersons.filter((p) => disputeSource.get(p.id) === s).length;
  console.log(`✓ 争议身份 ${disputedPersons.length} 人（深档 YAML ${bySrc('深档 YAML')} / 名录 tag ${bySrc('名录 tag')} / 显式登记 ${bySrc('dispute-reviewed.json')}）`);
}
const disputedIds = new Set(disputedPersons.map((p) => p.id));

// ---------- 5. 关系（人工考据 + 同年自动派生） ----------
const manualRelations = (yaml.load(readFileSync(join(dataDir, 'relations.yaml'), 'utf8')) as unknown[])
  .map((r) => RelationSchema.parse(r));

// 外延人物（M5 T4）：stub 档案，仅作关系图节点，不入星图/统计
const externals: External[] = existsSync(join(dataDir, 'externals.yaml'))
  ? (yaml.load(readFileSync(join(dataDir, 'externals.yaml'), 'utf8')) as unknown[] ?? [])
      .map((e) => ExternalSchema.parse(e))
  : [];
const externalById = new Map(externals.map((e) => [e.id, e]));
if (externals.length) console.log(`✓ 外延人物 ${externals.length}`);

for (const r of manualRelations) {
  const fromOk = personById.has(r.from) || externalById.has(r.from);
  const toOk = personById.has(r.to) || externalById.has(r.to);
  if (!fromOk) err(`关系 from=${r.from} 不存在`);
  if (!toOk) err(`关系 to=${r.to} 不存在`);
  if (r.source_id && !sourceById.has(r.source_id)) err(`关系 ${r.from}→${r.to} 引用了不存在的出处 ${r.source_id}`);
  if (r.source_id === undefined) warn(`关系 ${r.from}→${r.to}（${personById.get(r.from)?.name ?? externalById.get(r.from)?.name}→${personById.get(r.to)?.name ?? externalById.get(r.to)?.name}）缺出处`);
}
const nameOf = (id: string) => personById.get(id)?.name ?? externalById.get(id)?.name;

// 有方向关系的方向提示（T14 §5，2026-10-24 启用）：from 应为上位方。
// from 科年晚于 to 超过 5 年只警告（座主可以比门生年轻），不判错、不拦截。
const yearOf = (id: string) => personById.get(id)?.exam_year ?? externalById.get(id)?.index_year;
for (const r of manualRelations) {
  if (r.type === '父子' || r.type === '翁婿' || r.type === '座主' || r.type === '师承') {
    const fy = yearOf(r.from), ty = yearOf(r.to);
    if (fy !== undefined && ty !== undefined && fy > ty + 5) {
      warn(`方向提示：${nameOf(r.from)}→${nameOf(r.to)}（${r.type}）from 科年 ${fy} 晚于 to ${ty} 超 5 年，请确认方向`);
    }
  }
}

// 同年自动派生：同朝同科年（dynasty+exam_year）的两两连边，derived 标记，与人工边去重
const pairKey = (a: string, b: string, type: string) => [a, b].sort().join('|') + '#' + type;
const existingPairs = new Set(manualRelations.map((r) => pairKey(r.from, r.to, r.type)));

// 唯一性铁律（M5-c A5 新增）：同对同型只允许一条
// 背景：2026-10-15 A5 对账发现 relations.yaml 有 5 组同对同型重复边（批次追加与早期边撞车、note 措辞不同），
// 会在星图上画成重复连线并虚增计数。此处把校验落到构建期，批量追加撞车即 CI 拦截。
const manualSeen = new Set<string>();
for (const r of manualRelations) {
  const k = pairKey(r.from, r.to, r.type);
  if (manualSeen.has(k)) err(`关系重复：${nameOf(r.from)}↔${nameOf(r.to)}（${r.from}↔${r.to}）类型「${r.type}」出现多条——同对同型只应保留一条`);
  manualSeen.add(k);
}
const derivedRelations: Relation[] = [];
const cohorts = new Map<string, Person[]>();
for (const p of persons) {
  const key = `${p.dynasty}|${p.exam_year}`;
  if (!cohorts.has(key)) cohorts.set(key, []);
  cohorts.get(key)!.push(p);
}
for (const [, members] of cohorts) {
  if (members.length < 2) continue;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      // M5-d D3：disputed 人物不参与同年派生——其状元身份本身未定，据此连「同年」边会产出假边
      //（典型：z0108 李从实 ↔ z0656 陆器「840 年同科」）。同科异说者之间的真实关系是「异说互见」，
      // 不是同年；「异说」关系型留待 M6 schema 扩展，本期以双方 dispute_note 互指。
      if (disputedIds.has(members[i].id) || disputedIds.has(members[j].id)) {
        suppressedEdges.push({
          from: members[i].id, to: members[j].id,
          note: `${members[i].exam_year} 年同科（因一方状元身份存疑而抑制）`,
        });
        continue;
      }
      const k = pairKey(members[i].id, members[j].id, '同年');
      if (existingPairs.has(k)) continue;
      existingPairs.add(k);
      derivedRelations.push({
        from: members[i].id, to: members[j].id, type: '同年',
        note: `${members[i].exam_year} 年同科`,
      });
    }
  }
}
const relations: (Relation & { derived?: boolean })[] = [
  ...manualRelations,
  ...derivedRelations.map((r) => ({ ...r, derived: true as const })),
];
console.log(`✓ 关系 人工 ${manualRelations.length} + 同年派生 ${derivedRelations.length} = ${relations.length}${suppressedEdges.length ? `（异说抑制 ${suppressedEdges.length} 条：${suppressedEdges.map((e) => `${nameOf(e.from)}↔${nameOf(e.to)}`).join('、')}）` : ''}`);

// ---------- 6. 地名坐标回填 ----------
const placenames = readFileSync(join(dataDir, 'geo', 'placenames.csv'), 'utf8')
  .split('\n').slice(1).filter(Boolean)
  .map((l, idx) => {
    const [hist, modern, lat, lng] = l.split(',');
    return { hist: simp(hist.trim()), modern: modern.trim(), lat: Number(lat), lng: Number(lng), idx };
  })
  // 最长优先；同长度时后收录的（更具体的县名）优先于先收录的府名
  .sort((a, b) => b.hist.length - a.hist.length || b.idx - a.idx);

let geoHit = 0;
for (const p of persons) {
  const hay = simp(p.native_hist + '|' + (p.native_modern ?? ''));
  const hit = placenames.find((pl) => p.native_hist && hay.includes(pl.hist));
  if (hit) {
    p.lat = p.lat ?? hit.lat;
    p.lng = p.lng ?? hit.lng;
    p.native_modern = p.native_modern ?? hit.modern;
    geoHit++;
  }
  p.ganzhi = ganzhi(p.exam_year);
}
console.log(`✓ 地名回填 ${geoHit}/${persons.length} (${(geoHit / persons.length * 100).toFixed(1)}%)`);

// ---------- 7. 铁律校验 ----------
for (const p of persons) {
  for (const e of p.events) {
    if (e.source_id && !sourceById.has(e.source_id)) {
      err(`${p.name}(${p.id}) 事件"${e.title}"引用了不存在的出处 ${e.source_id}`);
    }
  }
}
for (const s of sources) {
  if (s.tier === 'A' && !s.title) err(`出处 ${s.id} 为 A 级但缺书名`);
}

// 7e. 骨架档籍贯占位符守卫（2026-10-25 T25 复测发现）
// 背景：DB21 骨架档生成时给 35 人写了 native_hist: 籍贯未详（待考）占位，
// 深档显式字段无条件覆盖名录（第 4 节），其中 18 人把名录真实籍贯顶掉、geo.json 丢 18 点。
// 占位本身合法（名录确实无籍贯者保留），但名录有值时占位即为数据冲突，err 拦截。
const NATIVE_PLACEHOLDER = /籍贯未详|待考/;
for (const f of profileFiles) {
  const rawTxt = readFileSync(join(dataDir, 'persons', f), 'utf8');
  const m = rawTxt.match(/^native_hist:\s*(.+)$/m);
  if (!m || !NATIVE_PLACEHOLDER.test(m[1])) continue;
  const id = f.split('-')[0];
  const rosterVal = rosterNativeById.get(id) ?? '';
  if (rosterVal && !NATIVE_PLACEHOLDER.test(rosterVal)) {
    err(`深度档案 ${f} 写了籍贯占位「${m[1].trim()}」，但名录 ${id} 有真实籍贯「${rosterVal}」——占位顶掉了名录值（DB21 骨架档生成缺陷，见 T25 复测）`);
  }
}

// 7d. 断言强度 ≤ 引文强度（2026-10-23 T02 D4 裁定落地，契约 v1.1）
// 背景：T02 抽验发现 z0179/z0180/z0427 三人的夺魁事件所挂正史原文并不含「第一」，
// 属「类型强于出处」。此处拦截其可机检的形态：夺魁事件所挂出处**已核**（check=quoted）
// 而引文不含名次明文，且同人无其他已核引文支撑——未核出处由 check 状态表达，不在此拦；
// 已标 disputed 者是披露中的异说状态，降为警告。
const RANK_MARK = /第一|榜首|状元|一甲一名|第一人/;
for (const p of persons) {
  const champ = p.events.find((e) => e.type === '夺魁');
  if (!champ?.source_id) continue;
  const src = sourceById.get(champ.source_id);
  if (!src || src.check !== 'quoted') continue;
  if (RANK_MARK.test(src.quote ?? '')) continue;
  const rescued = p.events.some((e) => {
    if (!e.source_id) return false;
    const s = sourceById.get(e.source_id);
    return s?.check === 'quoted' && RANK_MARK.test(s.quote ?? '');
  });
  if (rescued) continue;
  const msg = `${p.name}(${p.id}) 夺魁事件所挂 ${src.id} 的已核引文不含名次明文，且同人无其他已核引文支撑`;
  if (p.disputed) warn(`${msg}；该人已标 disputed，按异说披露`);
  else err(`${msg}——改挂正确出处、收敛断言或标 disputed（T02 D4）`);
}

// 7b. 生卒业务铁律（M5-d D1）——把「出生晚于登科」这类解析事故挡在构建期
// 背景：parse-wiki 曾把「？－658年」读成 birth=658，全站 38 人出生晚于登科而无人报警。
for (const p of persons) {
  if (p.birth_year !== undefined && p.birth_year > p.exam_year) {
    err(`${p.name}(${p.id}) 生年 ${p.birth_year} 晚于登科年 ${p.exam_year}`);
  }
  if (p.birth_year !== undefined && p.death_year !== undefined && p.birth_year > p.death_year) {
    err(`${p.name}(${p.id}) 生年 ${p.birth_year} 晚于卒年 ${p.death_year}`);
  }
  if (!p.research_status) p.research_status = 'uncompiled';
}

// 7c. 精选阅读。文件缺失就跳过；存在则整份校验。已审核段落必须有真实出处。
const readingsPath = join(dataDir, 'readings.yaml');
const readings: Reading[] = [];
if (existsSync(readingsPath)) {
  const parsed = ReadingSchema.array().safeParse(yaml.load(readFileSync(readingsPath, 'utf8')));
  if (!parsed.success) {
    err('readings.yaml 不符合结构：' + parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('；'));
  } else {
    const seenReading = new Set<string>();
    for (const reading of parsed.data) {
      if (seenReading.has(reading.id)) err(`阅读 ${reading.id} 的 ID 重复`);
      seenReading.add(reading.id);
      if (!personById.has(reading.person_id)) err(`阅读 ${reading.id} 指向不存在的人物 ${reading.person_id}`);
      if (reading.status === 'reviewed') {
        for (const [i, paragraph] of reading.paragraphs.entries()) {
          for (const sourceId of paragraph.source_ids) {
            if (!sourceById.has(sourceId)) err(`阅读 ${reading.id} 第 ${i + 1} 段引用了不存在的出处 ${sourceId}`);
          }
        }
      }
      readings.push(reading);
    }
  }
}
const publishedReadings = readings
  .filter((r) => r.status === 'reviewed')
  .sort((a, b) => a.order - b.order);
console.log(`✓ 精选阅读 ${publishedReadings.length} 篇公开 / ${readings.length} 篇录入`);

// ---------- 7c. 数据契约 v1 守卫（T05）：状态语义与四维事实不得互相冒充 ----------
// 规则来源：docs/数据契约-v1.md。这些检查只拦"写了但不自洽"的数据，不要求现在就把 656 人迁完。
const FACT_DIMS = ['highest', 'last', 'whereabouts', 'death'] as const;
const factCoverageRaw = { highest: { recorded: 0, unknown: 0 }, last: { recorded: 0, unknown: 0 }, whereabouts: { recorded: 0, unknown: 0 }, death: { recorded: 0, unknown: 0 } };
for (const p of persons) {
  if (p.research_status === 'searched' && !p.research_note?.trim()) {
    err(`${p.name}(${p.id}) research_status=searched 但缺 research_note——"查过没找到"必须写检索范围与结论`);
  }
  if (p.research_status !== 'uncompiled' && !p.research_checked_at) {
    warn(`${p.name}(${p.id}) research_status=${p.research_status} 但缺 research_checked_at（建议补 ISO 日期，便于复算）`);
  }
  for (const dim of FACT_DIMS) {
    const f = p.career?.[dim];
    if (!f) continue; // 缺省 = 尚未迁移，合法
    if ((f.status ?? 'recorded') === 'unknown') factCoverageRaw[dim].unknown++;
    else factCoverageRaw[dim].recorded++;
    if (f.source_id && !sourceById.has(f.source_id)) {
      err(`${p.name}(${p.id}) career.${dim} 引用不存在出处 ${f.source_id}`);
    }
    if ((f.status ?? 'recorded') === 'recorded' && !f.source_id) {
      warn(`${p.name}(${p.id}) career.${dim} 有值但无 source_id——迁移期允许，验收前须补源或改 status=unknown`);
    }
  }
  for (const [i, e] of p.events.entries()) {
    if (e.evidence === 'primary' && !e.source_id) {
      err(`${p.name}(${p.id}) 事件#${i + 1}「${e.title}」标 evidence=primary 但无 source_id——一手证据必须可定位`);
    }
    if (e.evidence === 'pending' && e.source_id) {
      warn(`${p.name}(${p.id}) 事件#${i + 1}「${e.title}」标 evidence=pending 却挂 source_id——确认是"待证"还是"二手"`);
    }
  }
}
const careerRows = persons.filter((p) => p.career).length;
console.log(`✓ 数据契约 v1：仕途四维 highest ${factCoverageRaw.highest.recorded} 有值/${factCoverageRaw.highest.unknown} 未知 · last ${factCoverageRaw.last.recorded}/${factCoverageRaw.last.unknown} · whereabouts ${factCoverageRaw.whereabouts.recorded}/${factCoverageRaw.whereabouts.unknown} · death ${factCoverageRaw.death.recorded}/${factCoverageRaw.death.unknown}（共 ${careerRows} 人有 career 记录）`);

// D5：上面所有 err() 已经跑完。有错就在任何写入之前退出。
assertClean();
mkdirSync(join(outDir, 'person'), { recursive: true });

// ---------- 8. 丰富度评分（关系数只计人工考据边，同年派生边是计算产物不算史料） ----------
const relCount = new Map<string, number>();
for (const r of manualRelations) {
  relCount.set(r.from, (relCount.get(r.from) ?? 0) + 1);
  relCount.set(r.to, (relCount.get(r.to) ?? 0) + 1);
}
const completeness = (p: Person) => {
  const fields = [p.native_hist, p.birth_year, p.death_year, p.reign, p.bio_short]
    .filter((v) => v !== undefined && v !== '').length;
  const score =
    0.3 * (fields / 5) +
    0.4 * Math.min(p.events.length / 10, 1) +
    0.2 * Math.min((relCount.get(p.id) ?? 0) / 5, 1) +
    0.1 * (p.bio_short ? 1 : 0);
  return Math.round(score * 100) / 100;
};

// ---------- 9. 编译分包 ----------
const index: PersonIndexEntry[] = persons.map((p) => ({
  id: p.id, name: p.name, dynasty: p.dynasty, exam_year: p.exam_year,
  ganzhi: p.ganzhi!, reign: p.reign,
  native_hist: p.native_hist, native_modern: p.native_modern,
  lat: p.lat, lng: p.lng,
  tags: p.tags, completeness: completeness(p), event_count: p.events.length,
  disputed: p.disputed, bio_short: p.bio_short,
  // 繁简归一搜索键：查询词经同一 T2S 表归一后在此匹配
  // 字（zi）/号（hao）一并入键：深档 88 人有字、42 人有号，此前只靠 tags 偶然覆盖少数人
  search_key: simp(`${p.name}${p.zi ?? ''}${p.hao ?? ''}${p.reign ?? ''}${p.ganzhi ?? ''}${p.native_hist}${p.native_modern ?? ''}${p.tags.join('')}`).toLowerCase(),
}));
writeFileSync(join(outDir, 'person-index.json'), JSON.stringify(index));

const readingsByPerson = new Map<string, Reading[]>();
for (const reading of publishedReadings) {
  const list = readingsByPerson.get(reading.person_id) ?? [];
  list.push(reading);
  readingsByPerson.set(reading.person_id, list);
}
for (const p of persons) {
  const usedSourceIds = new Set(p.events.map((e) => e.source_id).filter(Boolean) as string[]);
  for (const reading of readingsByPerson.get(p.id) ?? []) {
    for (const paragraph of reading.paragraphs) {
      for (const sourceId of paragraph.source_ids) usedSourceIds.add(sourceId);
    }
  }
  const detail = {
    ...p,
    sources: [...usedSourceIds].map((id) => sourceById.get(id)!),
    readings: readingsByPerson.get(p.id) ?? [],
  };
  writeFileSync(join(outDir, 'person', `${p.id}.json`), JSON.stringify(detail));
}
writeFileSync(join(outDir, 'readings.json'), JSON.stringify(publishedReadings));

const geoPoints = persons.filter((p) => p.lat && p.lng)
  .map((p) => ({ id: p.id, name: p.name, dynasty: p.dynasty, exam_year: p.exam_year, lat: p.lat, lng: p.lng }));

// ---------- 9b. 点面归属（射线法，依赖 build-geo-maps 产物） ----------
type Ring = [number, number][];
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeom(lng: number, lat: number, geom: { type: string; coordinates: unknown }): boolean {
  // Polygon 坐标为 Ring[]（外环+孔洞）；MultiPolygon 为 Ring[][]
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []) as Ring[][];
  return polys.some((poly) => {
    if (!pointInRing(lng, lat, poly[0])) return false; // 外环
    for (let k = 1; k < poly.length; k++) if (pointInRing(lng, lat, poly[k])) return false; // 孔洞
    return true;
  });
}

const mapsDir = join(outDir, 'maps');
const dynastyPolys = new Map<string, { name: string; geom: { type: string; coordinates: unknown } }[]>();
if (existsSync(mapsDir)) {
  for (const f of readdirSync(mapsDir).filter((f) => f.endsWith('.json') && f !== 'modern-china.json')) {
    const geo = JSON.parse(readFileSync(join(mapsDir, f), 'utf8'));
    dynastyPolys.set(f.replace('.json', ''), geo.features.map((ft: { properties: { name: string }; geometry: never }) => ({ name: ft.properties.name, geom: ft.geometry })));
  }
}
if (!dynastyPolys.size) warn('未找到 public/data/maps/{dynasty}.json，跳过点面归属（先运行 npm run build:maps）');

let assignedTotal = 0;
const geoPointsV2 = geoPoints.map((p) => {
  const polys = dynastyPolys.get(p.dynasty);
  const hit = polys?.find((pl) => pointInGeom(p.lng!, p.lat!, pl.geom));
  if (hit) assignedTotal++;
  return { ...p, region: hit?.name };
});
console.log(`✓ 点面归属 ${assignedTotal}/${geoPoints.length}`);

// 按朝聚合：regions（政区→人数）、centroids（重心，含该朝总数）、coverage（覆盖率审计）
// 2026-10-24 换源 Cliopatria 后，底图为政权级疆域轮廓（每朝 1–8 个政权面），
// 「政区」语义变为「政权疆域」：regions 只反映入面与否，人均落在同一政权名下。
// 人物级的地域分组仍由 native_hist/现代地名承担（MapList 按省聚合），故 regions 保留但不再承载府级分组。
const regions: Record<string, { name: string; count: number }[]> = {};
const coverage: Record<string, { with_geo: number; assigned: number; total: number }> = {};
for (const d of dynasties) {
  const all = persons.filter((p) => p.dynasty === d.key);
  const pts = geoPointsV2.filter((p) => p.dynasty === d.key);
  const cnt = new Map<string, number>();
  let assigned = 0;
  for (const p of pts) {
    if (p.region) { cnt.set(p.region, (cnt.get(p.region) ?? 0) + 1); assigned++; }
  }
  regions[d.key] = [...cnt.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  coverage[d.key] = { with_geo: pts.length, assigned, total: all.length };
}
for (const d of dynasties) {
  const c = coverage[d.key];
  console.log(`    ${d.name}: 坐标 ${c.with_geo}/${c.total}，入面 ${c.assigned}`);
}

const centroids = dynasties.map((d) => {
  const pts = persons.filter((p) => p.dynasty === d.key && p.lat && p.lng);
  if (!pts.length) return null;
  return {
    dynasty: d.key,
    lat: pts.reduce((s, p) => s + p.lat!, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng!, 0) / pts.length,
    count: pts.length,
    total: coverage[d.key].total,
  };
}).filter(Boolean);
writeFileSync(join(outDir, 'geo.json'), JSON.stringify({ points: geoPointsV2, regions, centroids, coverage }));

// ---------- 9c. edges.json v2（含 Louvain 社区预计算） ----------
// 图算法在构建期运行（graphology 为 devDependency，不进浏览器包）
const { default: Graph } = await import('graphology');
const { default: louvain } = await import('graphology-communities-louvain');

const g = new Graph({ type: 'undirected' });
for (const p of persons) g.addNode(p.id);
const seenEdge = new Set<string>();
for (const r of relations) {
  const k = [r.from, r.to].sort().join('|');
  if (seenEdge.has(k)) continue; // 同对人物多类型边只保留第一条进图（社区发现用）
  seenEdge.add(k);
  if (g.hasNode(r.from) && g.hasNode(r.to)) g.addEdge(r.from, r.to);
}
const partition = louvain(g) as Record<string, number>;
const commGroups = new Map<number, string[]>();
for (const [id, cid] of Object.entries(partition)) {
  if (!commGroups.has(cid)) commGroups.set(cid, []);
  commGroups.get(cid)!.push(id);
}
// 自动命名：看社区内部边的构成——同年边为主叫「某朝某年同科圈」，亲属/师生为主叫「某地某氏圈」
const COMMUNITY_LABEL_OVERRIDE: Record<string, string> = {
  // 成员id逗号串: 覆写名 —— 数据扩充后按需添加
  'z0123,z0133,z0147': '奉天赵氏圈', // 赵蒙/赵峻/赵昌翰，唐奉天县（今陕西乾县）
  'z0222,z0229,z0231': '荆门孙氏圈', // 孙何/孙仅/孙暨，"荆门三凤"+同族孙暨
};
const placeOf = (p: Person): string => {
  const h = p.native_hist ?? '';
  for (const suffix of ['县', '縣', '府', '州', '省']) {
    const m = h.match(new RegExp(`([^府州县省路道縣（(\\s]{2})${suffix}`));
    if (m) return m[1];
  }
  return dynastyByKey.get(p.dynasty)?.name ?? '';
};
const communities: Community[] = [...commGroups.entries()]
  .map(([cid, members]) => {
    const memberSet = new Set(members);
    const innerTypes = relations.filter((r) => memberSet.has(r.from) && memberSet.has(r.to))
      .map((r) => r.type);
    const tongnian = innerTypes.filter((t) => t === '同年').length;
    const sorted = members
      .map((id) => personById.get(id)!)
      .sort((a, b) => (completeness(b) - completeness(a)));
    const rep = sorted[0];
    const dynName = dynastyByKey.get(rep.dynasty)?.name ?? rep.dynasty;
    const auto = tongnian > innerTypes.length / 2
      ? `${dynName}·${rep.exam_year}年同科圈`
      : `${placeOf(rep)}${rep.name[0]}氏圈`;
    const label = COMMUNITY_LABEL_OVERRIDE[members.slice().sort().join(',')] ?? auto;
    return { id: cid, label, members: members.slice().sort(), size: members.length };
  })
  .filter((c) => c.size >= 3)
  .sort((a, b) => b.size - a.size);

const edgesFile: EdgesFile = {
  edges: relations.map((r) => ({
    ...r,
    from_name: nameOf(r.from),
    to_name: nameOf(r.to),
  })),
  communities,
  types: [...RELATION_TYPES],
  externals: externals.map((e) => ({
    id: e.id, name: e.name, birth_year: e.birth_year, death_year: e.death_year,
    index_year: e.index_year, note: e.note, kind: 'external' as const,
  })),
};
writeFileSync(join(outDir, 'edges.json'), JSON.stringify(edgesFile));
// 外延人物独立索引（不进主 person-index，避免稀释搜索）
if (externals.length) {
  writeFileSync(join(outDir, 'externals-index.json'), JSON.stringify(externals.map((e) => ({
    id: e.id, name: e.name, birth_year: e.birth_year, death_year: e.death_year,
    index_year: e.index_year, note: e.note, cbdb_id: e.cbdb_id,
  }))));
}
// UX2：外延简档只使用已有字段和真实关系。不进入 person-index，也不进入统计。
for (const e of externals) {
  const related = relations
    .filter((r) => r.from === e.id || r.to === e.id)
    .map((r) => {
      const other = r.from === e.id ? r.to : r.from;
      return { id: other, name: nameOf(other) ?? other, type: r.type, note: r.note };
    });
  const stub = {
    id: e.id, name: e.name, kind: 'external' as const,
    birth_year: e.birth_year, death_year: e.death_year, index_year: e.index_year,
    note: e.note, cbdb_id: e.cbdb_id, source_id: e.source_id, related,
  };
  writeFileSync(join(outDir, 'person', `${e.id}.json`), JSON.stringify(stub));
}
console.log(`✓ 外延简档 ${externals.length}（不计入状元名录 ${index.length}）`);
console.log(`✓ 社区发现：${commGroups.size} 个社区，标注 ${communities.length} 个（≥3 人）`);

// ---------- 9d. career.json（旧分类保留；另附拆开的三组计数，不再把它们连成一条人生） ----------
type SankeyLink = { source: string; target: string; value: number };
const sankeyPersons = persons.filter((p) => p.career?.final_category);
const linkCount = new Map<string, number>();
const bump = (a: string, b: string) => linkCount.set(a + '→' + b, (linkCount.get(a + '→' + b) ?? 0) + 1);
const colNode = (col: '首' | '中' | '终', cat: string) => `${col}·${cat}`;
const usedNodes = new Set<string>();
for (const p of sankeyPersons) {
  const c = p.career!;
  const first = c.first_category ? colNode('首', c.first_category) : '首·未详';
  const fin = colNode('终', c.final_category!);
  usedNodes.add(first); usedNodes.add(fin);
  if (c.mid_category) {
    const mid = colNode('中', c.mid_category);
    usedNodes.add(mid);
    bump(first, mid); bump(mid, fin);
  } else {
    bump(first, fin);
  }
}
const sankeyLinks: SankeyLink[] = [...linkCount.entries()].map(([k, v]) => {
  const [source, target] = k.split('→');
  return { source, target, value: v };
});
const sankeyNodes = [...usedNodes].map((name) => ({ name }));
const splitCounts = {
  office: new Map<string, number>(),
  path: new Map<string, number>(),
  death: new Map<string, number>(),
};
const pending: {
  id: string; name: string; final_category?: string; final_office?: string;
  reasons: string[]; entered: boolean;
}[] = [];
let pendingAlsoEntered = 0;
let enteredNone = 0;
for (const p of sankeyPersons) {
  const split = splitCareer(p.career!);
  if (split.office) splitCounts.office.set(split.office, (splitCounts.office.get(split.office) ?? 0) + 1);
  if (split.path) splitCounts.path.set(split.path, (splitCounts.path.get(split.path) ?? 0) + 1);
  if (split.death) splitCounts.death.set(split.death, (splitCounts.death.get(split.death) ?? 0) + 1);
  const entered = enteredAnyGroup(split);
  if (!entered) enteredNone++;
  if (split.pending.length) {
    if (entered) pendingAlsoEntered++;
    pending.push({
      id: p.id, name: p.name, final_category: p.career!.final_category, final_office: p.career!.final_office,
      reasons: split.pending, entered,
    });
  }
}
const toRows = (m: Map<string, number>) => [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
const careerDimensions = {
  office: toRows(splitCounts.office),
  path: toRows(splitCounts.path),
  death: toRows(splitCounts.death),
};
const careerPending = pending.length;
writeFileSync(join(outDir, 'career.json'), JSON.stringify({
  nodes: sankeyNodes,
  links: sankeyLinks,
  n: sankeyPersons.length,
  total: persons.length,
  unclassified: persons.length - sankeyPersons.length,
  stage_categories: CAREER_STAGE_CATEGORIES,
  final_categories: CAREER_FINAL_CATEGORIES,
  legacy_note: 'nodes 与 links 是旧的混合分类，官职、去向和死亡不能相加。请用 dimensions。',
  dimensions: {
    office: { label: '记载中的官职', rows: careerDimensions.office },
    path: { label: '记载中的生活去向', rows: careerDimensions.path },
    death: { label: '记载中的死亡', rows: careerDimensions.death },
  },
  pending,
  pending_summary: {
    with_pending_field: pending.length,
    pending_and_entered: pendingAlsoEntered,
    entered_none: enteredNone,
  },
}));
console.log(`✓ 仕途分类：旧入样 ${sankeyPersons.length}；官职 ${splitCounts.office.size} 类，去向 ${splitCounts.path.size} 类，死亡 ${splitCounts.death.size} 类；待核字段 ${pending.length}（其中已入组 ${pendingAlsoEntered}，未入任何组 ${enteredNone}）`);

// ---------- 10. 统计预计算 ----------
// M5-d D4 统计口径修复：① 姓氏繁简归一（原直接取 p.name[0]，致 张33/張11、刘16/劉10 同榜并存）
// ② 复姓整体计一姓 ③ 年龄榜剔除「生年约（circa）」与「身份存疑（disputed）」者（原简文会 13 岁居榜首）
const byDynasty = Object.fromEntries(dynasties.map((d) => [d.key, 0]));
for (const p of persons) byDynasty[p.dynasty]++;

// 复姓表（M5-d D4）——**按名录实证裁剪**：对 656 人逐一比对 100+ 项常见复姓前缀
// （欧阳/司马/司徒/上官/诸葛/东方/独孤/慕容/尉迟/长孙/宇文/皇甫/完颜/耶律/蒲察/徒单/纥石烈/
//   孛儿只斤/爱新觉罗/赫舍里/钮祜禄 等），实际出现者仅下列 3 个。其余二字起首者（如「完顏速蘭」
//   「忽都達兒」）皆为二字名而非复姓，按单字姓处理。
const COMPOUND_SURNAMES = ['独孤', '鲜于', '徒单'];
const surnameOf = (name: string): string => {
  const n = simp(name);
  for (const c of COMPOUND_SURNAMES) if (n.startsWith(c)) return c;
  return n[0] ?? '';
};
const surnames = new Map<string, number>();
for (const p of persons) {
  const s = surnameOf(p.name);
  if (s) surnames.set(s, (surnames.get(s) ?? 0) + 1);
}
const topSurnames = [...surnames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

// 年龄榜口径（M5-d D4）：birth_circa（生年系「约」）或 disputed（状元身份存疑）者不进确定榜，
// 单列 youngest_uncertain 存疑参考区，避免「约年」或身份未定者占据年龄纪录
type Aged = { id: string; name: string; dynasty: string; age: number; uncertain: boolean };
const allAged: Aged[] = persons
  .filter((p) => p.birth_year && p.exam_year)
  .map((p) => ({ id: p.id, name: p.name, dynasty: p.dynasty, age: p.exam_year - p.birth_year!, uncertain: p.birth_circa || p.disputed }))
  .filter((a) => a.age > 8 && a.age < 90);
const strip = ({ id, name, dynasty, age }: Aged) => ({ id, name, dynasty, age });
// N1-07：名录生年没有可核对出处的，不进确定年龄榜，也不进平均年龄。
// 目前只登记会直接改变榜首结论的两人。缺字段不等于事实为假。
const AGE_UNSOURCED = new Set(['z0217', 'z0208']); // 程宿、梁颢
const ages = allAged.filter((a) => !a.uncertain && !AGE_UNSOURCED.has(a.id)).map(strip).sort((a, b) => a.age - b.age);
const uncertainAges = allAged
  .filter((a) => a.uncertain || AGE_UNSOURCED.has(a.id))
  .map(strip)
  .sort((a, b) => a.age - b.age);
// 年龄分布直方图（5 岁桶）与分朝平均年龄——支撑问答页「最年轻/年龄变化」图表
const AGE_BUCKET = 5;
const ageHistMap = new Map<number, number>();
for (const a of ages) {
  const b = Math.floor(a.age / AGE_BUCKET) * AGE_BUCKET;
  ageHistMap.set(b, (ageHistMap.get(b) ?? 0) + 1);
}
const ageHistogram = [...ageHistMap.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([bucket, count]) => ({ bucket, label: `${bucket}–${bucket + AGE_BUCKET - 1} 岁`, count }));
const avgAgeByDynasty = dynasties.map((d) => {
  const arr = ages.filter((a) => a.dynasty === d.key);
  return {
    dynasty: d.key,
    n: arr.length,
    avg_age: arr.length ? Math.round(arr.reduce((s, a) => s + a.age, 0) / arr.length * 10) / 10 : null,
  };
});
// 史料丰富度分布（0–1 十等分）——「史中无痕」诚实直方图
const compBuckets = Array.from({ length: 10 }, (_, i) => ({ bucket: i / 10, label: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`, count: 0 }));
for (const p of persons) {
  compBuckets[Math.min(Math.floor(completeness(p) * 10), 9)].count++;
}
// 数据基准日。不随每次构建改成当天；口径或数据内容变化时才改这一行。
// 部署版本由 CI 的 commit 表达，不写进这个日期。
const BUILD_DATE = '2026-10-23';

const researchStatusCount = persons.reduce((a, p) => {
  a[p.research_status] = (a[p.research_status] ?? 0) + 1;
  return a;
}, {} as Record<string, number>);

const stats = {
  version: 5, // v5（T05）：数据契约 v1——整理状态与身份争议分轴；仕途四维覆盖计数
  contract_version: 1.1,
  total: persons.length,
  profiles: profileFiles.length, // 深度档案数——供 E3 替换前端写死的「16 人」
  build_date: BUILD_DATE,
  by_dynasty: byDynasty,
  top_surnames: topSurnames,
  youngest: ages.slice(0, 10),
  youngest_uncertain: uncertainAges.slice(0, 10), // 生年「约」或身份存疑者，存疑参考区
  oldest: ages.slice(-5).reverse(),
  avg_age: Math.round(ages.reduce((s, a) => s + a.age, 0) / ages.length * 10) / 10,
  sanyuan: persons.filter((p) => p.tags.includes('三元及第')).map((p) => ({ id: p.id, name: p.name, dynasty: p.dynasty, exam_year: p.exam_year })),
  geo_coverage: geoHit / persons.length,
  geo_unmatched: persons.length - geoHit, // 地名未命中数——供 E3/E6 动态化消费
  age_histogram: { buckets: ageHistogram, n: ages.length },
  avg_age_by_dynasty: avgAgeByDynasty,
  completeness_histogram: compBuckets,
  career_dimensions: careerDimensions,
  career_pending: careerPending,
  career_pending_entered: pendingAlsoEntered,
  career_entered_none: enteredNone,
  // v1 契约：四维覆盖按 656 名录为分母（missing = 尚未迁移，不等于"无"）
  career_rows: careerRows,
  career_facts: Object.fromEntries(
    FACT_DIMS.map((d) => [d, { ...factCoverageRaw[d], missing: persons.length - factCoverageRaw[d].recorded - factCoverageRaw[d].unknown }]),
  ),
  research_status: researchStatusCount,
};
writeFileSync(join(outDir, 'stats.json'), JSON.stringify(stats));

// T17：十组问答的机器可读口径。人数取自本次构建，不在页面里另算一套。
const geoByDynasty = dynasties.map((d) => {
  const c = coverage[d.key];
  return { dynasty: d.key, name: d.name, with_geo: c.with_geo, total: c.total };
});
const tagCounts = new Map<string, number>();
for (const p of persons) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
const questions = [
  { id: 'q0', question: '哪个朝代状元最多？', denominator: persons.length, sample: persons.length, method: '按名录 dynasty 计数，八朝合计等于名录总数' },
  { id: 'q1', question: '最年轻的状元是谁？', denominator: persons.length, sample: ages.length, method: '夺魁年减生年；生年约、身份存疑、无出处的生年不进确定榜' },
  { id: 'q2', question: '平均夺魁年龄历代如何变化？', denominator: persons.length, sample: ages.length, method: '与 q1 同一批确定年龄，按朝求平均；样本为 0 的朝代断开' },
  { id: 'q3', question: '哪个姓氏出状元最多？', denominator: persons.length, sample: persons.length, method: '繁简归一后取姓，复姓整体计一姓' },
  { id: 'q4', question: '状元产地如何南移？', denominator: persons.length, sample: geoPoints.length, method: '只计有坐标者的地理重心，不把无坐标者补进重心' },
  { id: 'q5', question: '哪些人连中三元？', denominator: persons.length, sample: stats.sanyuan.length, method: '名录标签「三元及第」，不是从官职推断' },
  { id: 'q6', question: '登科后的分类为什么不能当成结局？', denominator: persons.length, sample: sankeyPersons.length, method: '官职、去向、死亡分三组计数，三组不能相加' },
  { id: 'q7', question: '本站档案整理到哪一步？', denominator: persons.length, sample: persons.length, method: '完整度只衡量本站已录入字段，不衡量存世史料' },
  { id: 'q8', question: '多少人有籍贯坐标？', denominator: persons.length, sample: geoPoints.length, method: '有 lat/lng 即计入；分朝分子分母分开，不能把各朝覆盖率相加' },
  { id: 'q9', question: '多少人的状元身份存疑？', denominator: persons.length, sample: persons.filter((p) => p.disputed).length, method: 'disputed 标记；存疑只针对夺魁这一条，不表示人物虚构' },
];
writeFileSync(join(outDir, 'questions.json'), JSON.stringify({
  version: 1,
  total: persons.length,
  questions,
  geo_by_dynasty: geoByDynasty,
  disputed: persons.filter((p) => p.disputed).map((p) => ({
    id: p.id, name: p.name, dynasty: p.dynasty, exam_year: p.exam_year, note: p.dispute_note ?? '',
  })),
  tags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count })),
}));
writeFileSync(join(outDir, 'dynasties.json'), JSON.stringify(dynasties));

// ---------- 10c. 开放数据 v1（T16）：名录、关系、外延、问答口径分开导出 ----------
// 地图切片不进这里。CHGIS 许可未定，不能因为做了导出就把底图再分发一次。
const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const openDir = join(outDir, 'open');
mkdirSync(openDir, { recursive: true });
const rosterHeader = ['id', 'name', 'dynasty', 'exam_year', 'native_hist', 'native_modern', 'lat', 'lng', 'tags', 'disputed', 'event_count', 'research_status'];
const rosterRows = persons.map((p) => [
  p.id, p.name, p.dynasty, p.exam_year, p.native_hist, p.native_modern ?? '',
  p.lat ?? '', p.lng ?? '', p.tags.join('|'), p.disputed ? 1 : 0, p.events.length, p.research_status,
]);
writeFileSync(join(openDir, 'roster.csv'), toCsv(rosterHeader, rosterRows));
writeFileSync(join(openDir, 'relations.csv'), toCsv(
  ['from', 'to', 'type', 'derived', 'note', 'source_id'],
  relations.map((r) => [r.from, r.to, r.type, 'derived' in r && r.derived ? 1 : 0, r.note ?? '', r.source_id ?? '']),
));
writeFileSync(join(openDir, 'externals.csv'), toCsv(
  ['id', 'name', 'birth_year', 'death_year', 'index_year', 'note'],
  externals.map((e) => [e.id, e.name, e.birth_year ?? '', e.death_year ?? '', e.index_year ?? '', e.note ?? '']),
));
const manifest = {
  version: 1,
  generated_from: 'build-data',
  build_date: BUILD_DATE,
  roster: persons.length,
  relations_manual: manualRelations.length,
  relations_derived: relations.length - manualRelations.length,
  externals: externals.length,
  not_included: ['maps/*.json（CHGIS 底图，许可未定，不随开放数据分发）', 'cbdb sqlite（第三方库，按原许可使用）'],
  semantics: {
    disputed: '状元身份存疑，不等于人物虚构',
    research_status: 'uncompiled=尚未整理；searched=查过未见；compiled=已整理。缺省按 uncompiled',
    empty_field: '空值表示本站尚未录入或未见记载，不表示史料不存在',
    lat_lng: '籍贯点，精度到县治量级，不是精确宅址',
    source_tier: 'A=一手（正史/题名碑/朱卷/登科录）；A-=权威学术编纂（辑佚/汇考）；B=方志/年谱/名录；C=笔记/传说',
    rank_detail: '缺省=未核到名次明文（v1.1 起不再对全名录携带默认状元断言）',
  },
  files: {
    roster_json: '/data/person-index.json',
    roster_csv: '/data/open/roster.csv',
    relations_json: '/data/edges.json',
    relations_csv: '/data/open/relations.csv',
    externals_json: '/data/externals-index.json',
    externals_csv: '/data/open/externals.csv',
    stats_json: '/data/stats.json',
    questions_json: '/data/questions.json',
  },
};
writeFileSync(join(openDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`✓ 开放数据 v1：名录 ${persons.length} / 关系 ${relations.length} / 外延 ${externals.length}（不含地图切片）`);

// ---------- 10b. careers 冲突裁定表（构建期自动生成，不静默） ----------
// 内容 = 深档 × 回填 的逐字段冲突 + 裁定状态（默认保留深档 / 显式覆写 / 待裁定）。
// 报告只随内容变化重写（指纹化），保证重复构建零 git 噪声、字节级幂等可验。
const fingerprint = createHash('sha256').update(
  ['seed/roster.tsv', 'careers.yaml', 'seed/careers-mined-qing.yaml', 'seed/career-override-reviewed.json']
    .map((f) => (existsSync(join(dataDir, f)) ? readFileSync(join(dataDir, f)) : Buffer.from(''))).reduce(
      (acc, b) => Buffer.concat([acc, b]), Buffer.alloc(0),
    ),
).digest('hex').slice(0, 16);

const esc = (s: string) => s.replace(/\|/g, '\\|');
const conflictRow = (c: CareerConflict, verdict: string) =>
  `| ${c.id} | ${c.name} | \`${c.field}\` | ${esc(c.deep)} | ${esc(c.backfill)} | ${c.sources.join(' + ')}${c.alt.length ? `<br>（另值 ${esc(c.alt.join('；'))}）` : ''} | ${verdict} |`;

const conflictReport = `# careers 冲突裁定表（构建期自动生成 · 勿手工编辑）

> **优先级口径**：深度档案 YAML（\`data/persons/*.yaml\`）> 人工考据（\`data/careers.yaml\`）> 脚本挖掘（\`data/seed/careers-mined-qing.yaml\`）。
> **规则（M5-d D2）**：回填**仅补缺**——深档已写出的字段一律不被覆盖；两者给出不同值时逐条留痕于此，不再静默。
> **裁定方式**：在 \`data/seed/career-override-reviewed.json\` 的 \`overrides\` 内加 \`{ "id", "field", "value", "reason" }\`；\`value\` 只能在**深档值 / 回填值**中择一，\`reason\` 必填（如周延儒「赐死结局刻意降级」）。未在 \`overrides\` 中列出的冲突按默认「保留深档」处理，并在 \`kept_deep\` 中登记。
> **数据指纹**：\`${fingerprint}\`（roster.tsv + careers.yaml + careers-mined-qing.yaml + career-override-reviewed.json）

**冲突 ${conflictList.length} 条 / ${new Set(conflictList.map((c) => c.id)).size} 人** ｜ 待裁定 **${pendingConflicts.length}** ｜ 已裁定·覆写 **${appliedConflicts.length}** ｜ 已裁定·保留深档 **${keptConflicts.length}**

## 一、待裁定（${pendingConflicts.length} 条）

${pendingConflicts.length ? `| id | 姓名 | 字段 | 深档值 | 回填值 | 回填来源 | 裁定 |\n| --- | --- | --- | --- | --- | --- | --- |\n${pendingConflicts.map((c) => conflictRow(c, '**待裁定**')).join('\n')}` : '（无）'}

## 二、已裁定 · 覆写回填值（${appliedConflicts.length} 条）

${appliedConflicts.length ? `| id | 姓名 | 字段 | 深档值（被覆盖） | 回填值（生效） | 回填来源 | 理由 |\n| --- | --- | --- | --- | --- | --- | --- |\n${appliedConflicts.map((c) => conflictRow(c, esc(c.reason ?? ''))).join('\n')}` : '（无）'}

## 三、已裁定 · 保留深档（${keptConflicts.length} 条）

| id | 姓名 | 字段 | 深档值（生效） | 回填值（未采用） | 回填来源 | 裁定 |
| --- | --- | --- | --- | --- | --- | --- |
${keptConflicts.map((c) => conflictRow(c, c.reason ? `显式保留深档：${esc(c.reason)}` : '保留深档（默认）')).join('\n')}

## 四、字段分布

| 字段 | 冲突条数 | 待裁定 | 已裁定·覆写 |
| --- | --- | --- | --- |
${CAREER_FIELDS.map((f) => {
  const all = conflictList.filter((c) => c.field === f);
  if (!all.length) return null;
  return `| \`${f}\` | ${all.length} | ${all.filter((c) => c.resolution === 'pending').length} | ${all.filter((c) => c.resolution === 'backfill-applied').length} |`;
}).filter(Boolean).join('\n')}

## 五、建议复核（建议项，未生效 · 待 X2 确认）

> 下表是「默认保留深档」看似可疑的条目与理由，**仅作建议、不参与构建**。确认后把结论写入 \`overrides\`（采纳回填）或 \`kept_deep\`（保留深档），并删除本文件对应 \`review_hints\`。

${(reviewFile.review_hints ?? []).length ? `| id | 姓名 | 字段 | 建议 | 置信度 | 理由 |\n| --- | --- | --- | --- | --- | --- |\n${(reviewFile.review_hints ?? []).map((h) => {
  const c = careerConflicts.get(`${h.id}#${h.field}`);
  const nm = c?.name ?? personById.get(h.id)?.name ?? h.id;
  return `| ${h.id} | ${nm} | \`${h.field}\` | ${h.advice === 'deep' ? '保留深档' : '**覆写回填**'} | ${h.confidence} | ${esc(h.why)} |`;
}).join('\n')}` : '（无）'}

---

*由 \`scripts/build-data.ts\` 在每次 \`npm run build:data\` 时自动校验并重写（内容无变化则跳过写入，指纹 \`${fingerprint}\`）。*
`;

const conflictReportPath = join(docsDir, 'career-冲突裁定表.md');
if (!existsSync(conflictReportPath) || readFileSync(conflictReportPath, 'utf8') !== conflictReport) {
  writeFileSync(conflictReportPath, conflictReport);
  console.log(`✓ careers 冲突裁定表已更新：docs/career-冲突裁定表.md（${conflictList.length} 条冲突）`);
}

// ---------- 10c. 争议身份一览（构建期自动生成，不静默） ----------
// 三来源分组 + 派生抑制明细 + 同类排查结论，供人工复核；内容无变化则跳过写入（零 git 噪声）。
const disputeFingerprint = createHash('sha256').update(
  ['seed/roster.tsv', 'seed/roster-supplements.tsv', 'seed/dispute-reviewed.json']
    .map((f) => (existsSync(join(dataDir, f)) ? readFileSync(join(dataDir, f)) : Buffer.from(''))).reduce(
      (acc, b) => Buffer.concat([acc, b]), Buffer.alloc(0),
    ),
).digest('hex').slice(0, 16);

const dispRow = (p: Person) => `| ${p.id} | ${p.name} | ${dynastyByKey.get(p.dynasty)?.name ?? p.dynasty} ${p.exam_year} | ${disputeSource.get(p.id) ?? '—'} | ${esc(p.dispute_note ?? '（缺）')} |`;
const bySource = (s: string) => disputedPersons.filter((p) => disputeSource.get(p.id) === s);
const allRosterTags = persons.flatMap((p) => p.tags);
const tagHits = allRosterTags.filter((t) => t === DISPUTE_TAG).length;
const patternHits = allRosterTags.filter((t) => t !== DISPUTE_TAG && DISPUTE_PATTERN.test(t)).length;
const suppPatternHits = supplements.filter((s) => DISPUTE_PATTERN.test(s.source_note)).length;

const disputeReport = `# 争议身份一览（构建期自动生成 · 勿手工编辑）

> **口径（M5-d D3）**：\`disputed = true\` 表示「本站收录该人，但其**状元身份**存在异说」，而非「此人是伪造人物」。
> 三条来源：① 名录 tag \`${DISPUTE_TAG}\`（考据依据取 \`roster-supplements.tsv\` 同名同科行的 \`source_note\`）
> ② \`data/seed/dispute-reviewed.json\` 显式登记（用于「同科异说的另一方」——名录行无 tag，但详情页须与对方互见）
> ③ 深档 YAML \`data/persons/*.yaml\` 的 \`disputed\` 字段。
> **规则**：\`disputed=true\` 必带 \`dispute_note\`（缺即构建失败）；同一人不得有两个来源；争议类 tag 未映射即构建失败。
> **派生口径**：\`disputed\` 人物**不参与同年派生**——其身份本身未定，据此连「同年」边会产出假边（同科异说者之间的真实关系是「异说互见」而非同年）。
> **数据指纹**：\`${disputeFingerprint}\`（roster.tsv + roster-supplements.tsv + dispute-reviewed.json）

**争议身份 ${disputedPersons.length} 人** ｜ 深档 YAML **${bySource('深档 YAML').length}** ｜ 名录 tag **${bySource('名录 tag').length}** ｜ 显式登记 **${bySource('dispute-reviewed.json').length}**
**关系总数 ${relations.length}** = 人工考据 ${manualRelations.length} + 同年派生 ${derivedRelations.length} ｜ 因异说抑制派生边 **${suppressedEdges.length}** 条

## 一、名录 tag 来源（${bySource('名录 tag').length} 人）

${bySource('名录 tag').length ? `| id | 姓名 | 科次 | 来源 | dispute_note |\n| --- | --- | --- | --- | --- |\n${bySource('名录 tag').map(dispRow).join('\n')}` : '（无）'}

## 二、显式登记来源（${bySource('dispute-reviewed.json').length} 人）

> \`dispute-reviewed.json\`：同科异说的**另一方**，名录行本身无 tag（tag 只标在争议发起方），此处显式登记以便两页互见。

${bySource('dispute-reviewed.json').length ? `| id | 姓名 | 科次 | 来源 | dispute_note |\n| --- | --- | --- | --- | --- |\n${bySource('dispute-reviewed.json').map(dispRow).join('\n')}` : '（无）'}

## 三、深档 YAML 来源（${bySource('深档 YAML').length} 人）

| id | 姓名 | 科次 | 来源 | dispute_note |
| --- | --- | --- | --- | --- |
${bySource('深档 YAML').map(dispRow).join('\n')}

## 四、同年派生抑制明细（${suppressedEdges.length} 条）

${suppressedEdges.length ? `| 派生对（同年） | 双方身份 | 抑制的边 |\n| --- | --- | --- |\n${suppressedEdges.map((e) => {
  const a = persons.find((p) => p.id === e.from);
  const b = persons.find((p) => p.id === e.to);
  const mark = (p?: Person) => (p ? `${p.name}（${p.id}）${disputedIds.has(p.id) ? '·存疑' : ''}` : '?');
  const both = [a, b].filter((p) => p && disputedIds.has(p.id)).length === 2;
  return `| ${mark(a)} ↔ ${mark(b)} | ${both ? '双方均为争议身份' : '一方为争议身份'} | ${esc(e.note)} |`;
}).join('\n')}` : '（无）'}

## 五、同类排查（指令 D3 步骤 4）

- 扫描范围：名录 ${persons.length} 行全部 tags（共 ${allRosterTags.length} 个 tag）+ 补录表 ${supplements.length} 行的 \`source_note\`
- 命中：tag \`${DISPUTE_TAG}\` **${tagHits}** 处；补录表考据说明含异说类词 **${suppPatternHits}** 处
- 未映射的争议类 tag（异说/存疑/待考/阙疑/两说/说法不一…）：**${patternHits}** 处 → 构建期 \`err\` 守卫已就位（新增 tag 漏映射即 CI 拦截）
- 结论：本期无其他漏映射；补录表异说说明与名录 tag 一一对应
`;

const disputeReportPath = join(docsDir, '争议身份一览.md');
if (!existsSync(disputeReportPath) || readFileSync(disputeReportPath, 'utf8') !== disputeReport) {
  writeFileSync(disputeReportPath, disputeReport);
  console.log(`✓ 争议身份一览已更新：docs/争议身份一览.md（${disputedPersons.length} 人）`);
}

console.log(`\n分包完成：index=${index.length}, geo=${geoPoints.length}点, edges=${relations.length}, stats ok`);
console.log(`状元姓氏榜首：${topSurnames.slice(0, 3).map(([s, n]) => `${s}(${n})`).join(' ')}`);
console.log(`已知夺魁年龄：平均 ${stats.avg_age} 岁，最年轻 ${ages[0]?.name} ${ages[0]?.age} 岁`);
// D5：写入阶段不再新增 err()。若仍有错误，说明门禁被绕过，产物可能已变，必须失败。
if (errors) {
  console.error(`\n构建失败：${errors} 个错误（写入阶段之后仍有错误，产物可能已变化）`);
  process.exit(1);
}
console.log('\n✓ build-data 完成');
