// 关系卡和网络节点共用：只有能读到档案或外延简档的对象才能打开。
export function canOpenPerson(id: string, knownIds?: ReadonlySet<string>): boolean {
  if (!id) return false;
  if (id.startsWith('w')) return knownIds ? knownIds.has(id) : true;
  if (id.startsWith('z')) return knownIds ? knownIds.has(id) : true;
  return false;
}
