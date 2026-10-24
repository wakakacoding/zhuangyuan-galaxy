// 仕途四维（最高官 / 末任 / 去向 / 死亡）的三态呈现。
// 人物页与人物帖浮层共用，判定逻辑在 lib/careerFacts.ts，避免两处口径分叉。
//
// 三态在文案与视觉上都可区分（契约 v1 §3.2）：
//   missing  → 虚线灰框 + 「尚未整理」；不写"无"、不写"不详"
//   unknown  → 实线灰框 + 「已检索，未见记载」+ 检索说明
//   recorded → 亮色值 + 时间精度 + 出处
import { readCareerFacts, type CareerFactView } from '../../lib/careerFacts';

interface SourceLike { id: string; title: string; tier: 'A' | 'B' | 'C' }

interface Props {
  career: unknown;
  sources?: SourceLike[];
  /** page：出处可跳到页底锚点；overlay：浮层内只展示书名与等级 */
  variant?: 'page' | 'overlay';
}

const CARD: Record<CareerFactView['state'], string> = {
  missing: 'border-dashed border-miDim/25 bg-transparent',
  unknown: 'border-solid border-miDim/35 bg-xuan/40',
  recorded: 'border-solid border-jin/30 bg-dai/60',
};

const STATE_CHIP: Record<CareerFactView['state'], string> = {
  missing: 'border border-dashed border-miDim/35 px-1.5 py-0.5 text-[10px] text-miDim/70',
  unknown: 'border border-miDim/40 bg-miDim/10 px-1.5 py-0.5 text-[10px] text-miDim',
  recorded: '',
};

export default function CareerFacts({ career, sources = [], variant = 'page' }: Props) {
  const facts = readCareerFacts(career);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const pad = variant === 'overlay' ? 'p-2.5' : 'p-3';

  return (
    <section className="mt-6" aria-labelledby="career-facts-heading" data-career-facts={variant}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id="career-facts-heading" className="border-l-2 border-jin pl-2 font-serif text-base font-bold text-mi">
          仕途四维
        </h2>
        <span className="font-serif text-[11px] text-miDim/60">最高官 · 末任 · 去向 · 死亡</span>
      </div>
      <p className="mt-1.5 font-kai text-[11px] leading-5 text-miDim/70">
        「尚未整理」表示本站还没做这一维，不等于没有；「已检索，未见记载」表示查过而没找到。两种都不会写成「无」或「不详」。
      </p>
      <dl className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {facts.map((f) => {
          const src = f.sourceId ? sourceById.get(f.sourceId) : undefined;
          return (
            <div
              key={f.dim}
              className={`rounded-lg border ${CARD[f.state]} ${pad}`}
              data-career-dim={f.dim}
              data-career-state={f.state}
            >
              <dt className="font-serif text-[11px] tracking-widest text-miDim/70">{f.label}</dt>
              <dd className="mt-1 font-serif text-sm leading-6">
                {f.state === 'recorded' ? (
                  <span className="text-mi">{f.text}</span>
                ) : (
                  <span className={`inline-block rounded-sm ${STATE_CHIP[f.state]}`}>{f.text}</span>
                )}
                {f.timeText && <span className="ml-2 text-xs text-miDim">{f.timeText}</span>}
                {f.state === 'recorded' && (
                  <span className="mt-0.5 block text-[11px] text-miDim/70">
                    {src ? (
                      variant === 'page' ? (
                        <a href={`#source-${src.id}`} className="underline decoration-jin/30 hover:text-jin">
                          出处：《{src.title}》（{src.tier} 级）
                        </a>
                      ) : (
                        <>出处：《{src.title}》（{src.tier} 级）</>
                      )
                    ) : (
                      <>出处：尚未标注{f.sourceId ? `（${f.sourceId}）` : ''}</>
                    )}
                  </span>
                )}
                {f.note && <span className="mt-0.5 block font-kai text-[11px] leading-5 text-miDim/70">{f.note}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
