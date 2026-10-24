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
  /**
   * 证据状态（v1 契约）：primary=已核原文/一手；secondary=二手转录；pending=待证。
   * 缺省不等于 primary——缺 source_id 的事件按 pending 展示，不得默认当作已证。
   */
  evidence: z.enum(['primary', 'secondary', 'pending']).optional(),
});
export type PersonEvent = z.infer<typeof EventSchema>;

// ============ 仕途与结局事实（v1 数据契约，见 docs/数据契约-v1.md） ============
// 首授/中期流向分类（夺魁后第一站 → 中期流向）
export const CAREER_STAGE_CATEGORIES = ['翰林院', '部院', '地方', '军职', '学政文教', '其他'] as const;
// 仕途终点分类（旧字段 final_category 沿用，只读）
export const CAREER_FINAL_CATEGORIES = ['宰辅', '部院高官', '地方大员', '学政文教', '归隐', '殉国', '早逝', '其他'] as const;

// LIFE-09：三个维度分开计数。旧 final_category 保留，不自动改写。
export const OFFICE_BANDS = ['宰辅与执政', '部院', '地方', '翰林文教', '其他官职', '待核'] as const;
export const LIFE_PATHS = ['归隐或讲学', '实业', '待核'] as const;
export const DEATH_EVENTS = ['殉职或死事', '早逝', '待核'] as const;

/**
 * 事实状态：recorded=有值；unknown=已检索但未见记载。
 * 字段整体缺省 = **尚未迁移**（既不是"有值"，也不是"未知"），三者不可互相代替。
 */
export const FACT_STATUS = ['recorded', 'unknown'] as const;

type FactLike = {
  status?: (typeof FACT_STATUS)[number];
  office?: string;
  category?: string;
  year?: number;
  year_label?: string;
  precision?: 'exact' | 'circa' | 'range';
  source_id?: string;
  note?: string;
};

const factChecks = (v: FactLike, ctx: z.RefinementCtx) => {
  const status = v.status ?? 'recorded';
  if (status === 'unknown') {
    if (v.office || v.category) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'status=unknown 时不得同时写 office/category（未知不等于有值）' });
    }
    if (!v.note?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'status=unknown 必须写 note，说明检索范围或依据' });
    }
  } else if (!v.office && !v.category) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'status=recorded 必须至少有 office 或 category' });
  }
  if (v.year !== undefined && v.year_label) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'year 与 year_label 不能同时写（择一，避免两种时间口径并存）' });
  }
};

const CareerFactBase = z.object({
  status: z.enum(FACT_STATUS).optional(),
  office: z.string().optional(),
  category: z.string().optional(),
  year: z.number().optional(),
  year_label: z.string().optional(),
  precision: z.enum(['exact', 'circa', 'range']).optional(),
  source_id: z.string().regex(/^s\d{4}$/).optional(),
  note: z.string().optional(),
});

/** 最高官 / 末任：有值写 office（category 可选），无值写 status=unknown + note。 */
export const CareerFactSchema = CareerFactBase.superRefine(factChecks);
/** 去向：category 取 LIFE_PATHS。 */
export const WhereaboutsFactSchema = CareerFactBase.extend({ category: z.enum(LIFE_PATHS).optional() }).superRefine(factChecks);
/** 死亡：category 取 DEATH_EVENTS。 */
export const DeathFactSchema = CareerFactBase.extend({ category: z.enum(DEATH_EVENTS).optional() }).superRefine(factChecks);

export const CareerSchema = z.object({
  first_office: z.string().optional(), // 夺魁后首授官职
  first_category: z.enum(CAREER_STAGE_CATEGORIES).optional(),
  mid_office: z.string().optional(), // 中期代表官职
  mid_category: z.enum(CAREER_STAGE_CATEGORIES).optional(),
  final_office: z.string().optional(), // 旧字段：官职、去向或死亡混用，只读；不得据此推导下面四维
  final_category: z.enum(CAREER_FINAL_CATEGORIES).optional(),
  // 四维事实（v1）：字段缺省 = 尚未迁移，不能从 final_* 自动填。
  highest: CareerFactSchema.optional(),
  last: CareerFactSchema.optional(),
  whereabouts: WhereaboutsFactSchema.optional(),
  death: DeathFactSchema.optional(),
});
export type Career = z.infer<typeof CareerSchema>;
export type CareerFact = z.infer<typeof CareerFactSchema>;

// ============ 整理状态与身份争议：两个正交轴（v1 契约） ============
/**
 * 整理状态只描述"本站做到哪一步"，不描述史料真假：
 * - uncompiled 未整理：尚未系统检索/录入
 * - searched   已检索未获：查过（范围见 research_note），未取得可核材料
 * - compiled   已整理：有档案且断言逐条挂源（不等于全部审核通过）
 * 身份存疑不是整理状态，走 disputed 布尔 + dispute_note，两者可同时为真。
 */
export const RESEARCH_STATUS = ['uncompiled', 'searched', 'compiled'] as const;

/** 争议的断言粒度（v1 预留，T06 起用）：区分"状元身份存疑"与"进士及第并不存疑"。 */
export const DISPUTE_CLAIM_TYPES = ['夺魁', '进士及第', '名次', '生年', '卒年', '籍贯', '关系'] as const;
export const DISPUTE_CLAIM_STATUS = ['confirmed', 'disputed', 'insufficient'] as const;
export const DisputeClaimSchema = z.object({
  claim: z.enum(DISPUTE_CLAIM_TYPES),
  value: z.string(),
  status: z.enum(DISPUTE_CLAIM_STATUS),
  source_ids: z.array(z.string().regex(/^s\d{4}$/)).default([]),
  note: z.string().optional(),
});

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
  // v1.1（2026-10-23，T02 D4 裁定）：删除默认值，仅在核到名次明文（出处 juan+quote 含「第一/状元/榜首」类字样）时写入；
  // 缺省 = 未核到名次，不携带任何机器可读的状元断言。旧默认值「一甲第一名（状元）」曾覆盖 656/656 且对唐五代属时代错置。
  rank_detail: z.string().optional(),
  bio_short: z.string().optional(),
  tags: z.array(z.string()).default([]),
  disputed: z.boolean().default(false), // 状元身份存疑（与 research_status 正交）
  dispute_note: z.string().optional(),
  dispute_claims: z.array(DisputeClaimSchema).optional(), // 断言级争议（v1 预留）
  research_status: z.enum(RESEARCH_STATUS).default('uncompiled'),
  research_note: z.string().optional(), // searched 必须写检索范围与结论
  research_checked_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  career: CareerSchema.optional(), // 仕途轻量字段 + 四维结局（聚合桑基用）
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
  /**
   * 出处等级（v1.1，T02 D1 裁定）：
   * A  = 一手：正史/题名碑/朱卷/登科录
   * A- = 权威学术编纂（辑佚/汇考，如《登科记考》）：非一手，但为该领域的整理基准
   * B  = 地方志/年谱/日记/整理名录；C = 笔记小说/民间传说
   */
  tier: z.enum(['A', 'A-', 'B', 'C']),
  /** 核对程度：缺省 unverified。A 级不等于已核到卷次与引文；A- 同样要求 juan+quote 才能标 quoted。 */
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
// v1.1（2026-10-24，T14 契约启用）：座主/师承/荐举三类落地。
// 有方向（from 为上位方）：父子=父→子，翁婿=岳父→女婿，座主=座主→门生，师承=师→弟子。
// 无方向：亲属/同年/同僚/政敌/荐举（from/to 不表示谁对谁；note 保留原方向记述）。
// 旧类型「师生」保留为兼容类型；CBDB 条目只够支持「荐举」，座主/师承须卷次或篇目级出处。
export const RELATION_TYPES = ['同年', '师生', '座主', '师承', '荐举', '父子', '亲属', '翁婿', '政敌', '同僚'] as const;
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
