// T05 数据契约 v1：状态语义与四维事实的负向/正向守卫。
// 夹具在临时目录（整份 data/ 复制），不碰仓库 data/ 与 public/data。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsx = join(root, 'node_modules', '.bin', 'tsx');

function prepare(tag) {
  const base = join(tmpdir(), `zy-contract-${tag}-` + process.pid);
  rmSync(base, { recursive: true, force: true });
  const dataDir = join(base, 'data');
  const outDir = join(base, 'out');
  const docsDir = join(base, 'docs');
  cpSync(join(root, 'data'), dataDir, { recursive: true });
  mkdirSync(outDir);
  mkdirSync(docsDir);
  for (const name of ['career-冲突裁定表.md', '争议身份一览.md']) {
    cpSync(join(root, 'docs', name), join(docsDir, name));
  }
  return { base, dataDir, outDir, docsDir };
}

function run({ dataDir, outDir, docsDir }) {
  return spawnSync(tsx, ['scripts/build-data.ts'], {
    cwd: root,
    env: {
      ...process.env,
      BUILD_DATA_DIR: dataDir,
      BUILD_OUT_DIR: outDir,
      BUILD_DOCS_DIR: docsDir,
      SOURCE_DATE_EPOCH: '1792108800',
    },
    encoding: 'utf8',
    timeout: 180000,
  });
}

// z0001 孙伏伽：深档存在、无 career、无 disputed，适合做最小改动夹具
function findPersonFile(dir, id) {
  const f = readdirSync(dir).find((x) => x.startsWith(id + '-') && x.endsWith('.yaml'));
  if (!f) throw new Error(`夹具缺少 ${id} 的深档`);
  return join(dir, f);
}

function editPerson(dataDir, id, mutate) {
  const fp = findPersonFile(join(dataDir, 'persons'), id);
  const doc = yaml.load(readFileSync(fp, 'utf8'));
  mutate(doc);
  writeFileSync(fp, yaml.dump(doc, { lineWidth: 200, noRefs: true }));
}

const readPerson = (outDir, id) => JSON.parse(readFileSync(join(outDir, 'person', `${id}.json`), 'utf8'));

test('未迁移人物仍记 missing：四维不从 final_* 推导，缺省人物四维为空', () => {
  const fx = prepare('legacy');
  const r = run(fx);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const stats = JSON.parse(readFileSync(join(fx.outDir, 'stats.json'), 'utf8'));
  assert.equal(stats.contract_version, 1.1);
  // 计数相对基线：未迁移者必须是 missing，已显式迁移者计入 recorded/unknown，三者之和恒等于名录总数
  for (const dim of ['highest', 'last', 'whereabouts', 'death']) {
    const c = stats.career_facts[dim];
    assert.equal(c.recorded + c.unknown + c.missing, stats.total, dim + ' 三态之和应等于名录总数');
  }
  const p = readPerson(fx.outDir, 'z0001');
  for (const dim of ['highest', 'last', 'whereabouts', 'death']) {
    assert.equal(p.career?.[dim], undefined, dim + ' 不得从 final_* 自动生成');
  }
  rmSync(fx.base, { recursive: true, force: true });
});

test('research_status=disputed 被拒绝（身份争议是另一根轴）', () => {
  const fx = prepare('rs');
  editPerson(fx.dataDir, 'z0001', (d) => { d.research_status = 'disputed'; });
  const r = run(fx);
  assert.notEqual(r.status, 0, '旧的三态取值应构建失败');
  assert.match(r.stderr + r.stdout, /research_status|invalid/i);
  rmSync(fx.base, { recursive: true, force: true });
});

test('research_status=searched 缺 research_note 被拒绝', () => {
  const fx = prepare('searched');
  // 2026-10-24 回填后全库 178 份深档都有 research_status，夹具需先清成缺省再写 searched
  editPerson(fx.dataDir, 'z0001', (d) => {
    delete d.research_status;
    delete d.research_note;
    delete d.research_checked_at;
    d.research_status = 'searched';
  });
  const r = run(fx);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /research_note/);
  rmSync(fx.base, { recursive: true, force: true });
});

test('四维合法值原样进入产物，并按 recorded 计数', () => {
  const fx = prepare('facts');
  editPerson(fx.dataDir, 'z0001', (d) => {
    d.career = {
      ...(d.career ?? {}),
      highest: { office: '大理少卿', year: 650, precision: 'circa', source_id: 's0006' },
      last: { status: 'unknown', note: '末任记载分歧，未取得可核材料' },
      whereabouts: { category: '归隐或讲学', note: '致仕后讲学' },
      death: { category: '殉职或死事', year: 658, source_id: 's0006' },
    };
  });
  const r = run(fx);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const p = readPerson(fx.outDir, 'z0001');
  assert.equal(p.career.highest.office, '大理少卿');
  assert.equal(p.career.highest.precision, 'circa');
  assert.equal(p.career.last.status, 'unknown');
  assert.equal(p.career.whereabouts.category, '归隐或讲学');
  assert.equal(p.career.death.category, '殉职或死事');
  const base = JSON.parse(readFileSync(join(root, 'public/data/stats.json'), 'utf8'));
  const stats = JSON.parse(readFileSync(join(fx.outDir, 'stats.json'), 'utf8'));
  // 夹具只给 z0001 加了一格 recorded、一格 unknown、一格 death recorded，增量应正好是 1
  assert.equal(stats.career_facts.highest.recorded, base.career_facts.highest.recorded + 1);
  assert.equal(stats.career_facts.last.unknown, base.career_facts.last.unknown + 1);
  assert.equal(stats.career_facts.death.recorded, base.career_facts.death.recorded + 1);
  rmSync(fx.base, { recursive: true, force: true });
});

test('status=unknown 缺 note 被拒绝', () => {
  const fx = prepare('unknown-nonote');
  editPerson(fx.dataDir, 'z0001', (d) => { d.career = { highest: { status: 'unknown' } }; });
  const r = run(fx);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /note/);
  rmSync(fx.base, { recursive: true, force: true });
});

test('status=unknown 同时写 office 被拒绝（未知不等于有值）', () => {
  const fx = prepare('unknown-office');
  editPerson(fx.dataDir, 'z0001', (d) => { d.career = { highest: { status: 'unknown', office: '大理少卿', note: '存疑' } }; });
  const r = run(fx);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /unknown/);
  rmSync(fx.base, { recursive: true, force: true });
});

test('事件 evidence=primary 但无 source_id 被拒绝', () => {
  const fx = prepare('evidence');
  editPerson(fx.dataDir, 'z0001', (d) => {
    d.events = [{ year: 622, type: '夺魁', title: '武德五年壬午科状元', evidence: 'primary' }];
  });
  const r = run(fx);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /primary/);
  rmSync(fx.base, { recursive: true, force: true });
});
