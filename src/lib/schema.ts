import { z } from 'zod';

// ============ 朝代 ============
export const DYNASTY_KEYS = ['tang', 'wudai', 'liao', 'song', 'jin', 'yuan', 'ming', 'qing'] as const;
export type DynastyKey = (typeof DYNASTY_KEYS)[number];

export const DynastySchema = z.object({
  key: z.enum(DYNASTY_KEYS),
  name: z.string(),
  start: z.number(),
  end: z.number(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order: z.number(),
  map_year: z.number().optional(), // CHGIS 切片年（籍贯地图页用）
  map_note: z.string().optional(), // 该朝底图说明（如辽代政区暂缺）
  note: z.string().optional(),
});
export type Dynasty = z.infer<typeof DynastySchema>;

// ============ 事件 ============
export const EVENT_TYPES = [
  '应试', '中举', '夺魁', '授官', '升迁', '贬谪', '实业', '致仕', '著作', '卒', '轶事',
] as const;

export const EventSchema = z.object({
  year: z.number().optional(),
  year_label: z.string().optional(), // 年间描述，如 "嘉靖年间"
  precision: z.enum(['exact', 'circa', 'range']).default('exact'),
  type: z.enum(EVENT_TYPES),
  title: z.string(),
  description: z.string().optional(),
  office: z.string().optional(), // 官职名（与事件标题分离，仕途河流用）
  rank_grade: z.number().min(1).max(9.5).optional(), // 官品：1.0=正一品 … 9.5=从九品，0.5 步进，越小越高
  estimated: z.boolean().optional(), // rank_grade 为推定值（UI 半透明 + 图注）
  source_id: z.string().optional(),
});
export type PersonEvent = z.infer<typeof EventSchema>;

// ============ 仕途轻量字段（聚合桑基用，不必全量事件流） ============
// 首授/中期流向分类（夺魁后第一站 → 中期流向）
export const CAREER_STAGE_CATEGORIES = ['翰林院', '部院', '地方', '军职', '学政文教', '其他'] as const;
// 仕途终点分类
export const CAREER_FINAL_CATEGORIES = ['宰辅', '部院高官', '地方大员', '学政文教', '归隐', '殉国', '早逝', '其他'] as const;

const CareerFact = z.object({
  office: z.string().optional(),
  category: z.string().optional(),
  year: z.number().optional(),
  year_label: z.string().optional(),
  source_id: z.string().regex(/^s\d{4}$/).optional(),
  note: z.string().optional(),
});

export const CareerSchema = z.object({
  first_office: z.string().optional(), // 夺魁后首授官职
  first_category: z.enum(CAREER_STAGE_CATEGORIES).optional(),
  mid_office: z.string().optional(), // 中期代表官职
  mid_category: z.enum(CAREER_STAGE_CATEGORIES).optional(),
  final_office: z.string().optional(), // 旧字段：官职、去向或死亡混用，不再当作唯一结局
  final_category: z.enum(CAREER_FINAL_CATEGORIES).optional(),
  // N1-08：最高官与末任分开。缺省表示尚未迁移，不能从 final_* 自动填。
  highest: CareerFact.optional(),
  last: CareerFact.optional(),
});

// LIFE-09：三个维度分开计数。旧 final_category 保留，不自动改写。
export const OFFICE_BANDS = ['宰辅与执政', '部院', '地方', '翰林文教', '其他官职', '待核'] as const;
export const LIFE_PATHS = ['归隐或讲学', '实业', '待核'] as const;
export const DEATH_EVENTS = ['殉职或死事', '早逝', '待核'] as const;
export type Career = z.infer<typeof CareerSchema>;

// ============ 人物 ============
export const PersonSchema = z.object({
  id: z.string().regex(/^z\d{4}$/),
  name: z.string(),
  zi: z.string().optional(),
  hao: z.string().optional(),
  birth_year: z.number().optional(),
  death_year: z.number().optional(),
  birth_circa: z.boolean().default(false),
  death_circa: z.boolean().default(false),
  native_hist: z.string(),
  native_modern: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  dynasty: z.enum(DYNASTY_KEYS),
  reign: z.string().optional(),
  exam_year: z.number(),
  ganzhi: z.string().optional(), // 构建期自动补齐
  ke_ci: z.string().optional(),
  rank_detail: z.string().default('一甲第一名（状元）'),
  bio_short: z.string().optional(),
  tags: z.array(z.string()).default([]),
  disputed: z.boolean().default(false), // 状元身份存疑
  dispute_note: z.string().optional(),
  research_status: z.enum(['uncompiled', 'compiled', 'disputed']).default('uncompiled'),
  career: CareerSchema.optional(), // 仕途轻量字段（聚合桑基用）
  events: z.array(EventSchema).default([]),
});
export type Person = z.infer<typeof PersonSchema>;

// ============ 出处 ============
export const SourceSchema = z.object({
  id: z.string().regex(/^s\d{4}$/),
  title: z.string(),
  author: z.string().optional(),
  juan: z.string().optional(),
  quote: z.string().optional(),
  tier: z.enum(['A', 'B', 'C']),
  /** 核对程度：缺省 unverified。A 级不等于已核到卷次与引文。 */
  check: z.enum(['unverified', 'located', 'quoted']).default('unverified'),
  url: z.string().optional(),
  note: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

// ============ 精选阅读（人工撰写；审核状态不能代替证据核对） ============
export const ReadingSchema = z.object({
  id: z.string().regex(/^r\d{4}$/),
  person_id: z.string().regex(/^z\d{4}$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  order: z.number().int().positive(),
  status: z.enum(['draft', 'reviewed']),
  paragraphs: z.array(z.object({
    text: z.string().min(1),
    source_ids: z.array(z.string().regex(/^s\d{4}$/)).min(1),
  })).min(1),
});
export type Reading = z.infer<typeof ReadingSchema>;

// ============ 关系 ============
export const RELATION_TYPES = ['同年', '师生', '父子', '亲属', '翁婿', '政敌', '同僚'] as const;
export const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(RELATION_TYPES),
  note: z.string().optional(),
  source_id: z.string().optional(),
});
export type Relation = z.infer<typeof RelationSchema>;

// ============ 外延人物（M5 T4：非状元但与状元有关系者；stub 档案，不入星图/统计分母） ============
export const ExternalSchema = z.object({
  id: z.string().regex(/^w\d{4}$/),
  name: z.string(),
  cbdb_id: z.number().optional(),
  birth_year: z.number().optional(),
  death_year: z.number().optional(),
  index_year: z.number().optional(), // CBDB 指数年（生平中点估计）
  note: z.string().optional(),
  source_id: z.string().optional(),
});
export type External = z.infer<typeof ExternalSchema>;

// ============ 关系图编译产物（edges.json v2） ============
export interface Edge {
  from: string;
  to: string;
  type: (typeof RELATION_TYPES)[number];
  note?: string;
  source_id?: string;
  derived?: boolean; // 构建期自动派生（同年同科），非人工考据
  from_name?: string;
  to_name?: string;
}

export interface Community {
  id: number;
  label: string; // 自动命名：籍贯+姓氏圈，如「常熟翁氏圈」
  members: string[];
  size: number;
}

export interface EdgesFile {
  edges: Edge[];
  communities: Community[]; // 按 size 降序；成员 <3 的碎片社区不入列
  types: string[];
  externals?: ExternalIndexEntry[]; // 外延人物节点（M5）：网络图可选渲染
}

export interface ExternalIndexEntry {
  id: string;
  name: string;
  birth_year?: number;
  death_year?: number;
  index_year?: number;
  note?: string;
  kind: 'external';
}

// ============ 地名映射 ============
export interface Placename {
  hist: string;
  modern: string;
  lat: number;
  lng: number;
}

// ============ 骨架名录（seed CSV 行） ============
export const RosterRowSchema = z.object({
  name: z.string(),
  dynasty: z.enum(DYNASTY_KEYS),
  exam_year: z.number(),
  native_hist: z.string().default(''),
  reign: z.string().default(''),
  tags: z.string().default(''),
});
export type RosterRow = z.infer<typeof RosterRowSchema>;

// ============ 编译产物类型 ============
export interface PersonIndexEntry {
  id: string;
  name: string;
  dynasty: DynastyKey;
  exam_year: number;
  ganzhi: string;
  reign?: string;
  native_hist: string;
  native_modern?: string;
  lat?: number;
  lng?: number;
  tags: string[];
  completeness: number; // 0-1 史料丰富度
  event_count: number;
  disputed: boolean;
  bio_short?: string;
  search_key?: string; // 繁简归一后的搜索匹配串（构建期生成）
}

export interface PersonDetail extends Person {
  sources: Source[]; // 该人物引用到的出处
}
