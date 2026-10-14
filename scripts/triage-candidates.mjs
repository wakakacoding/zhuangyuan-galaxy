// 关系候选分诊（M5 T2）：relation-candidates.json 89 条 → 采纳队列 / 复核队列 / 驳回
// 规则：① 已在 relations.yaml 的边跳过；② 同年关系由 build-data 自动派生，跳过；
//      ③ remark 含明确亲属关键词且双方 id 可解析 → 采纳队列；④ 其余 → 复核队列
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedDir = join(root, 'data', 'seed');
const docsDir = join(root, 'docs');
mkdirSync(docsDir, { recursive: true });

const candidates = JSON.parse(readFileSync(join(seedDir, 'relation-candidates.json'), 'utf8'));
const manual = yaml.load(readFileSync(join(root, 'data', 'relations.yaml'), 'utf8'));

const pairKey = (a, b) => [a, b].sort().join('|');
const existing = new Set(manual.map((r) => pairKey(r.from, r.to)));

// 名录 id → 人物（供同年判断与姓名反查）
const roster = readFileSync(join(seedDir, 'roster.tsv'), 'utf8').split('\n').slice(1)
  .filter(Boolean).map((l) => l.split('\t'));
const byId = new Map(roster.map(([id, name, dynasty, exam_year]) => [id, { name, dynasty, exam_year: Number(exam_year) }]));

// 亲属关键词 → 关系类型（对齐 RELATION_TYPES：同年/师生/父子/亲属/翁婿/政敌/同僚）
const KIN_RULES = [
  [/父子|其子|之父/, '父子'],
  [/翁婿|岳父|女婿|婿/, '翁婿'],
  [/兄弟|之兄|之弟|堂兄弟|从兄弟|叔侄|祖孙|之孙|之侄|同族|族兄|族弟/, '亲属'],
  [/师生|门生|座主|座师/, '师生'],
  [/政敌|弹劾|构陷/, '政敌'],
  [/同僚|同年(?!进士)|共事/, '同僚'],
];
const classify = (text) => {
  for (const [re, type] of KIN_RULES) if (re.test(text)) return type;
  return null;
};

const adopt = [];   // 明确亲属关系，拟入库
const review = [];  // 关系性质不明，需人工
const skipExisting = [];
const skipTongnian = [];
const seen = new Set();

for (const c of candidates) {
  const fromId = (c.person_ids[0] || '').match(/z\d+/)?.[0];
  if (!fromId || !byId.has(fromId)) { review.push({ ...c, reason: '发起人 id 无法解析' }); continue; }
  for (const m of c.mentioned) {
    const toId = m.id;
    if (!byId.has(toId)) { review.push({ person: c.person, from: fromId, to: m.name, reason: '被提及人 id 不在名录' }); continue; }
    const k = pairKey(fromId, toId);
    if (seen.has(k)) continue;
    seen.add(k);
    if (existing.has(k)) { skipExisting.push(`${byId.get(fromId).name} ↔ ${m.name}`); continue; }
    const a = byId.get(fromId);
    if (a.exam_year === m.exam_year) { skipTongnian.push(`${a.name} ↔ ${m.name}（${a.exam_year} 同年，自动派生）`); continue; }
    const remark = (c.remark ?? '').replace(/align="[^"]*"\s*\|?/g, '');
    const type = classify(remark);
    if (type) {
      adopt.push({ from: fromId, to: toId, type, note: remark.replace(/^\s*[；;，,|]\s*/, '').slice(0, 80), source_id: 's0016', fromName: a.name, toName: m.name, fromYear: a.exam_year, toYear: m.exam_year });
    } else {
      review.push({ person: c.person, from: fromId, fromName: a.name, to: toId, toName: m.name, remark, reason: '亲属关键词未命中' });
    }
  }
}

// 采纳队列写出 YAML 草稿（人工复核后并入 relations.yaml）
const adoptYaml = adopt.map((e) =>
  `- from: ${e.from}   # ${e.fromName}（${e.fromYear}）\n  to: ${e.to}     # ${e.toName}（${e.toYear}）\n  type: ${e.type}\n  note: ${e.note}\n  source_id: ${e.source_id}`
).join('\n');
writeFileSync(join(seedDir, 'relation-adopt-draft.yaml'), `# T2 分诊采纳队列草稿（${adopt.length} 条）——复核后并入 relations.yaml\n${adoptYaml}\n`);

const r = [];
r.push('# 关系候选分诊报告（M5 T2 首轮）', '', `> 候选 ${candidates.length} 条记录，去重后边 ${seen.size} 条`, '');
r.push(`| 队列 | 条数 |`, `|---|---|`);
r.push(`| 拟采纳（明确亲属关键词） | ${adopt.length} |`);
r.push(`| 已在 relations.yaml（跳过） | ${skipExisting.length} |`);
r.push(`| 同年自动派生（跳过） | ${skipTongnian.length} |`);
r.push(`| 待人工复核 | ${review.length} |`, '');
r.push('## 拟采纳', '');
for (const e of adopt) r.push(`- ${e.fromName}（${e.fromYear}）→ ${e.toName}（${e.toYear}）【${e.type}】${e.note}`);
r.push('', '## 待人工复核', '');
for (const e of review) r.push(`- ${e.fromName ?? e.person} ↔ ${e.toName ?? e.to}：${e.remark ?? e.reason}`);
r.push('', '## 同年跳过（已由派生覆盖）', '');
for (const s of skipTongnian) r.push(`- ${s}`);
writeFileSync(join(docsDir, '关系候选分诊报告.md'), r.join('\n') + '\n');

console.log(`unique pairs: ${seen.size} | adopt: ${adopt.length} | existing: ${skipExisting.length} | tongnian: ${skipTongnian.length} | review: ${review.length}`);
console.log('→ data/seed/relation-adopt-draft.yaml / docs/关系候选分诊报告.md');
