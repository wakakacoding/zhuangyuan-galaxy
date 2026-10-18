// 历史底图构建：CHGIS V6 时间序列 shp → 按朝代切片 → 简化 → 分朝 GeoJSON
// 输入：data/geo/chgis/raw/v6_time_pref_pgn_utf_wgs84/（下载方式见 data/geo/SOURCES.md）
// 输出：public/data/maps/{dynasty}.json（府级面，WGS84，字段精简为 name/type/beg/end）
// 用法：npx tsx scripts/build-geo-maps.ts
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shp = join(root, 'data/geo/chgis/raw/v6_time_pref_pgn_utf_wgs84/v6_time_pref_pgn_utf_wgs84.shp');
const outDir = join(root, 'public', 'data', 'maps');
mkdirSync(outDir, { recursive: true });

// 无 CHGIS 原始数据时（如新克隆仓库）：切片产物已入 Git 则跳过，否则报错并给下载指引
if (!existsSync(shp)) {
  const existing = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith('.json')) : [];
  if (existing.length >= 8) {
    console.log(`未找到 CHGIS 原始数据，但已有 ${existing.length} 份切片产物，跳过重建`);
    console.log('（如需重建：按 data/geo/SOURCES.md 第 1 节下载解压后重跑）');
    process.exit(0);
  }
  console.error('缺少 CHGIS 原始数据且无切片产物。请按 data/geo/SOURCES.md 第 1 节下载解压。');
  process.exit(1);
}
const mapshaper = join(root, 'node_modules', '.bin', 'mapshaper');

// 每朝一个建制稳定期切片年（选定依据见 M2 开发计划 §2.1）
// simplify = mapshaper weighted 简化保留比例，按体积预算 ≤250KB/朝 调整
const SLICES: { dynasty: string; year: number; simplify: string }[] = [
  { dynasty: 'tang', year: 741, simplify: '8%' },
  { dynasty: 'wudai', year: 960, simplify: '8%' },
  { dynasty: 'song', year: 1111, simplify: '8%' },
  { dynasty: 'liao', year: 1111, simplify: '8%' },
  { dynasty: 'jin', year: 1189, simplify: '8%' },
  { dynasty: 'yuan', year: 1330, simplify: '5%' },
  { dynasty: 'ming', year: 1582, simplify: '5%' },
  { dynasty: 'qing', year: 1820, simplify: '5%' },
];

console.log('朝代切片构建（CHGIS V6 time series，WGS84）\n');
const audit: { dynasty: string; year: number; features: number; kb: number }[] = [];

for (const s of SLICES) {
  const out = join(outDir, `${s.dynasty}.json`);
  execFileSync(mapshaper, [
    shp,
    '-filter', `BEG_YR <= ${s.year} && END_YR >= ${s.year} && TYPE_CH != "非政区国土"`,
    '-filter-fields', 'NAME_CH,TYPE_CH,BEG_YR,END_YR',
    '-rename-fields', 'name=NAME_CH,type=TYPE_CH,beg=BEG_YR,end=END_YR',
    '-simplify', 'weighted', s.simplify, 'keep-shapes',
    '-o', out, 'format=geojson', 'precision=0.01',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  const geo = JSON.parse(readFileSync(out, 'utf8'));
  const kb = Math.round(statSync(out).size / 1024);
  audit.push({ dynasty: s.dynasty, year: s.year, features: geo.features.length, kb });
  console.log(`  ✓ ${s.dynasty} (${s.year}年): ${geo.features.length} 面, ${kb}KB`);
}

const total = audit.reduce((s, a) => s + a.kb, 0);
console.log(`\n合计 ${total}KB（未压缩），按需懒加载，首屏只载当前朝`);
console.log('现代底图 modern-china.json 已固化（来源见 SOURCES.md），本脚本不重复下载');
