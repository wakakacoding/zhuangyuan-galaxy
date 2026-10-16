// M5-d D1 单测：生卒解析 + 名录业务铁律（node:test，零新依赖）
// 运行：npm run test:data
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseLifespan } from './lib/lifespan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 生年阙如：绝不可把卒年当生年（本轮事故根因） ----------
const BIRTH_UNKNOWN = [
  ['？－658年', 658],   // ← D1 验收指定用例
  ['？—798年', 798],
  ['？-836年', 836],
  ['?－895年', 895],
  ['?-1016年', 1016],
  ['─1384年', 1384],
  ['－1689年', 1689],
  ['？~1030年', 1030],
  ['？－1142年', 1142],
];

for (const [cell, death] of BIRTH_UNKNOWN) {
  test(`生年阙如：${cell}`, () => {
    const r = parseLifespan(cell);
    assert.equal(r.birth, '', `「${cell}」不应解析出出生年`);
    assert.equal(r.death, death);
    assert.equal(r.birth_circa, false);
  });
}

// ---------- 卒年阙如 ----------
const DEATH_UNKNOWN = [
  ['818年－？', 818],
  ['958年~？', 958],
  ['1629年－', 1629],
  ['1088-?', 1088],   // 旧实现在此完全漏收（要求「年」字）
];

for (const [cell, birth] of DEATH_UNKNOWN) {
  test(`卒年阙如：${cell}`, () => {
    const r = parseLifespan(cell);
    assert.equal(r.birth, birth);
    assert.equal(r.death, '');
  });
}

// ---------- 生卒俱全：各种连接号写法 ----------
const BOTH = [
  ['658年－699年', 658, 699],
  ['621年～714年', 621, 714],
  ['646年--726年', 646, 726],
  ['1363年─1402年', 1363, 1402],
  ['1402－1449年', 1402, 1449],
  ['977年一1038年', 977, 1038], // 汉字「一」误作连接号
];

for (const [cell, birth, death] of BOTH) {
  test(`生卒俱全：${cell}`, () => {
    const r = parseLifespan(cell);
    assert.equal(r.birth, birth);
    assert.equal(r.death, death);
    assert.equal(r.birth_circa, false);
  });
}

// ---------- 约年 ----------
test('约年：约675年~714年', () => {
  const r = parseLifespan('约675年~714年');
  assert.deepEqual([r.birth, r.death, r.birth_circa, r.death_circa], [675, 714, true, false]);
});

test('约年：728年？－772年（年份后置问号）', () => {
  const r = parseLifespan('728年？－772年');
  assert.deepEqual([r.birth, r.death, r.birth_circa, r.death_circa], [728, 772, true, false]);
});

test('约年：？845年－？', () => {
  const r = parseLifespan('？845年－？');
  assert.deepEqual([r.birth, r.death, r.birth_circa, r.death_circa], [845, '', true, false]);
});

test('约年：约933年~？', () => {
  const r = parseLifespan('约933年~？');
  assert.deepEqual([r.birth, r.death, r.birth_circa, r.death_circa], [933, '', true, false]);
});

// ---------- 全阙 ----------
for (const cell of ['', '─', '—', '不详', '無考']) {
  test(`生卒皆阙：${JSON.stringify(cell)}`, () => {
    const r = parseLifespan(cell);
    assert.deepEqual([r.birth, r.death], ['', '']);
  });
}

// ---------- 名录业务铁律（构建产物的上源） ----------
test('roster.tsv：无名录行出生晚于登科 / 生年晚于卒年', () => {
  const rows = readFileSync(join(root, 'data', 'seed', 'roster.tsv'), 'utf8')
    .split('\n').slice(1).filter(Boolean).map((l) => l.split('\t'));
  const offenders = [];
  for (const c of rows) {
    const [id, name, , exam, , birth, death] = c;
    if (birth && Number(birth) > Number(exam)) offenders.push(`${id} ${name} 生${birth} > 科${exam}`);
    if (birth && death && Number(birth) > Number(death)) offenders.push(`${id} ${name} 生${birth} > 卒${death}`);
  }
  assert.deepEqual(offenders, []);
});
