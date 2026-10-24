// UX3：三视图共用的匹配。直接调用生产函数 src/store/filters.ts 的 matchEntry，
// 不复制一份匹配逻辑自测（旧版在这里重写了 simp/normalize/match，测的是副本而非线上行为）。
// 用真实 person-index.json，不写死结果人数以外的期望。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(readFileSync(join(root, 'public/data/person-index.json'), 'utf8'));

// 生产匹配函数与查询归一（filters.ts → lib/normalize.ts → data/t2s.json 单一真源）
const { matchEntry, readFilters, writeFilters } = await import('../src/store/filters.ts');
const { normalizeQuery } = await import('../src/lib/normalize.ts');

const ids = (rows) => rows.map((p) => p.id).sort();
const hit = (q, dyn = []) => index.filter((p) => matchEntry(p, dyn, q));

test('费宏与費宏命中同一人，标签可检索', () => {
  const simplified = hit('费宏');
  const traditional = hit('費宏');
  assert.deepEqual(ids(simplified), ids(traditional));
  assert.ok(simplified.some((p) => p.id === 'z0489'));
  const tagged = index.filter((p) => p.tags.length);
  assert.ok(tagged.length > 0);
  const sample = tagged[0];
  assert.ok(hit(sample.tags[0]).some((p) => p.id === sample.id));
});

test('朝代加关键词只留该朝', () => {
  const all = hit('王');
  const ming = hit('王', ['ming']);
  assert.ok(all.length > ming.length);
  assert.ok(ming.every((p) => p.dynasty === 'ming'));
  assert.equal(index.length, 656);
});

test('字可检索：贺知章以字「季真」命中', () => {
  const rows = hit('季真');
  assert.ok(rows.some((p) => p.id === 'z0014'), '季真应命中贺知章');
  // 该字不出现在姓名/籍贯/标签里，命中只可能来自 zi 入索引
  const e = index.find((p) => p.id === 'z0014');
  assert.ok(!`${e.name}${e.native_hist}${e.native_modern ?? ''}${e.tags.join('')}`.includes('季真'));
});

test('号可检索：文天祥以号「文山」命中，且不误伤同字他人', () => {
  const rows = hit('文山');
  assert.ok(rows.some((p) => p.id === 'z0416'), '文山应命中文天祥');
  const e = index.find((p) => p.id === 'z0416');
  assert.ok(!`${e.name}${e.native_hist}${e.native_modern ?? ''}${e.tags.join('')}`.includes('文山'));
});

test('字/号同样走繁简归一：繁体「子壽」命中張九齡', () => {
  const trad = hit('子壽');
  const simp = hit('子寿');
  assert.ok(trad.some((p) => p.id === 'z0015'), '子壽应命中張九齡');
  assert.deepEqual(ids(trad), ids(simp));
});

test('字/号命中受朝代筛选约束', () => {
  const rows = hit('季真', ['song']);
  assert.equal(rows.some((p) => p.id === 'z0014'), false);
  assert.ok(hit('季真', ['tang']).some((p) => p.id === 'z0014'));
});

test('查询归一与生产函数一致：空白与大小写不影响命中', () => {
  assert.equal(normalizeQuery(' 季 真 '), '季真');
  assert.deepEqual(ids(hit(' 季 真 ')), ids(hit('季真')));
});

test('年份范围只留区间内的人，单侧开放也成立', () => {
  const ranged = index.filter((p) => matchEntry(p, { yearFrom: 1900, yearTo: 1904 }));
  assert.ok(ranged.length > 0);
  assert.ok(ranged.every((p) => p.exam_year >= 1900 && p.exam_year <= 1904));
  const open = index.filter((p) => matchEntry(p, { yearFrom: 1900 }));
  assert.ok(open.length >= ranged.length);
  assert.ok(open.every((p) => p.exam_year >= 1900));
});

test('标签是交集：同时要求两个标签时两边都得有', () => {
  const both = index.filter((p) => matchEntry(p, { tags: ['三元及第', '早逝'] }));
  assert.ok(both.every((p) => p.tags.includes('三元及第') && p.tags.includes('早逝')));
  const one = index.filter((p) => matchEntry(p, { tags: ['三元及第'] }));
  assert.ok(one.length > both.length);
});

test('地区只匹配籍贯，整理程度按事件数分档', () => {
  const suzhou = index.filter((p) => matchEntry(p, { area: '苏州' }));
  assert.ok(suzhou.length > 0);
  assert.ok(suzhou.every((p) => normalizeQuery(`${p.native_hist}${p.native_modern ?? ''}`).includes(normalizeQuery('苏州'))));
  assert.equal(suzhou.some((p) => p.name.includes('苏州')), false);
  const deep = index.filter((p) => matchEntry(p, { depth: 'deep' }));
  assert.ok(deep.every((p) => p.event_count >= 3));
  const roster = index.filter((p) => matchEntry(p, { depth: 'roster' }));
  assert.ok(roster.every((p) => p.event_count === 0));
  assert.equal(deep.length + roster.length + index.filter((p) => p.event_count > 0 && p.event_count < 3).length, index.length);
});

test('四维可以同时生效，空结果是合法结果', () => {
  const rows = index.filter((p) => matchEntry(p, { dynasties: ['qing'], yearFrom: 1800, tags: ['三元及第'], depth: 'deep' }));
  assert.ok(rows.every((p) => p.dynasty === 'qing' && p.exam_year >= 1800 && p.tags.includes('三元及第') && p.event_count >= 3));
  const none = index.filter((p) => matchEntry(p, { dynasties: ['tang'], yearFrom: 1900 }));
  assert.equal(none.length, 0);
});

test('URL 契约往返：非法年份和整理程度被丢弃，合法参数原样回来', () => {
  const back = readFilters(new URLSearchParams('dyn=tang,ming&q=王&y=1400-1600&tag=早逝,三元及第&area=苏州&depth=deep'));
  assert.deepEqual(back, {
    dynasties: ['tang', 'ming'], query: '王', yearFrom: 1400, yearTo: 1600,
    tags: ['早逝', '三元及第'], area: '苏州', depth: 'deep',
  });
  const params = new URLSearchParams('slice=ming&p=z0001');
  writeFilters(params, back);
  assert.equal(params.get('slice'), 'ming');
  assert.equal(params.get('p'), 'z0001');
  assert.deepEqual(readFilters(params), back);
  const bad = readFilters(new URLSearchParams('y=12-99999&depth=full'));
  assert.equal(bad.yearFrom, null);
  assert.equal(bad.yearTo, null);
  assert.equal(bad.depth, '');
});
