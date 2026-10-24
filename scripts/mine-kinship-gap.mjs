#!/usr/bin/env node
// DB23 关系缺口挖掘：CBDB KIN_DATA 共父/父子三元组 → 站内无边候选
// 用法：node scripts/mine-kinship-gap.mjs
// 产出：/tmp/db23-kin-candidates.json（供人工核正史后入库，铁律：核实挂 source_id 才入 relations.yaml）
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(join(root, 'data/cbdb/cbdb_20261010.sqlite3'), { readOnly: true });

// ---- 站内 id 集（名录 656 + 外延 46）与名称 ----
const idx = JSON.parse(readFileSync(join(root, 'public/data/person-index.json'), 'utf8'));
const ext = JSON.parse(readFileSync(join(root, 'public/data/externals-index.json'), 'utf8'));
const siteById = new Map();
for (const p of [...idx, ...ext]) siteById.set(p.id, p);

// ---- 站内 ↔ CBDB 映射（合并两个匹配表）----
const m1 = JSON.parse(readFileSync(join(root, 'data/seed/cbdb-match.json'), 'utf8'));
const m2 = JSON.parse(readFileSync(join(root, 'data/seed/cbdb-match-reviewed.json'), 'utf8'));
const cbdbToSite = new Map();
const add = (siteId, v) => {
  const cid = v && (v.cbdbId || v.cbdb_person_id) || v;
  if (typeof cid === 'number') {
    if (!cbdbToSite.has(cid)) cbdbToSite.set(cid, siteId);
  }
};
for (const [k, v] of Object.entries(m1)) add(k, v);
for (const [k, v] of Object.entries(m2)) add(k, v);

// ---- 已有边对 ----
const relTxt = readFileSync(join(root, 'data/relations.yaml'), 'utf8');
const hasEdge = new Set(
  [...relTxt.matchAll(/^- from: (\S+)[\s\S]*?^  to: (\S+)/gm)].map((m) => {
    const a = m[1], b = m[2];
    return a < b ? a + '|' + b : b + '|' + a;
  })
);

// ---- KIN 解析：拉取站内匹配者的全部亲属行 ----
// 亲属码简表（按 KINSHIP_CODES，只取直系与兄弟——旁系由共父三元组覆盖）
const KIN = db.prepare('SELECT c_kincode, c_kinrel_chn, c_kinrel FROM KINSHIP_CODES').all();
const kinName = new Map(KIN.map((r) => [r.c_kincode, r.c_kinrel_chn + '/' + r.c_kinrel]));
const relStr = (code) => (kinName.get(code) ?? code).split('/')[1] ?? code;
// 父码集合：F、FF(经由)、以及各种「父」步。简化：c_kinrel 精确 'F' 为父。
const isFatherCode = (code) => relStr(code) === 'F';

const rows = db.prepare('SELECT c_personid, c_kin_id, c_kin_code, c_source, c_notes FROM KIN_DATA').all();
// person → 其父亲 cbdb id
const fatherOf = new Map();
// person → 兄弟（同码兄弟直接边）—— 兄弟码 B / BB 等
const brothers = [];
for (const r of rows) {
  const site = cbdbToSite.get(r.c_personid);
  if (!site) continue;
  const rel = relStr(r.c_kin_code);
  if (rel === 'F') fatherOf.set(r.c_personid, r.c_kin_id);
  if (rel === 'B' || relStr(r.c_kin_code).startsWith('B;') || /B/.test(rel) && rel.length <= 4) {
    // 兄弟类：B、BB、HB 等；共父法更稳，这里只收纯 B
    if (rel === 'B') brothers.push(r);
  }
}

const cand = [];
const seen = new Set();
const pushCand = (a, b, kind, detail) => {
  if (a === b) return;
  const pa = siteById.get(a), pb = siteById.get(b);
  if (!pa || !pb) return;
  const key = a < b ? a + '|' + b : b + '|' + a;
  if (seen.has(key) || hasEdge.has(key)) return;
  seen.add(key);
  cand.push({ from: a, fromName: pa.name, to: b, toName: pb.name, kind, detail });
};

// ① 共父：father(A) == father(B)
const byFather = new Map();
for (const [pid, fid] of fatherOf) {
  if (!byFather.has(fid)) byFather.set(fid, []);
  byFather.get(fid).push(pid);
}
for (const [fid, sons] of byFather) {
  for (let i = 0; i < sons.length; i++)
    for (let j = i + 1; j < sons.length; j++) {
      const a = cbdbToSite.get(sons[i]), b = cbdbToSite.get(sons[j]);
      if (a && b) pushCand(a, b, '共父', `父 CBDB#${fid}`);
    }
}

// ② 直接父子：A 的父是 B（B 也在站内）
for (const [pid, fid] of fatherOf) {
  const b = cbdbToSite.get(fid);
  if (b) {
    const a = cbdbToSite.get(pid);
    if (a) pushCand(a, b, '父子', `CBDB KIN: F (父)`);
  }
}

// ③ 纯兄弟码 B（直接记载）
for (const r of brothers) {
  const b = cbdbToSite.get(r.c_kin_id);
  if (b) {
    const a = cbdbToSite.get(r.c_personid);
    if (a) pushCand(a, b, '兄弟码', `CBDB KIN: B；source=${r.c_source ?? ''} notes=${(r.c_notes ?? '').slice(0, 60)}`);
  }
}

// 输出：外延节点单独标注（跨外延的边不强制，但列出供判断）
const out = cand.map((c) => ({
  ...c,
  endpoints: [c.from, c.to].map((x) => (idx.find((p) => p.id === x) ? '名录' : '外延')).join('-'),
}));
writeFileSync('/tmp/db23-kin-candidates.json', JSON.stringify(out, null, 2));
console.log(`候选 ${out.length} 条`);
const byKind = {};
for (const c of out) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
console.log('分类:', JSON.stringify(byKind));
const bothRoster = out.filter((c) => c.endpoints === '名录-名录');
console.log(`名录↔名录（优先）: ${bothRoster.length}`);
for (const c of bothRoster.slice(0, 40)) console.log(`  ${c.fromName}(${c.from}) ↔ ${c.toName}(${c.to}) [${c.kind}] ${c.detail}`);
