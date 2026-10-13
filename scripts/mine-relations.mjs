#!/usr/bin/env node
// 关系半自动挖掘：扫描 seed 维基 wikitext 备注列，找「备注提及其他状元」与「亲属/师生关键词」候选边
// 产出 candidates 供人工逐条核实（铁律：核实挂 source_id 后才入 relations.yaml）
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedDir = join(root, 'data/seed');
const idx = JSON.parse(readFileSync(join(root, 'public/data/person-index.json'), 'utf8'));

// ---- 繁简归一：单一真源 data/t2s.json（与 build-data.ts / 前端共享） ----
const T2S = JSON.parse(readFileSync(join(root, 'data/t2s.json'), 'utf8'));
const simp = (s) => [...s].map((c) => T2S[c] ?? c).join('');

// 姓名（归一后） -> [{id, dynasty, exam_year}]
const byName = new Map();
for (const p of idx) {
  const k = simp(p.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}

// 亲属/社会关系关键词（简体归一后匹配）
const KIN = /父|子|兄|弟|叔|侄|祖|孙|从|堂|甥|舅|婿|岳|翁|族|门生|座主|师|同年|同榜|连襟|姑|姨|表/;
const ZY = /状元/;

function parseWiki(file) {
  const text = readFileSync(join(seedDir, file), 'utf8');
  const rows = [];
  for (const chunk of text.split(/^\|-$/m)) {
    const cells = chunk.split('\n|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const clean = (s) => s.replace(/style="[^"]*"\|/g, '').replace(/align\s*=\s*"[^"]*"\|/g, '')
      .replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2').replace(/<[^>]+>/g, '').trim();
    const texts = cells.map(clean);
    let nameHit = null, nameCell = -1;
    for (let i = 0; i < Math.min(texts.length, 5); i++) {
      const t = simp(texts[i].replace(/[()（）].*$/, '').trim());
      if (byName.has(t)) { nameHit = t; nameCell = i; break; }
    }
    if (!nameHit) continue;
    const remark = texts.slice(nameCell + 1).join('；');
    rows.push({ name: nameHit, remark, file });
  }
  return rows;
}

const candidates = [];
const seenPair = new Set();

for (const f of readdirSync(seedDir).filter((f) => f.startsWith('wiki_') && f.endsWith('.txt'))) {
  for (const row of parseWiki(f)) {
    const { name, remark, file } = row;
    if (!remark || remark.length < 4) continue;
    const sRemark = simp(remark);
    const hasKin = KIN.test(sRemark);
    const hasZhuangyuan = ZY.test(sRemark);
    if (!hasKin && !hasZhuangyuan) continue;
    const others = [];
    for (const [n, persons] of byName) {
      if (n === name || n.length < 2) continue;
      if (sRemark.includes(n)) {
        for (const p of persons) others.push({ name: p.name, id: p.id, dynasty: p.dynasty, exam_year: p.exam_year });
      }
    }
    const key = name + '|' + others.map((o) => o.id).join(',');
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    candidates.push({
      person: byName.get(name)[0].name,
      person_ids: byName.get(name).map((p) => `${p.id}(${p.dynasty}${p.exam_year})`),
      mentioned: others,
      kin_hit: hasKin,
      remark: remark.slice(0, 150),
      file,
    });
  }
}

candidates.sort((a, b) => b.mentioned.length - a.mentioned.length);
console.log(`候选 ${candidates.length} 条（提及名录他人 ${candidates.filter((c) => c.mentioned.length).length}）\n`);
for (const c of candidates) {
  console.log(`● ${c.person} [${c.person_ids}] ${c.mentioned.length ? '→ 提及 ' + c.mentioned.map((m) => `${m.name}${m.id}`).join(' ') : ''}`);
  console.log(`  ${c.remark}`);
}
writeFileSync(join(root, 'data/seed/relation-candidates.json'), JSON.stringify(candidates, null, 2));
console.log('\n✓ 已存 data/seed/relation-candidates.json');
