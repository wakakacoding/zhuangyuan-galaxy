// 地区面板：点击历史政区后滑出该地区状元名单（当前朝代切片内）
// 桌面右侧抽屉 / 移动端底部上滑卡片；URL ?region= 可分享
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { selectedRegion, setRegion, mapSlice } from '../../store/filters';
import { selectPerson } from '../../store/selection';
import { loadGeo, type GeoPoint } from '../../lib/data';

export default function RegionPanel() {
  const region = useStore(selectedRegion);
  const slice = useStore(mapSlice);
  const [pts, setPts] = useState<GeoPoint[]>([]);

  useEffect(() => {
    if (!region) return;
    loadGeo().then((g) => {
      setPts(g.points.filter((p) => p.region === region && (!slice || p.dynasty === slice)));
    });
  }, [region, slice]);

  if (!region) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 max-h-[55vh] overflow-hidden rounded-t-xl border border-jin/25 bg-xuan/95 shadow-2xl backdrop-blur md:inset-x-auto md:bottom-16 md:right-4 md:top-4 md:w-80 md:rounded-lg">
      <div className="flex items-center justify-between border-b border-jin/15 px-4 py-3">
        <div>
          <h3 className="text-base font-bold text-jin">{region}</h3>
          <p className="mt-0.5 text-[11px] text-miDim">该政区状元 {pts.length} 人（按科年排序）</p>
        </div>
        <button
          onClick={() => setRegion(null)}
          aria-label="关闭"
          className="rounded-full border border-jin/30 px-2.5 py-1 text-xs text-miDim hover:bg-jin/10 hover:text-jin"
        >
          ✕
        </button>
      </div>
      <ul className="max-h-[calc(55vh-4rem)] overflow-y-auto px-2 py-2 md:max-h-none md:flex-1">
        {pts.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-miDim">此切片年内暂无该政区状元记录</li>
        )}
        {[...pts].sort((a, b) => a.exam_year - b.exam_year).map((p) => (
          <li key={p.id}>
            <button
              onClick={() => selectPerson(p.id)}
              className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-jin/10"
            >
              <span className="text-sm text-mi">{p.name}</span>
              <span className="text-[11px] text-miDim">{p.exam_year} 年</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
