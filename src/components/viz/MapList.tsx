// 地图的键盘替代：当前朝代切片里、落在全局筛选中、且有坐标的人。
// 没有坐标的人不编进这张表，页面另说人数，不假装他们也在图上。
// 2026-10-24 换源 Cliopatria：底图为政权级疆域轮廓，不再有府级「政区」列；
// 表格改为显示籍贯（历史地名 + 现代对照），点击籍贯按文字前缀过滤不再打开政区面板。
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { mapSlice, selectedDynasties, searchQuery, yearFrom, yearTo, selectedTags, areaQuery, depthFilter, currentFilters, filtersActive, matchEntry } from '../../store/filters';
import { selectPerson } from '../../store/selection';
import { loadGeo, loadIndex, type GeoPoint, type IndexEntry } from '../../lib/data';

export default function MapList() {
  const slice = useStore(mapSlice);
  const dyn = useStore(selectedDynasties);
  const query = useStore(searchQuery);
  const y0 = useStore(yearFrom);
  const y1 = useStore(yearTo);
  const tags = useStore(selectedTags);
  const area = useStore(areaQuery);
  const depth = useStore(depthFilter);
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    loadGeo().then((g) => { if (!dead) setPoints(g.points); }).catch(() => { if (!dead) setFailed(true); });
    loadIndex().then((rows) => { if (!dead) setIndex(rows); }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, []);

  const key = slice ?? 'tang';
  const byId = useMemo(() => new Map(index.map((p) => [p.id, p])), [index]);
  const rows = useMemo(() => points
    .filter((p) => p.dynasty === key)
    .filter((p) => {
      const person = byId.get(p.id);
      return person ? matchEntry(person, currentFilters()) : !filtersActive();
    })
    .sort((a, b) => a.exam_year - b.exam_year || a.name.localeCompare(b.name, 'zh')),
  [points, key, byId, dyn, query, y0, y1, tags, area, depth]);
  const inSlice = index.filter((p) => p.dynasty === key).length;
  const missing = inSlice - points.filter((p) => p.dynasty === key).length;

  if (failed) return <p className="font-serif text-sm text-zhusha" role="alert">地区表没有载入。</p>;
  if (!index.length) return <p className="font-serif text-sm text-miDim" role="status">地区表载入中…</p>;

  return (
    <div data-alt-view="map" data-rows={rows.length}>
      <p className="mb-2 font-serif text-[11px] leading-5 text-miDim" role="status">
        当前切片列出 {rows.length} 个有坐标的人，与地图上这一朝的点是同一批。
        这一朝还有 {missing} 人没有坐标，不在表里，也不在图上。
        底图为政权级疆域轮廓（Cliopatria），不再按府级政区分组；点「籍贯」可按地名文字筛选。
      </p>
      <div className="max-h-80 overflow-auto rounded-lg border border-jin/20">
        <table className="w-full border-collapse text-left font-serif text-xs">
          <caption className="sr-only">当前朝代有籍贯坐标的状元</caption>
          <thead className="sticky top-0 bg-dai">
            <tr className="text-miDim">
              <th scope="col" className="px-2 py-1.5 font-normal">姓名</th>
              <th scope="col" className="px-2 py-1.5 font-normal">夺魁年</th>
              <th scope="col" className="px-2 py-1.5 font-normal">籍贯</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const person = byId.get(p.id);
              const native = person?.native_hist ?? '';
              return (
                <tr key={p.id} className="border-t border-miDim/10">
                  <th scope="row" className="px-2 py-1.5 font-normal">
                    <button type="button" data-person-id={p.id} onClick={() => selectPerson(p.id)} className="min-h-8 text-mi underline decoration-jin/30">{p.name}</button>
                  </th>
                  <td className="px-2 py-1.5 tabular-nums text-miDim">{p.exam_year}</td>
                  <td className="px-2 py-1.5">
                    {native
                      ? <button type="button" onClick={() => areaQuery.set(native)} className="min-h-8 text-jin underline">{native}</button>
                      : <span className="text-miDim">籍贯未详</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
