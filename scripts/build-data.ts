// 数据构建管线：YAML/TSV 源 → 校验 → 地理回填 → 丰富度评分 → JSON 分包
// 用法：tsx scripts/build-data.ts
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import {
  PersonSchema, DynastySchema, SourceSchema, RelationSchema, CareerSchema, ExternalSchema,
  RELATION_TYPES, CAREER_STAGE_CATEGORIES, CAREER_FINAL_CATEGORIES,
  type Person, type Dynasty, type Source, type Relation, type PersonIndexEntry, type External,
  type EdgesFile, type Community,
} from '../src/lib/schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const outDir = join(root, 'public', 'data');
mkdirSync(join(outDir, 'person'), { recursive: true });

let errors = 0;
const err = (msg: string) => { console.error(`  ✗ ${msg}`); errors++; };
const warn = (msg: string) => console.warn(`  ⚠ ${msg}`);

// ---------- 干支 ----------
const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const ganzhi = (year: number) =>
  STEMS[(year - 4) % 10] + BRANCHES[(year - 4) % 12];

// ---------- 繁简归一（地名匹配 + 搜索索引用，单一真源：data/t2s.json） ----------
// 地名与人名用字合并表；前端 src/lib/normalize.ts 直接 import 同一 JSON，改表只改一处
const T2S: Record<string, string> = JSON.parse(readFileSync(join(dataDir, 't2s.json'), 'utf8'));
const simp = (s: string) => [...s].map((c) => T2S[c] ?? c).join('');

// ---------- 1. 朝代 ----------
const dynasties = (yaml.load(readFileSync(join(dataDir, 'dynasties.yaml'), 'utf8')) as unknown[])
  .map((d) => DynastySchema.parse(d));
const dynastyByKey = new Map(dynasties.map((d) => [d.key, d]));
console.log(`✓ 朝代 ${dynasties.length}`);

// ---------- 2. 出处 ----------
const sources = (yaml.load(readFileSync(join(dataDir, 'sources.yaml'), 'utf8')) as unknown[])
  .map((s) => SourceSchema.parse(s));
const sourceById = new Map(sources.map((s) => [s.id, s]));
console.log(`✓ 出处 ${sources.length}`);

// ---------- 3. 骨架名录（roster.tsv） ----------
const tsv = readFileSync(join(dataDir, 'seed', 'roster.tsv'), 'utf8');
const rosterLines = tsv.split('\n').slice(1).filter(Boolean);
const persons: Person[] = rosterLines.map((line) => {
  const [id, name, dynasty, exam_year, reign, birth, death, native_hist, tags] = line.split('\t');
  return PersonSchema.parse({
    id, name, dynasty,
    exam_year: Number(exam_year),
    reign: reign || undefined,
    birth_year: birth ? Number(birth) : undefined,
    death_year: death ? Number(death) : undefined,
    native_hist: native_hist || '',
    tags: tags ? tags.split(/[;,，；]/) : [],
    events: [],
    source_id: undefined,
  });
});
console.log(`✓ 骨架名录 ${persons.length}`);
const personById = new Map(persons.map((p) => [p.id, p]));

// ---------- 4. 深度档案合并 ----------
const profileFiles = readdirSync(join(dataDir, 'persons')).filter((f) => f.endsWith('.yaml'));
for (const f of profileFiles) {
  const profile = PersonSchema.parse(yaml.load(readFileSync(join(dataDir, 'persons', f), 'utf8')));
  const base = personById.get(profile.id);
  if (!base) { err(`深度档案 ${f} 的 id ${profile.id} 不在骨架名录中`); continue; }
  // 深度档案覆盖骨架字段（以 YAML 为准）
  Object.assign(base, profile);
}
console.log(`✓ 深度档案 ${profileFiles.length}`);

// ---------- 4b. 仕途轻量字段回填（挖掘底稿 + 人工考据，聚合桑基数据源） ----------
// 优先级：深度档案 YAML > careers.yaml（人工考据）> careers-mined-qing.yaml（脚本挖掘）
let careerCount = 0;
for (const rel of ['seed/careers-mined-qing.yaml', 'careers.yaml']) {
  const fp = join(dataDir, rel);
  if (!existsSync(fp)) continue;
  const careerRows = (yaml.load(readFileSync(fp, 'utf8')) as unknown[]) ?? [];
  for (const row of careerRows) {
    const { id, source_id, note, ...careerFields } = row as Record<string, unknown> & { id: string; source_id?: string; note?: string };
    const p = personById.get(id);
    if (!p) { err(`${rel}: id ${id} 不在骨架名录中`); continue; }
    if (source_id && !sourceById.has(source_id)) { err(`${rel}: ${id} 引用不存在出处 ${source_id}`); continue; }
    const parsed = CareerSchema.parse(careerFields);
    // 后加载者优先（人工考据覆盖挖掘）；深档 YAML 已在合并阶段落定，此处不再回写覆盖其已有字段
    p.career = { ...(p.career ?? {}), ...parsed };
    careerCount++;
  }
}
console.log(`✓ 仕途回填 ${careerCount} 条记录（挖掘+人工）`);

// ---------- 5. 关系（人工考据 + 同年自动派生） ----------
const manualRelations = (yaml.load(readFileSync(join(dataDir, 'relations.yaml'), 'utf8')) as unknown[])
  .map((r) => RelationSchema.parse(r));

// 外延人物（M5 T4）：stub 档案，仅作关系图节点，不入星图/统计
const externals: External[] = existsSync(join(dataDir, 'externals.yaml'))
  ? (yaml.load(readFileSync(join(dataDir, 'externals.yaml'), 'utf8')) as unknown[] ?? [])
      .map((e) => ExternalSchema.parse(e))
  : [];
const externalById = new Map(externals.map((e) => [e.id, e]));
if (externals.length) console.log(`✓ 外延人物 ${externals.length}`);

for (const r of manualRelations) {
  const fromOk = personById.has(r.from) || externalById.has(r.from);
  const toOk = personById.has(r.to) || externalById.has(r.to);
  if (!fromOk) err(`关系 from=${r.from} 不存在`);
  if (!toOk) err(`关系 to=${r.to} 不存在`);
  if (r.source_id && !sourceById.has(r.source_id)) err(`关系 ${r.from}→${r.to} 引用了不存在的出处 ${r.source_id}`);
  if (r.source_id === undefined) warn(`关系 ${r.from}→${r.to}（${personById.get(r.from)?.name ?? externalById.get(r.from)?.name}→${personById.get(r.to)?.name ?? externalById.get(r.to)?.name}）缺出处`);
}
const nameOf = (id: string) => personById.get(id)?.name ?? externalById.get(id)?.name;

// 同年自动派生：同朝同科年（dynasty+exam_year）的两两连边，derived 标记，与人工边去重
const pairKey = (a: string, b: string, type: string) => [a, b].sort().join('|') + '#' + type;
const existingPairs = new Set(manualRelations.map((r) => pairKey(r.from, r.to, r.type)));
const derivedRelations: Relation[] = [];
const cohorts = new Map<string, Person[]>();
for (const p of persons) {
  const key = `${p.dynasty}|${p.exam_year}`;
  if (!cohorts.has(key)) cohorts.set(key, []);
  cohorts.get(key)!.push(p);
}
for (const [, members] of cohorts) {
  if (members.length < 2) continue;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const k = pairKey(members[i].id, members[j].id, '同年');
      if (existingPairs.has(k)) continue;
      existingPairs.add(k);
      derivedRelations.push({
        from: members[i].id, to: members[j].id, type: '同年',
        note: `${members[i].exam_year} 年同科`,
      });
    }
  }
}
const relations: (Relation & { derived?: boolean })[] = [
  ...manualRelations,
  ...derivedRelations.map((r) => ({ ...r, derived: true as const })),
];
console.log(`✓ 关系 人工 ${manualRelations.length} + 同年派生 ${derivedRelations.length} = ${relations.length}`);

// ---------- 6. 地名坐标回填 ----------
const placenames = readFileSync(join(dataDir, 'geo', 'placenames.csv'), 'utf8')
  .split('\n').slice(1).filter(Boolean)
  .map((l, idx) => {
    const [hist, modern, lat, lng] = l.split(',');
    return { hist: simp(hist.trim()), modern: modern.trim(), lat: Number(lat), lng: Number(lng), idx };
  })
  // 最长优先；同长度时后收录的（更具体的县名）优先于先收录的府名
  .sort((a, b) => b.hist.length - a.hist.length || b.idx - a.idx);

let geoHit = 0;
for (const p of persons) {
  const hay = simp(p.native_hist + '|' + (p.native_modern ?? ''));
  const hit = placenames.find((pl) => p.native_hist && hay.includes(pl.hist));
  if (hit) {
    p.lat = p.lat ?? hit.lat;
    p.lng = p.lng ?? hit.lng;
    p.native_modern = p.native_modern ?? hit.modern;
    geoHit++;
  }
  p.ganzhi = ganzhi(p.exam_year);
}
console.log(`✓ 地名回填 ${geoHit}/${persons.length} (${(geoHit / persons.length * 100).toFixed(1)}%)`);

// ---------- 7. 铁律校验 ----------
for (const p of persons) {
  for (const e of p.events) {
    if (e.source_id && !sourceById.has(e.source_id)) {
      err(`${p.name}(${p.id}) 事件"${e.title}"引用了不存在的出处 ${e.source_id}`);
    }
  }
}
for (const s of sources) {
  if (s.tier === 'A' && !s.title) err(`出处 ${s.id} 为 A 级但缺书名`);
}

// ---------- 8. 丰富度评分（关系数只计人工考据边，同年派生边是计算产物不算史料） ----------
const relCount = new Map<string, number>();
for (const r of manualRelations) {
  relCount.set(r.from, (relCount.get(r.from) ?? 0) + 1);
  relCount.set(r.to, (relCount.get(r.to) ?? 0) + 1);
}
const completeness = (p: Person) => {
  const fields = [p.native_hist, p.birth_year, p.death_year, p.reign, p.bio_short]
    .filter((v) => v !== undefined && v !== '').length;
  const score =
    0.3 * (fields / 5) +
    0.4 * Math.min(p.events.length / 10, 1) +
    0.2 * Math.min((relCount.get(p.id) ?? 0) / 5, 1) +
    0.1 * (p.bio_short ? 1 : 0);
  return Math.round(score * 100) / 100;
};

// ---------- 9. 编译分包 ----------
const index: PersonIndexEntry[] = persons.map((p) => ({
  id: p.id, name: p.name, dynasty: p.dynasty, exam_year: p.exam_year,
  ganzhi: p.ganzhi!, reign: p.reign,
  native_hist: p.native_hist, native_modern: p.native_modern,
  lat: p.lat, lng: p.lng,
  tags: p.tags, completeness: completeness(p), event_count: p.events.length,
  disputed: p.disputed, bio_short: p.bio_short,
  // 繁简归一搜索键：查询词经同一 T2S 表归一后在此匹配
  search_key: simp(`${p.name}${p.reign ?? ''}${p.ganzhi ?? ''}${p.native_hist}${p.native_modern ?? ''}${p.tags.join('')}`).toLowerCase(),
}));
writeFileSync(join(outDir, 'person-index.json'), JSON.stringify(index));

for (const p of persons) {
  const usedSourceIds = new Set(p.events.map((e) => e.source_id).filter(Boolean) as string[]);
  const detail = { ...p, sources: [...usedSourceIds].map((id) => sourceById.get(id)!) };
  writeFileSync(join(outDir, 'person', `${p.id}.json`), JSON.stringify(detail));
}

const geoPoints = persons.filter((p) => p.lat && p.lng)
  .map((p) => ({ id: p.id, name: p.name, dynasty: p.dynasty, exam_year: p.exam_year, lat: p.lat, lng: p.lng }));

// ---------- 9b. 点面归属（射线法，依赖 build-geo-maps 产物） ----------
type Ring = [number, number][];
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeom(lng: number, lat: number, geom: { type: string; coordinates: unknown }): boolean {
  // Polygon 坐标为 Ring[]（外环+孔洞）；MultiPolygon 为 Ring[][]
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []) as Ring[][];
  return polys.some((poly) => {
    if (!pointInRing(lng, lat, poly[0])) return false; // 外环
    for (let k = 1; k < poly.length; k++) if (pointInRing(lng, lat, poly[k])) return false; // 孔洞
    return true;
  });
}

const mapsDir = join(outDir, 'maps');
const dynastyPolys = new Map<string, { name: string; geom: { type: string; coordinates: unknown } }[]>();
if (existsSync(mapsDir)) {
  for (const f of readdirSync(mapsDir).filter((f) => f.endsWith('.json') && f !== 'modern-china.json')) {
    const geo = JSON.parse(readFileSync(join(mapsDir, f), 'utf8'));
    dynastyPolys.set(f.replace('.json', ''), geo.features.map((ft: { properties: { name: string }; geometry: never }) => ({ name: ft.properties.name, geom: ft.geometry })));
  }
}
if (!dynastyPolys.size) warn('未找到 public/data/maps/{dynasty}.json，跳过点面归属（先运行 npm run build:maps）');

let assignedTotal = 0;
const geoPointsV2 = geoPoints.map((p) => {
  const polys = dynastyPolys.get(p.dynasty);
  const hit = polys?.find((pl) => pointInGeom(p.lng!, p.lat!, pl.geom));
  if (hit) assignedTotal++;
  return { ...p, region: hit?.name };
});
console.log(`✓ 点面归属 ${assignedTotal}/${geoPoints.length}`);

// 按朝聚合：regions（政区→人数）、centroids（重心，含该朝总数）、coverage（覆盖率审计）
const regions: Record<string, { name: string; count: number }[]> = {};
const coverage: Record<string, { with_geo: number; assigned: number; total: number }> = {};
for (const d of dynasties) {
  const all = persons.filter((p) => p.dynasty === d.key);
  const pts = geoPointsV2.filter((p) => p.dynasty === d.key);
  const cnt = new Map<string, number>();
  let assigned = 0;
  for (const p of pts) {
    if (p.region) { cnt.set(p.region, (cnt.get(p.region) ?? 0) + 1); assigned++; }
  }
  regions[d.key] = [...cnt.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  coverage[d.key] = { with_geo: pts.length, assigned, total: all.length };
}
for (const d of dynasties) {
  const c = coverage[d.key];
  console.log(`    ${d.name}: 坐标 ${c.with_geo}/${c.total}，入面 ${c.assigned}`);
}

const centroids = dynasties.map((d) => {
  const pts = persons.filter((p) => p.dynasty === d.key && p.lat && p.lng);
  if (!pts.length) return null;
  return {
    dynasty: d.key,
    lat: pts.reduce((s, p) => s + p.lat!, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng!, 0) / pts.length,
    count: pts.length,
    total: coverage[d.key].total,
  };
}).filter(Boolean);
writeFileSync(join(outDir, 'geo.json'), JSON.stringify({ points: geoPointsV2, regions, centroids, coverage }));

// ---------- 9c. edges.json v2（含 Louvain 社区预计算） ----------
// 图算法在构建期运行（graphology 为 devDependency，不进浏览器包）
const { default: Graph } = await import('graphology');
const { default: louvain } = await import('graphology-communities-louvain');

const g = new Graph({ type: 'undirected' });
for (const p of persons) g.addNode(p.id);
const seenEdge = new Set<string>();
for (const r of relations) {
  const k = [r.from, r.to].sort().join('|');
  if (seenEdge.has(k)) continue; // 同对人物多类型边只保留第一条进图（社区发现用）
  seenEdge.add(k);
  if (g.hasNode(r.from) && g.hasNode(r.to)) g.addEdge(r.from, r.to);
}
const partition = louvain(g) as Record<string, number>;
const commGroups = new Map<number, string[]>();
for (const [id, cid] of Object.entries(partition)) {
  if (!commGroups.has(cid)) commGroups.set(cid, []);
  commGroups.get(cid)!.push(id);
}
// 自动命名：看社区内部边的构成——同年边为主叫「某朝某年同科圈」，亲属/师生为主叫「某地某氏圈」
const COMMUNITY_LABEL_OVERRIDE: Record<string, string> = {
  // 成员id逗号串: 覆写名 —— 数据扩充后按需添加
  'z0123,z0133,z0147': '奉天赵氏圈', // 赵蒙/赵峻/赵昌翰，唐奉天县（今陕西乾县）
  'z0222,z0229,z0231': '荆门孙氏圈', // 孙何/孙仅/孙暨，"荆门三凤"+同族孙暨
};
const placeOf = (p: Person): string => {
  const h = p.native_hist ?? '';
  for (const suffix of ['县', '縣', '府', '州', '省']) {
    const m = h.match(new RegExp(`([^府州县省路道縣（(\\s]{2})${suffix}`));
    if (m) return m[1];
  }
  return dynastyByKey.get(p.dynasty)?.name ?? '';
};
const communities: Community[] = [...commGroups.entries()]
  .map(([cid, members]) => {
    const memberSet = new Set(members);
    const innerTypes = relations.filter((r) => memberSet.has(r.from) && memberSet.has(r.to))
      .map((r) => r.type);
    const tongnian = innerTypes.filter((t) => t === '同年').length;
    const sorted = members
      .map((id) => personById.get(id)!)
      .sort((a, b) => (completeness(b) - completeness(a)));
    const rep = sorted[0];
    const dynName = dynastyByKey.get(rep.dynasty)?.name ?? rep.dynasty;
    const auto = tongnian > innerTypes.length / 2
      ? `${dynName}·${rep.exam_year}年同科圈`
      : `${placeOf(rep)}${rep.name[0]}氏圈`;
    const label = COMMUNITY_LABEL_OVERRIDE[members.slice().sort().join(',')] ?? auto;
    return { id: cid, label, members: members.slice().sort(), size: members.length };
  })
  .filter((c) => c.size >= 3)
  .sort((a, b) => b.size - a.size);

const edgesFile: EdgesFile = {
  edges: relations.map((r) => ({
    ...r,
    from_name: nameOf(r.from),
    to_name: nameOf(r.to),
  })),
  communities,
  types: [...RELATION_TYPES],
  externals: externals.map((e) => ({
    id: e.id, name: e.name, birth_year: e.birth_year, death_year: e.death_year,
    index_year: e.index_year, note: e.note, kind: 'external' as const,
  })),
};
writeFileSync(join(outDir, 'edges.json'), JSON.stringify(edgesFile));
// 外延人物独立索引（不进主 person-index，避免稀释搜索）
if (externals.length) {
  writeFileSync(join(outDir, 'externals-index.json'), JSON.stringify(externals.map((e) => ({
    id: e.id, name: e.name, birth_year: e.birth_year, death_year: e.death_year,
    index_year: e.index_year, note: e.note, cbdb_id: e.cbdb_id,
  }))));
}
console.log(`✓ 社区发现：${commGroups.size} 个社区，标注 ${communities.length} 个（≥3 人）`);

// ---------- 9d. career.json（仕途桑基聚合） ----------
// 三列：夺魁第一站(first_category，缺记入「未详」) → 中期流向(mid_category，缺省时直通终点) → 仕途终点(final_category)
type SankeyLink = { source: string; target: string; value: number };
const sankeyPersons = persons.filter((p) => p.career?.final_category);
const linkCount = new Map<string, number>();
const bump = (a: string, b: string) => linkCount.set(a + '→' + b, (linkCount.get(a + '→' + b) ?? 0) + 1);
const colNode = (col: '首' | '中' | '终', cat: string) => `${col}·${cat}`;
const usedNodes = new Set<string>();
for (const p of sankeyPersons) {
  const c = p.career!;
  const first = c.first_category ? colNode('首', c.first_category) : '首·未详';
  const fin = colNode('终', c.final_category!);
  usedNodes.add(first); usedNodes.add(fin);
  if (c.mid_category) {
    const mid = colNode('中', c.mid_category);
    usedNodes.add(mid);
    bump(first, mid); bump(mid, fin);
  } else {
    bump(first, fin);
  }
}
const sankeyLinks: SankeyLink[] = [...linkCount.entries()].map(([k, v]) => {
  const [source, target] = k.split('→');
  return { source, target, value: v };
});
const sankeyNodes = [...usedNodes].map((name) => ({ name }));
writeFileSync(join(outDir, 'career.json'), JSON.stringify({
  nodes: sankeyNodes,
  links: sankeyLinks,
  n: sankeyPersons.length,
  total: persons.length,
  stage_categories: CAREER_STAGE_CATEGORIES,
  final_categories: CAREER_FINAL_CATEGORIES,
}));
console.log(`✓ 仕途桑基：${sankeyPersons.length} 人入样，${sankeyLinks.length} 条流量`);

// ---------- 10. 统计预计算 ----------
const byDynasty = Object.fromEntries(dynasties.map((d) => [d.key, 0]));
for (const p of persons) byDynasty[p.dynasty]++;
const surnames = new Map<string, number>();
for (const p of persons) {
  const s = p.name[0];
  surnames.set(s, (surnames.get(s) ?? 0) + 1);
}
const topSurnames = [...surnames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
const ages = persons.filter((p) => p.birth_year && p.exam_year)
  .map((p) => ({ name: p.name, dynasty: p.dynasty, age: p.exam_year - p.birth_year! }))
  .filter((a) => a.age > 8 && a.age < 90)
  .sort((a, b) => a.age - b.age);
// 年龄分布直方图（5 岁桶）与分朝平均年龄——支撑问答页「最年轻/年龄变化」图表
const AGE_BUCKET = 5;
const ageHistMap = new Map<number, number>();
for (const a of ages) {
  const b = Math.floor(a.age / AGE_BUCKET) * AGE_BUCKET;
  ageHistMap.set(b, (ageHistMap.get(b) ?? 0) + 1);
}
const ageHistogram = [...ageHistMap.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([bucket, count]) => ({ bucket, label: `${bucket}–${bucket + AGE_BUCKET - 1} 岁`, count }));
const avgAgeByDynasty = dynasties.map((d) => {
  const arr = ages.filter((a) => a.dynasty === d.key);
  return {
    dynasty: d.key,
    n: arr.length,
    avg_age: arr.length ? Math.round(arr.reduce((s, a) => s + a.age, 0) / arr.length * 10) / 10 : null,
  };
});
// 史料丰富度分布（0–1 十等分）——「史中无痕」诚实直方图
const compBuckets = Array.from({ length: 10 }, (_, i) => ({ bucket: i / 10, label: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`, count: 0 }));
for (const p of persons) {
  compBuckets[Math.min(Math.floor(completeness(p) * 10), 9)].count++;
}
const stats = {
  total: persons.length,
  by_dynasty: byDynasty,
  top_surnames: topSurnames,
  youngest: ages.slice(0, 10),
  oldest: ages.slice(-5).reverse(),
  avg_age: Math.round(ages.reduce((s, a) => s + a.age, 0) / ages.length * 10) / 10,
  sanyuan: persons.filter((p) => p.tags.includes('三元及第')).map((p) => ({ id: p.id, name: p.name, dynasty: p.dynasty, exam_year: p.exam_year })),
  geo_coverage: geoHit / persons.length,
  age_histogram: { buckets: ageHistogram, n: ages.length },
  avg_age_by_dynasty: avgAgeByDynasty,
  completeness_histogram: compBuckets,
};
writeFileSync(join(outDir, 'stats.json'), JSON.stringify(stats));
writeFileSync(join(outDir, 'dynasties.json'), JSON.stringify(dynasties));

console.log(`\n分包完成：index=${index.length}, geo=${geoPoints.length}点, edges=${relations.length}, stats ok`);
console.log(`状元姓氏榜首：${topSurnames.slice(0, 3).map(([s, n]) => `${s}(${n})`).join(' ')}`);
console.log(`已知夺魁年龄：平均 ${stats.avg_age} 岁，最年轻 ${ages[0]?.name} ${ages[0]?.age} 岁`);
if (errors) { console.error(`\n构建失败：${errors} 个错误`); process.exit(1); }
console.log('\n✓ build-data 完成');
