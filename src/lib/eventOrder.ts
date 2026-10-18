// 事件阅读顺序与官品曲线可绘判定。浮层与独立人物页共用，不补造年份。

export interface DatedEvent {
  year?: number;
  year_label?: string;
  precision?: 'exact' | 'circa' | 'range' | string;
  rank_grade?: number;
}

/** 可定位年份：有数字年，且不是范围记事。约年可按估计年定位，但不是确切日期。范围年份即使带了起始年，也不能排到可定位年之前。 */
export function hasExactYear(event: DatedEvent): boolean {
  return typeof event.year === 'number' && Number.isFinite(event.year) && event.precision !== 'range';
}

/** 可定位且不是约计。曲线与「确切年份」文案只用这一类。 */
export function isExactYear(event: DatedEvent): boolean {
  return hasExactYear(event) && event.precision !== 'circa';
}

/**
 * 阅读顺序：有数字年且非范围的事件（含约年）按年升序；
 * 范围与没有年份的事件保持原序，整体放在后面。缺年份不按 0 年排到最前。
 */
export function orderEvents<T extends DatedEvent>(events: readonly T[]): T[] {
  const dated: T[] = [];
  const undated: T[] = [];
  events.forEach((event) => (hasExactYear(event) ? dated : undated).push(event));
  dated.sort((a, b) => a.year! - b.year!);
  return [...dated, ...undated];
}

/** 无法可靠定位：范围，或没有数字年。约年不算。 */
export function isUnplaced<T extends DatedEvent>(event: T): boolean {
  return !hasExactYear(event);
}

/** 曲线只收同时有确切年份与品级的事件。约年、范围、未知品级都不入曲线。 */
export function plottableEvents<T extends DatedEvent>(events: readonly T[]): T[] {
  return events.filter((event) => isExactYear(event) && typeof event.rank_grade === 'number');
}

/** 显示：确切年写「N 年」；约年必带「约」，不称确切日期；范围与未详保留原文。 */
export function eventYearText(event: DatedEvent): string {
  if (isExactYear(event)) return `${event.year} 年`;
  if (hasExactYear(event)) {
    const label = event.year_label?.trim();
    if (label && /约/.test(label)) return label;
    return `约 ${event.year} 年`;
  }
  return event.year_label?.trim() || '时间未详';
}
