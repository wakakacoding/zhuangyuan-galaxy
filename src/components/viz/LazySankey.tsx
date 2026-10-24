// 旧桑基图：折叠时不下载图表代码，展开后才动态导入。
// 之前是文件顶部静态 import，打包时 chunk 仍随页面一起进来，折叠只是没渲染。
import { useEffect, useState, type ComponentType } from 'react';

export default function LazySankey() {
  const [open, setOpen] = useState(false);
  const [Chart, setChart] = useState<ComponentType | null>(null);

  useEffect(() => {
    const details = document.querySelector('#q6 details');
    if (!details) return;
    const sync = () => setOpen((details as HTMLDetailsElement).open);
    sync();
    details.addEventListener('toggle', sync);
    return () => details.removeEventListener('toggle', sync);
  }, []);

  useEffect(() => {
    if (!open || Chart) return;
    let dead = false;
    import('./AggregateSankey').then((m) => {
      if (!dead) setChart(() => m.default);
    });
    return () => { dead = true; };
  }, [open, Chart]);

  if (!open || !Chart) {
    return <p className="font-serif text-xs text-miDim">展开后才加载这张旧图，不在页面打开时下载。</p>;
  }
  return <Chart />;
}
