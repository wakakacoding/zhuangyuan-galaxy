// 关系网络的键盘可达替代视图：一张随全局筛选变化的关系表。
// 筛选口径复用 store/filters 的 matchEntry，与星图名单、网络图高亮是同一批人。
// 键盘路径：Tab 到任一端的姓名按钮，Enter 或空格打开人物帖。
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { selectedDynasties, searchQuery, yearFrom, yearTo, selectedTags, areaQuery, depthFilter, currentFilters, filtersActive, matchEntry } from '../../store/filters';
import { selectPerson } from '../../store/selection';
import { loadIndex, type IndexEntry } from '../../lib/data';
import DisputedBadge from '../person/DisputedBadge';

interface Edge {
  from: string;
  to: string;
  type: string;
  note?: string;
  derived?: boolean;
  from_name: string;
  to_name: string;
}

const TYPE_ORDER = ['父子', '座主', '师承', '荐举', '师生', '翁婿', '亲属', '同僚', '政敌', '同年'];

export default function NetworkList() {
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [failed, setFailed] = useState(false);
  const dynFilter = useStore(selectedDynasties);
  const query = useStore(searchQuery);
  const y0 = useStore(yearFrom);
  const y1 = useStore(yearTo);
  const tags = useStore(selectedTags);
  const area = useStore(areaQuery);
  const depth = useStore(depthFilter);

  useEffect(() => {
    let dead = false;
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    loadIndex().then((rows) => { if (!dead) setIndex(rows); }).catch(() => { if (!dead) setFailed(true); });
    fetch(`${base}/data/edges.json`)
      .then((r) => r.json())
      .then((d) => { if (!dead) setEdges(d.edges ?? []); })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, []);

  const byId = useMemo(() => new Map(index.map((p) => [p.id, p])), [index]);
  const filtered = filtersActive();

  const rows = useMemo(() => {
    const keep = (id: string) => {
      const p = byId.get(id);
      // 外延人物不在名录里：只在没有任何筛选时保留，避免筛选结果和星图对不上
      if (!p) return !filtered;
      return matchEntry(p, currentFilters());
    };
    return edges
      .filter((e) => keep(e.from) || keep(e.to))
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
        || a.from_name.localeCompare(b.from_name, 'zh'));
  }, [edges, byId, dynFilter, query, y0, y1, tags, area, depth, filtered]);

  if (failed) return <p className="font-serif text-sm text-zhusha" role="alert">关系表没有载入，请刷新页面重试。</p>;
  if (!index.length || !edges.length) return <p className="font-serif text-sm text-miDim" role="status">关系表载入中…</p>;

  const nameCell = (id: string, name: string) => {
    const p = byId.get(id);
    if (!p) return <span className="text-miDim">{name}<span className="ml-1 text-[10px] text-miDim/60">外延</span></span>;
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => selectPerson(id)}
          className="min-h-8 rounded px-1 text-left text-mi underline decoration-jin/30 underline-offset-2 hover:text-jin focus-visible:outline focus-visible:outline-2 focus-visible:outline-jin"
          data-person-id={id}
        >{name}</button>
        {p.disputed && <DisputedBadge />}
      </span>
    );
  };

  return (
    <div data-alt-view="network" data-rows={rows.length}>
      <p className="mb-2 font-serif text-[11px] leading-5 text-miDim/70" role="status">
        当前{filtered ? '筛选' : '全量'}涉及 {rows.length} 条关系，任一端落在筛选结果里即列出；
        与上方网络图高亮的是同一批人。Tab 到姓名按钮，Enter 或空格打开人物帖。
      </p>
      <div className="max-h-[26rem] overflow-auto rounded-lg border border-jin/20">
        <table className="w-full border-collapse text-left font-serif text-xs">
          <caption className="sr-only">状元关系表：按当前筛选列出关系类型、两端人物与是否为同年派生</caption>
          <thead className="sticky top-0 bg-dai">
            <tr className="text-miDim">
              <th scope="col" className="px-2 py-1.5 font-normal">类型</th>
              <th scope="col" className="px-2 py-1.5 font-normal">甲</th>
              <th scope="col" className="px-2 py-1.5 font-normal">乙</th>
              <th scope="col" className="px-2 py-1.5 font-normal">来历</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.from}-${e.to}-${e.type}-${i}`} className="border-t border-miDim/10 align-top">
                <th scope="row" className="px-2 py-1.5 font-normal text-mi">{e.type}</th>
                <td className="px-2 py-1.5">{nameCell(e.from, e.from_name)}</td>
                <td className="px-2 py-1.5">{nameCell(e.to, e.to_name)}</td>
                <td className="px-2 py-1.5 text-miDim">{e.derived ? '同年派生' : '人工考据'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-3 py-4 font-serif text-xs text-miDim">当前筛选没有匹配的关系，清空朝代或关键词后重试。</p>
        )}
      </div>
    </div>
  );
}
