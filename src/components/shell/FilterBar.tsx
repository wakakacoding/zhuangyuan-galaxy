import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { selectedDynasties, searchQuery, toggleDynasty, resetFilters } from '../../store/filters';
import { selectPerson } from '../../store/selection';
import { loadDynasties, loadIndex, type DynastyMeta, type IndexEntry } from '../../lib/data';
import { normalizeQuery } from '../../lib/normalize';

export default function FilterBar() {
  const [dynasties, setDynasties] = useState<DynastyMeta[]>([]);
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const sel = useStore(selectedDynasties);
  const q = useStore(searchQuery);

  useEffect(() => {
    loadDynasties().then((d) => setDynasties(d.sort((a, b) => a.order - b.order))).catch(() => {});
    loadIndex().then(setIndex).catch(() => {});
  }, []);

  const active = sel.length > 0 || q.trim().length > 0;

  // 搜索建议：姓名前缀 > 姓名包含 > 籍贯/标签；同分按史料丰富度排序
  const suggestions = useMemo(() => {
    const qq = normalizeQuery(q);
    if (!qq) return [];
    const scored: { p: IndexEntry; score: number }[] = [];
    for (const p of index) {
      const key = p.search_key ?? normalizeQuery(`${p.name}${p.native_hist}${p.native_modern ?? ''}${p.tags.join('')}`);
      if (!key.includes(qq)) continue;
      const nameKey = normalizeQuery(p.name);
      const score = nameKey.startsWith(qq) ? 0 : nameKey.includes(qq) ? 1 : 2;
      scored.push({ p, score });
    }
    return scored
      .sort((a, b) => a.score - b.score || b.p.completeness - a.p.completeness)
      .slice(0, 8)
      .map((x) => x.p);
  }, [q, index]);

  const openPerson = (id: string) => {
    selectPerson(id);
    setSearchFocused(false);
  };

  const dynName = (key: string) => dynasties.find((d) => d.key === key)?.name ?? key;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-jin/15 bg-xuan/90 px-4 py-2.5 md:flex-wrap md:overflow-x-visible">
      <span className="mr-1 shrink-0 font-serif text-xs tracking-widest text-miDim">筛选</span>
      {dynasties.map((d) => {
        const on = sel.includes(d.key);
        return (
          <button
            key={d.key}
            onClick={() => toggleDynasty(d.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 font-serif text-xs transition-all md:py-1 ${
              on ? 'border-transparent font-bold' : 'border-miDim/25 text-miDim hover:border-miDim/60'
            }`}
            style={on ? { backgroundColor: d.color, color: '#0E1621' } : { color: d.color }}
          >
            {d.name}
          </button>
        );
      })}
      <div className="relative ml-auto shrink-0">
        <input
          value={q}
          onChange={(e) => searchQuery.set(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearchFocused(false);
            if (e.key === 'Enter' && suggestions.length) openPerson(suggestions[0].id);
          }}
          placeholder="搜姓名 / 籍贯 / 标签（繁简通）…"
          aria-label="搜索状元"
          className="w-44 rounded-full border border-miDim/25 bg-transparent px-3 py-1 font-serif text-xs text-mi placeholder-miDim/50 outline-none focus:border-jin/60 sm:w-52"
        />
        {searchFocused && suggestions.length > 0 && (
          <ul className="absolute right-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-lg border border-jin/25 bg-dai/95 shadow-xl backdrop-blur">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); openPerson(p.id); }}
                  className="flex w-full items-baseline gap-2 px-3 py-2 text-left font-serif text-xs transition hover:bg-jin/10"
                >
                  <span className="text-mi">{p.name}</span>
                  <span className="text-miDim/80">{dynName(p.dynasty)} · {p.exam_year}</span>
                  {p.native_modern && <span className="ml-auto truncate text-[10px] text-miDim/60">{p.native_modern}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {active && (
        <button
          onClick={resetFilters}
          className="shrink-0 rounded-full border border-zhusha/50 px-3 py-1.5 font-serif text-xs text-zhusha hover:bg-zhusha/10 md:py-1"
        >
          重置
        </button>
      )}
    </div>
  );
}
