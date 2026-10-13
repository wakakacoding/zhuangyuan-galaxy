// 仕途桑基（聚合视图）：夺魁后第一站 → 中期流向 → 仕途终点
// 数据：/data/career.json（构建期聚合，n= 标注为诚实口径）
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { SankeyChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { loadCareer, type CareerData } from '../../lib/data';

echarts.use([SankeyChart, TooltipComponent, CanvasRenderer]);

// 列底色：首=青绿 / 中=黛紫 / 终点按性质（宰辅金、殉国朱砂、早逝灰、归隐米…）
const COL_COLOR: Record<string, string> = {
  首: '#5FA8A0',
  中: '#8E7CC3',
};
const FINAL_COLOR: Record<string, string> = {
  宰辅: '#C9A227', 部院高官: '#B8932E', 地方大员: '#7A9E7E',
  学政文教: '#5FA8A0', 归隐: '#F2EAD8', 殉国: '#C03F2B', 早逝: '#5F5E5A', 其他: '#9AA5B1',
};
const nodeColor = (name: string) => {
  const [col, cat] = name.split('·');
  if (col === '终') return FINAL_COLOR[cat] ?? '#9AA5B1';
  return COL_COLOR[col] ?? '#5B6B7F';
};

export default function AggregateSankey() {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [data, setData] = useState<CareerData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { loadCareer().then(setData).catch((e) => setErr(String(e))); }, []);

  useEffect(() => {
    if (!data || !el.current) return;
    if (!chartRef.current) chartRef.current = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chartRef.current.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: '#16233A', borderColor: '#C9A22755',
        textStyle: { color: '#F2EAD8', fontSize: 12, fontFamily: 'serif' },
        formatter: (p: { dataType?: string; data?: { source?: string; target?: string; value?: number; name?: string } }) => {
          const d = p.data ?? {};
          if (p.dataType === 'edge') return `${d.source} → ${d.target}：${d.value} 人`;
          return `${d.name}`;
        },
      },
      series: [{
        type: 'sankey',
        left: 10, right: 96, top: 12, bottom: 12,
        nodeWidth: 14, nodeGap: 10,
        data: data.nodes.map((n) => ({
          name: n.name,
          itemStyle: { color: nodeColor(n.name), borderColor: 'rgba(14,22,33,0.5)', borderWidth: 0.5 },
        })),
        links: data.links,
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.32 },
        label: { color: '#F2EAD8', fontSize: 11, fontFamily: 'serif' },
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.55 } },
      }],
    }, { notMerge: true });
  }, [data]);

  useEffect(() => {
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    if (el.current) ro.observe(el.current);
    return () => ro.disconnect();
  }, []);

  if (err) return <p className="font-serif text-sm text-zhusha">仕途数据加载失败</p>;
  if (!data) return <p className="font-serif text-sm text-miDim">疏浚河道中…</p>;
  if (!data.n) return <p className="font-serif text-sm text-miDim">仕途数据回填中，暂无足够样本绘图。</p>;

  return (
    <div>
      <div ref={el} className="h-[420px] w-full rounded-lg border border-jin/15 bg-xuan/30" />
      <p className="mt-2 font-serif text-[11px] leading-5 text-miDim/70">
        基于已回填仕途的 <span className="text-jin">n={data.n}</span>/{data.total} 人（清代由名录最高官职批量初录，唐宋辽金元明为逐人考据）。
        「首·未详」为夺魁后首授官职失载者。样本目前偏向史料较全的名臣，结论随回填滚动修正。
      </p>
    </div>
  );
}
