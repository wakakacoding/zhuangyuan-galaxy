// 历史底图构建：Cliopatria 疆域轮廓（CC BY 4.0）→ 分朝 GeoJSON
// 输入：data/geo/cliopatria/dynasty-outlines-v1.geojson（由 Seshat Cliopatria v0.2.1 按切片年截取，
//       提取与抽稀脚本见 outputs/ai-tasks/2026-10-24-四线推进交接.md；政权→朝代映射内嵌于源文件 properties.dynasty）
// 输出：public/data/maps/{dynasty}.json（政权级疆域轮廓面，WGS84，字段：polity/beg/end）
// 用法：npx tsx scripts/build-geo-maps.ts（默认重切，产物入 Git 前需过 C 线评审）
// 换源记录：2026-10-24 D5 裁定弃用 CHGIS（EULA no redistribution 与公开分发冲突）。
// 语义降级：府级政区面 → 政权疆域轮廓；辽代由宋图同源改为独立 Liao Dynasty 轮廓。
import { readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'data/geo/cliopatria/dynasty-outlines-v1.geojson');
const outDir = join(root, 'public', 'data', 'maps');
mkdirSync(outDir, { recursive: true });

if (!existsSync(src)) {
  console.error('缺少 Cliopatria 轮廓源文件 data/geo/cliopatria/dynasty-outlines-v1.geojson。');
  console.error('提取方法见 outputs/ai-tasks/2026-10-24-四线推进交接.md §①；数据许可 CC BY 4.0（Seshat Cliopatria）。');
  process.exit(1);
}

const fc = JSON.parse(readFileSync(src, 'utf8'));
if (fc.name !== 'zhuangyuan-galaxy-dynasty-outlines-v1') {
  console.error(`源文件标识不符：${fc.name}（期望 zhuangyuan-galaxy-dynasty-outlines-v1）`);
  process.exit(1);
}

const DYNASTIES = ['tang', 'wudai', 'song', 'liao', 'jin', 'yuan', 'ming', 'qing'];
console.log('朝代切片构建（Cliopatria 疆域轮廓，CC BY 4.0，WGS84）\n');
const audit: { dynasty: string; polities: string[]; kb: number }[] = [];

for (const key of DYNASTIES) {
  const feats = fc.features.filter((f: { properties: { dynasty: string } }) => f.properties.dynasty === key);
  if (!feats.length) {
    console.error(`  ✗ ${key}: 源中无轮廓，终止（切片不完整比缺图更危险）`);
    process.exit(1);
  }
  const polities: string[] = [];
  const out = {
    type: 'FeatureCollection',
    features: feats.map((f: { properties: { polity: string; from: number; to: number }; geometry: unknown }) => {
      polities.push(f.properties.polity);
      return {
        type: 'Feature',
        properties: { name: f.properties.polity, type: '疆域轮廓', beg: f.properties.from, end: f.properties.to },
        geometry: f.geometry,
      };
    }),
  };
  // 同一政权同段可能多面（源按 feature 拆），合并为每政权一条记录由 nameProperty 聚合渲染
  const outPath = join(outDir, `${key}.json`);
  writeFileSync(outPath, JSON.stringify(out));
  const kb = Math.round(statSync(outPath).size / 1024);
  audit.push({ dynasty: key, polities: [...new Set(polities)], kb });
  console.log(`  ✓ ${key}: ${feats.length} 面（${[...new Set(polities)].join('、')}），${kb}KB`);
}

const total = audit.reduce((s, a) => s + a.kb, 0);
console.log(`\n合计 ${total}KB（未压缩），按需懒加载，首屏只载当前朝`);
console.log('署名要求：页脚已固定「疆域轮廓：Cliopatria (Seshat Global History Databank), CC BY 4.0」');
console.log('旧 CHGIS 切片已由本脚本产物覆盖；CHGIS shp 与许可限制见 data/geo/SOURCES.md 历史段落');
