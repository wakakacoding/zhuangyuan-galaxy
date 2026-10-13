// 未命中地名报告：找出有籍贯记录但地名表未覆盖的状元，按籍贯频次排序
// 用法：tsx scripts/report-unmatched.ts
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { PersonSchema } from '../src/lib/schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');

// 繁简归一表：单一真源 data/t2s.json（与 build-data.ts / 前端 normalize.ts 共享）
const T2S: Record<string, string> = JSON.parse(readFileSync(join(dataDir, 't2s.json'), 'utf8'));
const simp = (s: string) => [...s].map((c) => T2S[c] ?? c).join('');

// 载入人物（骨架 + 深度档案合并，与 build-data 同逻辑）
const tsv = readFileSync(join(dataDir, 'seed', 'roster.tsv'), 'utf8');
const persons = tsv.split('\n').slice(1).filter(Boolean).map((line) => {
  const [id, name, dynasty, exam_year, reign, birth, death, native_hist, tags] = line.split('\t');
  return PersonSchema.parse({
    id, name, dynasty, exam_year: Number(exam_year),
    reign: reign || undefined,
    birth_year: birth ? Number(birth) : undefined,
    death_year: death ? Number(death) : undefined,
    native_hist: native_hist || '',
    tags: tags ? tags.split(/[;,，；]/) : [], events: [],
  });
});
const byId = new Map(persons.map((p) => [p.id, p]));
for (const f of readdirSync(join(dataDir, 'persons')).filter((f) => f.endsWith('.yaml'))) {
  const profile = PersonSchema.parse(yaml.load(readFileSync(join(dataDir, 'persons', f), 'utf8')));
  const base = byId.get(profile.id);
  if (base) Object.assign(base, profile);
}

const placenames = readFileSync(join(dataDir, 'geo', 'placenames.csv'), 'utf8')
  .split('\n').slice(1).filter(Boolean)
  .map((l, idx) => {
    const [hist] = l.split(',');
    return { hist: simp(hist.trim()), idx };
  })
  .sort((a, b) => b.hist.length - a.hist.length || b.idx - a.idx);

const withNative = persons.filter((p) => p.native_hist);
const unmatched = withNative.filter(
  (p) => !placenames.find((pl) => simp(p.native_hist + '|' + (p.native_modern ?? '')).includes(pl.hist)),
);

console.log(`有籍贯记录 ${withNative.length} 人，未命中 ${unmatched.length} 人，当前命中率 ${((withNative.length - unmatched.length) / withNative.length * 100).toFixed(1)}%\n`);

// 按籍贯字符串聚合频次
const freq = new Map<string, { count: number; dynasties: Set<string>; names: string[] }>();
for (const p of unmatched) {
  const key = p.native_hist;
  const cur = freq.get(key) ?? { count: 0, dynasties: new Set(), names: [] };
  cur.count++;
  cur.dynasties.add(p.dynasty);
  if (cur.names.length < 3) cur.names.push(p.name);
  freq.set(key, cur);
}
const sorted = [...freq.entries()].sort((a, b) => b[1].count - a[1].count);
console.log('未命中籍贯频次榜（补齐头部可最快提升命中率）：\n');
for (const [hist, info] of sorted) {
  console.log(`${String(info.count).padStart(2)}  ${hist}  [${[...info.dynasties].join('/')}]  如:${info.names.join('、')}`);
}
console.log(`\n唯一地名数：${sorted.length}`);
