// UX3：三视图共用的匹配。用真实 person-index，不写死结果人数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(readFileSync(join(root, 'public/data/person-index.json'), 'utf8'));

function simp(s, table) {
  return [...s].map((c) => table[c] ?? c).join('');
}
function normalize(s, table) {
  return simp(s, table).toLowerCase().replace(/\s+/g, '');
}
function match(entry, dynasties, query, table) {
  if (dynasties.length && !dynasties.includes(entry.dynasty)) return false;
  const q = normalize(query, table);
  if (!q) return true;
  const hay = entry.search_key ?? normalize(
    `${entry.name}${entry.native_hist}${entry.native_modern ?? ''}${entry.tags.join('')}`, table,
  );
  return hay.includes(q);
}

const table = JSON.parse(readFileSync(join(root, 'data/t2s.json'), 'utf8'));
const ids = (rows) => rows.map((p) => p.id).sort();

test('费宏与費宏命中同一人，标签可检索', () => {
  const simplified = index.filter((p) => match(p, [], '费宏', table));
  const traditional = index.filter((p) => match(p, [], '費宏', table));
  assert.deepEqual(ids(simplified), ids(traditional));
  assert.ok(simplified.some((p) => p.id === 'z0489'));
  const tagged = index.filter((p) => p.tags.length);
  assert.ok(tagged.length > 0);
  const sample = tagged[0];
  assert.ok(index.filter((p) => match(p, [], sample.tags[0], table)).some((p) => p.id === sample.id));
});

test('朝代加关键词只留该朝，建议可把非首项当作选中项', () => {
  const all = index.filter((p) => match(p, [], '王', table));
  const ming = index.filter((p) => match(p, ['ming'], '王', table));
  assert.ok(all.length > ming.length);
  assert.ok(ming.every((p) => p.dynasty === 'ming'));
  const ranked = [...ming].sort((a, b) => {
    const score = (p) => {
      const name = normalize(p.name, table);
      return name.startsWith('王') ? 0 : name.includes('王') ? 1 : 2;
    };
    return score(a) - score(b) || b.completeness - a.completeness;
  }).slice(0, 8);
  assert.ok(ranked.length >= 2);
  const selected = ranked.length - 1;
  assert.notEqual(ranked[selected].id, ranked[0].id);
  assert.equal(index.length, 656);
});
