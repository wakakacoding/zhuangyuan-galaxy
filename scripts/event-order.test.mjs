// LIFE-02：范围日期不按 0 年排到确切年份之前；曲线只收同时有年份与品级的事件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventYearText, hasExactYear, isExactYear, orderEvents, plottableEvents } from '../src/lib/eventOrder.ts';

test('杨慎：嘉靖年间的范围记事不排到 1511 年之前', () => {
  const events = [
    { title: '正德六年辛未科状元', year: 1511, precision: 'exact' },
    { title: '大礼议伏阙哭谏', year: 1524, precision: 'exact' },
    { title: '戍中著述等身', precision: 'range', year_label: '嘉靖年间' },
    { title: '卒于永昌戍所', year: 1559, precision: 'exact' },
  ];
  assert.deepEqual(orderEvents(events).map((e) => e.title), [
    '正德六年辛未科状元',
    '大礼议伏阙哭谏',
    '卒于永昌戍所',
    '戍中著述等身',
  ]);
});

test('带起始年的范围日期也不抢在确切年份前', () => {
  const events = [
    { title: '范围', year: 1500, precision: 'range', year_label: '1498–1510' },
    { title: '确切', year: 1511, precision: 'exact' },
  ];
  assert.equal(hasExactYear(events[0]), false);
  assert.deepEqual(orderEvents(events).map((e) => e.title), ['确切', '范围']);
});

test('没有年份的事件保持原序，并放在确切年份之后', () => {
  const events = [
    { title: '未详乙' },
    { title: '确切', year: 1600, precision: 'exact' },
    { title: '未详甲', year_label: '晚年' },
  ];
  assert.deepEqual(orderEvents(events).map((e) => e.title), ['确切', '未详乙', '未详甲']);
  assert.equal(eventYearText(events[0]), '时间未详');
  assert.equal(eventYearText(events[2]), '晚年');
});

test('约年按估计年排序，显示必须带「约」，且不进官品曲线', () => {
  const events = [
    { title: '约年', year: 1500, precision: 'circa', year_label: '约 1500', rank_grade: 5 },
    { title: '确切', year: 1511, precision: 'exact' },
    { title: '范围', year: 1490, precision: 'range', year_label: '1490–1510' },
  ];
  assert.equal(hasExactYear(events[0]), true);
  assert.equal(isExactYear(events[0]), false);
  assert.deepEqual(orderEvents(events).map((e) => e.title), ['约年', '确切', '范围']);
  assert.equal(eventYearText(events[0]), '约 1500');
  assert.equal(eventYearText({ year: 1488, precision: 'circa' }), '约 1488 年');
  assert.equal(eventYearText(events[1]), '1511 年');
  assert.equal(eventYearText(events[2]), '1490–1510');
  assert.deepEqual(plottableEvents(events).map((e) => e.title), []);
});

test('曲线不收缺年份、缺品级和范围日期；单点仍可绘', () => {
  const events = [
    { title: '有品级', year: 1511, precision: 'exact', rank_grade: 6 },
    { title: '无品级', year: 1524, precision: 'exact' },
    { title: '范围有品级', precision: 'range', year_label: '嘉靖年间', rank_grade: 9 },
    { title: '无年', rank_grade: 3 },
  ];
  assert.deepEqual(plottableEvents(events).map((e) => e.title), ['有品级']);
  assert.equal(plottableEvents([]).length, 0);
});
