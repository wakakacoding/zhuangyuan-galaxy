// 关系网络：ECharts Graph（force + Canvas）
// 节点=有关系的状元（朝代色，大小∝丰富度，深档描金边）；边=7 类关系（色/线型区分）
// 交互：类型多选 + 全局朝代/搜索筛选（未命中降透明度）；单击开帖；双击 ego 二度聚焦；Top5 社区标注
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import * as echarts from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { selectedDynasties, searchQuery, yearFrom, yearTo, selectedTags, areaQuery, depthFilter, currentFilters, matchEntry } from '../../store/filters';
import { selectPerson } from '../../store/selection';
import { canOpenPerson } from '../../lib/openable';
import {
  loadEdges, loadIndex, loadDynasties, invalidateLoad, RELATION_STYLE,
  type EdgesData, type IndexEntry, type DynastyMeta, type EdgeItem,
} from '../../lib/data';
import GuidePopover from '../shell/GuidePopover';

echarts.use([GraphChart, TooltipComponent, CanvasRenderer]);

const DIM = 0.07; // 未命中/非聚焦的透明度（与星图 8% 行为一致）

export default function NetworkGraph() {
  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [data, setData] = useState<EdgesData | null>(null);
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [dynasties, setDynasties] = useState<DynastyMeta[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [offTypes, setOffTypes] = useState<Set<string>>(new Set()); // 被关闭的关系类型
  const [egoId, setEgoId] = useState<string | null>(null);
  const [activeComm, setActiveComm] = useState<number | null>(null);
  const [showExternals, setShowExternals] = useState(false); // 默认「仅状元」，外延人物按需展开
  const [pickedId, setPickedId] = useState<string | null>(null);

  const dynFilter = useStore(selectedDynasties);
  const query = useStore(searchQuery);
  const y0 = useStore(yearFrom);
  const y1 = useStore(yearTo);
  const tags = useStore(selectedTags);
  const area = useStore(areaQuery);
  const depth = useStore(depthFilter);

  // ---------- 数据加载 ----------
  useEffect(() => {
    let dead = false;
    invalidateLoad('/data/edges.json');
    invalidateLoad('/data/person-index.json');
    invalidateLoad('/data/dynasties.json');
    (async () => {
      try {
        const [e, idx, d] = await Promise.all([loadEdges(), loadIndex(), loadDynasties()]);
        if (dead) return;
        setData(e); setIndex(idx); setDynasties(d);
      } catch (err) {
        if (!dead) setLoadError(err instanceof Error ? err.message : '数据加载失败');
      }
    })();
    return () => { dead = true; };
  }, [attempt]);

  const personById = useMemo(() => new Map(index.map((p) => [p.id, p])), [index]);
  const externalById = useMemo(
    () => new Map((data?.externals ?? []).map((e) => [e.id, e])),
    [data],
  );
  const dynColor = useMemo(() => new Map(dynasties.map((d) => [d.key, d.color])), [dynasties]);
  const dynName = useMemo(() => new Map(dynasties.map((d) => [d.key, d.name])), [dynasties]);

  // URL 初始化（?types=关闭集&ego=id）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('nt'); // 关闭的类型（network types off，避免与全局筛选冲突）
    if (t) setOffTypes(new Set(t.split(',').filter(Boolean)));
    const ego = params.get('ego');
    if (ego) setEgoId(ego);
    if (params.get('nx') === '1') setShowExternals(true);
  }, []);

  // URL 同步
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (offTypes.size) params.set('nt', [...offTypes].join(',')); else params.delete('nt');
    if (egoId) params.set('ego', egoId); else params.delete('ego');
    if (showExternals) params.set('nx', '1'); else params.delete('nx');
    const url = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState(null, '', url);
  }, [offTypes, egoId, showExternals]);

  // ---------- 图数据加工 ----------
  const activeEdges = useMemo(
    () => (data?.edges ?? []).filter((e) =>
      !offTypes.has(e.type) &&
      (showExternals || (personById.has(e.from) && personById.has(e.to)))),
    [data, offTypes, showExternals, personById],
  );
  const connectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of activeEdges) { s.add(e.from); s.add(e.to); }
    return s;
  }, [activeEdges]);

  // ego 二度邻域
  const egoSet = useMemo(() => {
    if (!egoId || !data) return null;
    const one = new Set([egoId]);
    for (const e of data.edges) {
      if (e.from === egoId) one.add(e.to);
      if (e.to === egoId) one.add(e.from);
    }
    const two = new Set(one);
    for (const e of data.edges) {
      if (one.has(e.from)) two.add(e.to);
      if (one.has(e.to)) two.add(e.from);
    }
    return two;
  }, [egoId, data]);

  const commMembers = useMemo(() => {
    if (activeComm === null || !data) return null;
    const c = data.communities.find((c) => c.id === activeComm);
    return c ? new Set(c.members) : null;
  }, [activeComm, data]);

  const focusSet = egoSet ?? commMembers; // 当前聚焦集（ego 优先）

  // ---------- 渲染 ----------
  useEffect(() => {
    if (!data || !index.length || !dynasties.length || !chartEl.current) return;
    if (!chartRef.current) {
      chartRef.current = echarts.init(chartEl.current, undefined, { renderer: 'canvas' });
      const pickId = (p: unknown): string | null => {
        const d = (p as { dataType?: string; data?: unknown }).data;
        if ((p as { dataType?: string }).dataType !== 'node' || !d || typeof d !== 'object') return null;
        const id = (d as { id?: unknown }).id;
        return typeof id === 'string' ? id : null;
      };
      chartRef.current.on('click', (p) => {
        const id = pickId(p);
        if (id) setPickedId(id);
      });
      chartRef.current.on('dblclick', (p) => {
        const id = pickId(p);
        if (id) setEgoId((cur) => (cur === id ? null : id));
      });
    }
    const chart = chartRef.current;

    const pass = (id: string): boolean => {
      if (externalById.has(id)) return true; // 外延人物不受朝代/搜索筛选影响
      const p = personById.get(id);
      if (!p) return false;
      return matchEntry(p, currentFilters());
    };

    const nodes = [...connectedIds].map((id) => {
      const ext = externalById.get(id);
      if (ext) {
        // 外延节点：小圆点、灰调、虚线描边，视觉降级以区分主线
        const dim = focusSet ? !focusSet.has(id) : false;
        return {
          id,
          name: ext.name,
          symbolSize: 6,
          itemStyle: {
            color: '#8B93A1',
            borderColor: 'rgba(242,234,216,0.55)',
            borderWidth: 1,
            borderType: 'dashed' as const,
            opacity: dim ? DIM : 0.9,
          },
          label: { color: '#B9C0CC', fontSize: 10 },
        };
      }
      const p = personById.get(id)!;
      const dim = !pass(id) || (focusSet ? !focusSet.has(id) : false);
      const deep = p.event_count >= 3;
      return {
        id,
        name: p.name,
        symbolSize: 7 + p.completeness * 12,
        itemStyle: {
          color: dynColor.get(p.dynasty) ?? '#666',
          borderColor: deep ? '#C9A227' : 'rgba(14,22,33,0.6)',
          borderWidth: deep ? 1.6 : 0.6,
          opacity: dim ? DIM : 1,
        },
        label: { color: '#F2EAD8', fontSize: 11 },
      };
    });
    const links = activeEdges.map((e: EdgeItem) => {
      const st = RELATION_STYLE[e.type] ?? { color: '#9AA5B1' };
      const dim = !pass(e.from) || !pass(e.to)
        || (focusSet ? !(focusSet.has(e.from) && focusSet.has(e.to)) : false);
      return {
        source: e.from, target: e.to,
        lineStyle: {
          color: st.color, width: e.derived ? 1 : 1.6,
          type: (st.dash ? 'dashed' : 'solid') as 'dashed' | 'solid',
          curveness: 0.08, opacity: dim ? DIM : 0.85,
        },
        note: e.note, relType: e.type,
      };
    });

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: '#16233A', borderColor: '#C9A22755',
        textStyle: { color: '#F2EAD8', fontSize: 12, fontFamily: 'serif' },
        formatter: (params: { dataType?: string; data?: Record<string, unknown> }) => {
          const d = params.data ?? {};
          if (params.dataType === 'edge') {
            return `${d.relType}：${String(d.note ?? '')}`;
          }
          const p = personById.get(String(d.id));
          if (!p) {
            const ext = externalById.get(String(d.id));
            if (ext) return `${ext.name}<br/><span style="opacity:.7">外延人物（非状元）${ext.note ? '：' + ext.note : ''}</span>`;
            return String(d.name ?? '');
          }
          return `${p.name} · ${dynName.get(p.dynasty) ?? ''} · ${p.exam_year} 年${p.event_count >= 3 ? '<br/>有深度档案' : ''}`;
        },
      },
      series: [{
        type: 'graph', layout: 'force', roam: true, draggable: true,
        data: nodes, links,
        force: { repulsion: 90, edgeLength: [24, 90], gravity: 0.08, friction: 0.35 },
        label: { show: false },
        emphasis: {
          label: { show: true, position: 'right' },
          lineStyle: { width: 2.4 },
          focus: 'adjacency',
        },
        scaleLimit: { min: 0.4, max: 6 },
      }],
    }, { notMerge: true });
  }, [data, index, dynasties, connectedIds, activeEdges, dynFilter, query, y0, y1, tags, area, depth, focusSet, personById, externalById, dynColor, dynName]);

  // 自适应
  useEffect(() => {
    if (!chartEl.current || !data) return;
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    ro.observe(chartEl.current);
    return () => ro.disconnect();
  }, [data]);

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="font-serif text-sm text-zhusha" role="alert">关系数据加载失败：{loadError}</p>
        <button type="button" onClick={() => { setLoadError(null); setAttempt((n) => n + 1); }} className="rounded-full border border-jin/50 px-4 py-1.5 font-serif text-xs text-jin">重试</button>
      </div>
    );
  }
  if (!data) return <p className="font-serif text-sm text-miDim">织网中…</p>;

  const coverage = new Set(data.edges.flatMap((e) => [e.from, e.to]));
  const egoName = egoId ? personById.get(egoId)?.name : null;

  return (
    <div>
      {/* 类型筛选 chips */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {data.types.map((t) => {
          const st = RELATION_STYLE[t] ?? { color: '#9AA5B1', label: t };
          const off = offTypes.has(t);
          const cnt = data.edges.filter((e) => e.type === t).length;
          return (
            <button
              key={t}
              onClick={() => setOffTypes((cur) => {
                const next = new Set(cur);
                if (next.has(t)) next.delete(t); else next.add(t);
                return next;
              })}
              className={`rounded-full border px-2.5 py-1 font-serif text-xs transition-opacity ${off ? 'opacity-35' : ''}`}
              style={{ borderColor: st.color + '66', color: st.color }}
            >
              {st.label} {cnt}
            </button>
          );
        })}
        {(data.externals?.length ?? 0) > 0 && (
          <button
            onClick={() => setShowExternals((v) => !v)}
            className={`rounded-full border px-2.5 py-1 font-serif text-xs transition-opacity ${showExternals ? '' : 'opacity-35'}`}
            style={{ borderColor: '#8B93A166', color: '#8B93A1' }}
            title="外延人物：非状元但与多名状元有记录关系者（如座主、名臣亲属），数据来自 CBDB"
          >
            外延人物 {data.externals!.length}
          </button>
        )}
        <span className="ml-auto font-serif text-[11px] text-miDim/70">
          已收录关系 {data.edges.length} 条 · 状元 {index.filter((p) => coverage.has(p.id)).length}/{index.length} · 外延 {data.externals?.filter((e) => coverage.has(e.id)).length ?? 0}/{data.externals?.length ?? 0} · 筛选只降亮
        </span>
      </div>

      {activeEdges.length === 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-dashed border-miDim/30 px-3 py-2" role="status">
          <p className="font-serif text-xs text-miDim">当前没有可显示的关系。</p>
          <button type="button" onClick={() => { setOffTypes(new Set()); setShowExternals(true); }} className="rounded-full border border-jin/40 px-3 py-1 font-serif text-xs text-jin">恢复全部关系</button>
        </div>
      )}
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative min-w-0 flex-1">
          <div ref={chartEl} className="h-[62vh] w-full rounded-lg border border-jin/15 bg-xuan/30 md:h-[560px]" />
          <GuidePopover title="关系网络怎么读">
            <p>
              科举不仅是选官，更是结网：同年登科者互为「年谊」，座主与门生结成政治师生，状元世家代代蝉联。
              节点颜色为朝代，金边者有深度档案；边色分关系：金=亲属，青绿系=座主/师承/荐举/师生，灰虚线=同年，朱红=政敌。
              双击任一节点聚焦其二度朋友圈；右侧面板列出算法自动发现的五大「状元朋友圈」。
            </p>
            <p className="mt-2 font-kai text-[11px] text-miDim/70">
              关系考据刚起步，唐孔氏、清翁氏等家族网络目前整理得最完整。图上没有连线，只表示本站尚未录入关系，不表示历史上没有往来。
            </p>
          </GuidePopover>
          {pickedId && (
            <div className="absolute bottom-2 left-2 z-10 flex gap-2 rounded-lg border border-jin/30 bg-dai/95 p-2">
              <button type="button" onClick={() => canOpenPerson(pickedId) && selectPerson(pickedId)} disabled={!canOpenPerson(pickedId)} className="rounded-full border border-jin/50 px-3 py-1 font-serif text-xs text-jin disabled:opacity-40">查看人物</button>
              <button type="button" onClick={() => setEgoId(pickedId)} className="rounded-full border border-miDim/40 px-3 py-1 font-serif text-xs text-mi">聚焦关系</button>
            </div>
          )}
          {egoId && (
            <button
              onClick={() => setEgoId(null)}
              className="absolute right-2 top-2 rounded-full border border-jin/50 bg-dai/90 px-3 py-1 font-serif text-xs text-jin"
            >
              退出聚焦{egoName ? `（${egoName}）` : ''}
            </button>
          )}
        </div>

        {/* Top5 社区面板（桌面侧栏；移动端折为主图下方横滑卡片） */}
        <aside className="w-full shrink-0 md:w-56">
          <h3 className="mb-2 font-serif text-sm font-bold tracking-widest text-jin">状元朋友圈</h3>
          <p className="mb-2 font-serif text-[11px] text-miDim/70">构建期社区发现算法自动标注</p>
          <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:space-y-2 md:pb-0">
            {data.communities.slice(0, 5).map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveComm((cur) => (cur === c.id ? null : c.id))}
                className={`w-44 shrink-0 rounded-lg border px-3 py-2 text-left transition-colors md:w-full ${
                  activeComm === c.id ? 'border-jin/60 bg-jin/10' : 'border-miDim/20 bg-xuan/40 hover:border-jin/40'
                }`}
              >
                <p className="font-serif text-sm text-mi">{c.label}</p>
                <p className="mt-0.5 font-serif text-[11px] text-miDim">
                  {c.size} 人：{c.members.map((id) => personById.get(id)?.name ?? id).slice(0, 4).join('、')}{c.size > 4 ? ' 等' : ''}
                </p>
              </button>
            ))}
          </div>
          {activeComm !== null && (
            <button
              onClick={() => setActiveComm(null)}
              className="mt-2 w-full rounded-full border border-miDim/30 py-1 font-serif text-xs text-miDim hover:border-jin/50 hover:text-jin"
            >
              取消高亮
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
