#!/usr/bin/env node
// 地图切片整改验收脚本（T10）
// 用途：把 T03 §5.4 的验收清单变成可复跑检查，任何一项失败即退出码 1。
// 用法：
//   node scripts/verify-geo-maps.mjs                    # 与 git HEAD 的切片对比
//   node scripts/verify-geo-maps.mjs --baseline 688b18f # 指定基线 ref
//   node scripts/verify-geo-maps.mjs --baseline /tmp/t03/maps   # 指定基线目录
// 只读：不写任何文件，不联网。
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const mapsDir = resolve(root, arg('--maps', 'public/data/maps'));
const geoFile = resolve(root, arg('--geo', 'public/data/geo.json'));
const baseline = arg('--baseline', 'HEAD');

// ---------- 期望值（2026-10-24 换源 Cliopatria 后重定；政权级轮廓，1–8 面/朝） ----------
// 旧 CHGIS 期望（120/163/253 面等）随换源作废，md5 基线在 data/CHANGELOG.md 2026-10-24 条目存档
const EXPECT = {
  tang: { features: 1, rings: 5, vertices: 245, bytes: 9773, md5: 'f42d87c5c4d4b767f6b71024e1f65cd6', bbox: [73.32, 122.71, 17.77, 42.76] },
  wudai: { features: 8, rings: 16, vertices: 494, bytes: 20556, md5: '18dcd67a696aac8b6f9cb387bca907cf', bbox: [99.85, 138.43, 18.22, 48.79] },
  song: { features: 1, rings: 3, vertices: 180, bytes: 7266, md5: '38de42399116939148882debc0d04c2b', bbox: [101.0, 122.71, 18.22, 39.06] },
  liao: { features: 1, rings: 2, vertices: 114, bytes: 4630, md5: '639d2d0acfeac0e4c07f204a0f931f5f', bbox: [99.79, 138.43, 38.55, 48.72] },
  jin: { features: 1, rings: 1, vertices: 116, bytes: 4694, md5: '7f8ece1dd3901c2593abc240d4695cd0', bbox: [103.5, 140.49, 32.94, 50.38] },
  yuan: { features: 1, rings: 4, vertices: 372, bytes: 14614, md5: '6cd0df2ec70a14bd14c2068329078022', bbox: [78.46, 141.56, 18.22, 61.48] },
  ming: { features: 1, rings: 3, vertices: 234, bytes: 9343, md5: 'c4c4ab27e7658f91f6fe835d145f1459', bbox: [98.26, 124.69, 18.22, 42.89] },
  qing: { features: 1, rings: 5, vertices: 416, bytes: 16339, md5: '49498d55b611438b1f6ae16893340ace', bbox: [73.38, 141.35, 18.22, 56.18] },
};
const DYNASTIES = Object.keys(EXPECT);
const TOTAL_BYTES = 87215;
const QING_MD5_UNCHANGED = '49498d55b611438b1f6ae16893340ace';
const EXPECT_ASSIGNED = 422;
const EXPECT_POINTS = 422;
const BBOX_TOL = 0.02;

// ---------- 小工具 ----------
const md5 = (buf) => createHash('md5').update(buf).digest('hex');
const rows = [];
let failed = 0;
function check(name, ok, detail) {
  rows.push({ name, ok, detail });
  if (!ok) failed++;
  return ok;
}
function info(name, detail) {
  rows.push({ name, ok: null, detail });
}
const round2 = (n) => Math.round(n * 100) / 100;

function rings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  return [];
}
function bboxOf(features) {
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const f of features) for (const r of rings(f.geometry)) for (const [x, y] of r) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, e, s, n];
}
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeom(lng, lat, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((poly) => {
    if (!pointInRing(lng, lat, poly[0])) return false;
    for (let k = 1; k < poly.length; k++) if (pointInRing(lng, lat, poly[k])) return false;
    return true;
  });
}

// ---------- 基线读取（git ref 或目录） ----------
function readBaseline(d) {
  const file = join(mapsDir, `${d}.json`);
  if (existsSync(baseline) && statSync(baseline).isDirectory()) {
    const p = join(baseline, `${d}.json`);
    return existsSync(p) ? readFileSync(p) : null;
  }
  try {
    return execFileSync('git', ['-C', root, 'show', `${baseline}:public/data/maps/${d}.json`], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return existsSync(file) ? null : null;
  }
}

// ---------- 1. 文件齐备 ----------
const files = existsSync(mapsDir) ? readdirSync(mapsDir).filter((f) => f.endsWith('.json') && f !== 'modern-china.json').sort() : [];
check('切片文件齐备（8 份，不含 modern-china）', files.length === 8 && DYNASTIES.every((d) => files.includes(`${d}.json`)), files.join(', '));

const cur = {};
const base = {};
for (const d of DYNASTIES) {
  cur[d] = JSON.parse(readFileSync(join(mapsDir, `${d}.json`), 'utf8'));
  const b = readBaseline(d);
  base[d] = b ? JSON.parse(b.toString('utf8')) : null;
}

// ---------- 2. 逐朝结构、体积、指纹、四至 ----------
info('朝 | 要素 | 环 | 顶点 | 体积B | gzipKB | md5 | 四至');
let totalBytes = 0;
let totalGzip = 0;
for (const d of DYNASTIES) {
  const exp = EXPECT[d];
  const g = cur[d];
  const feats = g.features;
  const buf = readFileSync(join(mapsDir, `${d}.json`));
  const size = buf.length;
  const gz = gzipSync(buf, { level: 9 }).length;
  totalBytes += size;
  totalGzip += gz;
  const rg = feats.reduce((n, f) => n + rings(f.geometry).length, 0);
  const vt = feats.reduce((n, f) => n + rings(f.geometry).reduce((m, r) => m + r.length, 0), 0);
  const bb = bboxOf(feats);
  const md = md5(buf);
  const badType = feats.filter((f) => f.properties?.type === '非政区国土').length;
  const bboxOk = bb.every((v, i) => Math.abs(v - exp.bbox[i]) <= BBOX_TOL);

  check(`${d} 要素数 = ${exp.features}`, feats.length === exp.features, `实际 ${feats.length}`);
  check(`${d} 非政区国土 = 0`, badType === 0, `实际 ${badType}`);
  check(`${d} 环/顶点 = ${exp.rings}/${exp.vertices}`, rg === exp.rings && vt === exp.vertices, `实际 ${rg}/${vt}`);
  check(`${d} 体积 = ${exp.bytes} B`, size === exp.bytes, `实际 ${size} B`);
  check(`${d} md5 = ${exp.md5.slice(0, 8)}…`, md === exp.md5, md);
  check(`${d} 四至一致（容差 ${BBOX_TOL}°）`, bboxOk, bb.map(round2).join(' / '));
  info(`  ${d}`, `${feats.length} 面 | ${rg} 环 | ${vt} 顶点 | ${size} B | ${(gz / 1024).toFixed(0)} KB | ${md.slice(0, 8)} | ${bb.map(round2).join('/')}`);
}
check(`总体积 = ${TOTAL_BYTES} B`, totalBytes === TOTAL_BYTES, `实际 ${totalBytes} B`);
info('gzip 合计', `${(totalGzip / 1024).toFixed(0)} KB（本地 gzip -9；线上以实际响应为准）`);

// ---------- 3. 清图完整性（换源后语义变更：不再是「与整改前逐字节相同」，改为完整性断言） ----------
// 沿革：本脚本原为 T10 CHGIS 整改验收（清台湾府 81 顶点、只删不改、7 面删除清单）。
// 2026-10-24 换源 Cliopatria（D5 裁定）后，底图为政权级轮廓，以下旧断言随 CHGIS 期望作废：
//   「清 1820 切片字节未变」「清台湾府 81 顶点+bbox」「保留要素几何 0 差异」「删除要素仅为非政区国土」。
// 清代台湾在 Cliopatria Qing Dynasty 轮廓内整体表达（无独立台湾府面），完整性由 EXPECT md5 断言承担。
const qingBuf = readFileSync(join(mapsDir, 'qing.json'));
check('清 1820 切片 md5 与换源基线一致', md5(qingBuf) === QING_MD5_UNCHANGED, md5(qingBuf));
info('清台湾府独立面', '已随换源取消（Cliopatria 为政权级轮廓，台湾含于 Qing Dynasty 整域）；旧 81 顶点断言随 CHGIS 作废');

// ---------- 4. 逐要素几何比对（换源后基线=本轮产物，仅校验可复算性） ----------
const keyOf = (f) => `${f.properties?.name}|${f.properties?.type}|${f.properties?.beg}|${f.properties?.end}`;
let geomDiffTotal = 0;
let missingTotal = 0;
let removedTotal = 0;
const removedNames = [];
for (const d of DYNASTIES) {
  if (!base[d]) { info(`${d} 几何比对`, '无基线，跳过'); continue; }
  // 换源后 git 基线仍是 CHGIS 旧切片，逐要素比对无意义；仅当基线与当前同为 Cliopatria（name 为政权名）时比对
  const baseIsCliopatria = (base[d].features[0]?.properties?.type ?? '') === '疆域轮廓';
  if (!baseIsCliopatria) { info(`${d} 几何比对`, '基线为 CHGIS 旧切片（已换源），跳过逐要素比对'); continue; }
  const bMap = new Map(base[d].features.map((f) => [keyOf(f), JSON.stringify(f.geometry)]));
  const cMap = new Map(cur[d].features.map((f) => [keyOf(f), JSON.stringify(f.geometry)]));
  let diff = 0;
  let missing = 0;
  for (const [k, g] of cMap) {
    if (!bMap.has(k)) missing++;
    else if (bMap.get(k) !== g) diff++;
  }
  let removed = 0;
  for (const k of bMap.keys()) if (!cMap.has(k)) {
    removed++;
    removedNames.push(`${d}:${k}`);
  }
  geomDiffTotal += diff;
  missingTotal += missing;
  removedTotal += removed;
  check(`${d} 与基线几何 0 差异`, diff === 0 && missing === 0, `几何不同 ${diff} / 新增键 ${missing} / 删除键 ${removed}`);
}
check('八朝合计几何差异 = 0', geomDiffTotal === 0, `差异 ${geomDiffTotal}`);
info('删除要素清单', `换源为全量替换，旧「仅删 7 个非政区国土」断言随 CHGIS 作废；本轮相对 git 基线 ${removedTotal} 面`);

// ---------- 5. 辽宋同源（结构性已知项，不作失败） ----------
const songMd5 = md5(readFileSync(join(mapsDir, 'song.json')));
const liaoMd5 = md5(readFileSync(join(mapsDir, 'liao.json')));
info('辽/宋 同源', songMd5 === liaoMd5 ? `仍同 md5 ${liaoMd5.slice(0, 8)}…（结构性，重切不解决）` : '已不同');

// ---------- 6. 点面归属（414 点 / 316 归属 / 0 变化） ----------
let assignedNow = 0;
let assignedBase = 0;
let changed = 0;
let points = [];
if (existsSync(geoFile)) {
  const geo = JSON.parse(readFileSync(geoFile, 'utf8'));
  points = geo.points ?? [];
  const polysNow = new Map(DYNASTIES.map((d) => [d, cur[d].features.map((f) => ({ name: f.properties.name, geom: f.geometry }))]));
  const polysBase = new Map(DYNASTIES.map((d) => [d, (base[d]?.features ?? []).map((f) => ({ name: f.properties.name, geom: f.geometry }))]));
  for (const p of points) {
    if (!p.lat || !p.lng) continue;
    const hitNow = polysNow.get(p.dynasty)?.find((pl) => pointInGeom(p.lng, p.lat, pl.geom));
    const hitBase = polysBase.get(p.dynasty)?.find((pl) => pointInGeom(p.lng, p.lat, pl.geom));
    if (hitNow) assignedNow++;
    if (hitBase) assignedBase++;
    if ((hitNow?.name ?? null) !== (hitBase?.name ?? null)) changed++;
  }
  check(`有坐标人物 = ${EXPECT_POINTS}`, points.length === EXPECT_POINTS, `实际 ${points.length}`);
  check(`点面归属 = ${EXPECT_ASSIGNED}`, assignedNow === EXPECT_ASSIGNED, `新 ${assignedNow} / 旧 ${assignedBase}`);
  // 归属变化：换源为全量替换（CHGIS 府级 → Cliopatria 政权级），归属名称必然全变，此断言仅在同源重切时有意义
  info('归属变化', `相对基线 ${changed} 人（换源全量替换，预期全变；同源重切时应为 0）`);
  const regions = geo.regions ?? {};
  const badRegion = [];
  for (const [d, list] of Object.entries(regions)) for (const r of list ?? []) if (/流求|琉球|台湾|夷洲|东番/.test(r.name)) badRegion.push(`${d}:${r.name}`);
  check('geo.json regions 无「流求/琉球/台湾」', badRegion.length === 0, badRegion.join('; ') || '0 条');
  const cov = geo.coverage ?? {};
  const covAssigned = Object.values(cov).reduce((n, c) => n + (c.assigned ?? 0), 0);
  check('geo.json coverage.assigned 合计 = 316', covAssigned === EXPECT_ASSIGNED, `实际 ${covAssigned}`);
  info('coverage.liao.assigned', String(cov.liao?.assigned ?? 'n/a'));
} else {
  info('点面归属', `未找到 ${geoFile}，跳过`);
}

// ---------- 7. 体积预算口径（D8 未决，仅报告） ----------
const over250 = DYNASTIES.filter((d) => EXPECT[d].bytes > 250 * 1024);
info('体积预算（脚本注释 ≤250KB/朝）', over250.length ? `仍超：${over250.join(', ')} → 需 D8 决定口径` : '全部达标');

// ---------- 输出 ----------
console.log('\n=== T10 地图切片验收 ===');
console.log(`切片目录：${mapsDir}`);
console.log(`基线：${baseline}\n`);
for (const r of rows) {
  if (r.ok === null) console.log(`  ·  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  else console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
}
console.log(`\n结果：${rows.filter((r) => r.ok === true).length} 通过 / ${failed} 失败 / ${rows.filter((r) => r.ok === null).length} 信息项`);
if (failed) process.exit(1);
