// 把旧的单一「终点」拆成官职、生活去向、死亡三组。拆不准的标待核，不改原字段。

export interface CareerRow {
  final_office?: string;
  final_category?: string;
}

export interface CareerSplit {
  office: string | null;
  path: string | null;
  death: string | null;
  pending: string[];
}

export function splitCareer(row: CareerRow): CareerSplit {
  const office = row.final_office ?? '';
  const category = row.final_category ?? '';
  const out: CareerSplit = { office: null, path: null, death: null, pending: [] };

  if (category === '宰辅') out.office = '宰辅与执政';
  else if (category === '部院高官') out.office = '部院';
  else if (category === '地方大员') out.office = '地方';
  else if (category === '学政文教') out.office = '翰林文教';
  else if (category === '归隐') out.path = '归隐或讲学';
  else if (category === '殉国') out.death = '殉职或死事';
  else if (category === '早逝') {
    out.death = '早逝';
    if (office && !/卒年/.test(office)) out.pending.push('早逝条目同时记有官职，未自动计入官职');
  } else if (category === '其他') {
    if (/纱厂|实业|商局|农商/.test(office)) out.path = '实业';
    else out.pending.push('「其他」不能判断是官职、去向还是死亡');
  } else if (category) {
    out.pending.push(`未识别的旧分类：${category}`);
  }
  return out;
}
