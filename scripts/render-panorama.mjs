#!/usr/bin/env node
// 星图静态全景（移动端默认视图）：与 StarMap 同参数渲染 SVG 到 public/images/starmap-panorama.svg
// 简化：不做 force 防重叠，带内用确定性伪随机抖动（移动端静态图可接受）
// 用法：node scripts/render-panorama.mjs（npm run build:data 后自动调用）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(readFileSync(join(root, 'public/data/person-index.json'), 'utf8'));
const dynasties = JSON.parse(readFileSync(join(root, 'public/data/dynasties.json'), 'utf8'));
dynasties.sort((a, b) => a.order - b.order);

// 与 StarMap.tsx 同参数
const W = 900, H = 620;
const MARGIN = { left: 56, right: 20, top: 34, bottom: 14 };
const MIN_BAND = 44;

const xScale = (yr) => MARGIN.left + ((yr - 600) / (1915 - 600)) * (W - MARGIN.left - MARGIN.right);

const counts = new Map();
for (const s of index) counts.set(s.dynasty, (counts.get(s.dynasty) ?? 0) + 1);
const availH = H - MARGIN.top - MARGIN.bottom;
let acc = MARGIN.top;
const bandCenters = new Map();
for (const d of dynasties) {
  const bh = Math.max(MIN_BAND, ((counts.get(d.key) ?? 0) / index.length) * availH);
  bandCenters.set(d.key, acc + bh / 2);
  acc += bh;
}
const totalH = acc; // 实际内容高度可能超出 H，等比压缩
const yCompress = Math.min(1, H / totalH);

// 确定性伪随机（mulberry32）
const rand = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const parts = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="'Noto Serif SC',serif">`);
parts.push(`<rect width="${W}" height="${H}" fill="#101B2A"/>`);

// 百年刻度
for (let yr = 700; yr <= 1900; yr += 100) {
  const px = xScale(yr);
  parts.push(`<line x1="${px}" y1="${MARGIN.top}" x2="${px}" y2="${H - MARGIN.bottom}" stroke="rgba(242,234,216,0.07)"/>`);
  parts.push(`<text x="${px}" y="${MARGIN.top - 8}" font-size="10" fill="rgba(154,165,177,0.55)" text-anchor="middle">${yr}</text>`);
}

// 朝代带标签
for (const d of dynasties) {
  const cy = (bandCenters.get(d.key) ?? 0) * yCompress;
  parts.push(`<text x="8" y="${cy + 4}" font-size="12" fill="${d.color}B3">${d.name}</text>`);
  parts.push(`<line x1="${MARGIN.left - 8}" y1="${cy + 10}" x2="${W - MARGIN.right}" y2="${cy + 10}" stroke="${d.color}26"/>`);
}

// 星（带内伪随机抖动；亮度=0.3+0.7*completeness，与 StarMap 常态一致）
index.forEach((s, i) => {
  const r = rand(i * 7919 + 17);
  const cy = (bandCenters.get(s.dynasty) ?? H / 2) * yCompress;
  const x = xScale(s.exam_year) + (r() - 0.5) * 7;
  const y = cy + (r() - 0.5) * Math.max(18, MIN_BAND * yCompress * 0.62);
  const radius = (1.5 + 2.4 * s.completeness).toFixed(2);
  const alpha = (0.3 + 0.7 * s.completeness).toFixed(2);
  const color = dynasties.find((d) => d.key === s.dynasty)?.color ?? '#9AA5B1';
  parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}" fill="${color}" fill-opacity="${alpha}"/>`);
});

parts.push('</svg>');
mkdirSync(join(root, 'public/images'), { recursive: true });
writeFileSync(join(root, 'public/images/starmap-panorama.svg'), parts.join('\n'));
console.log(`✓ 星图静态全景：${index.length} 星 → public/images/starmap-panorama.svg`);
