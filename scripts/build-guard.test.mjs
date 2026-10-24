// M5-d D5：校验失败不得改写任何产物。夹具在临时目录，不碰仓库 data/ 与 public/data。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsx = join(root, 'node_modules', '.bin', 'tsx');

function snapshot(dir) {
  const out = new Map();
  const walk = (cur) => {
    for (const name of readdirSync(cur, { withFileTypes: true })) {
      const fp = join(cur, name.name);
      if (name.isDirectory()) walk(fp);
      else if (name.isFile()) {
        out.set(fp.slice(dir.length + 1), createHash('sha256').update(readFileSync(fp)).digest('hex'));
      }
    }
  };
  walk(dir);
  return out;
}

function same(before, after) {
  assert.equal(after.size, before.size, '产物文件数变了');
  for (const [rel, hash] of before) {
    assert.equal(after.get(rel), hash, rel + ' 内容变了');
  }
}

function run(dataDir, outDir, docsDir) {
  return spawnSync(tsx, ['scripts/build-data.ts'], {
    cwd: root,
    env: {
      ...process.env,
      BUILD_DATA_DIR: dataDir,
      BUILD_OUT_DIR: outDir,
      BUILD_DOCS_DIR: docsDir,
      SOURCE_DATE_EPOCH: '1792108800', // 2026-10-16T00:00:00Z，固定构建日期
    },
    encoding: 'utf8',
    timeout: 120000,
  });
}

// 夹具：整份 data/ 与 public/data/ 复制到临时目录，产物目录已存在（用于比对「失败不改写」）
function prepare(tag) {
  const base = join(tmpdir(), `zy-${tag}-` + process.pid);
  rmSync(base, { recursive: true, force: true });
  const dataDir = join(base, 'data');
  const outDir = join(base, 'out');
  const docsDir = join(base, 'docs');
  cpSync(join(root, 'data'), dataDir, { recursive: true });
  cpSync(join(root, 'public', 'data'), outDir, { recursive: true });
  mkdirSync(docsDir);
  for (const name of ['career-冲突裁定表.md', '争议身份一览.md']) {
    cpSync(join(root, 'docs', name), join(docsDir, name));
  }
  return { base, dataDir, outDir, docsDir };
}

test('校验失败（生年晚于登科 + 关系指向不存在的人）不改任何产物', () => {
  const { base, dataDir, outDir, docsDir } = prepare('d5');

  const rosterPath = join(dataDir, 'seed', 'roster.tsv');
  const lines = readFileSync(rosterPath, 'utf8').split('\n');
  const i = lines.findIndex((l) => l.startsWith('z0001\t'));
  assert.ok(i > 0, '夹具里应有孙伏伽');
  const cols = lines[i].split('\t');
  cols[5] = '700'; // birth 700 > exam 622
  lines[i] = cols.join('\t');
  writeFileSync(rosterPath, lines.join('\n'));
  writeFileSync(
    join(dataDir, 'relations.yaml'),
    readFileSync(join(dataDir, 'relations.yaml'), 'utf8') +
      '\n- from: z0001\n  to: z9999\n  type: 亲属\n  note: D5 夹具：指向不存在的人\n',
  );

  const before = snapshot(outDir);
  const docsBefore = snapshot(docsDir);
  const result = run(dataDir, outDir, docsDir);
  assert.notEqual(result.status, 0, '非法输入必须非零退出');
  assert.match(result.stderr + result.stdout, /生年 700 晚于登科年 622/);
  assert.match(result.stderr + result.stdout, /关系 to=z9999 不存在/);
  assert.match(result.stderr + result.stdout, /未写入任何产物/);
  same(before, snapshot(outDir));
  same(docsBefore, snapshot(docsDir));
  rmSync(base, { recursive: true, force: true });
});

test('精选阅读引用不存在的出处时不写产物，草稿不进入公开名单', () => {
  const { base, dataDir, outDir, docsDir } = prepare('read');
  const readings = readFileSync(join(dataDir, 'readings.yaml'), 'utf8');
  writeFileSync(
    join(dataDir, 'readings.yaml'),
    readings.replace('source_ids: [s0034]', 'source_ids: [s9999]') +
      '\n- id: r0099\n  person_id: z0497\n  title: 草稿\n  summary: 不该公开\n  order: 9\n  status: draft\n  paragraphs:\n    - text: 草稿正文\n      source_ids: [s0034]\n',
  );
  const before = snapshot(outDir);
  const bad = run(dataDir, outDir, docsDir);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr + bad.stdout, /s9999/);
  assert.match(bad.stderr + bad.stdout, /未写入任何产物/);
  same(before, snapshot(outDir));

  writeFileSync(
    join(dataDir, 'readings.yaml'),
    readings +
      '\n- id: r0099\n  person_id: z0497\n  title: 草稿\n  summary: 不该公开\n  order: 9\n  status: draft\n  paragraphs:\n    - text: 草稿正文\n      source_ids: [s0034]\n',
  );
  const good = run(dataDir, outDir, docsDir);
  assert.equal(good.status, 0, good.stderr);
  const published = JSON.parse(readFileSync(join(outDir, 'readings.json'), 'utf8'));
  assert.equal(published.some((r) => r.id === 'r0099'), false);
  // 2026-10-24：三篇新增长文（r0004–r0006）经逐段复核升 reviewed，公开数 3→6（M-G 收口）
  assert.equal(published.length, 6);
  const person = JSON.parse(readFileSync(join(outDir, 'person', 'z0497.json'), 'utf8'));
  assert.equal(person.readings.some((r) => r.id === 'r0099'), false);
  assert.equal(person.sources.some((s) => s.id === 's0034'), true);
  rmSync(base, { recursive: true, force: true });
});

test('同对同型重复边构建失败，且不改写任何产物', () => {
  const { base, dataDir, outDir, docsDir } = prepare('dup');
  const relPath = join(dataDir, 'relations.yaml');
  const rels = yaml.load(readFileSync(relPath, 'utf8'));
  assert.ok(Array.isArray(rels) && rels.length > 0, 'relations.yaml 应可解析');
  const dup = rels[0];
  writeFileSync(
    relPath,
    readFileSync(relPath, 'utf8') +
      yaml.dump([{ from: dup.from, to: dup.to, type: dup.type, note: 'D5 夹具：同对同型重复边' }], { lineWidth: -1 }),
  );

  const before = snapshot(outDir);
  const result = run(dataDir, outDir, docsDir);
  assert.notEqual(result.status, 0, '重复边必须非零退出');
  assert.match(result.stderr + result.stdout, /关系重复/);
  assert.match(result.stderr + result.stdout, /未写入任何产物/);
  same(before, snapshot(outDir));
  rmSync(base, { recursive: true, force: true });
});

test('争议人物不参与同年派生：登记 disputed 后同科对不再生成同年边', () => {
  const { base, dataDir, outDir, docsDir } = prepare('dispute');
  // 五代 925 年同科两人：基线派生「同年」边；把其中一人登记为 disputed 后必须抑制
  const [a, b] = ['z0170', 'z0171'];
  const tongnian = () => {
    const f = JSON.parse(readFileSync(join(outDir, 'edges.json'), 'utf8'));
    const list = f.edges ?? f;
    return list.some((e) => e.type === '同年' && ((e.from === a && e.to === b) || (e.from === b && e.to === a)));
  };

  const control = run(dataDir, outDir, docsDir);
  assert.equal(control.status, 0, control.stderr);
  assert.equal(tongnian(), true, '基线应派生同年边');

  const disputePath = join(dataDir, 'seed', 'dispute-reviewed.json');
  const disputeFile = JSON.parse(readFileSync(disputePath, 'utf8'));
  disputeFile.notes.push({ id: a, dispute_note: 'D5 夹具：身份异说，仅用于负向回归', reason: 'D5 夹具' });
  writeFileSync(disputePath, JSON.stringify(disputeFile, null, 2));

  const res = run(dataDir, outDir, docsDir);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(tongnian(), false, 'disputed 人物不应参与同年派生');
  assert.match(res.stdout, /异说抑制 3 条/, '原有 2 条（李从实↔陆器、泰不华↔宋本——2026-10-23 泰不华经 T02 裁定补标 disputed）+ 新增 1 条');
  rmSync(base, { recursive: true, force: true });
});

test('careers 冲突未裁定时只告警不失败，并写入裁定表', () => {
  const { base, dataDir, outDir, docsDir } = prepare('career');
  // 贺知章深档 final_category=归隐，追加一条人工回填「部院高官」且不做裁定
  const careerPath = join(dataDir, 'careers.yaml');
  writeFileSync(
    careerPath,
    readFileSync(careerPath, 'utf8') +
      '\n- id: z0014   # D5 夹具：与深档 final_category 冲突且未裁定\n  final_category: 部院高官\n  source_id: s0006\n',
  );

  const res = run(dataDir, outDir, docsDir);
  assert.equal(res.status, 0, '未裁定冲突不得升级为全库失败');
  assert.match(res.stderr + res.stdout, /careers 冲突待裁定 \d+ 条/);
  assert.match(res.stderr + res.stdout, /贺知章\.final_category/);

  const report = readFileSync(join(docsDir, 'career-冲突裁定表.md'), 'utf8');
  assert.match(report, /\| z0014 \| 贺知章 \| `final_category` \| 归隐 \| 部院高官 \| careers\.yaml \| \*\*待裁定\*\* \|/);
  rmSync(base, { recursive: true, force: true });
});
