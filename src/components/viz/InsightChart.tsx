// 问答页通用图表壳：ECharts 按需（柱/折线），统一深色主题 + n= 角标 + 数据表降级（无障碍）
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export interface ChartRow {
  label: string;
  value: number | null; // null = 无样本，折线如实断开
  color?: string;
  hint?: string; // tooltip 追加信息（如各朝 n）
}

const AXIS_COLOR = 'rgba(154,165,177,0.55)';
const SPLIT_COLOR = 'rgba(154,165,177,0.12)';
const JIN = '#C9A227';

export default function InsightChart({
  type,
  rows,
  n,
  height = 260,
  yName = '',
  ariaLabel,
}: {
  type: 'histogram' | 'line';
  rows: ChartRow[];
  n?: number;
  height?: number;
  yName?: string;
  ariaLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: 'canvas' });
    const labels = rows.map((r) => r.label);
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 42, right: 16, top: 18, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,35,58,0.95)',
        borderColor: 'rgba(201,162,39,0.3)',
        textStyle: { color: '#F2EAD8', fontSize: 12 },
        formatter: (params: unknown) => {
          const p = (params as { dataIndex: number; value: number | null }[])[0];
          const row = rows[p.dataIndex];
          const v = row.value === null ? '无样本' : `${row.value}${yName}`;
          return `${row.label}<br/>${v}${row.hint ? `<br/><span style="color:#9AA5B1">${row.hint}</span>` : ''}`;
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: SPLIT_COLOR } },
        axisTick: { show: false },
        axisLabel: { color: AXIS_COLOR, fontSize: 11, fontFamily: '"Noto Serif SC", serif' },
      },
      yAxis: {
        type: 'value',
        name: yName,
        nameTextStyle: { color: AXIS_COLOR, fontSize: 10 },
        splitLine: { lineStyle: { color: SPLIT_COLOR } },
        axisLabel: { color: AXIS_COLOR, fontSize: 10 },
      },
      series: type === 'histogram'
        ? [{
            type: 'bar',
            data: rows.map((r) => ({
              value: r.value,
              itemStyle: { color: r.color ?? `${JIN}B3`, borderRadius: [2, 2, 0, 0] },
            })),
            barMaxWidth: 36,
          }]
        : [{
            type: 'line',
            data: rows.map((r) => r.value),
            connectNulls: false, // 无样本朝代如实断开
            symbol: 'circle',
            symbolSize: 7,
            lineStyle: { color: JIN, width: 2 },
            itemStyle: { color: JIN, borderColor: '#0E1621', borderWidth: 1.5 },
            label: { show: true, position: 'top', color: AXIS_COLOR, fontSize: 10 },
          }],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); chart.dispose(); };
    // rows 由 SSG 注入，稳定不变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <figure aria-label={ariaLabel}>
      <div ref={el} style={{ height }} className="w-full" role="img" aria-label={ariaLabel} />
      <div className="mt-1 flex items-baseline justify-between">
        <details className="text-[11px] text-miDim/60">
          <summary className="cursor-pointer hover:text-miDim">数据表</summary>
          <table className="mt-1.5 border-collapse font-serif text-[11px] text-miDim">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-miDim/10">
                  <td className="py-0.5 pr-4">{r.label}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{r.value === null ? '无样本' : r.value}</td>
                  {r.hint && <td className="py-0.5 text-miDim/60">{r.hint}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        {n !== undefined && (
          <span className="shrink-0 font-serif text-[11px] text-miDim/70">n = {n}</span>
        )}
      </div>
    </figure>
  );
}
