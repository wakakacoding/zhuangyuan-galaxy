// 事件阅读顺序与官品曲线可绘判定。浮层与独立人物页共用，不补造年份。

export interface DatedEvent {
  year?: number;
  year_label?: string;
  precision?: 'exact' | 'circa' | 'range' | string;
  rank_grade?: number;
}

/** 确切年份：有数字年，且不是范围记事。范围年份即使带了起始年，也不能排到确切年之前。 */
export function hasExactYear(event: DatedEvent): boolean {
  return typeof event.year === 'number' && Number.isFinite(event.year) && event.precision !== 'range';
}

/**
 * 阅读顺序：确切年份按年升序；范围、约计与没有年份的事件保持原序，整体放在确切年份之后。
 * 缺年份不按 0 年排到最前。
 */
export function orderEvents<T extends DatedEvent>(events: readonly T[]): T[] {
  const dated: T[] = [];
  const undated: T[] = [];
  events.forEach((event) => (hasExactYear(event) ? dated : undated).push(event));
  dated.sort((a, b) => a.year! - b.year!);
  return [...dated, ...undated];
}

/** 曲线只收同时有确切年份与品级的事件。未知品级不当最低品。 */
export function plottableEvents<T extends DatedEvent>(events: readonly T[]): T[] {
  return events.filter((event) => hasExactYear(event) && typeof event.rank_grade === 'number');
}

export function eventYearText(event: DatedEvent): string {
  if (hasExactYear(event)) return `${event.year} 年`;
  return event.year_label?.trim() || '时间未详';
}
