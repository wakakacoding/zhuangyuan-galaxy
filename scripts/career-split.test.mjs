// LIFE-09：旧终点拆成三组。早逝不自动变成官职，归隐不解释成幸福。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitCareer } from '../src/lib/careerSplit.ts';

test('宰辅、归隐、殉国分别进入三个维度', () => {
  assert.equal(splitCareer({ final_category: '宰辅' }).office, '宰辅与执政');
  assert.equal(splitCareer({ final_category: '归隐' }).path, '归隐或讲学');
  assert.equal(splitCareer({ final_category: '殉国' }).death, '殉职或死事');
  assert.deepEqual(splitCareer({ final_category: '归隐' }).pending, []);
});

test('早逝只记死亡；旁边的官职不自动计入官职维度', () => {
  const split = splitCareer({ final_category: '早逝', final_office: '翰林院修撰' });
  assert.equal(split.death, '早逝');
  assert.equal(split.office, null);
  assert.equal(split.pending.length, 1);
});

test('其他不能可靠判断时保持待核', () => {
  const unknown = splitCareer({ final_category: '其他', final_office: '武英殿大学士，后贬终官检讨' });
  assert.equal(unknown.office, null);
  assert.equal(unknown.path, null);
  assert.equal(unknown.death, null);
  assert.equal(unknown.pending.length, 1);

  const trade = splitCareer({ final_category: '其他', final_office: '弃官实业救国（大生纱厂、民国农商总长）' });
  assert.equal(trade.path, '实业');
  assert.equal(trade.pending.length, 0);
});
