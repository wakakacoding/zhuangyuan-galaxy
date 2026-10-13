import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { select, type Selection } from 'd3-selection';
import 'd3-transition'; // 副作用导入：为 Selection 扩展 transition()
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type D3ZoomEvent } from 'd3-zoom';
import { quadtree as d3quadtree, type Quadtree } from 'd3-quadtree';
import { forceSimulation, forceX, forceY, forceCollide } from 'd3-force';
import { scaleLinear } from 'd3-scale';
import { selectedDynasties, searchQuery, matchEntry } from '../../store/filters';
import { selectPerson } from '../../store/selection';
import { loadIndex, loadDynasties, type IndexEntry, type DynastyMeta } from '../../lib/data';
import { ganzhiOf } from '../../lib/era';
import GuidePopover from '../shell/GuidePopover';

interface StarNode extends IndexEntry {
  x: number; y: number; tx: number; ty: number; r: number;
}

const MARGIN = { left: 76, right: 28, top: 30, bottom: 16 };
const MIN_BAND = 56;
// 年份播放：622 年首科 → 1912 终态（末科 1904 后留缓冲）
const PLAY_START = 620;
const PLAY_END = 1912;
const YEARS_PER_SEC = (PLAY_END - PLAY_START) / 60; // 1× = 全程 60s
const SPEEDS = [1, 2, 4];
const RECORD_MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
const pickRecordMime = (): string | null => {
  if (typeof MediaRecorder === 'undefined') return null;
  return RECORD_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
};

// 光晕精灵：每朝代一个离屏 canvas
function makeSprite(color: string): HTMLCanvasElement {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.28, color + 'CC');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // 星核
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.085, 0, Math.PI * 2);
  ctx.fillStyle = '#FFF7E0';
  ctx.fill();
  return c;
}

export default function StarMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stars, setStars] = useState<StarNode[]>([]);
  const [dynasties, setDynasties] = useState<DynastyMeta[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; s: StarNode } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dynFilter = useStore(selectedDynasties);
  const query = useStore(searchQuery);

  // 年份播放 / 录制状态
  const [playing, setPlaying] = useState(false);
  const [playYearUI, setPlayYearUI] = useState(PLAY_START);
  const [speed, setSpeed] = useState(1);
  const [recording, setRecording] = useState(false);
  const playYearRef = useRef(PLAY_START);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const lastFrameTRef = useRef(0);
  const lastUiTRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const canRecord = typeof window !== 'undefined' && pickRecordMime() !== null;

  const stateRef = useRef<{
    stars: StarNode[]; dynasties: DynastyMeta[];
    sprites: Map<string, HTMLCanvasElement>;
    quadtree: Quadtree<StarNode> | null;
    transform: { x: number; y: number; k: number };
    hovered: StarNode | null;
    matched: Set<string> | null;
    w: number; h: number;
    playYear: number | null; // null = 常态渲染；数值 = 播放模式（星依科年点亮）
  }>({
    stars: [], dynasties: [], sprites: new Map(), quadtree: null,
    transform: { x: 0, y: 0, k: 1 }, hovered: null, matched: null, w: 0, h: 0,
    playYear: null,
  });
  const rafRef = useRef(0);
  const playRafRef = useRef(0); // 播放循环独立 raf，避免被 scheduleDraw 取消

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const st = stateRef.current;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = st;
    if (!w || !h) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { x: tx, y: ty, k } = st.transform;
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    // 百年刻度
    ctx.strokeStyle = 'rgba(242,234,216,0.07)';
    ctx.lineWidth = 1 / k;
    ctx.fillStyle = 'rgba(154,165,177,0.55)';
    ctx.font = `${11 / k}px "Noto Serif SC", serif`;
    ctx.textAlign = 'center';
    const xScale = scaleLinear().domain([600, 1915]).range([MARGIN.left, w - MARGIN.right]);
    for (let yr = 700; yr <= 1900; yr += 100) {
      const px = xScale(yr);
      ctx.beginPath();
      ctx.moveTo(px, MARGIN.top);
      ctx.lineTo(px, h - MARGIN.bottom);
      ctx.stroke();
      ctx.fillText(`${yr}`, px, MARGIN.top - 8 / k);
    }

    // 朝代带标签
    ctx.textAlign = 'left';
    ctx.font = `${13 / k}px "Noto Serif SC", serif`;
    const bandMap = (st as any).bandCenters as Map<string, number> | undefined;
    if (bandMap) {
      for (const d of st.dynasties) {
        const cy = bandMap.get(d.key);
        if (cy === undefined) continue;
        ctx.fillStyle = d.color + 'B3';
        ctx.fillText(d.name, 14 / k, cy);
        ctx.strokeStyle = d.color + '26';
        ctx.beginPath();
        ctx.moveTo(MARGIN.left - 8, cy + 14 / k);
        ctx.lineTo(w - MARGIN.right, cy + 14 / k);
        ctx.stroke();
      }
    }

    // 星
    const py = st.playYear;
    for (const s of st.stars) {
      const dim = st.matched && !st.matched.has(s.id);
      const hovered = st.hovered === s;
      let alpha = dim ? 0.05 : hovered ? 1 : 0.3 + 0.7 * s.completeness;
      let sizeMul = hovered ? 3.4 : 2.6;
      if (py !== null) {
        // 播放模式：星依科年点亮，2 年 smoothstep 过渡 + 点亮瞬间脉冲放大
        const t = (py - s.exam_year) / 2;
        const lit = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
        alpha = 0.04 + lit * (alpha - 0.04);
        if (lit > 0 && lit < 1) sizeMul *= 1 + 0.9 * Math.sin(lit * Math.PI);
      }
      const sprite = st.sprites.get(s.dynasty);
      if (!sprite) continue;
      const size = s.r * sizeMul;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, s.x - size / 2, s.y - size / 2, size, size);
      if (hovered) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#C9A227';
        ctx.lineWidth = 1.2 / k;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + 5 / k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 播放模式：顶部当前年份水印大字（公元 + 干支）
    if (py !== null) {
      const yr = Math.floor(py);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(201,162,39,0.9)';
      ctx.font = `bold ${Math.round(st.h * 0.11)}px "Noto Serif SC", serif`;
      ctx.fillText(`${yr}`, w - 18, st.h * 0.16);
      ctx.font = `${Math.round(st.h * 0.035)}px "Noto Serif SC", serif`;
      ctx.fillStyle = 'rgba(242,234,216,0.55)';
      ctx.fillText(`${ganzhiOf(yr)}年`, w - 18, st.h * 0.16 + st.h * 0.05);
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // ---------- 年份播放 ----------
  const finishPlayback = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop(); // onstop 里清理 recording 态
    // 终态 = 全亮 = 常态渲染，退出播放模式视觉无缝
    stateRef.current.playYear = null;
    scheduleDraw();
  }, [scheduleDraw]);

  const playTick = useCallback((t: number) => {
    if (!playingRef.current) return;
    const st = stateRef.current;
    const last = lastFrameTRef.current || t;
    lastFrameTRef.current = t;
    const dt = Math.min((t - last) / 1000, 0.1); // 防后台切回大跳
    playYearRef.current += dt * YEARS_PER_SEC * speedRef.current;
    if (playYearRef.current >= PLAY_END) {
      playYearRef.current = PLAY_END;
      st.playYear = PLAY_END;
      setPlayYearUI(PLAY_END);
      draw();
      finishPlayback();
      return;
    }
    st.playYear = playYearRef.current;
    if (t - lastUiTRef.current > 80) { // UI 节流 ~12fps
      setPlayYearUI(playYearRef.current);
      lastUiTRef.current = t;
    }
    draw();
    playRafRef.current = requestAnimationFrame(playTick);
  }, [draw, finishPlayback]);

  const startPlay = useCallback(() => {
    if (playYearRef.current >= PLAY_END) playYearRef.current = PLAY_START; // 播完再按=重播
    playingRef.current = true;
    setPlaying(true);
    lastFrameTRef.current = 0;
    cancelAnimationFrame(playRafRef.current);
    playRafRef.current = requestAnimationFrame(playTick);
  }, [playTick]);

  const pausePlay = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    // 画面停在该年（playYear 保留）
  }, []);

  const seekPlay = useCallback((yr: number) => {
    playYearRef.current = yr;
    stateRef.current.playYear = yr;
    setPlayYearUI(yr);
    scheduleDraw();
  }, [scheduleDraw]);

  const exitPlay = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    playYearRef.current = PLAY_START;
    stateRef.current.playYear = null;
    setPlayYearUI(PLAY_START);
    scheduleDraw();
  }, [scheduleDraw]);

  const changeSpeed = useCallback((s: number) => {
    speedRef.current = s;
    setSpeed(s);
  }, []);

  // ---------- WebM 导出（实时录制：自动从头播放一遍） ----------
  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    const mime = pickRecordMime();
    if (!canvas || !mime || recorderRef.current) return;
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    recordChunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) recordChunksRef.current.push(e.data); };
    rec.onstop = () => {
      const type = mime.split(';')[0];
      const blob = new Blob(recordChunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `状元星河-千年点亮.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      recorderRef.current = null;
      setRecording(false);
    };
    recorderRef.current = rec;
    setRecording(true);
    playYearRef.current = PLAY_START;
    setPlayYearUI(PLAY_START);
    rec.start(250);
    startPlay();
  }, [startPlay]);

  // 数据加载 + 布局
  const layout = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight || Math.max(500, Math.min(760, w * 0.58));
    const st = stateRef.current;
    st.w = w; st.h = h;
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    let index = st.stars;
    let dynasties = st.dynasties;
    if (!index.length) {
      try {
        const [idx, dyn] = await Promise.all([loadIndex(), loadDynasties()]);
        dyn.sort((a, b) => a.order - b.order);
        dynasties = dyn;
        st.dynasties = dyn;
        for (const d of dyn) st.sprites.set(d.key, makeSprite(d.color));
        index = idx.map((e) => ({ ...e, x: 0, y: 0, tx: 0, ty: 0, r: 0 }));
        st.stars = index;
        setStars(index);
        setDynasties(dyn);
      } catch (e) {
        setLoadError(String(e));
        return;
      }
    }

    const xScale = scaleLinear().domain([600, 1915]).range([MARGIN.left, w - MARGIN.right]);

    // 朝代分带：高度按数量比例（下限 MIN_BAND）
    const counts = new Map<string, number>();
    for (const s of index) counts.set(s.dynasty, (counts.get(s.dynasty) ?? 0) + 1);
    const total = index.length || 1;
    const availH = h - MARGIN.top - MARGIN.bottom;
    let acc = MARGIN.top;
    const bandCenters = new Map<string, number>();
    for (const d of dynasties) {
      const bh = Math.max(MIN_BAND, ((counts.get(d.key) ?? 0) / total) * availH);
      bandCenters.set(d.key, acc + bh / 2);
      acc += bh;
    }
    (st as any).bandCenters = bandCenters;

    for (const s of index) {
      s.tx = xScale(s.exam_year);
      s.ty = bandCenters.get(s.dynasty) ?? h / 2;
      s.r = 3.2 + 5.2 * s.completeness;
      s.x = s.tx; s.y = s.ty;
    }

    // 蜂群防重叠（同步跑仿真）
    const sim = forceSimulation(index)
      .force('x', forceX((d: StarNode) => d.tx).strength(0.85))
      .force('y', forceY((d: StarNode) => d.ty).strength(0.4))
      .force('collide', forceCollide((d: StarNode) => d.r * 1.35 + 0.8))
      .stop();
    for (let i = 0; i < 240; i++) sim.tick();

    st.quadtree = d3quadtree<StarNode>()
      .x((d) => d.x).y((d) => d.y)
      .addAll(index);
    scheduleDraw();
  }, [scheduleDraw]);

  // 缩放/平移/拾取
  useEffect(() => {
    layout();
    const container = containerRef.current!;
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => layout());
    ro.observe(container);

    const st = stateRef.current;
    const zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown> = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.55, 14])
      .on('zoom', (ev: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        st.transform = { x: ev.transform.x, y: ev.transform.y, k: ev.transform.k };
        scheduleDraw();
      });
    const sel = select(canvas) as Selection<HTMLCanvasElement, unknown, null, undefined>;
    sel.call(zoomBehavior);
    // 双击放大
    canvas.addEventListener('dblclick', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const p = zoomIdentity
        .translate(st.transform.x, st.transform.y).scale(st.transform.k)
        .translate(ev.clientX - rect.left, ev.clientY - rect.top).scale(1.8)
        .translate(-(ev.clientX - rect.left), -(ev.clientY - rect.top));
      sel.transition().duration(280).call(zoomBehavior.transform as any, p);
    });

    const pick = (ev: MouseEvent): StarNode | null => {
      if (!st.quadtree) return null;
      const rect = canvas.getBoundingClientRect();
      const wx = (ev.clientX - rect.left - st.transform.x) / st.transform.k;
      const wy = (ev.clientY - rect.top - st.transform.y) / st.transform.k;
      const found = st.quadtree.find(wx, wy, 14 / st.transform.k + 4);
      return found ?? null;
    };

    canvas.addEventListener('mousemove', (ev) => {
      const hit = pick(ev);
      if (hit !== st.hovered) {
        st.hovered = hit;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        if (hit) {
          const rect = canvas.getBoundingClientRect();
          setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, s: hit });
        } else setTooltip(null);
        scheduleDraw();
      } else if (hit) {
        const rect = canvas.getBoundingClientRect();
        setTooltip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, s: hit });
      }
    });
    canvas.addEventListener('mouseleave', () => { st.hovered = null; setTooltip(null); scheduleDraw(); });
    canvas.addEventListener('click', (ev) => {
      const hit = pick(ev);
      if (hit) selectPerson(hit.id);
    });

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(playRafRef.current);
      playingRef.current = false;
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
    };
  }, [layout, scheduleDraw]);

  // 筛选联动：不匹配降透明度
  useEffect(() => {
    const st = stateRef.current;
    if (!st.stars.length) return;
    if (!dynFilter.length && !query.trim()) st.matched = null;
    else st.matched = new Set(st.stars.filter((s) => matchEntry(s, dynFilter, query)).map((s) => s.id));
    scheduleDraw();
  }, [dynFilter, query, stars, scheduleDraw]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" style={{ touchAction: 'none' }} />
      <GuidePopover title="星图怎么读">
        每颗星是一位状元：横轴为夺魁年份（622–1904），纵轴按朝代分带，带高随该朝状元数伸缩——密度本身就是信息。亮度代表史料丰富度：唐宋大量淡星是「榜上有名，史中无痕」的真实呈现，明清星群密集明亮，因科举鼎盛、文献丰盈。点播放键，看千年星河次第点亮。
      </GuidePopover>
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-jin/30 bg-dai/95 px-3 py-2 shadow-xl"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          <div className="font-serif text-sm font-bold text-mi">
            {tooltip.s.name}
            {tooltip.s.disputed && <span className="ml-1 text-[10px] text-zhusha">存疑</span>}
          </div>
          <div className="font-serif text-xs text-miDim">
            {dynasties.find((d) => d.key === tooltip.s.dynasty)?.name} · {tooltip.s.exam_year} 年 · {tooltip.s.ganzhi}
          </div>
          {tooltip.s.native_hist && (
            <div className="font-serif text-xs text-miDim">{tooltip.s.native_hist}</div>
          )}
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center font-serif text-sm text-miDim">
          数据加载失败：{loadError}
        </div>
      )}

      {/* 年份播放条 */}
      {!loadError && (
        <div className="absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-2 rounded-full border border-jin/30 bg-dai/90 py-1.5 pl-3 pr-2 shadow-lg backdrop-blur sm:gap-3 sm:px-4">
          <button
            type="button"
            aria-label={playing ? '暂停' : '播放'}
            onClick={() => (playing ? pausePlay() : startPlay())}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-jin/50 text-jin transition hover:bg-jin/15"
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="1.5" width="3" height="12" rx="0.5"/><rect x="7.5" width="3" height="12" rx="0.5"/></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 0.8v10.4c0 .6.7 1 1.2.7l8-5.2c.5-.3.5-1 0-1.3l-8-5.2C2.7-.3 2 .1 2 .8z"/></svg>
            )}
          </button>
          <input
            type="range"
            min={PLAY_START}
            max={PLAY_END}
            step={1}
            value={Math.round(playYearUI)}
            onChange={(e) => seekPlay(Number(e.target.value))}
            aria-label="年份进度"
            className="h-1 w-28 shrink cursor-pointer appearance-none rounded-full bg-miDim/30 accent-jin sm:w-44"
          />
          <span className="shrink-0 font-serif text-xs tabular-nums text-mi">
            {Math.floor(playYearUI)} <span className="text-miDim">{ganzhiOf(Math.floor(playYearUI))}</span>
          </span>
          <span className="flex shrink-0 overflow-hidden rounded-full border border-miDim/25 text-[10px]">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeSpeed(s)}
                className={`px-1.5 py-0.5 transition ${speed === s ? 'bg-jin/80 text-dai' : 'text-miDim hover:text-mi'}`}
              >
                {s}×
              </button>
            ))}
          </span>
          <button
            type="button"
            onClick={startRecording}
            disabled={!canRecord || recording}
            title={canRecord ? '从头播放一遍并录制成视频' : '当前浏览器不支持录制，请用 Chrome / Edge'}
            className="shrink-0 rounded-full border border-zhusha/60 px-2.5 py-1 text-[11px] text-zhusha transition enabled:hover:bg-zhusha/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⏺ 导出
          </button>
          {stateRef.current.playYear !== null && !playing && (
            <button
              type="button"
              aria-label="退出播放"
              onClick={exitPlay}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-miDim transition hover:bg-miDim/15 hover:text-mi"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* 录制遮罩：锁定交互，防 tooltip 入镜 */}
      {recording && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/25 pb-16">
          <div className="w-64 rounded-lg border border-jin/40 bg-dai/95 px-5 py-3.5 text-center shadow-xl">
            <div className="font-serif text-sm text-mi">正在录制 · {Math.floor(playYearUI)} 年</div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-miDim/25">
              <div
                className="h-full rounded-full bg-jin transition-[width] duration-200"
                style={{ width: `${Math.min(100, ((playYearUI - PLAY_START) / (PLAY_END - PLAY_START)) * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-miDim">完整播放一遍后自动下载（约 {Math.round(60 / speed)} 秒）</div>
          </div>
        </div>
      )}
    </div>
  );
}
