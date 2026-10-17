// 官职品级参考：横轴年份 × 纵轴官品（正一品顶 → 从九品底）
// 只画同时有确切年份与品级的事件。未知品级不入纵轴，单点不连成走势。
import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { EVENT_COLOR, gradeLabel, type EventItem } from '../../lib/data';
import { hasExactYear, plottableEvents } from '../../lib/eventOrder';

const W = 400, H = 200, PAD_L = 52, PAD_R = 14, PAD_T = 14, BAND_H = 26;
const PLOT_H = H - PAD_T - BAND_H - 8;

export default function CareerRiver({ events }: { events: EventItem[] }) {
  const [hover, setHover] = useState<EventItem | null>(null);

  const { points, band, minYear, maxYear, hasEstimated } = useMemo(() => {
    const graded = plottableEvents(events).sort((a, b) => a.year! - b.year!);
    const ungraded = events.filter((e) => hasExactYear(e) && e.rank_grade === undefined)
      .sort((a, b) => a.year! - b.year!);
    const years = [...graded, ...ungraded].map((e) => e.year!);
    return {
      points: graded,
      band: ungraded,
      minYear: Math.min(...years) - 3,
      maxYear: Math.max(...years) + 3,
      hasEstimated: graded.some((e) => e.estimated),
    };
  }, [events]);

  const x = scaleLinear().domain([minYear, maxYear]).range([PAD_L, W - PAD_R]);
  // 品级 1.0（正一品）置顶，9.5（从九品）置底
  const y = scaleLinear().domain([1, 9.5]).range([PAD_T, PAD_T + PLOT_H]);

  if (!points.length) return null;

  // 两点及以上才连阶梯。单点只标位置，不画虚构走势。
  const path = points.length < 2 ? '' : points.map((p, i) => {
    const px = x(p.year!);
    const py = y(p.rank_grade!);
    if (i === 0) return `M ${px} ${py}`;
    return `H ${px} V ${py}`;
  }).join(' ');

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 品级刻度线（整数品级） */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
          <g key={g}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(g)} y2={y(g)} stroke="#9AA5B1" strokeOpacity={0.12} strokeWidth={0.5} />
            <text x={PAD_L - 4} y={y(g) + 3} textAnchor="end" fontSize={8} fill="#9AA5B1" fontFamily="serif">
              {gradeLabel(g)}
            </text>
          </g>
        ))}
        {/* 阶梯主线：至少两点才画 */}
        {path && <path d={path} fill="none" stroke="#C9A227" strokeWidth={1.6} strokeOpacity={0.85} />}
        {/* 纪事带分隔线 */}
        <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + PLOT_H + 4} y2={PAD_T + PLOT_H + 4} stroke="#9AA5B1" strokeOpacity={0.25} strokeWidth={0.5} strokeDasharray="2 3" />
        <text x={PAD_L - 4} y={PAD_T + PLOT_H + BAND_H - 6} textAnchor="end" fontSize={8} fill="#9AA5B1" fontFamily="serif">纪事</text>
        {/* 纪事带事件（无品级） */}
        {band.map((e, i) => (
          <circle
            key={`b${i}`} cx={x(e.year!)} cy={PAD_T + PLOT_H + BAND_H / 2} r={3}
            fill={EVENT_COLOR[e.type] ?? '#9AA5B1'} fillOpacity={0.7}
            onMouseEnter={() => setHover(e)} onMouseLeave={() => setHover(null)}
          />
        ))}
        {/* 品级事件节点 */}
        {points.map((e, i) => (
          <g key={i} opacity={e.estimated ? 0.55 : 1}>
            {e.type === '夺魁' ? (
              <path
                d={starPath(x(e.year!), y(e.rank_grade!), 5.5)}
                fill="#C9A227" stroke="#F2EAD8" strokeWidth={0.8}
                onMouseEnter={() => setHover(e)} onMouseLeave={() => setHover(null)}
              />
            ) : (
              <circle
                cx={x(e.year!)} cy={y(e.rank_grade!)} r={4}
                fill={EVENT_COLOR[e.type] ?? '#9AA5B1'} stroke="#0E1621" strokeWidth={1}
                onMouseEnter={() => setHover(e)} onMouseLeave={() => setHover(null)}
              />
            )}
          </g>
        ))}
        {/* 首尾年份轴标 */}
        <text x={PAD_L} y={H - 2} fontSize={8} fill="#9AA5B1" fontFamily="serif">{minYear + 3}</text>
        <text x={W - PAD_R} y={H - 2} textAnchor="end" fontSize={8} fill="#9AA5B1" fontFamily="serif">{maxYear - 3}</text>
      </svg>
      {/* 悬停提示 */}
      {hover && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[240px] rounded border border-jin/30 bg-dai/95 px-2.5 py-1.5 shadow-lg">
          <p className="font-serif text-xs text-jin">
            {hover.year ?? hover.year_label} 年 · {hover.type}
            {hover.rank_grade !== undefined && (
              <span className="ml-1 text-miDim">{gradeLabel(hover.rank_grade)}{hover.estimated ? '（推定）' : ''}</span>
            )}
          </p>
          <p className="mt-0.5 font-serif text-xs text-mi">{hover.office ?? hover.title}</p>
        </div>
      )}
      <p className="mt-1 font-kai text-[10px] leading-5 text-miDim/60">
        纵轴只表示官职品级，不代表生活如何。查不到品级的事件不放进这根轴。
        {hasEstimated && '半透明节点的品级是推定（唐宋官品依寄禄官折算，容有出入）。'}
        {points.length === 1 && '目前只有一个可定位的品级，故不连线。'}
      </p>
    </div>
  );
}

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(1)},${(cy + rr * Math.sin(rad)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}
