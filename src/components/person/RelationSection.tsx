// 人物帖·关系区：分组卡片链，点击栈式跳转对方帖
import { useEffect, useMemo, useState } from 'react';
import {
  loadEdges, loadIndex, RELATION_STYLE,
  type EdgesData, type IndexEntry,
} from '../../lib/data';
import { pushPerson } from '../../store/selection';

export default function RelationSection({ id, name }: { id: string; name: string }) {
  const [edges, setEdges] = useState<EdgesData | null>(null);
  const [index, setIndex] = useState<IndexEntry[]>([]);

  useEffect(() => { loadEdges().then(setEdges).catch(() => {}); }, []);
  useEffect(() => { loadIndex().then(setIndex).catch(() => {}); }, []);

  const groups = useMemo(() => {
    if (!edges) return [];
    const byType = new Map<string, { otherId: string; otherName: string; note?: string; derived?: boolean }[]>();
    for (const e of edges.edges) {
      let otherId: string | null = null;
      let otherName = '';
      if (e.from === id) { otherId = e.to; otherName = e.to_name ?? ''; }
      else if (e.to === id) { otherId = e.from; otherName = e.from_name ?? ''; }
      if (!otherId) continue;
      if (!byType.has(e.type)) byType.set(e.type, []);
      byType.get(e.type)!.push({ otherId, otherName, note: e.note, derived: e.derived });
    }
    const order = ['父子', '亲属', '翁婿', '师生', '同年', '同僚', '政敌'];
    return [...byType.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [edges, id]);

  const dynastyOf = useMemo(() => {
    const m = new Map(index.map((p) => [p.id, p.dynasty]));
    return (pid: string) => m.get(pid) ?? '';
  }, [index]);

  if (!edges) return null;
  if (!groups.length) {
    return (
      <section className="mb-5 rounded-lg border border-dashed border-miDim/25 p-4 text-center">
        <p className="font-serif text-sm text-miDim">未见可考的人物关系</p>
        <p className="mt-1 font-serif text-xs text-miDim/60">同年、师生、亲属、政敌等关系随考据增补。</p>
      </section>
    );
  }

  return (
    <section className="mb-5">
      <h3 className="mb-3 font-serif text-sm font-bold tracking-widest text-jin">人物关系</h3>
      <div className="space-y-3">
        {groups.map(([type, list]) => {
          const style = RELATION_STYLE[type] ?? { color: '#9AA5B1', label: type };
          return (
            <div key={type}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="h-px w-4" style={{ backgroundColor: style.color }} />
                <span className="font-serif text-xs tracking-widest" style={{ color: style.color }}>
                  {style.label}（{list.length}）
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {list.map((r) => (
                  <button
                    key={r.otherId + type}
                    onClick={() => pushPerson(r.otherId)}
                    className="group flex items-center gap-2 rounded-lg border border-miDim/15 bg-xuan/60 px-3 py-2 text-left transition-colors hover:border-jin/40"
                  >
                    <span className="font-serif text-sm text-mi group-hover:text-jin">{r.otherName}</span>
                    <DynastyChip dynastyKey={dynastyOf(r.otherId)} />
                    {r.note && <span className="ml-auto line-clamp-1 text-right font-serif text-[11px] text-miDim/80">{r.note}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 font-kai text-[11px] text-miDim/60">点击卡片可跳转对方人物帖，可逐级返回。</p>
    </section>
  );
}

function DynastyChip({ dynastyKey }: { dynastyKey: string }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#666');
  useEffect(() => {
    loadDynastiesNames().then((m) => {
      setName(m.get(dynastyKey)?.name ?? '');
      setColor(m.get(dynastyKey)?.color ?? '#666');
    });
  }, [dynastyKey]);
  if (!name) return null;
  return (
    <span className="rounded px-1 py-0.5 font-serif text-[10px]" style={{ backgroundColor: color + '22', color }}>
      {name}
    </span>
  );
}

// 避免整包引入 dynasties 的轻量缓存（与 data.ts loadDynasties 同源缓存）
import { loadDynasties } from '../../lib/data';
const dynastiesCache = { p: null as Promise<Map<string, { name: string; color: string }>> | null };
function loadDynastiesNames() {
  if (!dynastiesCache.p) {
    dynastiesCache.p = loadDynasties().then((ds) => new Map(ds.map((d) => [d.key, { name: d.name, color: d.color }])));
  }
  return dynastiesCache.p;
}
