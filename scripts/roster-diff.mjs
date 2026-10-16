// 名录三方比对与补录（M5 T1）
// 输入：data/seed/roster.tsv（主名录，id 冻结）+ wiki-parsed.tsv（维基重解析）+ roster-supplements.tsv（考据补录）
// 输出：docs/名录比对报告.md；--apply 时把补录条目合并进 roster.tsv（新 id 从 max+1 起，按科年插入）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedDir = join(root, 'data', 'seed');
const docsDir = join(root, 'docs');
mkdirSync(docsDir, { recursive: true });
const apply = process.argv.includes('--apply');

// 繁简归一（与 build-data 同一真源）
const T2S = JSON.parse(readFileSync(join(root, 'data', 't2s.json'), 'utf8'));
const simp = (s) => [...String(s ?? '')].map((c) => T2S[c] ?? c).join('');

const readTsv = (f) =>
  readFileSync(join(seedDir, f), 'utf8').split('\n').slice(1)
    .filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t'));

const rosterRaw = readFileSync(join(seedDir, 'roster.tsv'), 'utf8');
const rosterHeader = rosterRaw.split('\n')[0];
// 保留第 9 列之后的追加列（M5-d D1 的 birth_circa/death_circa 及未来列）——
// 原实现只回写前 9 列，--apply 会静默截断这些列（数据丢失），此处按位透传
const rosterTrailing = rosterHeader.split('\t').length - 9;
const roster = readTsv('roster.tsv').map((cols) => {
  const [id, name, dynasty, exam_year, reign, birth, death, native_hist, tags, ...rest] = cols;
  return { id, name, dynasty, exam_year: Number(exam_year), reign, birth, death, native_hist, tags, rest };
});
const wiki = readTsv('wiki-parsed.tsv').map(([name, dynasty, exam_year, reign, birth, death, native_hist, tags]) =>
  ({ name, dynasty, exam_year: Number(exam_year), reign, birth, death, native_hist, tags }));
const supp = readTsv('roster-supplements.tsv').map(([name, dynasty, exam_year, reign, birth, death, native_hist, tags, source_note]) =>
  ({ name, dynasty, exam_year: Number(exam_year), reign, birth, death, native_hist, tags, source_note }));

const key = (name, year) => `${simp(name)}|${year}`;
const rosterKeys = new Set(roster.map((r) => key(r.name, r.exam_year)));
const rosterByName = new Map();
for (const r of roster) {
  const k = simp(r.name);
  if (!rosterByName.has(k)) rosterByName.set(k, []);
  rosterByName.get(k).push(r);
}

// ① 维基重解析 vs 主名录
const wikiMissing = wiki.filter((w) => !rosterKeys.has(key(w.name, w.exam_year)));
const wikiExtra = roster.filter((r) => !wiki.some((w) => key(w.name, w.exam_year) === key(r.name, r.exam_year)));
// 同名科年冲突（年份不一致）
const yearConflicts = [];
for (const w of wiki) {
  const cands = rosterByName.get(simp(w.name)) ?? [];
  for (const c of cands) {
    if (c.exam_year !== w.exam_year && Math.abs(c.exam_year - w.exam_year) <= 3) {
      yearConflicts.push({ name: w.name, wiki_year: w.exam_year, roster_year: c.exam_year, id: c.id });
    }
  }
}

// ② 补录表 vs 主名录
const suppNew = supp.filter((s) => !rosterKeys.has(key(s.name, s.exam_year)));
const suppDup = supp.filter((s) => rosterKeys.has(key(s.name, s.exam_year)));

// id 冻结检查：z0001–z0654 不得缺号/重复
const ids = roster.map((r) => r.id);
const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i);
const maxId = Math.max(...ids.map((i) => Number(i.slice(1))));

const report = [];
report.push('# 名录比对报告（M5 T1）', '', `> 生成时间：${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '');
report.push(`- 主名录 roster.tsv：${roster.length} 人（id z0001–z${String(maxId).padStart(4, '0')}）`);
report.push(`- 维基重解析 wiki-parsed.tsv：${wiki.length} 人`);
report.push(`- 考据补录表 roster-supplements.tsv：${supp.length} 人`, '');
report.push('## 一、维基重解析 vs 主名录', '');
report.push(wikiMissing.length === 0 && wikiExtra.length === 0
  ? '**完全一致，解析层零漏收。**'
  : `维基有而名录缺 ${wikiMissing.length} 人；名录有而维基缺 ${wikiExtra.length} 人（多为人工移除的存疑条目）。`);
for (const w of wikiMissing) report.push(`- 缺：${w.name}（${w.dynasty} ${w.exam_year}）`);
for (const r of wikiExtra) report.push(`- 多：${r.id} ${r.name}（${r.dynasty} ${r.exam_year}）`);
report.push('', '## 二、同名科年冲突（±3 年内）', '');
report.push(yearConflicts.length ? '' : '无');
for (const c of yearConflicts) report.push(`- ${c.name}：维基 ${c.wiki_year} / 名录 ${c.roster_year}（${c.id}）`);
report.push('', '## 三、考据补录', '');
report.push(`待补入 ${suppNew.length} 人；已在名录中（跳过）${suppDup.length} 人`, '');
for (const s of suppNew) report.push(`- **${s.name}**（${s.dynasty} ${s.exam_year} ${s.reign}，${s.native_hist}）——${s.source_note}`);
for (const s of suppDup) report.push(`- ~~${s.name}（${s.exam_year}）~~ 已在名录`);
report.push('', '## 四、id 冻结审计', '');
report.push(dupIds.length ? `⚠️ 重复 id：${[...new Set(dupIds)].join(', ')}` : `✓ ${ids.length} 个 id 无重复；最大号 z${String(maxId).padStart(4, '0')}`);

// --apply：补录合并（新 id 从 max+1 起，按科年+朝代序插入）
if (apply && suppNew.length) {
  const order = { tang: 0, wudai: 1, liao: 2, song: 3, jin: 4, yuan: 5, ming: 6, qing: 7 };
  const merged = [...roster];
  suppNew.forEach((s, i) => {
    merged.push({ id: `z${String(maxId + 1 + i).padStart(4, '0')}`, ...s, rest: Array(rosterTrailing).fill('') });
  });
  merged.sort((a, b) => a.exam_year - b.exam_year || (order[a.dynasty] ?? 9) - (order[b.dynasty] ?? 9));
  const lines = [rosterHeader];
  for (const r of merged) {
    lines.push([r.id, r.name, r.dynasty, r.exam_year, r.reign ?? '', r.birth ?? '', r.death ?? '', r.native_hist ?? '', r.tags ?? '', ...(r.rest ?? [])].join('\t'));
  }
  writeFileSync(join(seedDir, 'roster.tsv'), lines.join('\n') + '\n');
  report.push('', `## 五、补录执行（--apply）`, '', `已写入 ${suppNew.length} 人，id z${String(maxId + 1).padStart(4, '0')}–z${String(maxId + suppNew.length).padStart(4, '0')}，按科年插入；名录总数 ${merged.length}。`);
  console.log(`applied: +${suppNew.length} → total ${merged.length}`);
}

writeFileSync(join(docsDir, '名录比对报告.md'), report.join('\n') + '\n');
console.log(`roster ${roster.length} / wiki ${wiki.length} / wiki-missing ${wikiMissing.length} / wiki-extra ${wikiExtra.length} / conflicts ${yearConflicts.length} / supp-new ${suppNew.length} / supp-dup ${suppDup.length}${dupIds.length ? ' / DUP-IDS!' : ''}`);
console.log('→ docs/名录比对报告.md');
