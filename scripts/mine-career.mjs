// 仕途挖掘：解析清朝状元列表 wikitext 的「最高職位」列 → careers-mined-qing.yaml
// 用法：node scripts/mine-career.mjs
// 产物：data/seed/careers-mined-qing.yaml（B 级初录，构建期与 careers.yaml 人工考据合并，人工优先）
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wiki = readFileSync(join(root, 'data/seed/wiki_清朝状元列表.txt'), 'utf8');
const roster = readFileSync(join(root, 'data/seed/roster.tsv'), 'utf8');

// roster 建立 姓名→id（简体+繁体双索引）
const T2S = { 鄭: '郑', 鄧: '邓', 閩: '闽', 粵: '粤', 贛: '赣', 遼: '辽', 晉: '晋', 魯: '鲁', 豫: '豫', 鄂: '鄂', 湘: '湘', 橋: '桥', 鄉: '乡', 蘇: '苏', 寧: '宁', 廣: '广', 東: '东', 縣: '县', 隸: '隶', 陜: '陕', 貴: '贵', 雲: '云', 紹: '绍', 興: '兴', 臨: '临', 陽: '阳', 陰: '阴', 開: '开', 豐: '丰', 應: '应', 鳳: '凤', 鎮: '镇', 國: '国', 龍: '龙', 門: '门', 閬: '阆', 遠: '远', 慶: '庆', 樂: '乐', 壽: '寿', 鹽: '盐', 餘: '余', 嶽: '岳', 荊: '荆', 間: '间', 順: '顺', 揚: '扬', 溫: '温', 無: '无', 廬: '庐', 鄆: '郓', 須: '须', 肅: '肃', 師: '师', 鄒: '邹', 穎: '颍', 濟: '济', 勻: '匀', 華: '华', 黃: '黄', 蘄: '蕲', 薊: '蓟', 諸: '诸', 渾: '浑', 烏: '乌', 濱: '滨', 滄: '沧', 強: '强', 饒: '饶', 劉: '刘', 陸: '陆', 孫: '孙', 張: '张', 陳: '陈', 莊: '庄', 鴻: '鸿', 勛: '勋', 於: '于', 啟: '启', 齊: '齐', 龢: '龢' };
const simp = (s) => [...s].map((c) => T2S[c] ?? c).join('');
const name2id = new Map();
for (const line of roster.split('\n').slice(1)) {
  const [id, name] = line.split('\t');
  if (id && name) name2id.set(simp(name), id);
}

// 最高職位 → 终点分类（清官制）
function classify(office) {
  const o = office ?? '';
  if (/大學士|大学士/.test(o)) return '宰辅';
  if (/尚書|尚书|都御史/.test(o)) return '部院高官';
  if (/侍郎|內閣學士|内阁学士|副都御史/.test(o)) return '部院高官';
  if (/總督|总督|巡撫|巡抚|布政使|按察使|提督|將軍|将军|都統|都统/.test(o)) return '地方大员';
  if (/知府|知州|道員|道台|鹽運使|盐运使/.test(o)) return '地方大员';
  if (/學政|学政|祭酒|司業|司业|山長|山长|教習|教习/.test(o)) return '学政文教';
  if (/侍讀|侍读|侍講|侍讲|修撰|編修|编修|翰林|詹事|洗馬|洗马|中允|贊善|赞善|庶子/.test(o)) return '学政文教';
  return '其他';
}
// 清洗 wikitext 单元格：去 align/style/noWrap 前缀、[[链接]]、html
const clean = (s) => (s ?? '')
  .replace(/^align\s*=\s*"[^"]*"\s*(noWrap\s*)?\|/i, '')
  .replace(/^style\s*=\s*"[^"|]*"?\|/i, '') // wikitext 的 style 属性无右引号，到 | 为止
  .replace(/^noWrap\s*\|/i, '')
  .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
  .replace(/<[^>]*>/g, '')
  .trim();

const rows = wiki.split('|-').slice(1);
const out = [];
const miss = [];
for (const row of rows) {
  const cells = row.split('\n')
    .filter((l) => l.startsWith('|') && !l.startsWith('|}'))
    .map((l) => clean(l.slice(1)));
  if (cells.length < 6) continue;
  const [yearCell, , nameCell, lifeCell, , officeCell] = cells;
  const year = parseInt(yearCell);
  const name = simp(clean(nameCell));
  const id = name2id.get(name);
  if (!id) { miss.push(name); continue; }
  const office = clean(officeCell);
  if (!office) continue; // 无最高职位记录 → 不产出（宁缺毋错）
  // 早逝判定：享年 ≤48 且官职未至高位
  const m = lifeCell.match(/(\d{3,4})年.*?[－—-].*?(\d{3,4})年/);
  const age = m ? Number(m[2]) - Number(m[1]) : null;
  let cat = classify(office);
  if (age !== null && age <= 48 && !/大學士|尚書|总督|總督/.test(office)) cat = '早逝';
  out.push({
    id, name, year,
    first_office: '翰林院修撰', first_category: '翰林院', // 清制：状元授翰林院修撰（从六品）
    final_office: office, final_category: cat,
    note: age !== null && age <= 48 ? `享年 ${age}` : undefined,
  });
}

const yaml = ['# 清朝状元仕途挖掘产物（来源：维基状元列表最高職位列，B 级 s0018，人工考据 careers.yaml 优先）']
  .concat(out.map((r) => [
    `- id: ${r.id}   # ${r.name}（${r.year}）`,
    `  first_office: ${r.first_office}`,
    `  first_category: ${r.first_category}`,
    `  final_office: "${r.final_office.replace(/"/g, '\\"')}"`,
    `  final_category: ${r.final_category}`,
    `  source_id: s0018`,
    r.note ? `  note: "${r.note}"` : null,
  ].filter(Boolean).join('\n')))
  .join('\n') + '\n';

writeFileSync(join(root, 'data/seed/careers-mined-qing.yaml'), yaml);
console.log(`✓ 清代仕途挖掘 ${out.length} 条；未匹配姓名 ${miss.length}：${miss.join('、')}`);
const byCat = {};
for (const r of out) byCat[r.final_category] = (byCat[r.final_category] ?? 0) + 1;
console.log('分类分布：', byCat);
