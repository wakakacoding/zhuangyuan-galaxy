// 旧桑基图只在用户展开详情之后才加载 ECharts。折叠本身不下载图表。
import { useEffect, useState } from 'react';
import AggregateSankey from './AggregateSankey';

export default function LazySankey() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const details = document.querySelector('#q6 details');
    if (!details) return;
    const sync = () => setOpen((details as HTMLDetailsElement).open);
    sync();
    details.addEventListener('toggle', sync);
    return () => details.removeEventListener('toggle', sync);
  }, []);

  if (!open) {
    return <p className="font-serif text-xs text-miDim">展开后才加载这张旧图，不在页面打开时下载。</p>;
  }
  return <AggregateSankey />;
}
