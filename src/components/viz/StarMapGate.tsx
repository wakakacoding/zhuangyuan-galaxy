// 星图入口门：移动端默认静态全景（构建期生成的 SVG），点「进入探索」才按需加载交互版
// 桌面端直接渲染交互版。client:only 保证首渲染即拿到真实断点，不会误加载
import { useEffect, useState, type ComponentType } from 'react';
import { useIsMobile } from '../../lib/useMediaQuery';

export default function StarMapGate() {
  const isMobile = useIsMobile();
  const [enterInteractive, setEnterInteractive] = useState(false);
  const [StarMapComp, setStarMapComp] = useState<ComponentType | null>(null);

  const needInteractive = !isMobile || enterInteractive;
  useEffect(() => {
    if (needInteractive && !StarMapComp) {
      import('./StarMap').then((m) => setStarMapComp(() => m.default)).catch(() => {});
    }
  }, [needInteractive, StarMapComp]);

  if (isMobile && !enterInteractive) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        <img
          src="/images/starmap-panorama.svg"
          alt="状元星河静态全景：622–1904 年 654 位状元，横轴为夺魁年份，纵带为朝代"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-x-4 bottom-4 rounded-lg border border-jin/25 bg-xuan/90 p-4 backdrop-blur">
          <p className="font-serif text-xs leading-6 text-miDim">
            每一颗星是一位有姓名可考的状元，共 654 位。横轴是夺魁之年，纵带是朝代；星光越亮，存世史料越丰。
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
      <div className="flex h-full w-full items-center justify-center font-serif text-sm text-miDim">
        星图加载中…
      </div>
    );
  }
  return <StarMapComp />;
}
