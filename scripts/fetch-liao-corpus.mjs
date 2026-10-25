#!/usr/bin/env node
// DB25 辽史语料抓取：辽状元本传密集卷 + 外延相关卷
// 用法：node scripts/fetch-liao-corpus.mjs
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/db23-corpus/辽史';
mkdirSync(outDir, { recursive: true });

// 辽史列传卷号范围：卷73–卷130（列传）。状元本传目标卷（据深档 note 与辽史通行目录）：
const TARGETS = [
  86,   // 刘六符等（外延关联）
  97,   // 耶律资忠等
  98,   // 萧孝忠等
  99,   // 耶律庶成等
  103,  // 文学：萧韩家奴 等
  104,  // 文学：耶律昭 等
  105,  // 能吏
  106,  // 卓行
  107,  // 方技
  110,  // 张俭传（圣宗朝名相，辽圣宗太平五年状元 hongjing 系）
  111,  // 耶律弘古等
  113,  // 耶律玦 等
  114,  // 萧兀纳 等
  115,  // 萧挞不也等
  116,  // 奸臣
  120,  // 龙化州／术者
  125,  // 列传：梁援所在（辽史卷125 文学？待验证）
  130,  // 语解/杂记
];

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

let ok = 0, fail = 0;
for (const juan of TARGETS) {
  const fp = join(outDir, `卷${juan}.txt`);
  if (existsSync(fp)) { ok++; continue; }
  const url = `https://zh.wikisource.org/wiki/${encodeURIComponent(`遼史/卷${juan}`)}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) { console.log(`✗ 卷${juan} HTTP ${res.status}`); fail++; continue; }
    const html = await res.text();
    const text = extractText(html);
    if (text.length < 2000) { console.log(`✗ 卷${juan} 内容过短 ${text.length}`); fail++; continue; }
    writeFileSync(fp, text);
    console.log(`✓ 卷${juan} ${text.length} 字`);
    ok++;
    await new Promise((r) => setTimeout(r, 800));
  } catch (e) {
    console.log(`✗ 卷${juan} ${e.message}`);
    fail++;
  }
}
console.log(`\n完成 ok=${ok} fail=${fail}`);
