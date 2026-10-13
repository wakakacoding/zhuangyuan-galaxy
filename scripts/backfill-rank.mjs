// 品级回填：为 16 个深度档案的事件补 office / rank_grade / estimated
// rank_grade：1.0=正一品 … 9.5=从九品，0.5 步进；明清官品明确不标 estimated，唐宋标 estimated
// 用法：node scripts/backfill-rank.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'persons');

// 匹配规则：year（可选）+ titleHas（可选），命中即 set
const PATCH = {
  'z0001': [
    { titleHas: '官至大理少卿', set: { office: '大理少卿', rank_grade: 4.5, estimated: true } },
  ],
  'z0022': [
    { titleHas: '贬济州', set: { office: '济州司仓参军', rank_grade: 8.5, estimated: true } },
    { titleHas: '卒于尚书右丞任', set: { office: '尚书右丞', rank_grade: 4.0, estimated: true } },
  ],
  'z0211': [
    { year: 977, set: { office: '将作监丞、通判升州', rank_grade: 8.0, estimated: true } },
    { titleHas: '参知政事', set: { office: '参知政事', rank_grade: 2.0, estimated: true } },
    { titleHas: '拜相', set: { office: '同中书门下平章事', rank_grade: 1.0, estimated: true } },
  ],
  'z0235': [
    { year: 1002, set: { office: '将作监丞、通判济州', rank_grade: 8.0, estimated: true } },
    { titleHas: '拜相', set: { office: '同中书门下平章事', rank_grade: 1.0, estimated: true } },
  ],
  'z0416': [
    { year: 1256, set: { office: '承事郎、签书宁海军节度判官', rank_grade: 8.5, estimated: true } },
    { titleHas: '起兵勤王', set: { office: '右丞相兼枢密使', rank_grade: 1.0, estimated: true } },
  ],
  'z0457': [
    { year: 1391, set: { office: '翰林院修撰', rank_grade: 6.5 } }, // 明制：状元授修撰（从六品）
  ],
  'z0476': [
    { year: 1445, set: { office: '翰林院修撰', rank_grade: 6.5 } },
    { titleHas: '入阁', year: 1449, set: { office: '翰林院侍读、入阁预机务', rank_grade: 6.0, estimated: true } },
    { titleHas: '召复入阁', set: { office: '吏部尚书兼谨身殿大学士', rank_grade: 2.0, estimated: true } }, // 明大学士本官正五品，取兼衔
  ],
  'z0497': [
    { year: 1511, set: { office: '翰林院修撰', rank_grade: 6.5 } },
  ],
  'z0526': [
    { year: 1598, set: { office: '翰林院修撰', rank_grade: 6.5 } },
    { titleHas: '官至礼部尚书', set: { office: '礼部尚书', rank_grade: 2.0 } }, // 明尚书正二品
  ],
  'z0541': [
    { year: 1646, set: { office: '内翰林国史院修撰', rank_grade: 6.5 } },
    { titleHas: '官至武英殿大学士', set: { office: '武英殿大学士兼兵部尚书', rank_grade: 1.0 } }, // 清大学士正一品
  ],
  'z0597': [
    { titleHas: '授翰林院修撰', set: { office: '翰林院修撰', rank_grade: 6.5 } },
    { titleHas: '卒于云南学政', set: { office: '内阁学士、云南学政', rank_grade: 2.5, estimated: true } }, // 本官内阁学士从二品，学政为差遣
  ],
  'z0615': [
    { titleHas: '授翰林院修撰', set: { office: '翰林院修撰', rank_grade: 6.5 } },
    { year: 1849, set: { office: '江宁布政使', rank_grade: 2.5 } }, // 清布政使从二品
  ],
  'z0633': [
    { year: 1856, set: { office: '翰林院修撰', rank_grade: 6.5 } },
    { titleHas: '弘德殿', set: { office: '弘德殿行走（帝师），本官侍讲学士', rank_grade: 4.5, estimated: true } },
    { titleHas: '军机处', set: { office: '户部尚书、军机大臣', rank_grade: 1.5 } }, // 清尚书从一品
  ],
  'z0650': [
    { year: 1894, set: { office: '翰林院修撰', rank_grade: 6.5 } },
    // 民国农商总长无品级 → 不入折线，进纪事带
  ],
  'z0654': [
    { titleHas: '授翰林院修撰', set: { office: '翰林院修撰', rank_grade: 6.5 } },
  ],
};

let patched = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
  const id = f.slice(0, 5);
  const rules = PATCH[id];
  if (!rules) continue;
  const fp = join(dir, f);
  const doc = yaml.load(readFileSync(fp, 'utf8'));
  let hit = 0;
  for (const e of doc.events ?? []) {
    for (const r of rules) {
      if (r.year !== undefined && e.year !== r.year) continue;
      if (r.titleHas && !e.title.includes(r.titleHas)) continue;
      Object.assign(e, r.set);
      hit++;
      break; // 一事件只命中一条规则
    }
  }
  writeFileSync(fp, yaml.dump(doc, { lineWidth: 200, noRefs: true }));
  console.log(`${f}: 命中 ${hit}/${rules.length} 条规则`);
  patched += hit;
}
console.log(`\n✓ 共回填 ${patched} 个事件的品级/官职`);
