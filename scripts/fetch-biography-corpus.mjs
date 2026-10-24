#!/usr/bin/env node
// DB23 正史本传语料抓取：sources.yaml 已定位（s0055/s0056/s0057/s0058/s0059 + s0003–s0009 quoted 卷）
// 抓维基文库卷页 → 抽正文 → 存 /tmp/db23-corpus/{书}/{卷}.txt
// 用法：node scripts/fetch-biography-corpus.mjs [--only 宋史/卷284]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/db23-corpus';
mkdirSync(outDir, { recursive: true });

// 书名 → wikisource 路径前缀（简体页面名会 301 到繁体，curl -L 跟随）
const BOOK_PREFIX = {
  宋史: '宋史/卷',
  金史: '金史/卷',
  元史: '元史/卷',
  明史: '明史/卷',
  清史稿: '清史稿/卷',
  旧唐书: '舊唐書/卷',
  新唐书: '新唐書/卷',
};

// 从 sources.yaml 已核卷次列表（s0055–s0059 的 note + s0003–s0009 的 juan）
const TARGETS = [
  // s0055 宋史诸传
  ['宋史', 266], ['宋史', 287], ['宋史', 432], ['宋史', 286], ['宋史', 317], ['宋史', 284],
  ['宋史', 292], ['宋史', 321], ['宋史', 318], ['宋史', 320], ['宋史', 302], ['宋史', 387],
  ['宋史', 374], ['宋史', 389], ['宋史', 384], ['宋史', 390], ['宋史', 381], ['宋史', 451],
  ['宋史', 436], ['宋史', 405],
  // s0056 金史
  ['金史', 126], ['金史', 106],
  // s0057 元史
  ['元史', 186], ['元史', 196],
  // s0058 明史
  ['明史', 168], ['明史', 184], ['明史', 181], ['明史', 195], ['明史', 148], ['明史', 167],
  ['明史', 193], ['明史', 218], ['明史', 191],
  // s0059 清史稿
  ['清史稿', 250], ['清史稿', 266], ['清史稿', 302], ['清史稿', 305], ['清史稿', 323],
  ['清史稿', 320], ['清史稿', 437], ['清史稿', 479],
  // s0003–s0009 quoted 卷
  ['宋史', 418], ['宋史', 310], ['明史', 176], ['明史', 143], ['清史稿', 332],
  ['旧唐书', 93], ['旧唐书', 190], ['旧唐书', 190], ['旧唐书', 75], ['旧唐书', 149],
  ['新唐书', 122], ['新唐书', 160], ['金史', 125], ['元史', 143], ['元史', 153],
];

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const uniq = [...new Map(TARGETS.map((t) => [t.join('/'), t])).values()];
let ok = 0, fail = 0;
for (const [book, juan] of uniq) {
  const key = `${book}/卷${juan}`;
  if (only && key !== only) continue;
  const fp = join(outDir, book, `卷${juan}.txt`);
  if (existsSync(fp)) { ok++; continue; }
  const url = `https://zh.wikisource.org/zh-hans/${BOOK_PREFIX[book]}${juan}`.replace('zh-hans', 'wiki');
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) { console.log(`✗ ${key} HTTP ${res.status}`); fail++; continue; }
    const html = await res.text();
    const text = extractText(html);
    mkdirSync(join(outDir, book), { recursive: true });
    writeFileSync(fp, text);
    console.log(`✓ ${key} ${text.length} 字`);
    ok++;
    await new Promise((r) => setTimeout(r, 800)); // 限速礼貌
  } catch (e) {
    console.log(`✗ ${key} ${e.message}`);
    fail++;
  }
}
console.log(`\n完成 ok=${ok} fail=${fail}`);
