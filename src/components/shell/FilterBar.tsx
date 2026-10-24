import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  selectedDynasties, searchQuery, toggleDynasty, resetFilters, matchEntry, currentFilters, filtersActive,
  yearFrom, yearTo, selectedTags, toggleTag, areaQuery, depthFilter,
} from '../../store/filters';
import { selectPerson } from '../../store/selection';
import { loadDynasties, loadIndex, type DynastyMeta, type IndexEntry } from '../../lib/data';
import { normalizeQuery } from '../../lib/normalize';
import DisputedBadge from '../person/DisputedBadge';

export default function FilterBar() {
  const [dynasties, setDynasties] = useState<DynastyMeta[]>([]);
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const sel = useStore(selectedDynasties);
  const q = useStore(searchQuery);
  const y0 = useStore(yearFrom);
  const y1 = useStore(yearTo);
  const tags = useStore(selectedTags);
  const area = useStore(areaQuery);
  const depth = useStore(depthFilter);

  useEffect(() => {
    loadDynasties().then((d) => setDynasties(d.sort((a, b) => a.order - b.order))).catch(() => {});
    loadIndex().then(setIndex).catch(() => {});
  }, []);
  useEffect(() => { setActive(0); }, [q, sel.join(',')]);

  const state = currentFilters();
  const activeFilters = filtersActive(state);
  const tagOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of index) for (const t of p.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh')).slice(0, 16);
  }, [index]);

  // 搜索建议：姓名前缀 > 姓名包含 > 籍贯/标签；同分按史料丰富度排序
  const suggestions = useMemo(() => {
    const qq = normalizeQuery(q);
    if (!qq) return { inScope: [] as IndexEntry[], extra: [] as IndexEntry[] };
    const scored: { p: IndexEntry; score: number; inScope: boolean }[] = [];
    for (const p of index) {
      if (!matchEntry(p, [], q)) continue;
      const nameKey = normalizeQuery(p.name);
      const score = nameKey.startsWith(qq) ? 0 : nameKey.includes(qq) ? 1 : 2;
      scored.push({ p, score, inScope: matchEntry(p, state) });
    }
    scored.sort((a, b) => a.score - b.score || b.p.completeness - a.p.completeness);
    const inScope = scored.filter((x) => x.inScope).slice(0, 8).map((x) => x.p);
    const extra = sel.length
      ? scored.filter((x) => !x.inScope).slice(0, 8).map((x) => x.p)
      : [];
    return { inScope, extra };
  }, [q, index, sel, y0, y1, tags, area, depth]);
  const flat = [...suggestions.inScope, ...suggestions.extra];
  const open = searchFocused && (flat.length > 0 || normalizeQuery(q).length > 0);
  const matchCount = useMemo(
    () => (activeFilters ? index.filter((p) => matchEntry(p, state)).length : index.length),
    [index, sel, q, y0, y1, tags, area, depth],
  );

  const openPerson = (id: string) => {
    selectPerson(id);
    setSearchFocused(false);
  };
  const move = (delta: number) => {
    if (!flat.length) return;
    setActive((i) => (i + delta + flat.length) % flat.length);
  };

  const dynName = (key: string) => dynasties.find((d) => d.key === key)?.name ?? key;

  return (
    <div className="border-b border-jin/15 bg-xuan/90 px-4 py-2.5">
      <span className="sr-only">清除筛选会清掉朝代、关键词、年份、标签、地区和整理程度。地图切片与政区选择由地图页自己恢复。</span>
      <div
        ref={boxRef}
        className="relative w-full"
        onBlur={(e) => {
          if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setSearchFocused(false);
        }}
      >
        <input
          value={q}
          onChange={(e) => searchQuery.set(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1); setSearchFocused(true); }
            if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); setSearchFocused(true); }
            if (e.key === 'Escape') setSearchFocused(false);
            if (e.key === 'Enter' && flat[active]) { e.preventDefault(); openPerson(flat[active].id); }
          }}
          placeholder="搜姓名 / 籍贯 / 标签（繁简通）…"
          aria-label="搜索状元"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-suggestions"
          aria-activedescendant={flat[active] ? `suggest-${flat[active].id}` : undefined}
          className="w-full rounded-full border border-miDim/25 bg-transparent px-3 py-2 font-serif text-sm text-mi placeholder-miDim/50 outline-none focus:border-jin/60"
        />
        <p className="sr-only" role="status">{activeFilters ? `当前匹配 ${matchCount} 人` : ''}</p>
        {open && (
          <div id="search-suggestions" role="listbox" className="absolute right-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-lg border border-jin/25 bg-dai/95 shadow-xl backdrop-blur">
            <p className="border-b border-jin/15 px-3 py-1.5 font-serif text-[11px] text-miDim">当前筛选 {matchCount} 人</p>
            {flat.length === 0 && <p className="px-3 py-3 font-serif text-xs text-miDim">没有匹配的状元</p>}
            {[{ title: '当前筛选', rows: suggestions.inScope }, { title: '其他朝代', rows: suggestions.extra }]
              .filter((g) => g.rows.length)
              .map((g) => (
                <div key={g.title}>
                  {suggestions.extra.length > 0 && <p className="px-3 pt-2 font-serif text-[11px] text-jin/80">{g.title}</p>}
                  <ul>
                    {g.rows.map((p) => {
                      const i = flat.findIndex((x) => x.id === p.id);
                      const on = i === active;
                      return (
                        <li key={p.id} id={`suggest-${p.id}`} role="option" aria-selected={on}>
                          <button
                            type="button"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => openPerson(p.id)}
                            className={`flex w-full items-baseline gap-2 px-3 py-2 text-left font-serif text-xs ${on ? 'bg-jin/15' : ''}`}
                          >
                            <span className="text-mi">{p.name}</span>
                            {p.disputed && <DisputedBadge />}
                            <span className="text-miDim/80">{dynName(p.dynasty)} · {p.exam_year}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 overflow-x-auto">
      <span className="shrink-0 font-serif text-xs tracking-widest text-miDim">朝代</span>
      {dynasties.map((d) => {
        const on = sel.includes(d.key);
        return (
          <button
            key={d.key}
            onClick={() => toggleDynasty(d.key)}
            className={`shrink-0 rounded-full border min-h-11 px-3 font-serif text-sm transition-all md:py-1 ${
              on ? 'border-transparent font-bold' : 'border-miDim/25 text-miDim hover:border-miDim/60'
            }`}
            style={on ? { backgroundColor: d.color, color: '#0E1621' } : { color: d.color }}
          >
            {d.name}
          </button>
        );
      })}
      {activeFilters && (
        <button
          onClick={resetFilters}
          className="shrink-0 rounded-full border border-miDim/40 min-h-11 px-3 font-serif text-sm text-miDim hover:text-mi"
        >
          清除筛选
        </button>
      )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 font-serif text-xs text-miDim">
          年份
          <input
            inputMode="numeric"
            value={y0 ?? ''}
            aria-label="夺魁年起"
            placeholder="起"
            onChange={(e) => yearFrom.set(e.target.value ? Number(e.target.value) : null)}
            className="w-16 rounded border border-miDim/25 bg-transparent px-2 py-1 text-sm text-mi"
          />
          <span>–</span>
          <input
            inputMode="numeric"
            value={y1 ?? ''}
            aria-label="夺魁年止"
            placeholder="止"
            onChange={(e) => yearTo.set(e.target.value ? Number(e.target.value) : null)}
            className="w-16 rounded border border-miDim/25 bg-transparent px-2 py-1 text-sm text-mi"
          />
        </label>
        <label className="flex items-center gap-1 font-serif text-xs text-miDim">
          地区
          <input
            value={area}
            aria-label="籍贯地区"
            placeholder="籍贯含…"
            onChange={(e) => areaQuery.set(e.target.value)}
            className="w-28 rounded border border-miDim/25 bg-transparent px-2 py-1 text-sm text-mi"
          />
        </label>
        <label className="flex items-center gap-1 font-serif text-xs text-miDim">
          整理
          <select
            value={depth}
            aria-label="档案整理程度"
            onChange={(e) => depthFilter.set(e.target.value as '' | 'roster' | 'events' | 'deep')}
            className="rounded border border-miDim/25 bg-transparent px-2 py-1 text-sm text-mi"
          >
            <option value="">不限</option>
            <option value="deep">深度档案</option>
            <option value="events">有事件</option>
            <option value="roster">仅名录</option>
          </select>
        </label>
        <span className="font-serif text-xs text-miDim" role="status">匹配 {matchCount} 人</span>
      </div>
      {tagOptions.length > 0 && (
        <div className="mt-2 flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 font-serif text-xs tracking-widest text-miDim">标签</span>
          {tagOptions.map(([tag, n]) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTag(tag)}
                className={`shrink-0 rounded-full border min-h-9 px-2.5 font-serif text-xs ${on ? 'border-jin bg-jin/20 text-jin' : 'border-miDim/25 text-miDim'}`}
              >
                {tag} {n}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
