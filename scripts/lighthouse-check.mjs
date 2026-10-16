#!/usr/bin/env node
/**
 * T7a · Lighthouse 三页实测（一键脚本，需在本机终端运行——沙箱内 Chrome 被 SIGTERM 拦截）
 *
 * 用法：
 *   node scripts/lighthouse-check.mjs                      # 线上三页 · desktop preset（默认）
 *   node scripts/lighthouse-check.mjs --preset=mobile      # 移动端配置
 *   node scripts/lighthouse-check.mjs --local              # 改测本地 preview（默认 http://127.0.0.1:4321）
 *   node scripts/lighthouse-check.mjs --local --port 4321
 *   node scripts/lighthouse-check.mjs --url https://wakakacoding.github.io/zhuangyuan-galaxy
 *   node scripts/lighthouse-check.mjs --only=/,/map/       # 只跑指定页
 *   node scripts/lighthouse-check.mjs --reuse              # 不重跑，用 docs/lighthouse/*.json 重新生成文档
 *   node scripts/lighthouse-check.mjs --view               # 跑完自动打开 HTML 报告
 *
 * 产出：
 *   docs/lighthouse/<YYYY-MM>-<page>.report.json / .report.html   原始报告
 *   docs/lighthouse-2026-10.md                                    分数表 + 不达标项 自动回填（标记块内）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', 'lighthouse-2026-10.md');
const OUT_DIR = path.join(ROOT, 'docs', 'lighthouse');
const LH_VERSION = '12.2.1';

const PAGES = [
  { key: 'home', label: '首页 /', path: '/' },
  { key: 'map', label: '地图 /map', path: '/map/' },
  { key: 'insights', label: '问答 /insights', path: '/insights/' },
];

const CATS = [
  ['performance', 'Performance'],
  ['accessibility', 'Accessibility'],
  ['best-practices', 'Best Practices'],
  ['seo', 'SEO'],
];

// ---------- 参数解析 ----------
const argv = process.argv.slice(2);
const getFlag = (name, def = undefined) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
};
const preset = String(getFlag('preset', 'desktop'));
const useLocal = Boolean(getFlag('local', false));
const reuse = Boolean(getFlag('reuse', false));
const view = Boolean(getFlag('view', false));
const port = String(getFlag('port', '4321'));
const only = getFlag('only', null);
const baseUrl = String(
  getFlag('url', useLocal ? `http://127.0.0.1:${port}` : 'https://wakakacoding.github.io/zhuangyuan-galaxy'),
).replace(/\/$/, '');

const selected = only
  ? PAGES.filter((p) => String(only).split(',').some((o) => o.trim().replace(/\/$/, '') === p.path.replace(/\/$/, '')))
  : PAGES;

const stamp = new Date().toISOString().slice(0, 10);

// ---------- 运行 ----------
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
for (const page of selected) {
  const url = baseUrl + page.path;
  const outBase = path.join(OUT_DIR, `${stamp}-${page.key}`);
  // Lighthouse 会在 --output-path 后追加 .report.json / .report.html
  const jsonPath = `${outBase}.report.json`;
  const htmlPath = `${outBase}.report.html`;

  if (reuse) {
    if (!fs.existsSync(jsonPath)) {
      console.error(`✗ --reuse 但找不到 ${path.relative(ROOT, jsonPath)}，跳过 ${page.label}`);
      continue;
    }
    console.log(`↺ 复用已有报告：${path.relative(ROOT, jsonPath)}`);
  } else {
    console.log(`\n▶ Lighthouse 实测：${page.label} → ${url}`);
    const args = [
      '--yes',
      `lighthouse@${LH_VERSION}`,
      url,
      `--preset=${preset}`,
      '--only-categories=performance,accessibility,best-practices,seo',
      '--output=json',
      '--output=html',
      `--output-path=${outBase}`,
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage',
      '--max-wait-for-load=45000',
      '--quiet',
    ];
    const r = spawnSync('npx', args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.error) {
      console.error(`\n✗ 启动失败：${r.error.message}\n  确认已安装 Chrome：https://www.google.com/chrome/`);
      process.exit(1);
    }
    if (r.status !== 0 || !fs.existsSync(jsonPath)) {
      console.error(`\n✗ ${page.label} 实测失败（退出码 ${r.status}）。若为端口/网络问题，可加 --local 改测本地 preview。`);
      process.exit(1);
    }
  }

  const lhr = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const cats = {};
  for (const [id, name] of CATS) {
    const c = lhr.categories?.[id];
    cats[id] = { name, score: typeof c?.score === 'number' ? Math.round(c.score * 100) : null };
  }
  // 不达标审计项（score < 0.9 且带权重）
  const fails = [];
  for (const [id, name] of CATS) {
    const c = lhr.categories?.[id];
    if (!c?.auditRefs) continue;
    for (const ref of c.auditRefs) {
      if (!ref.weight) continue;
      const a = lhr.audits?.[ref.id];
      if (!a || a.score === null || a.score === undefined) continue;
      if (a.score >= 0.9) continue;
      fails.push({
        cat: name,
        id: ref.id,
        title: a.title,
        display: a.displayValue || '',
        score: a.score,
        weight: ref.weight,
        waste: (ref.weight * (1 - a.score)),
      });
    }
  }
  fails.sort((x, y) => y.waste - x.waste);
  const metrics = {};
  for (const m of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'interactive']) {
    const a = lhr.audits?.[m];
    if (a) metrics[m] = a.displayValue || String(a.numericValue ?? '');
  }
  results.push({ page, url, cats, fails, metrics, jsonPath: path.relative(ROOT, jsonPath), htmlPath: path.relative(ROOT, htmlPath) });
  fs.writeFileSync(`${outBase}.summary.json`, JSON.stringify({ url, preset, stamp, cats, metrics, fails }, null, 2));
  console.log(`  ✓ ${Object.values(cats).map((c) => `${c.name} ${c.score}`).join(' / ')}`);
}

if (!results.length) {
  console.error('没有可用结果，退出。');
  process.exit(1);
}

// ---------- 生成 markdown 块 ----------
const lines = [];
lines.push(`> 实测时间：${stamp}　·　配置：Lighthouse ${LH_VERSION} / \`--preset=${preset}\`　·　目标：${baseUrl}`);
lines.push(`> 原始报告：${results.map((r) => `\`${r.htmlPath}\``).join('、')}`);
lines.push('');
lines.push('| 页面 | Performance | Accessibility | Best Practices | SEO |');
lines.push('| --- | --- | --- | --- | --- |');
for (const r of results) {
  const cells = CATS.map(([id]) => {
    const s = r.cats[id]?.score;
    if (s === null || s === undefined) return '—';
    return s >= 90 ? `**${s}**` : `${s}`;
  });
  lines.push(`| ${r.page.label} | ${cells.join(' | ')} |`);
}
lines.push('');
lines.push('**关键指标**');
lines.push('');
lines.push('| 页面 | FCP | LCP | TBT | CLS | SI | TTI |');
lines.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  const m = r.metrics;
  lines.push(
    `| ${r.page.label} | ${m['first-contentful-paint'] ?? '—'} | ${m['largest-contentful-paint'] ?? '—'} | ${m['total-blocking-time'] ?? '—'} | ${m['cumulative-layout-shift'] ?? '—'} | ${m['speed-index'] ?? '—'} | ${m['interactive'] ?? '—'} |`,
  );
}
lines.push('');
lines.push('**不达标项（同一审计跨页合并，按权重损失排序，score < 0.9）**');
lines.push('');
const byAudit = new Map();
for (const r of results) {
  for (const f of r.fails) {
    const k = `${f.cat}|${f.id}`;
    const cur = byAudit.get(k) ?? { ...f, pages: [], values: new Set() };
    cur.pages.push(r.page.label);
    if (f.display) cur.values.add(f.display);
    cur.waste = Math.max(cur.waste, f.waste);
    cur.score = Math.min(cur.score, f.score);
    byAudit.set(k, cur);
  }
}
const allFails = [...byAudit.values()].sort((x, y) => y.waste - x.waste);
if (!allFails.length) {
  lines.push('（无——四类审计全部 ≥ 0.9）');
} else {
  lines.push('| 类别 | 审计项 | 命中页 | 实测值 | score | 权重 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const f of allFails.slice(0, 25)) {
    const hit = f.pages.length === results.length ? `全部 ${f.pages.length} 页` : f.pages.join('、');
    lines.push(
      `| ${f.cat} | ${f.title} | ${hit} | ${[...f.values].join(' / ') || '—'} | ${f.score.toFixed(2)} | ${f.weight} |`,
    );
  }
  if (allFails.length > 25) lines.push(`\n_（其余 ${allFails.length - 25} 项见各页原始报告）_`);
}
const block = lines.join('\n');

const BEGIN = '<!-- LH:SCORES:BEGIN -->';
const END = '<!-- LH:SCORES:END -->';
if (fs.existsSync(DOC)) {
  const doc = fs.readFileSync(DOC, 'utf8');
  const b = doc.indexOf(BEGIN);
  const e = doc.indexOf(END);
  if (b !== -1 && e !== -1 && e > b) {
    const next = doc.slice(0, b + BEGIN.length) + '\n\n' + block + '\n\n' + doc.slice(e);
    fs.writeFileSync(DOC, next);
    console.log(`\n✓ 已回填 ${path.relative(ROOT, DOC)}（标记块内）`);
  } else {
    console.error(`\n⚠ ${path.relative(ROOT, DOC)} 内未找到 ${BEGIN} / ${END} 标记块，分数表未回填。`);
  }
} else {
  console.error(`\n⚠ 未找到 ${path.relative(ROOT, DOC)}，分数表未回填。`);
}

if (view) {
  for (const r of results) spawnSync('open', [path.join(ROOT, r.htmlPath)], { stdio: 'ignore' });
}

console.log('\n—— 分数表已回填 docs/lighthouse-2026-10.md；回对话里说一句「T7a 实测完成」即可，我会直接读取结果并据此收敛优化清单 ——');
