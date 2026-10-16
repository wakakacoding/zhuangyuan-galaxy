// UX8：分享取消、复制失败和可恢复状态。不调用真实系统分享。
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('取消不复制，失败不报成功，稳定状态被保留', async () => {
  const { shareUrl, copyText } = await import('../src/components/shell/ShareButton.tsx');
  assert.equal(await copyText('x', async () => { throw new Error('denied'); }), false);
  assert.equal(await copyText('x', async () => {}), true);
  const current = new URL('http://local/insights?dyn=ming&q=%E8%B4%B9%E5%AE%8F&p=z0489&slice=song&hover=1&nx=1#q1');
  const url = shareUrl(current);
  assert.match(url, /dyn=ming/);
  assert.match(url, /q=/);
  assert.match(url, /p=z0489/);
  assert.match(url, /slice=song/);
  assert.match(url, /nx=1/);
  assert.match(url, /#q1$/);
  assert.doesNotMatch(url, /hover/);
});
