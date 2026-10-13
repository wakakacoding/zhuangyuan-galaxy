// 纪年工具：公元/干支/年号 三纪年并列显示
const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
// 公元 4 年为甲子年
export const ganzhiOf = (year: number): string =>
  STEMS[(((year - 4) % 10) + 10) % 10] + BRANCHES[(((year - 4) % 12) + 12) % 12];

export const formatYear = (year: number, ganzhi?: string, reign?: string): string => {
  const parts = [`${year} 年`];
  if (reign && ganzhi) return `${year} 年 · ${reign} · ${ganzhi}`;
  if (ganzhi) parts.push(ganzhi);
  return parts.join(' · ');
};

export const lifespan = (
  birth?: number, death?: number, birthCirca?: boolean, deathCirca?: boolean,
): string => {
  if (!birth && !death) return '生卒不详';
  const b = birth ? `${birthCirca ? '约' : ''}${birth}` : '？';
  const d = death ? `${deathCirca ? '约' : ''}${death}` : '？';
  return `${b} – ${d}`;
};
