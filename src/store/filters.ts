import { atom } from 'nanostores';
import { normalizeQuery } from '../lib/normalize';

// 全局筛选状态：朝代多选 + 关键词。URL 同步见 initUrlSync。
export const selectedDynasties = atom<string[]>([]);
export const searchQuery = atom<string>('');

// 籍贯地图页状态：当前朝代切片 + 选中政区（点击政区滑出名单）
export const mapSlice = atom<string | null>(null);
export const selectedRegion = atom<string | null>(null);
export function setMapSlice(key: string | null) {
  if (mapSlice.get() !== key) {
    mapSlice.set(key);
    selectedRegion.set(null); // 政区随切片切换失效
  }
}
export function setRegion(name: string | null) {
  selectedRegion.set(name);
}

export function toggleDynasty(key: string) {
  const cur = selectedDynasties.get();
  selectedDynasties.set(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
}
export function resetFilters() {
  selectedDynasties.set([]);
  searchQuery.set('');
}

export function matchEntry(
  e: { name: string; dynasty: string; tags: string[]; native_hist: string; native_modern?: string; search_key?: string },
  dynasties: string[], query: string,
): boolean {
  if (dynasties.length && !dynasties.includes(e.dynasty)) return false;
  if (query) {
    const q = normalizeQuery(query);
    if (!q) return true;
    // 优先用构建期生成的繁简归一 search_key；无则现场归一兜底
    const hay = e.search_key
      ?? normalizeQuery(`${e.name}${e.native_hist}${e.native_modern ?? ''}${e.tags.join('')}`);
    if (!hay.includes(q)) return false;
  }
  return true;
}

// URL 双向同步（?dyn=tang,qing&q=苏州&slice=ming&region=苏州府）
let syncing = false;
export function initUrlSync() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const dyn = params.get('dyn');
  if (dyn) selectedDynasties.set(dyn.split(',').filter(Boolean));
  const q = params.get('q');
  if (q) searchQuery.set(q);
  const slice = params.get('slice');
  if (slice) mapSlice.set(slice);
  const region = params.get('region');
  if (region) selectedRegion.set(region);

  const push = () => {
    if (syncing) return;
    const params = new URLSearchParams(window.location.search);
    const d = selectedDynasties.get();
    const q = searchQuery.get();
    const s = mapSlice.get();
    const r = selectedRegion.get();
    if (d.length) params.set('dyn', d.join(',')); else params.delete('dyn');
    if (q) params.set('q', q); else params.delete('q');
    if (s) params.set('slice', s); else params.delete('slice');
    if (r) params.set('region', r); else params.delete('region');
    const url = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  };
  selectedDynasties.subscribe(push);
  searchQuery.subscribe(push);
  mapSlice.subscribe(push);
  selectedRegion.subscribe(push);
}
