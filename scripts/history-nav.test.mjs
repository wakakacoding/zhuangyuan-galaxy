// UX5：人物与地区的历史动作。用最小 history 替身，不打开浏览器。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function installHistory() {
  const entries = [{ path: '/', search: '', state: null }];
  let index = 0;
  globalThis.window = {
    location: {
      pathname: '/', search: '', hash: '',
    },
    history: {
      get state() { return entries[index].state; },
      pushState(state, _title, url) {
        const parsed = new URL(url, 'http://local');
        entries.splice(index + 1);
        entries.push({ path: parsed.pathname, search: parsed.search, state });
        index += 1;
        window.location.pathname = parsed.pathname;
        window.location.search = parsed.search;
      },
      replaceState(state, _title, url) {
        const parsed = new URL(url, 'http://local');
        entries[index] = { path: parsed.pathname, search: parsed.search, state };
        window.location.pathname = parsed.pathname;
        window.location.search = parsed.search;
      },
    },
  };
  return {
    back() { index = Math.max(0, index - 1); sync(); },
    forward() { index = Math.min(entries.length - 1, index + 1); sync(); },
    search: () => window.location.search,
    length: () => entries.length,
  };
  function sync() {
    window.location.pathname = entries[index].path;
    window.location.search = entries[index].search;
  }
}

test('A→B→C 后退再前进，关闭直接深链不新增离开本站的历史', async () => {
  const nav = installHistory();
  const { historyMode } = await import('../src/store/history.ts');
  assert.equal(historyMode('person-open'), 'push');
  assert.equal(historyMode('person-drill'), 'push');
  assert.equal(historyMode('region-open'), 'push');
  assert.equal(historyMode('person-close'), 'replace');
  assert.equal(historyMode('replace'), 'replace');

  const { writeHistory } = await import('../src/store/history.ts');
  writeHistory((p) => p.set('p', 'zA'), 'person-open', { personStack: ['zA'] });
  writeHistory((p) => p.set('p', 'zB'), 'person-drill', { personStack: ['zA', 'zB'] });
  writeHistory((p) => p.set('p', 'zC'), 'person-drill', { personStack: ['zA', 'zB', 'zC'] });
  assert.equal(nav.length(), 4);
  nav.back();
  assert.equal(nav.search(), '?p=zB');
  nav.back();
  assert.equal(nav.search(), '?p=zA');
  nav.forward();
  assert.equal(nav.search(), '?p=zB');

  const before = nav.length();
  writeHistory((p) => p.delete('p'), 'person-close', { personStack: [] });
  assert.equal(nav.search(), '');
  assert.equal(nav.length(), before);
});
