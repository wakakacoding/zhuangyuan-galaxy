#!/usr/bin/env node
// DB23 姓名共现预筛：本传语料 × 站内状元名（繁简归一）
// 找「某状元本传里出现另一位状元的名字」→ 输出带上下文供人工核
// 用法：node scripts/scan-mentions.mjs > /tmp/db23-mentions.txt
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpusDir = '/tmp/db23-corpus';

// 繁简归一
const T2S = JSON.parse(readFileSync(join(root, 'data/t2s.json'), 'utf8'));
const simp = (s) => [...s].map((c) => T2S[c] ?? c).join('');

// 站内人（名录+外延），按简体名索引；重名者列出全部
const idx = JSON.parse(readFileSync(join(root, 'public/data/person-index.json'), 'utf8'));
const ext = JSON.parse(readFileSync(join(root, 'public/data/externals-index.json'), 'utf8'));
const bySimp = new Map();
for (const p of [...idx, ...ext]) {
  const k = simp(p.name);
  if (!bySimp.has(k)) bySimp.set(k, []);
  bySimp.get(k).push(p);
}

// 每卷的主人：sources.yaml 定位到该卷的本传主人（从 note 反查——手工映射太脆，
// 改为：扫描时不区分主人，凡「卷内出现状元名」即列出，由人工判断主客）
const relTxt = readFileSync(join(root, 'data/relations.yaml'), 'utf8');
const hasEdge = new Set(
  [...relTxt.matchAll(/^- from: (\S+)[\s\S]*?^  to: (\S+)/gm)].map((m) => {
    const a = m[1], b = m[2];
    return a < b ? a + '|' + b : b + '|' + a;
  })
);

for (const book of readdirSync(corpusDir).sort()) {
  for (const f of readdirSync(join(corpusDir, book)).sort()) {
    const juan = f.replace('.txt', '');
    const text = readFileSync(join(corpusDir, book, f), 'utf8');
    const stext = simp(text);
    const found = [];
    for (const [name, ps] of bySimp) {
      if (name.length < 2) continue; // 单字名噪声大，跳过
      const at = stext.indexOf(name);
      if (at < 0) continue;
      // 上下文（归一前原文定位：直接用归一后取窗，再回贴）
      const ctx = stext.slice(Math.max(0, at - 40), at + name.length + 40).replace(/\n/g, '⏎');
      found.push({ name, ps: ps.map((p) => p.id + (idx.includes(p) ? '' : '(外)')), ctx });
    }
    if (found.length < 2) continue; // 只有 1 个状元名的卷（多半是主人自己）跳过
    console.log(`\n===== ${book}/${juan} =====`);
    for (const fnd of found) {
      for (const pid of fnd.ps) {
        const bare = pid.replace('(外)', '');
        console.log(`  ${fnd.name} ${pid} :: ${fnd.ctx}`);
      }
    }
  }
}
