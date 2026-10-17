// 星图入口门：移动端默认静态全景（构建期生成的 SVG），点「进入探索」才按需加载交互版
// 桌面端直接渲染交互版。client:only 保证首渲染即拿到真实断点，不会误加载
import { useEffect, useState, type ComponentType } from 'react';
import { useStore } from '@nanostores/react';
import { useIsMobile } from '../../lib/useMediaQuery';
import { selectedDynasties, searchQuery } from '../../store/filters';
import { selectedPersonId } from '../../store/selection';

export default function StarMapGate() {
  const isMobile = useIsMobile();
  const dynasties = useStore(selectedDynasties);
  const query = useStore(searchQuery);
  const personId = useStore(selectedPersonId);
  const hasExploreState = dynasties.length > 0 || query.trim().length > 0 || Boolean(personId);
  const [enterInteractive, setEnterInteractive] = useState(hasExploreState);
  const [StarMapComp, setStarMapComp] = useState<ComponentType | null>(null);
  const [importFailed, setImportFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (hasExploreState) setEnterInteractive(true);
  }, [hasExploreState]);

  useEffect(() => {
    const enter = () => setEnterInteractive(true);
    window.addEventListener('starmap:enter', enter);
    return () => window.removeEventListener('starmap:enter', enter);
  }, []);

  const needInteractive = !isMobile || enterInteractive;
  useEffect(() => {
    if (!needInteractive || StarMapComp) return;
    let alive = true;
    setImportFailed(false);
    import('./StarMap')
      .then((m) => { if (alive) setStarMapComp(() => m.default); })
      .catch(() => { if (alive) setImportFailed(true); });
    return () => { alive = false; };
  }, [needInteractive, StarMapComp, attempt]);

  if (isMobile && !enterInteractive) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        <img
          src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/images/starmap-panorama.svg`}
          alt="状元星河静态全景：622–1904 年历代状元，横轴为夺魁年份，纵带为朝代"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-4 bottom-4 rounded-lg border border-jin/25 bg-xuan/90 p-4 backdrop-blur">
          <p className="font-serif text-xs leading-6 text-miDim">
            每一颗星是一位有姓名可考的状元。横轴是夺魁之年，纵带是朝代。星的基础明暗只反映本站档案整理程度，不代表人物价值或存世史料多少。
          </p>
          <button
            type="button"
            onClick={() => setEnterInteractive(true)}
            className="mt-3 w-full rounded-full border border-jin bg-jin/15 py-2.5 font-serif text-sm font-bold text-jin transition active:bg-jin/30"
          >
            进入探索 · 缩放漫游千年星河
          </button>
        </div>
      </div>
    );
  }

  if (!StarMapComp) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 font-serif text-sm text-miDim">
        {importFailed ? (
          <>
            <p role="alert">星图没有载入，网络恢复后可以重试。</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-full border border-jin/50 px-4 py-1.5 text-jin"
            >重试</button>
          </>
        ) : (
          <p role="status">星图加载中…</p>
        )}
      </div>
    );
  }
  return <StarMapComp />;
}
