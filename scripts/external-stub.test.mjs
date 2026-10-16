// UX2：外延简档可读、引用可解析，且不进入状元名录。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

test('38 份外延简档可读取，引用都落在名录或外延中，名录仍为 656', () => {
  const index = read('public/data/person-index.json');
  const stats = read('public/data/stats.json');
  const known = new Set(index.map((p) => p.id));
  const files = readdirSync(join(root, 'public/data/person')).filter((f) => f.startsWith('w'));
  assert.equal(files.length, 38);
  assert.equal(index.length, 656);
  assert.equal(stats.total, 656);
  assert.equal(index.some((p) => p.id.startsWith('w')), false);
  for (const file of files) {
    const stub = read('public/data/person/' + file);
    assert.equal(stub.kind, 'external');
    assert.equal(stub.id, file.replace('.json', ''));
    assert.ok(stub.name);
    known.add(stub.id);
    for (const rel of stub.related) {
      assert.ok(rel.id && rel.name && rel.type, stub.id + ' 有空引用');
    }
  }
  for (const file of files) {
    const stub = read('public/data/person/' + file);
    for (const rel of stub.related) assert.ok(known.has(rel.id), stub.id + ' → ' + rel.id);
  }
  const gui = read('public/data/person/w0001.json');
  assert.equal(gui.name, '歸融');
  assert.equal(gui.birth_year, undefined);
  assert.ok(gui.related.some((r) => r.id === 'z0134' && r.name === '归仁绍'));
});
