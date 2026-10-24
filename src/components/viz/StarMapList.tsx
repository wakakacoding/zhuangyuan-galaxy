// 星图的键盘可达替代视图：一张随全局筛选变化的表，内容与星图高亮的是同一批人。
// 不是另立名单：筛选口径直接复用 store/filters 的 matchEntry（星图 canvas 用的就是它）。
// 键盘路径：Tab 进入表格 → Tab 到姓名按钮 → Enter/Space 打开人物帖（与点星一致）。
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { selectedDynasties, searchQuery, yearFrom, yearTo, selectedTags, areaQuery, depthFilter, currentFilters, filtersActive, matchEntry } from '../../store/filters';
import { selectPerson } from '../../store/selection';
import { loadIndex, loadDynasties, type IndexEntry, type DynastyMeta } from '../../lib/data';
import DisputedBadge from '../person/DisputedBadge';

const depthLabel = (p: IndexEntry): string =>
  p.event_count >= 3 ? '深度档案' : p.event_count > 0 ? '有事件' : '仅名录';

export default function StarMapList() {
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [dynasties, setDynasties] = useState<DynastyMeta[]>([]);
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
    loadIndex().then((rows) => { if (!dead) setIndex(rows); }).catch(() => { if (!dead) setFailed(true); });
    loadDynasties().then((d) => { if (!dead) setDynasties(d); }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const dynName = useMemo(() => new Map(dynasties.map((d) => [d.key, d.name])), [dynasties]);
  const rows = useMemo(
    () => index
      .filter((p) => matchEntry(p, currentFilters()))
      .sort((a, b) => a.exam_year - b.exam_year || a.name.localeCompare(b.name, 'zh')),
    [index, dynFilter, query, y0, y1, tags, area, depth],
  );
  const filtered = filtersActive();

  if (failed) {
    return <p className="font-serif text-sm text-zhusha" role="alert">名单没有载入，请刷新页面重试。</p>;
  }
  if (!index.length) {
    return <p className="font-serif text-sm text-miDim" role="status">名单载入中…</p>;
  }

  return (
    <div data-alt-view="starmap" data-rows={rows.length}>
      <p className="mb-2 font-serif text-[11px] leading-5 text-miDim/70" role="status">
        当前{filtered ? '筛选' : '全量'}共 {rows.length} 人，与上方星图高亮的是同一批；按夺魁年排序。
        Tab 移到姓名按钮，Enter 或空格打开人物帖。图形探索仍在上方星图里。
      </p>
      <div className="max-h-[26rem] overflow-auto rounded-lg border border-jin/20">
        <table className="w-full border-collapse text-left font-serif text-xs">
          <caption className="sr-only">
            状元名单：按当前朝代与关键词筛选结果列出姓名、朝代、夺魁年、籍贯、档案深度与身份存疑状态
          </caption>
          <thead className="sticky top-0 bg-dai">
            <tr className="text-miDim">
              <th scope="col" className="px-2 py-1.5 font-normal">姓名</th>
              <th scope="col" className="px-2 py-1.5 font-normal">朝代</th>
              <th scope="col" className="px-2 py-1.5 font-normal">夺魁年</th>
              <th scope="col" className="px-2 py-1.5 font-normal">籍贯</th>
              <th scope="col" className="px-2 py-1.5 font-normal">档案</th>
              <th scope="col" className="px-2 py-1.5 font-normal">身份</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-miDim/10 align-top">
                <th scope="row" className="px-2 py-1.5 font-normal">
                  <button
                    type="button"
                    onClick={() => selectPerson(p.id)}
                    className="min-h-8 rounded px-1 text-left text-mi underline decoration-jin/30 underline-offset-2 hover:text-jin focus-visible:outline focus-visible:outline-2 focus-visible:outline-jin"
                    data-person-id={p.id}
                  >
                    {p.name}
                  </button>
                </th>
                <td className="px-2 py-1.5 text-miDim">{dynName.get(p.dynasty) ?? p.dynasty}</td>
                <td className="px-2 py-1.5 tabular-nums text-miDim">{p.exam_year}</td>
                <td className="px-2 py-1.5 text-miDim">{p.native_hist || '—'}</td>
                <td className="px-2 py-1.5 text-miDim">{depthLabel(p)}</td>
                <td className="px-2 py-1.5">{p.disputed ? <DisputedBadge /> : <span className="text-miDim/50">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-3 py-4 font-serif text-xs text-miDim">当前筛选没有匹配的人，清空朝代或关键词后重试。</p>
        )}
      </div>
    </div>
  );
}
