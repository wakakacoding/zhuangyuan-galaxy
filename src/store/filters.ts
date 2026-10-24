import { atom } from 'nanostores';
import { normalizeQuery } from '../lib/normalize';
import { writeHistory, bindPopState } from './history';

// 全局筛选。四维契约见 docs/筛选契约-T15.md，页面只读这些原子，不自己拼参数。
// URL：?dyn=tang,qing&q=苏州&y=1400-1600&tag=三元及第,早逝&area=苏州&depth=deep&slice=ming&region=苏州府
export const selectedDynasties = atom<string[]>([]);
export const searchQuery = atom<string>('');
export const yearFrom = atom<number | null>(null);
export const yearTo = atom<number | null>(null);
export const selectedTags = atom<string[]>([]);
export const areaQuery = atom<string>('');
/** roster=仅名录（无事件）／events=有事件但不足深档／deep=事件≥3。空=不限。 */
export const depthFilter = atom<'' | 'roster' | 'events' | 'deep'>('');

export interface FilterEntry {
  name: string; dynasty: string; tags: string[];
  native_hist: string; native_modern?: string;
  exam_year?: number; event_count?: number; search_key?: string;
}
export interface FilterState {
  dynasties?: string[];
  query?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  tags?: string[];
  area?: string;
  depth?: '' | 'roster' | 'events' | 'deep';
}

const DEPTHS = new Set(['roster', 'events', 'deep']);
const yearOf = (raw: string | null): number | null => {
  if (!raw || !/^\d{3,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 600 && n <= 1912 ? n : null;
};
const splitList = (raw: string | null) => (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function readFilters(params: URLSearchParams): Required<FilterState> {
  const y = params.get('y') ?? '';
  const [a, b] = y.split('-');
  const depth = params.get('depth') ?? '';
  return {
    dynasties: splitList(params.get('dyn')),
    query: params.get('q') ?? '',
    yearFrom: yearOf(a),
    yearTo: yearOf(b),
    tags: splitList(params.get('tag')),
    area: params.get('area') ?? '',
    depth: DEPTHS.has(depth) ? depth as 'roster' | 'events' | 'deep' : '',
  };
}

export function writeFilters(params: URLSearchParams, f: Required<FilterState>) {
  if (f.dynasties.length) params.set('dyn', f.dynasties.join(',')); else params.delete('dyn');
  if (f.query) params.set('q', f.query); else params.delete('q');
  if (f.yearFrom != null || f.yearTo != null) params.set('y', `${f.yearFrom ?? ''}-${f.yearTo ?? ''}`);
  else params.delete('y');
  if (f.tags.length) params.set('tag', f.tags.join(',')); else params.delete('tag');
  if (f.area) params.set('area', f.area); else params.delete('area');
  if (f.depth) params.set('depth', f.depth); else params.delete('depth');
}

export function currentFilters(): Required<FilterState> {
  return {
    dynasties: selectedDynasties.get(),
    query: searchQuery.get(),
    yearFrom: yearFrom.get(),
    yearTo: yearTo.get(),
    tags: selectedTags.get(),
    area: areaQuery.get(),
    depth: depthFilter.get(),
  };
}

function applyFilters(f: Required<FilterState>) {
  selectedDynasties.set(f.dynasties);
  searchQuery.set(f.query);
  yearFrom.set(f.yearFrom);
  yearTo.set(f.yearTo);
  selectedTags.set(f.tags);
  areaQuery.set(f.area);
  depthFilter.set(f.depth);
}

// 籍贯地图页状态：当前朝代切片 + 选中政区（点击政区滑出名单）
export const mapSlice = atom<string | null>(null);
export const selectedRegion = atom<string | null>(null);
/** 从人物页带来的定位请求。没有坐标时不设置。 */
export const focusPersonId = atom<string | null>(null);
export function setFocusPerson(id: string | null) {
  focusPersonId.set(id);
}
export function setMapSlice(key: string | null) {
  if (mapSlice.get() !== key) {
    mapSlice.set(key);
    selectedRegion.set(null); // 政区随切片切换失效
  }
}
export function setRegion(name: string | null) {
  const prev = selectedRegion.get();
  selectedRegion.set(name);
  const kind = name && name !== prev ? 'region-open' : 'region-close';
  writeHistory((params) => {
    if (name) params.set('region', name); else params.delete('region');
  }, kind);
}

export function toggleDynasty(key: string) {
  const cur = selectedDynasties.get();
  selectedDynasties.set(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
}
export function toggleTag(tag: string) {
  const cur = selectedTags.get();
  selectedTags.set(cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]);
}
export function resetFilters() {
  selectedDynasties.set([]);
  searchQuery.set('');
  yearFrom.set(null);
  yearTo.set(null);
  selectedTags.set([]);
  areaQuery.set('');
  depthFilter.set('');
}

export function filtersActive(f: FilterState = currentFilters()): boolean {
  return Boolean(
    (f.dynasties?.length ?? 0) || (f.query ?? '').trim()
    || f.yearFrom != null || f.yearTo != null
    || (f.tags?.length ?? 0) || (f.area ?? '').trim() || f.depth,
  );
}

/** 生产匹配。旧的 (entry, dynasties, query) 调用仍然有效，缺省的维度等于不限。 */
export function matchEntry(e: FilterEntry, dynasties: string[] | FilterState = [], query = ''): boolean {
  const f: FilterState = Array.isArray(dynasties) ? { dynasties, query } : dynasties;
  if (f.dynasties?.length && !f.dynasties.includes(e.dynasty)) return false;
  if (f.query) {
    const q = normalizeQuery(f.query);
    if (q) {
      const hay = e.search_key
        ?? normalizeQuery(`${e.name}${e.native_hist}${e.native_modern ?? ''}${e.tags.join('')}`);
      if (!hay.includes(q)) return false;
    }
  }
  if (f.yearFrom != null && (e.exam_year ?? 0) < f.yearFrom) return false;
  if (f.yearTo != null && (e.exam_year ?? 9999) > f.yearTo) return false;
  if (f.tags?.length && !f.tags.every((t) => e.tags.includes(t))) return false;
  if (f.area?.trim()) {
    const a = normalizeQuery(f.area);
    // 只看籍贯。search_key 里还有姓名和标签，拿来当地名会把人名字面含地名的人算进来。
    const place = normalizeQuery(`${e.native_hist}${e.native_modern ?? ''}`);
    if (a && !place.includes(a)) return false;
  }
  if (f.depth) {
    const n = e.event_count ?? 0;
    if (f.depth === 'roster' && n !== 0) return false;
    if (f.depth === 'events' && !(n > 0 && n < 3)) return false;
    if (f.depth === 'deep' && n < 3) return false;
  }
  return true;
}

// URL 双向同步。筛选变化用 replace，不打断前进后退里的人物与政区步骤。
let syncing = false;
export function initUrlSync() {
  if (typeof window === 'undefined') return;
  const boot = readFilters(new URLSearchParams(window.location.search));
  applyFilters(boot);
  const slice = new URLSearchParams(window.location.search).get('slice');
  if (slice) mapSlice.set(slice);
  const region = new URLSearchParams(window.location.search).get('region');
  if (region) selectedRegion.set(region);
  const focus = new URLSearchParams(window.location.search).get('focus');
  if (focus) focusPersonId.set(focus);

  const push = () => {
    if (syncing) return;
    const params = new URLSearchParams(window.location.search);
    writeFilters(params, currentFilters());
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const onMap = path.endsWith('/map');
    const s = onMap ? mapSlice.get() : null;
    const r = onMap ? selectedRegion.get() : null;
    if (s) params.set('slice', s); else params.delete('slice');
    if (r) params.set('region', r); else params.delete('region');
    const focus = onMap ? focusPersonId.get() : null;
    if (focus) params.set('focus', focus); else params.delete('focus');
    const url = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  };
  selectedDynasties.subscribe(push);
  searchQuery.subscribe(push);
  yearFrom.subscribe(push);
  yearTo.subscribe(push);
  selectedTags.subscribe(push);
  areaQuery.subscribe(push);
  depthFilter.subscribe(push);
  mapSlice.subscribe(push);
  selectedRegion.subscribe(push);
  focusPersonId.subscribe(push);
  bindPopState((params) => {
    syncing = true;
    applyFilters(readFilters(params));
    mapSlice.set(params.get('slice'));
    selectedRegion.set(params.get('region'));
    focusPersonId.set(params.get('focus'));
    syncing = false;
    const state = window.history.state as { personStack?: string[] } | null;
    const person = params.get('p');
    const stack = state?.personStack ?? (person ? [person] : []);
    import('./selection').then((m) => m.restorePersonStack(stack));
  });
}
