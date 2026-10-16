// 籍贯地图：CHGIS 历史政区底图 + 散点/热力 + 朝代滑块 + 重心迁移线
// 数据：/data/geo.json（v2）+ /data/maps/{dynasty}.json（懒加载）
// 合规：无审图号的现代矢量层已撤除（M4），坐标系由当前历史切片兼任；现代对照见页面标准地图链接
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import * as echarts from 'echarts/core';
import { MapChart, ScatterChart, HeatmapChart, LinesChart, EffectScatterChart } from 'echarts/charts';
import { GeoComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  selectedDynasties, searchQuery, matchEntry,
  mapSlice, setMapSlice, selectedRegion, setRegion,
} from '../../store/filters';
import { selectPerson } from '../../store/selection';
import {
  loadGeo, loadDynasties, loadIndex, loadMapSlice, invalidateLoad,
  type GeoData, type DynastyMeta, type IndexEntry, type GeoPoint,
} from '../../lib/data';
import GuidePopover from '../shell/GuidePopover';

echarts.use([
  MapChart, ScatterChart, HeatmapChart, LinesChart, EffectScatterChart,
  GeoComponent, TooltipComponent, VisualMapComponent, CanvasRenderer,
]);

// 统一视野（中国全域，含南海）；历史/现代两层共用，保证对齐
const BBOX: [[number, number], [number, number]] = [[73, 54.2], [135.8, 17.6]];
const LAYOUT = { layoutCenter: ['50%', '52%'] as [string, string], layoutSize: '106%', boundingCoords: BBOX };
const HIST = (k: string) => `hist-${k}`;
const MIN_SOLID = 8; // 重心样本数下限：低于此值迁移线用虚线

type ViewMode = 'heat' | 'scatter';

export default function GeoMap() {
  const chartEl = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [dynasties, setDynasties] = useState<DynastyMeta[]>([]);
  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [baseReady, setBaseReady] = useState(false);
  const [slices, setSlices] = useState<Set<string>>(new Set()); // 已注册的朝代切片
  const [viewMode, setViewMode] = useState<ViewMode>('heat');
  const [showMigration, setShowMigration] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [sliceLoading, setSliceLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sliceAttempt, setSliceAttempt] = useState(0);

  const sliceKey = useStore(mapSlice);
  const region = useStore(selectedRegion);
  const dynFilter = useStore(selectedDynasties);
  const query = useStore(searchQuery);

  const sorted = useMemo(() => [...dynasties].sort((a, b) => a.order - b.order), [dynasties]);
  const current = sorted.find((d) => d.key === sliceKey) ?? sorted[0];
  const currentKey = current?.key ?? 'tang';

  // ---------- 基础数据 + 初始化 ----------
  useEffect(() => {
    let dead = false;
    setLoadError(null);
    invalidateLoad('/data/geo.json');
    invalidateLoad('/data/dynasties.json');
    invalidateLoad('/data/person-index.json');
    (async () => {
      try {
        const [g, d, idx] = await Promise.all([loadGeo(), loadDynasties(), loadIndex()]);
        if (dead) return;
        setGeo(g); setDynasties(d); setIndex(idx); setBaseReady(true);
      } catch (e) {
        if (!dead) setLoadError(e instanceof Error ? e.message : '数据加载失败');
      }
    })();
    return () => { dead = true; };
  }, [attempt]);

  useEffect(() => {
    if (!baseReady || !chartEl.current) return;
    const chart = echarts.init(chartEl.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(chartEl.current);
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, [baseReady]);

  // ---------- 朝代切片懒加载与注册 ----------
  useEffect(() => {
    if (!baseReady || slices.has(currentKey)) return;
    let dead = false;
    setSliceLoading(true);
    setSliceError(null);
    invalidateLoad(`/data/maps/${currentKey}.json`);
    loadMapSlice(currentKey)
      .then((gj) => {
        if (dead) return;
        echarts.registerMap(HIST(currentKey), gj as never);
        setSlices((s) => new Set(s).add(currentKey));
      })
      .catch((e) => {
        if (dead) return;
        setSliceError(e instanceof Error ? e.message : '切片加载失败');
      })
      .finally(() => !dead && setSliceLoading(false));
    return () => { dead = true; };
  }, [currentKey, baseReady, slices, sliceAttempt]);

  // ---------- 全局筛选变化：当前朝代不在筛选内时跳到首个命中朝 ----------
  useEffect(() => {
    if (!dynFilter.length || !sorted.length) return;
    if (!dynFilter.includes(currentKey)) {
      const first = sorted.find((d) => dynFilter.includes(d.key));
      if (first) setMapSlice(first.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynFilter, sorted.length]);

  const playback = dynFilter.length ? sorted.filter((d) => dynFilter.includes(d.key)) : sorted;

  // ---------- 播放：有朝代筛选时只在这些朝之间走 ----------
  useEffect(() => {
    if (!playing || playback.length < 2) return;
    const t = setInterval(() => {
      const i = playback.findIndex((d) => d.key === mapSlice.get());
      const cur = i < 0 ? 0 : i;
      if (cur >= playback.length - 1) { setPlaying(false); return; }
      setMapSlice(playback[cur + 1].key);
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, playback]);

  // ---------- 深链修正：?region=X 但当前切片无此政区时，跳到拥有它的首个朝代 ----------
  useEffect(() => {
    if (!geo || !region || !sorted.length || !slices.has(currentKey)) return;
    if ((geo.regions[currentKey] ?? []).some((r) => r.name === region)) return;
    const target = sorted.find((d) => (geo.regions[d.key] ?? []).some((r) => r.name === region));
    if (target && target.key !== currentKey) {
      setMapSlice(target.key); // 会清空 region
      setRegion(region); // 立即重设，保持深链完整
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, region, sorted, currentKey, slices]);

  // ---------- 渲染 ----------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !geo || !sorted.length || !slices.has(currentKey)) return;

    const dColor = current?.color ?? '#C9A227';
    const cov = geo.coverage[currentKey];
    const regionAgg = new Map((geo.regions[currentKey] ?? []).map((r) => [r.name, r.count]));
    const pts = geo.points.filter((p) => p.dynasty === currentKey);

    // 全局筛选 → 命中集合。热力只画命中者；散点保留未命中但降亮。
    const filterActive = dynFilter.length > 0 || query.trim().length > 0;
    const matched = new Set(
      index.filter((e) => matchEntry(e, dynFilter, query)).map((e) => e.id),
    );
    const isHit = (p: GeoPoint) => !filterActive || matched.has(p.id);

    // 迁移线：按朝代序连接重心；小样本段虚线
    const cents = sorted
      .map((d) => ({ d, c: geo.centroids.find((c) => c.dynasty === d.key) }))
      .filter((x): x is { d: DynastyMeta; c: NonNullable<GeoData['centroids'][number]> } => Boolean(x.c));
    const lineData = cents.slice(0, -1).map((x, i) => {
      const nxt = cents[i + 1];
      return {
        coords: [[x.c.lng, x.c.lat], [nxt.c.lng, nxt.c.lat]] as [number[], number[]],
        lineStyle: {
          color: x.d.color, width: 2.4, curveness: 0.16,
          type: x.c.count < MIN_SOLID || nxt.c.count < MIN_SOLID ? ('dashed' as const) : ('solid' as const),
          opacity: 0.85,
        },
        fromName: x.d.name, toName: nxt.d.name,
      };
    });
    const curCent = geo.centroids.find((c) => c.dynasty === currentKey);

    const regionConf = region && regionAgg.has(region)
      ? [{ name: region, itemStyle: { areaColor: dColor + '40', borderColor: '#C9A227', borderWidth: 1.4 }, label: { show: true, color: '#F2EAD8', fontSize: 12 } }]
      : [];

    chart.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          backgroundColor: '#16233A', borderColor: 'rgba(201,162,39,0.35)', borderWidth: 1,
          textStyle: { color: '#F2EAD8', fontSize: 12 },
        },
        visualMap: {
          show: false, min: 0, max: 4, seriesIndex: 1,
          inRange: { color: ['rgba(74,138,196,0)', '#3B5C82', '#C9A227', '#F2D16B', '#FFF3C4'] },
        },
        geo: {
          // 坐标系由当前历史切片兼任（boundingCoords 固定对齐）；轮廓透明，填色层由 series[0] 承担
          map: HIST(currentKey), ...LAYOUT, silent: true, z: 1,
          itemStyle: { areaColor: 'transparent', borderColor: 'transparent' },
          label: { show: false },
        },
        series: [
          // 0 历史政区（辽代无数据时该层为空，仅现代省界兜底）
          {
            type: 'map', map: HIST(currentKey), nameProperty: 'name', ...LAYOUT,
            z: 2, roam: false, selectedMode: false,
            itemStyle: { areaColor: dColor + '14', borderColor: dColor + '59', borderWidth: 0.8 },
            emphasis: { itemStyle: { areaColor: dColor + '30' }, label: { show: true, color: '#F2EAD8', fontSize: 11 } },
            label: { show: false },
            regions: regionConf,
            data: [],
            name: 'hist',
          },
          // 1 热力
          {
            type: 'heatmap', coordinateSystem: 'geo', geoIndex: 0, z: 3,
            pointSize: 18, blur: 16,
            data: viewMode === 'heat' ? pts.filter(isHit).map((p) => [p.lng, p.lat, 1]) : [],
            name: 'heat',
          },
          // 2 散点
          {
            type: 'scatter', coordinateSystem: 'geo', geoIndex: 0, z: 4,
            symbolSize: 7,
            data: viewMode === 'scatter'
              ? pts.map((p) => ({
                  name: p.name, value: [p.lng, p.lat], personId: p.id, person: p,
                  itemStyle: { color: dColor, borderColor: '#FFF7E0', borderWidth: 0.6, opacity: isHit(p) ? 0.95 : 0.08 },
                }))
              : [],
            name: 'points',
          },
          // 3 重心迁移线
          {
            type: 'lines', coordinateSystem: 'geo', geoIndex: 0, z: 3,
            polyline: false, symbol: ['none', 'arrow'], symbolSize: 9,
            data: showMigration ? lineData : [],
            name: 'migration',
          },
          // 4 当前朝重心涟漪
          {
            type: 'effectScatter', coordinateSystem: 'geo', geoIndex: 0, z: 5,
            symbolSize: 11, rippleEffect: { brushType: 'stroke', scale: 2.8 },
            itemStyle: { color: '#C03F2B' },
            label: {
              show: Boolean(curCent) && showMigration, position: 'right', color: '#F2EAD8', fontSize: 11,
              formatter: () => (curCent ? `${current.name}重心 · 全量 ${curCent.count}` : ''),
            },
            data: showMigration && curCent ? [{ value: [curCent.lng, curCent.lat] }] : [],
            name: 'centroid',
          },
        ],
      },
      { notMerge: true },
    );

    chart.off('click');
    chart.on('click', (raw: unknown) => {
      const params = raw as {
        seriesName?: string; componentType?: string; name?: string;
        data?: { personId?: string } | null;
      };
      if (params.seriesName === 'points' && params.data?.personId) {
        selectPerson(params.data.personId);
      } else if (params.seriesName === 'hist' && params.name && regionAgg.has(params.name)) {
        setRegion(params.name);
      }
    });
  }, [geo, sorted, currentKey, slices, viewMode, showMigration, dynFilter, query, region, index, current]);

  // ---------- UI ----------
  if (loadError && !geo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zhusha">
        <p role="alert">地图数据加载失败：{loadError}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-full border border-jin/50 px-4 py-1.5 font-serif text-jin">重试</button>
      </div>
    );
  }
  if (!geo || !sorted.length) {
    return <div className="flex h-full items-center justify-center text-sm text-miDim">舆图铺展中…</div>;
  }
  const cov = geo.coverage[currentKey];

  return (
    <div className="relative h-full w-full">
      <div ref={chartEl} className="h-full w-full" />
      {sliceError && (
        <div className="absolute left-3 top-3 z-10 max-w-xs rounded-lg border border-zhusha/40 bg-dai/95 p-3 font-serif text-xs text-mi" role="alert">
          <p>这一朝的底图没有载入：{sliceError}</p>
          <p className="mt-1 text-miDim">已保留上一张成功的地图，朝代切换仍然可用。</p>
          <button type="button" onClick={() => setSliceAttempt((n) => n + 1)} className="mt-2 rounded-full border border-jin/50 px-3 py-1 text-jin">重试这一朝</button>
        </div>
      )}
      <GuidePopover title="籍贯地图怎么读">
        散点是状元籍贯，底色为各朝行政区划。拖动时间滑块可见状元产地的千年南移：唐代重心尚在黄河中下游，北宋移至江淮，明清沉入江浙——背后正是经济重心南移与南方书院的兴起。金色轨迹为各朝重心连线；辽金元样本稀少（n&lt;8 以虚线示警），空白同样是史实。
      </GuidePopover>

      {/* 图层开关（右上） */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 rounded-lg border border-jin/20 bg-xuan/85 p-2.5 text-xs backdrop-blur">
        <div className="mb-0.5 flex rounded border border-jin/25 text-center">
          {(['heat', 'scatter'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-2.5 py-1 ${viewMode === m ? 'bg-jin/20 text-jin' : 'text-miDim hover:text-mi'}`}
            >
              {m === 'heat' ? '热力' : '散点'}
            </button>
          ))}
        </div>
        {[
          [showMigration, setShowMigration, '重心迁移线'],
        ].map(([v, set, label]) => (
          <label key={label as string} className="flex cursor-pointer items-center gap-1.5 text-miDim hover:text-mi">
            <input
              type="checkbox" checked={v as boolean}
              onChange={(e) => (set as (b: boolean) => void)(e.target.checked)}
              className="accent-[#C9A227]"
            />
            {label as string}
          </label>
        ))}
      </div>

      {/* 朝代滑块（底部） */}
      <div className="absolute inset-x-0 bottom-0 z-10 pb-2">
        {current?.map_note && (
          <p className="mx-auto mb-1 w-fit max-w-[92vw] rounded bg-xuan/85 px-3 py-1 text-center text-[11px] text-miDim">
            {current.map_note}
          </p>
        )}
        <div className="mx-auto flex w-fit max-w-[96vw] items-center gap-1 overflow-x-auto rounded-full border border-jin/25 bg-xuan/90 px-2 py-1.5 backdrop-blur">
          <button
            aria-label={playing ? '暂停' : '播放'}
            onClick={() => setPlaying(!playing)}
            className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-jin/40 text-xs text-jin hover:bg-jin/15"
          >
            {playing ? '❚❚' : '▶'}
          </button>
          {sorted.map((d) => {
            const c = geo.coverage[d.key];
            const active = d.key === currentKey;
            return (
              <button
                key={d.key}
                onClick={() => { setPlaying(false); setMapSlice(d.key); }}
                title={`${d.name} · ${d.map_year ?? ''} · 坐标 ${c?.with_geo ?? 0}/${c?.total ?? 0}`}
                className={`flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1 transition-colors ${active ? 'bg-jin/15' : 'hover:bg-jin/5'}`}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: active ? d.color : '#9AA5B1' }}>
                  <i className="inline-block h-2 w-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className={`text-[10px] ${active ? 'text-mi' : 'text-miDim/70'}`}>
                  {d.map_year} · {c ? `${c.with_geo}/${c.total}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {sliceLoading && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded bg-xuan/85 px-3 py-1 text-xs text-miDim">
          切换朝代底图…
        </div>
      )}
    </div>
  );
}
