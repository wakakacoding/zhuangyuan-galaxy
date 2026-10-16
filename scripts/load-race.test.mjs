// UX1：失败缓存、重试、过期人物响应。不渲染页面，不碰真实数据。
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { loadPerson, invalidateLoad, setLoadFetch } = await import('../src/lib/data.ts');
const { settlePersonLoad } = await import('../src/lib/personLoad.ts');

const person = (id, name) => ({ id, name });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('失败结果不缓存，恢复后重试成功', async () => {
  let down = true;
  setLoadFetch(async (url) => {
    if (down) throw new Error('down ' + url);
    return person('z0001', '孙伏伽');
  });
  await assert.rejects(() => loadPerson('z0001'), /down/);
  down = false;
  assert.equal((await loadPerson('z0001')).name, '孙伏伽');
  setLoadFetch(null);
});

test('成功缓存不会被一次较新的失败清掉', async () => {
  setLoadFetch(async () => person('z0002', '娄师德'));
  assert.equal((await loadPerson('z0002')).name, '娄师德');
  setLoadFetch(async () => { throw new Error('newer failure'); });
  assert.equal((await loadPerson('z0002')).name, '娄师德');
  invalidateLoad('/data/person/z0002.json');
  assert.equal((await loadPerson('z0002')).name, '娄师德');
  setLoadFetch(null);
});

test('进行中的失败不会被旧的 invalidate 误删', async () => {
  const first = deferred();
  const second = deferred();
  let n = 0;
  setLoadFetch(() => (n++ === 0 ? first.promise : second.promise));
  const a = loadPerson('z0003');
  invalidateLoad('/data/person/z0003.json');
  first.reject(new Error('old'));
  await assert.rejects(() => a, /old/);
  const b = loadPerson('z0003');
  second.resolve(person('z0003', '第三次成功'));
  assert.equal((await b).name, '第三次成功');
  setLoadFetch(null);
});

test('A 的迟到响应在当前已是 B 或已关闭时不接受', () => {
  const lateA = settlePersonLoad('zA', 'zB', { ok: true, person: person('zA', '甲') });
  assert.equal(lateA.accept, false);
  const currentB = settlePersonLoad('zB', 'zB', { ok: true, person: person('zB', '乙') });
  assert.equal(currentB.person.name, '乙');
  const closed = settlePersonLoad('zA', null, { ok: true, person: person('zA', '甲') });
  assert.equal(closed.accept, false);
  const wrongBody = settlePersonLoad('zB', 'zB', { ok: true, person: person('zA', '甲') });
  assert.equal(wrongBody.failedId, 'zB');
  assert.equal(wrongBody.person, null);
});

test('外延人物失败保留目标 id，供失败态重试', () => {
  const failed = settlePersonLoad('w0001', 'w0001', { ok: false });
  assert.equal(failed.accept, true);
  assert.equal(failed.failedId, 'w0001');
  assert.equal(failed.person, null);
});
