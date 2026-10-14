// 考据工作单生成器（M5 T5）：为深度档案扩充生成逐人工作单
// 用法：node scripts/profile-worksheet.mjs [batch号]   默认 batch=1（20 人）
// 选人：按朝代配额 × 数据丰富度评分排序；已有深度档案者自动排除
// 输出：docs/考据工作单/batch-NN/<id>-<姓名>.md + index.md
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const batch = Number(process.argv[2] ?? 1);

// ---- 配额（M5 计划 §2.4，84 人）与批次划分（5 批：20/20/20/20/24） ----
const QUOTA = { tang: 13, wudai: 5, song: 18, liao: 4, jin: 6, yuan: 8, ming: 14, qing: 16 };
const DYNASTY_NAME = { tang: '唐', wudai: '五代十国', liao: '辽', song: '宋', jin: '金', yuan: '元', ming: '明', qing: '清' };
const DYNASTY_ORDER = ['tang', 'wudai', 'liao', 'song', 'jin', 'yuan', 'ming', 'qing'];

// ---- 数据载入 ----
const roster = readFileSync(join(root, 'data', 'seed', 'roster.tsv'), 'utf8')
  .split('\n').slice(1).filter(Boolean).map((l) => l.split('\t'))
  .map(([id, name, dynasty, exam_year, reign, birth, death, native_hist, tags]) =>
    ({ id, name, dynasty, exam_year: Number(exam_year), reign, birth, death, native_hist, tags: tags ? tags.split(/[;,，；]/) : [] }));
const doneIds = new Set(readdirSync(join(root, 'data', 'persons')).filter((f) => f.endsWith('.yaml')).map((f) => f.split('-')[0]));
const relations = yaml.load(readFileSync(join(root, 'data', 'relations.yaml'), 'utf8'));
const byId = new Map(roster.map((r) => [r.id, r]));
const relsOf = (id) => relations.filter((r) => r.from === id || r.to === id);

// ---- 丰富度评分（知名度代理：有生卒 +2/有标签 +2/有关系 +3/籍贯可考 +1） ----
const score = (p) =>
  (p.birth && p.death ? 2 : 0) + p.tags.length * 2 + (relsOf(p.id).length ? 3 : 0) + (p.native_hist ? 1 : 0);

// ---- 朝代内排序、取配额池（1.5 倍候选，便于人工微调） ----
const pools = {};
for (const d of DYNASTY_ORDER) {
  pools[d] = roster.filter((p) => p.dynasty === d && !doneIds.has(p.id))
    .sort((a, b) => score(b) - score(a) || a.exam_year - b.exam_year);
}

// ---- 批次切分：每批按配额比例取整 ----
const BATCH_SIZE = [20, 20, 20, 20, 24];
const totalQuota = Object.values(QUOTA).reduce((a, b) => a + b, 0);
const batchPlan = [];
let start = 0;
for (let b = 0; b < 5; b++) {
  const end = start + BATCH_SIZE[b];
  batchPlan.push({ b: b + 1, range: [start, end] });
  start = end;
}
// 把 84 个名额按朝代顺序展开成全局序列，再按批次区间切
const sequence = [];
for (const d of DYNASTY_ORDER) {
  for (let i = 0; i < QUOTA[d]; i++) {
    if (pools[d][i]) sequence.push({ ...pools[d][i], quota_rank: i + 1 });
  }
}
const { range } = batchPlan[batch - 1];
const picked = sequence.slice(range[0], range[1]);

// ---- 来源白名单 ----
const sources = yaml.load(readFileSync(join(root, 'data', 'sources.yaml'), 'utf8'));
const whitelist = sources.filter((s) => s.tier !== 'C')
  .map((s) => `- ${s.id}《${s.title}》（${s.tier} 级${s.author ? '，' + s.author : ''}）`).join('\n');

// ---- 工作单渲染 ----
const outDir = join(root, 'docs', '考据工作单', `batch-${String(batch).padStart(2, '0')}`);
mkdirSync(outDir, { recursive: true });
const index = [`# 考据工作单 batch-${String(batch).padStart(2, '0')}（${picked.length} 人）`, '',
  '> 流程：AI 按单出初稿（仅限白名单来源，禁止无源事实）→ 人工逐条对出处 → 过质量门槛五条 → 入 data/persons/ → build:data 校验 → commit `feat(data):`', ''];

for (const p of picked) {
  const rels = relsOf(p.id).map((r) => {
    const other = byId.get(r.from === p.id ? r.to : r.from);
    return `- ${r.type}：${other?.name ?? r.to}（${other?.exam_year ?? '?'}）${r.note ? '——' + r.note : ''}`;
  });
  const md = `# 考据工作单：${p.name}（${p.id}）

## 骨架字段（已录）

| 字段 | 值 |
|---|---|
| 朝代 | ${DYNASTY_NAME[p.dynasty]} |
| 科年 | ${p.exam_year}（${p.reign || '—'}） |
| 生卒 | ${p.birth || '？'}–${p.death || '？'} |
| 籍贯 | ${p.native_hist || '无考'} |
| 标签 | ${p.tags.join('、') || '—'} |

## 关系上下文（已录）

${rels.length ? rels.join('\n') : '（无）'}

## 待填字段清单

- [ ] bio_short（80–120 字人物小传，A 级事实为主）
- [ ] events 生平年表（年份/事件/出处，至少 3 条）
- [ ] career 仕途节点（官职+年份，推定值须注明）
- [ ] anecdotes 轶事（独立 anecdote 标记，C 级来源仅入此栏）
- [ ] source_id 主出处 + 逐条事实挂源

## 来源白名单（仅限以下，禁止无源事实）

${whitelist}

## 质量门槛（五条，一票否决）

1. 夺魁记录有出处；2. 仕途节点有年份或注明推定；3. 轶事独立标记；4. 空值合法不硬填；5. 丰富度评分 ≥0.6。

## 检索提示

- 正史列传：《${{ tang: '新唐书/旧唐书', wudai: '新五代史/旧五代史', liao: '辽史', song: '宋史', jin: '金史', yuan: '元史', ming: '明史', qing: '清史稿' }[p.dynasty]}》
- 关键词建议：「${p.name} ${p.exam_year} 状元」「${p.name} 传」「${p.native_hist || DYNASTY_NAME[p.dynasty]} ${p.name}」
`;
  writeFileSync(join(outDir, `${p.id}-${p.name}.md`), md);
  index.push(`- [${p.name}（${DYNASTY_NAME[p.dynasty]} ${p.exam_year}）](${p.id}-${p.name}.md)　评分 ${score(p)}`);
}
writeFileSync(join(outDir, 'index.md'), index.join('\n') + '\n');

console.log(`batch-${String(batch).padStart(2, '0')}: ${picked.length} 人 → docs/考据工作单/batch-${String(batch).padStart(2, '0')}/`);
for (const d of DYNASTY_ORDER) {
  const n = picked.filter((p) => p.dynasty === d).length;
  if (n) console.log(`  ${DYNASTY_NAME[d]}: ${n}`);
}
