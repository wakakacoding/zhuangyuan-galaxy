#!/usr/bin/env node
// DB24 传主分段预筛：本传语料按「[编辑]」标题切段 → 只在传主段内找其他状元名
// 消掉跨传噪声（论赞并提、同卷他传、名单罗列）
// 用法：node scripts/scan-mentions-v2.mjs > /tmp/db24-mentions.txt
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpusDir = '/tmp/db23-corpus';

const T2S = JSON.parse(readFileSync(join(root, 'data/t2s.json'), 'utf8'));
const simp = (s) => [...s].map((c) => T2S[c] ?? c).join('');

const idx = JSON.parse(readFileSync(join(root, 'public/data/person-index.json'), 'utf8'));
const ext = JSON.parse(readFileSync(join(root, 'public/data/externals-index.json'), 'utf8'));
const bySimp = new Map();
for (const p of [...idx, ...ext]) {
  const k = simp(p.name);
  if (!bySimp.has(k)) bySimp.set(k, []);
  bySimp.get(k).push(p);
}

const relTxt = readFileSync(join(root, 'data/relations.yaml'), 'utf8');
// 双向查重（DB23 教训）
const hasEdge = new Set();
for (const m of relTxt.matchAll(/^- from: (\S+)[\s\S]*?^  to: (\S+)/gm)) {
  const a = m[1], b = m[2];
  hasEdge.add(a < b ? a + '|' + b : b + '|' + a);
}

for (const book of readdirSync(corpusDir).sort()) {
  for (const f of readdirSync(join(corpusDir, book)).sort()) {
    const juan = f.replace('.txt', '');
    const text = readFileSync(join(corpusDir, book, f), 'utf8');
    // 归一段落标题标记：抽取器把 [编辑] 拆成了 [ / 编辑 / ] 三行，先合并
    const norm = text.replace(/\[\n编辑\n\]/g, '[编辑]').replace(/\[\n编辑\n\]\n?/g, '[编辑]\n');
    // 按维基文库段落标题切：标题行形如「张九成[编辑]」，其后到下个标题为该传正文
    const parts = norm.split(/\n?[^\n]*\[编辑]\n?/);
    for (let pi = 0; pi < parts.length; pi++) {
      const seg = parts[pi];
      if (seg.length < 80) continue; // 跳过目录碎片
      const sseg = simp(seg);
      // 传主判定：段内出现的站内人名
      const found = [];
      for (const [name, ps] of bySimp) {
        if (name.length < 2) continue;
        if (!sseg.includes(name)) continue;
        // 找全部出现位置，取第一处上下文
        const at = sseg.indexOf(name);
        const ctx = sseg.slice(Math.max(0, at - 50), at + name.length + 60).replace(/\n/g, '⏎');
        found.push({ name, ps, ctx });
      }
      if (found.length < 2) continue;
      // 段落标题 = 上一段的最后一行（[编辑] 前的名字）
      const prevTail = (parts[pi - 1] || '').split('\n').filter(Boolean).pop() || '(卷首)';
      console.log(`\n== ${book}/${juan} 「${prevTail.slice(0, 20)}」段 ==`);
      for (const fnd of found) {
        for (const p of fnd.ps) {
          console.log(`  ${fnd.name} ${p.id}${idx.includes(p) ? '' : '(外)'} :: ${fnd.ctx}`);
        }
      }
    }
  }
}
