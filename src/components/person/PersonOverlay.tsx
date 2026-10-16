import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { selectedPersonId, selectPerson, popPerson, pushPerson, personStack } from '../../store/selection';
import { loadPerson, loadDynasties, EVENT_COLOR, isExternalStub, type PersonDetailData, type ExternalStub, type DynastyMeta } from '../../lib/data';
import { settlePersonLoad } from '../../lib/personLoad';
import { lifespan } from '../../lib/era';
import RelationSection from './RelationSection';
import CareerRiver from '../viz/CareerRiver';
import GuidePopover from '../shell/GuidePopover';

const TIER_STYLE: Record<string, { label: string; cls: string }> = {
  A: { label: 'A', cls: 'bg-jin/20 text-jin border-jin/50' },
  B: { label: 'B', cls: 'bg-teal-400/10 text-[#5DCAA5] border-[#5DCAA5]/40' },
  C: { label: 'C', cls: 'bg-miDim/10 text-miDim border-miDim/40' },
};

export default function PersonOverlay() {
  const id = useStore(selectedPersonId);
  const stack = useStore(personStack);
  const [record, setRecord] = useState<PersonDetailData | ExternalStub | null>(null);
  const [dynasties, setDynasties] = useState<DynastyMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef<{ startY: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => { loadDynasties().then(setDynasties).catch(() => {}); }, []);

  useEffect(() => {
    if (!id) { setRecord(null); setFailedId(null); setLoading(false); return; }
    let alive = true;
    setRecord(null);
    setFailedId(null);
    setLoading(true);
    panelRef.current?.scrollTo(0, 0);
    loadPerson(id).then((p) => {
      const settled = settlePersonLoad(id, alive ? id : null, { ok: true, person: p });
      if (!settled.accept) return;
      setRecord(settled.person);
      setFailedId(settled.failedId);
      setLoading(false);
    }).catch(() => {
      const settled = settlePersonLoad(id, alive ? id : null, { ok: false });
      if (!settled.accept) return;
      setRecord(null);
      setFailedId(settled.failedId);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id, attempt]);

  useEffect(() => {
    if (!id) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panelRef.current?.querySelector('[aria-expanded="true"]')) return;
        e.preventDefault();
        selectPerson(null);
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll('button, a, input, summary')].filter(
        (el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute('disabled'),
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [id]);

  if (!id) return null;
  const stub = isExternalStub(record) ? record : null;
  const person = record && !isExternalStub(record) ? record : null;
  const dyn = dynasties.find((d) => d.key === person?.dynasty);
  const sortedEvents = [...(person?.events ?? [])].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  // 移动端下滑关闭手势（顶部抓手条拖动）
  const onGrabTouchStart = (e: React.TouchEvent) => {
    dragRef.current = { startY: e.touches[0].clientY, dy: 0 };
  };
  const onGrabTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragRef.current.startY);
    dragRef.current.dy = dy;
    setDragY(dy);
  };
  const onGrabTouchEnd = () => {
    const dy = dragRef.current?.dy ?? 0;
    dragRef.current = null;
    setDragY(0);
    if (dy > 80) selectPerson(null);
  };

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/50" onClick={() => selectPerson(null)} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-dialog-title"
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-jin/25 bg-dai shadow-2xl max-md:top-auto max-md:bottom-0 max-md:h-[92dvh] max-md:max-w-none max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t md:w-[480px]"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        {/* 移动端下滑抓手 */}
        <div
          className="sticky top-0 z-10 flex h-8 cursor-grab items-center justify-center bg-dai md:hidden"
          onTouchStart={onGrabTouchStart}
          onTouchMove={onGrabTouchMove}
          onTouchEnd={onGrabTouchEnd}
          aria-label="下滑关闭"
        >
          <span className="h-1 w-10 rounded-full bg-miDim/40" />
        </div>
        {/* 竖排题签 */}
        <div className="pointer-events-none absolute left-0 top-0 h-full w-10 border-r border-jin/10" style={{ writingMode: 'vertical-rl' }}>
          <span className="pt-6 text-center font-serif text-xl tracking-[0.5em] text-jin/70">
            {person?.name ?? stub?.name ?? ''}
          </span>
        </div>

        <div className="ml-10 p-6">
          <div className="mb-4 flex items-center gap-2">
            {stack.length > 1 && (
              <button
                onClick={popPerson}
                className="rounded-full border border-jin/40 px-3 py-1 font-serif text-xs text-jin hover:bg-jin/10"
              >
                ← 返回上一帖（{stack.length - 1}）
              </button>
            )}
            <button
              onClick={() => selectPerson(null)}
              className="min-h-11 rounded-full border border-miDim/30 px-4 font-serif text-sm text-miDim hover:border-jin/50 hover:text-jin"
            >
              ✕ 收起
            </button>
          </div>

          {loading && (
            <p className="font-serif text-sm text-miDim" role="status">正在读取 {id} 的档案…</p>
          )}

          {failedId === id && !loading && (
            <div className="rounded-lg border border-zhusha/50 bg-zhusha/10 p-4" role="alert">
              <p className="font-serif text-sm text-mi">档案没有打开</p>
              <p className="mt-1 font-serif text-xs leading-6 text-miDim">
                {`${id} 的档案没有取到，可能是网络中断或这条记录尚未收录。`}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="rounded-full border border-jin/50 px-3 py-1 font-serif text-xs text-jin hover:bg-jin/10"
                >
                  重试
                </button>
                <button
                  type="button"
                  onClick={() => (stack.length > 1 ? popPerson() : selectPerson(null))}
                  className="rounded-full border border-miDim/30 px-3 py-1 font-serif text-xs text-miDim hover:text-jin"
                >
                  {stack.length > 1 ? '返回上一帖' : '关闭'}
                </button>
              </div>
            </div>
          )}

          {stub && stub.id === id && <ExternalStubView stub={stub} />}

          {person && person.id === id && (
            <>
              {/* 题签区 */}
              <header className="mb-5 border-b border-jin/20 pb-4">
                <h2 id="person-dialog-title" className="font-serif text-3xl font-bold text-mi">
                  {person.name}
                  {(person.zi || person.hao) && (
                    <span className="ml-3 text-sm font-normal text-miDim">
                      {[person.zi && `字${person.zi}`, person.hao && `号${person.hao}`].filter(Boolean).join(' ')}
                    </span>
                  )}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 font-serif text-xs">
                  <span className="rounded px-2 py-0.5" style={{ backgroundColor: (dyn?.color ?? '#666') + '33', color: dyn?.color }}>
                    {dyn?.name}
                  </span>
                  <span className="text-mi">{person.ke_ci ?? `${person.exam_year} 年`}</span>
                  <span className="text-miDim">{person.ganzhi && `${person.ganzhi}科`}</span>
                  {person.tags.map((t) => (
                    <span key={t} className="rounded border border-jin/30 px-1.5 py-0.5 text-jin/90">{t}</span>
                  ))}
                </div>
              </header>

              {/* 存疑警示 */}
              {person.disputed && (
                <div className="mb-4 rounded-lg border border-zhusha/50 bg-zhusha/10 p-3">
                  <p className="font-serif text-xs font-bold text-zhusha">⚠ 状元身份存疑</p>
                  <p className="mt-1 font-serif text-xs leading-relaxed text-mi/80">{person.dispute_note}</p>
                </div>
              )}

              {/* 档案区 */}
              <section className="mb-5 grid grid-cols-1 gap-2 font-serif text-sm sm:grid-cols-2">
                <div className="rounded bg-xuan/60 p-2.5">
                  <span className="text-miDim">生卒</span>
                  <p className="mt-0.5 text-mi">{lifespan(person.birth_year, person.death_year, person.birth_circa, person.death_circa)}</p>
                </div>
                <div className="rounded bg-xuan/60 p-2.5">
                  <span className="text-miDim">籍贯</span>
                  <p className="mt-0.5 text-mi">{person.native_hist || '不详'}</p>
                  {person.native_modern && <p className="text-miDim/70">今：{person.native_modern}</p>}
                </div>
              </section>

              {person.bio_short && (
                <p className="mb-5 font-serif text-sm leading-7 text-mi/90">{person.bio_short}</p>
              )}

              {/* 仕途河流：有品级数据时展示阶梯图；文本行迹保留为折叠详录 */}
              {sortedEvents.length > 0 ? (
                <section className="mb-5">
                  <h3 className="mb-3 font-serif text-sm font-bold tracking-widest text-jin">
                    仕途行迹
                    {sortedEvents.some((e) => e.rank_grade !== undefined) && (
                      <span className="ml-2 align-middle">
                        <GuidePopover inline title="仕途河流怎么读">
                          横轴为年份，纵轴为官职品级（正一品置顶）。阶梯上升是升迁，陡然下落是贬谪；金色星点为夺魁。品级依《历代职官表》按该朝制度考订；半透明节点为推定值，查不到确切品级的一律置于底部纪事带——宁缺毋错。
                        </GuidePopover>
                      </span>
                    )}
                  </h3>
                  {sortedEvents.some((e) => e.rank_grade !== undefined) && (
                    <div className="mb-3 rounded-lg border border-jin/15 bg-xuan/40 p-2">
                      <CareerRiver events={sortedEvents} />
                    </div>
                  )}
                  <details open={!sortedEvents.some((e) => e.rank_grade !== undefined)} className="group">
                    <summary className="mb-2 cursor-pointer font-serif text-xs text-miDim hover:text-jin">
                      行迹详录（{sortedEvents.length} 条）
                    </summary>
                    <div className="relative ml-2 border-l border-jin/25 pl-4">
                      {sortedEvents.map((e, i) => (
                        <div key={i} className="relative mb-4">
                          <span
                            className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-dai"
                            style={{ backgroundColor: EVENT_COLOR[e.type] ?? '#9AA5B1' }}
                          />
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-serif text-xs text-jin/90">{e.year ? `${e.year} 年` : e.year_label}</span>
                            <span className="rounded-sm px-1 text-[10px]" style={{ color: EVENT_COLOR[e.type] ?? '#9AA5B1', border: `1px solid ${EVENT_COLOR[e.type] ?? '#9AA5B1'}55` }}>
                              {e.type}
                            </span>
                            <span className="font-serif text-sm text-mi">{e.title}</span>
                          </div>
                          {e.office && (
                            <p className="mt-0.5 font-serif text-xs text-mi/70">官职：{e.office}</p>
                          )}
                          {e.description && (
                            <p className="mt-1 font-serif text-xs leading-6 text-miDim">{e.description}</p>
                          )}
                          {e.source_id && person.sources.find((s) => s.id === e.source_id) && (
                            <SourceBadge source={person.sources.find((s) => s.id === e.source_id)!} />
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                </section>
              ) : (
                <section className="mb-5 rounded-lg border border-dashed border-miDim/25 p-4 text-center">
                  <p className="font-serif text-sm text-miDim">本站尚未整理这份档案</p>
                  <p className="mt-1 font-serif text-xs text-miDim/60">目前只录姓名和科年。这不表示史料不存在，本站档案完整度仍在补齐。</p>
                </section>
              )}

              {/* 人物关系区（分组卡片链，栈式跳转） */}
              <RelationSection id={person.id} name={person.name} />

              {/* 出处面板 */}
              {person.sources.length > 0 && (
                <section>
                  <h3 className="mb-2 font-serif text-sm font-bold tracking-widest text-jin">史料出处</h3>
                  <div className="space-y-1.5">
                    {person.sources.map((s) => (
                      <div key={s.id} className="flex items-start gap-2 rounded bg-xuan/60 px-2.5 py-2">
                        <TierMark tier={s.tier} />
                        <div className="font-serif text-xs">
                          <span className="text-mi">《{s.title}》{s.juan ? ` · ${s.juan}` : ''}{s.author && <span className="text-miDim"> {s.author}</span>}</span>
                          {s.quote && <p className="mt-0.5 text-miDim">{s.quote}</p>}
                          {s.url && <a href={s.url} target="_blank" rel="noopener" className="mt-1 inline-block text-jin underline">核查原文</a>}
                          {s.note && <p className="mt-0.5 text-miDim/70">{s.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 font-kai text-[11px] text-miDim/60">
                    可信度：A=正史/碑录/朱卷　B=方志/年谱/整理名录　C=笔记传说
                  </p>
                  <a href={`${import.meta.env.BASE_URL}person/${person.id}`} className="mt-3 inline-block font-serif text-xs text-jin underline">完整档案</a>
                  <a href={`https://github.com/wakakacoding/zhuangyuan-galaxy/issues/new?template=errata.yml&title=${encodeURIComponent('[勘误] ' + person.id + ' ' + person.name)}`} className="ml-3 inline-block font-serif text-xs text-miDim underline">提交勘误</a>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function TierMark({ tier }: { tier: 'A' | 'B' | 'C' }) {
  const s = TIER_STYLE[tier];
  return (
    <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border font-serif text-[10px] font-bold ${s.cls}`}>
      {s.label}
    </span>
  );
}

function SourceBadge({ source }: { source: { tier: 'A' | 'B' | 'C'; title: string } }) {
  return (
    <span className="mt-1 inline-flex items-center gap-1 font-serif text-[10px] text-miDim/70">
      <TierMark tier={source.tier} />
      《{source.title}》
    </span>
  );
}

function ExternalStubView({ stub }: { stub: ExternalStub }) {
  return (
    <>
      <header className="mb-5 border-b border-jin/20 pb-4">
        <p className="mb-2 font-serif text-xs tracking-widest text-jin">外延人物 · 非状元</p>
        <h2 id="person-dialog-title" className="font-serif text-3xl font-bold text-mi">{stub.name}</h2>
        <p className="mt-2 font-serif text-xs text-miDim">不计入状元名录与统计。生卒或年代缺失处保持空白。</p>
      </header>
      <section className="mb-5 grid grid-cols-2 gap-2 font-serif text-xs">
        <div className="rounded bg-xuan/60 p-2.5">
          <span className="text-miDim">生卒</span>
          <p className="mt-0.5 text-mi">{lifespan(stub.birth_year, stub.death_year)}</p>
        </div>
        <div className="rounded bg-xuan/60 p-2.5">
          <span className="text-miDim">索引年</span>
          <p className="mt-0.5 text-mi">{stub.index_year ? `${stub.index_year} 年` : '未录'}</p>
        </div>
      </section>
      {stub.note && <p className="mb-5 font-serif text-sm leading-7 text-mi/90">{stub.note}</p>}
      <section className="mb-5">
        <h3 className="mb-3 font-serif text-sm font-bold tracking-widest text-jin">相关状元</h3>
        {stub.related.length === 0 ? (
          <p className="font-serif text-xs text-miDim">暂无站内关联。</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5">
            {stub.related.map((r) => (
              <button
                key={r.id + r.type}
                type="button"
                onClick={() => pushPerson(r.id)}
                className="flex items-center gap-2 rounded-lg border border-miDim/15 bg-xuan/60 px-3 py-2 text-left hover:border-jin/40"
              >
                <span className="font-serif text-sm text-mi">{r.name}</span>
                <span className="font-serif text-xs text-jin/80">{r.type}</span>
                {r.note && <span className="ml-auto line-clamp-1 font-serif text-[11px] text-miDim">{r.note}</span>}
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
