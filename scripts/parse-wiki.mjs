// 解析维基状元列表 wikitext → roster.tsv
// 输入：data/seed/wiki_*.txt（唐/宋/明/清独立页 + 中国状元列表总页的五代/辽/金/元章节）
// 输出：data/seed/roster.tsv  列：id name dynasty exam_year reign birth death native_hist tags
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedDir = join(root, 'data', 'seed');

const stripWiki = (s) => {
  if (!s) return '';
  let out = s.trim();
  // [[target|text]] → text；[[text]] → text
  out = out.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
  out = out.replace(/\[\[([^\]]*)\]\]/g, '$1');
  out = out.replace(/'''?/g, '');
  out = out.replace(/\{\{[^{}]*\}\}/g, '');
  out = out.replace(/<[^>]*>/g, '');
  return out.trim();
};

// 把一个 |- 分隔的行块拆成单元格数组
const parseRow = (block) => {
  const lines = block.split('\n')
    .filter((l) => l.startsWith('|') && !l.startsWith('|-') && !l.startsWith('|}'))
    .map((l) => {
      let c = l.slice(1);
      // 去掉 align/style 属性前缀：属性与内容之间以 | 分隔
      if (/^(align|style|rowspan|colspan|noWrap|width)/i.test(c) && c.includes('|')) {
        c = c.slice(c.indexOf('|') + 1);
      }
      return c;
    })
    .filter((c) => c.length > 0 || true);
  return lines;
};

const parseYear = (cell) => {
  const m = cell && cell.match(/(\d{3,4})\s*年/);
  return m ? Number(m[1]) : null;
};

const parseLifespan = (cell) => {
  if (!cell) return { birth: '', death: '' };
  const nums = [...cell.matchAll(/(\d{3,4})\s*年/g)].map((m) => Number(m[1]));
  return { birth: nums[0] ?? '', death: nums[1] ?? '' };
};

const parseName = (cell) => {
  if (!cell) return '';
  const m = cell.match(/\[\[([^\]]*)\]\]/);
  let raw = m ? m[1] : cell;
  if (raw.includes('|')) raw = raw.split('|').pop();
  raw = stripWiki(raw);
  // 去掉名字后括注，如 "陳伯玉]](陈子昂)" 已在上面处理；去除 "，字XX"
  raw = raw.split(/[，,(（]/)[0].trim();
  return raw;
};

const parseTable = (text, dynasty) => {
  const rows = [];
  for (const block of text.split('|-')) {
    if (!block.includes('年')) continue;
    const cells = parseRow(block);
    if (cells.length < 3) continue;
    const year = parseYear(cells[0]);
    if (!year) continue;
    const name = parseName(cells[2]);
    if (!name || name.length < 2 || name.length > 4) continue;
    const { birth, death } = parseLifespan(cells[3] ?? '');
    const native = stripWiki(cells[4] ?? '').replace(/人$/, '').replace(/[|]/g, '').trim();
    const note = stripWiki(cells[5] ?? '');
    const tags = /三元及第|连中三元/.test(note) ? '三元及第' : '';
    const reign = stripWiki(cells[1] ?? '');
    rows.push({ dynasty, exam_year: year, name, reign, birth, death, native_hist: native, tags });
  }
  return rows;
};

// 独立朝代页
const files = [
  ['wiki_唐朝状元列表.txt', 'tang'],
  ['wiki_宋朝状元列表.txt', 'song'],
  ['wiki_明朝状元列表.txt', 'ming'],
  ['wiki_清朝状元列表.txt', 'qing'],
];

const all = [];
for (const [f, dyn] of files) {
  const text = readFileSync(join(seedDir, f), 'utf8');
  const rows = parseTable(text, dyn);
  console.log(`${dyn}: ${rows.length} rows`);
  all.push(...rows);
}

// 总页的五代/辽/金/元章节
const main = readFileSync(join(seedDir, 'wiki_中国状元列表.txt'), 'utf8');
const sectionRe = /==([^=]+)==/g;
const sections = [];
let m;
const marks = [];
while ((m = sectionRe.exec(main))) marks.push({ name: m[1].trim(), idx: m.index });
for (let i = 0; i < marks.length; i++) {
  sections.push({
    name: marks[i].name,
    text: main.slice(marks[i].idx, i + 1 < marks.length ? marks[i + 1].idx : main.length),
  });
}
const sectionMap = { 五代十国状元: 'wudai', 辽朝状元: 'liao', 金朝状元: 'jin', 元朝状元: 'yuan' };
for (const [secName, dyn] of Object.entries(sectionMap)) {
  const sec = sections.find((s) => s.name === secName);
  if (!sec) { console.log(`${secName}: NOT FOUND`); continue; }
  const rows = parseTable(sec.text, dyn);
  console.log(`${dyn} (${secName}): ${rows.length} rows`);
  all.push(...rows);
}

// 去重（同名同年）+ 按科年排序 + 分配 id
const seen = new Set();
const deduped = all.filter((r) => {
  const k = `${r.name}|${r.exam_year}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
const order = { tang: 0, wudai: 1, liao: 2, song: 3, jin: 4, yuan: 5, ming: 6, qing: 7 };
deduped.sort((a, b) => a.exam_year - b.exam_year || order[a.dynasty] - order[b.dynasty]);

const esc = (s) => String(s ?? '').replace(/\t/g, ' ');
const lines = ['id\tname\tdynasty\texam_year\treign\tbirth\tdeath\tnative_hist\ttags'];
deduped.forEach((r, i) => {
  const id = `z${String(i + 1).padStart(4, '0')}`;
  lines.push([id, r.name, r.dynasty, r.exam_year, esc(r.reign), r.birth, r.death, esc(r.native_hist), r.tags].join('\t'));
});
writeFileSync(join(seedDir, 'roster.tsv'), lines.join('\n'));
console.log(`TOTAL: ${deduped.length} → data/seed/roster.tsv`);
