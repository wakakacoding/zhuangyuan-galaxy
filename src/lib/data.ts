// 数据加载器：构建期产物 JSON 的运行时读取（带缓存）
import { u } from './url';

export interface IndexEntry {
  id: string; name: string; dynasty: string; exam_year: number;
  ganzhi: string; reign?: string;
  native_hist: string; native_modern?: string;
  lat?: number; lng?: number;
  tags: string[]; completeness: number; event_count: number;
  disputed: boolean; bio_short?: string;
  search_key?: string; // 繁简归一搜索串（构建期生成）
}
export interface DynastyMeta {
  key: string; name: string; start: number; end: number; color: string; order: number;
  map_year?: number; map_note?: string; note?: string;
}
export interface EventItem {
  year?: number; year_label?: string; precision: 'exact' | 'circa' | 'range';
  type: string; title: string; description?: string; source_id?: string;
  office?: string; rank_grade?: number; estimated?: boolean;
}
export interface CareerInfo {
  first_office?: string; first_category?: string;
  mid_office?: string; mid_category?: string;
  final_office?: string; final_category?: string;
}
export interface SourceItem {
  id: string; title: string; author?: string; juan?: string; quote?: string;
  tier: 'A' | 'B' | 'C'; url?: string; note?: string;
}
export interface PersonDetailData {
  id: string; name: string; zi?: string; hao?: string;
  birth_year?: number; death_year?: number; birth_circa?: boolean; death_circa?: boolean;
  native_hist: string; native_modern?: string; lat?: number; lng?: number;
  dynasty: string; reign?: string; exam_year: number; ganzhi?: string; ke_ci?: string;
  rank_detail: string; bio_short?: string; tags: string[];
  disputed: boolean; dispute_note?: string;
  career?: CareerInfo;
  events: EventItem[]; sources: SourceItem[];
}

const cache = new Map<string, Promise<unknown>>();
const load = <T>(url: string): Promise<T> => {
  if (!cache.has(url)) {
    cache.set(url, fetch(u(url)).then((r) => {
      if (!r.ok) throw new Error(`加载失败: ${url}`);
      return r.json();
    }));
  }
  return cache.get(url) as Promise<T>;
};

export const loadIndex = () => load<IndexEntry[]>('/data/person-index.json');
export const loadDynasties = () => load<DynastyMeta[]>('/data/dynasties.json');
export const loadStats = () => load<any>('/data/stats.json');
export const loadPerson = (id: string) => load<PersonDetailData>(`/data/person/${id}.json`);

// ---- 籍贯地图（geo.json v2 + 分朝 GeoJSON 切片） ----
export interface GeoPoint {
  id: string; name: string; dynasty: string; exam_year: number;
  lat: number; lng: number; region?: string;
}
export interface GeoData {
  points: GeoPoint[];
  regions: Record<string, { name: string; count: number }[]>;
  centroids: { dynasty: string; lat: number; lng: number; count: number; total: number }[];
  coverage: Record<string, { with_geo: number; assigned: number; total: number }>;
}
export const loadGeo = () => load<GeoData>('/data/geo.json');
export const loadMapSlice = (dynasty: string) => load<GeoJSON.FeatureCollection>(`/data/maps/${dynasty}.json`);
// 注：无审图号的现代矢量层已于 M4 撤除（合规），坐标系改由历史切片兼任

// ---- 关系网络（edges.json v2）与仕途桑基（career.json） ----
export interface EdgeItem {
  from: string; to: string; type: string; note?: string; source_id?: string;
  derived?: boolean; from_name?: string; to_name?: string;
}
export interface CommunityItem { id: number; label: string; members: string[]; size: number }
export interface ExternalItem {
  id: string; name: string; birth_year?: number; death_year?: number;
  index_year?: number; note?: string; kind: 'external';
}
export interface EdgesData { edges: EdgeItem[]; communities: CommunityItem[]; types: string[]; externals?: ExternalItem[] }
export const loadEdges = () => load<EdgesData>('/data/edges.json');

export interface CareerData {
  nodes: { name: string }[];
  links: { source: string; target: string; value: number }[];
  n: number; total: number;
  stage_categories: string[]; final_categories: string[];
}
export const loadCareer = () => load<CareerData>('/data/career.json');

// 关系类型视觉约定（NetworkGraph 与人物帖关系区共用）：色 + 线型
export const RELATION_STYLE: Record<string, { color: string; dash?: number[]; label: string }> = {
  同年: { color: '#5B6B7F', dash: [2, 3], label: '同年' },
  师生: { color: '#5FA8A0', dash: [6, 3], label: '师生' },
  父子: { color: '#C9A227', label: '父子' },
  亲属: { color: '#C9A227', label: '亲属' },
  翁婿: { color: '#B08FC0', label: '翁婿' },
  政敌: { color: '#C03F2B', label: '政敌' },
  同僚: { color: '#8E7CC3', dash: [1, 2], label: '同僚' },
};

// 事件类型配色（人物帖与仕途河流共用）
export const EVENT_COLOR: Record<string, string> = {
  夺魁: '#C9A227', 中举: '#C9A227', 应试: '#9AA5B1',
  授官: '#5FA8A0', 升迁: '#5FA8A0', 实业: '#5FA8A0',
  贬谪: '#C03F2B', 致仕: '#9AA5B1', 著作: '#8E7CC3',
  卒: '#5F5E5A', 轶事: '#B08FC0',
};

// 官品 → 中文标签（整数品级标注，半品为「从」）
export function gradeLabel(g: number): string {
  const zheng = Number.isInteger(g);
  return `${zheng ? '正' : '从'}${'一二三四五六七八九'[Math.floor(g) - 1]}品`;
}
