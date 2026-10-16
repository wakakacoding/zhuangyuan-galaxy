# 状元星河 · Lighthouse 三页实测（M5-c / T7a）

- **实测对象**：首页 `/`、地图 `/map/`、问答 `/insights/`（线上 `https://wakakacoding.github.io/zhuangyuan-galaxy`）
- **验收标准**：三页 Performance ≥ 90；不达标项有优化清单
- **状态**：沙箱内完成构建冒烟 + 静态产物摸底（第三节，真数据）；**浏览器实测分数待本机终端回填**（第四节点 `npm run lighthouse` 自动写入）
- **分支基线**：HEAD `e4d9949`（A4 `--deep` 合并**未**入库，故按指令用现有 dist 摸底）

---

## 一、为什么实测必须在你的本机终端跑

沙箱内 Chrome 无法启动，逐一验证：

| 尝试 | 结果 |
| --- | --- |
| `Chrome --headless=new --dump-dom https://example.com` | 退出码 **137 / SIGTERM** |
| 同上，关闭沙箱隔离（dangerouslyDisableSandbox） | 仍是 **137 / SIGTERM** |
| `open -na "Google Chrome" --args --headless=new --remote-debugging-port=9222` | `open` 返回 0，但 `user-data-dir` 未创建、9222 无监听 → 进程被回收 |

Lighthouse 强依赖 Chrome，因此 T7a 的实测环节按指令走本机终端（一键脚本见第五节）。

## 二、沙箱内已完成：构建与冒烟

- A4 未入库 → 用现有 `dist/`（构建于 2026-10-15 17:39）摸底，未额外重建
- 本地 preview（4321）冒烟全绿：

| 路由 | 状态 | 体积 |
| --- | --- | --- |
| `/` | 200 | 8,569 B |
| `/map` | 200 | 9,319 B |
| `/insights` | 200 | 45,308 B |
| `/network` | 200 | 8,233 B |
| `/person/z0001/` | 200 | 11,124 B |

- 线上冒烟（GitHub Pages）：`/`、`/map/`、`/insights/` 均 200（注意**必须带尾斜杠**，否则 301）
- ⚠️ **口径提醒**：本地 dist 以 `base='/'` 构建，线上为 `base='/zhuangyuan-galaxy'`，同一份源码产出的 CSS 文件名不同（本地 `about.BSusDGpK.css`、线上 `about.KuleOnUB.css`），内容等价但**不可混用**。终测一律以线上 URL 为准。

## 三、静态摸底：产物体积与传输实测（真数据）

### 3.1 线上各资源实际传输量（GitHub Pages **只提供 gzip，不支持 brotli**，已逐项用 `Content-Encoding` 核验）

| 资源 | 原始 | gzip 传输 | 出现在 |
| --- | ---: | ---: | --- |
| `about.*.css`（全局样式表） | 273,367 B | **108,774 B** | 三页阻塞 |
| `client.*.js`（React 水合运行时） | 215,568 B | 67,724 B | 三页 |
| `GeoMap.*.js` | 113,393 B | 37,939 B | /map |
| `InsightChart.*.js` | 40,481 B | 15,140 B | /insights |
| `AggregateSankey.*.js` | 15,088 B | 6,076 B | /insights |
| `PersonOverlay.*.js` | 14,009 B | 5,145 B | 四页（详情浮层） |
| `StarMapGate.*.js` | 3,140 B | 1,779 B | / |
| `FilterBar.*.js` | 2,949 B | 1,514 B | /、/map |
| `RegionPanel.*.js` | 1,818 B | 962 B | /map |
| `ShareButton.*.js` | 1,518 B | 868 B | 全站 |
| 页面 HTML（gzip） | — | / 3,648 · /map/ 3,948 · /insights/ 8,958 · /network/ 3,445 | — |
| ECharts canvas 渲染器 | 421,403 B | 按需动态导入（未进首屏 HTML） | 星图/地图水合后 |

### 3.2 全局 CSS 的构成拆解（**关键发现**）

| 组成 | 字节 | 占 CSS |
| --- | ---: | ---: |
| `@font-face` 声明骨架（**202 条** = 101 子集 × 400/700） | 206,044 | 75.4% |
| 内联 base64 字体（12 个小子集，命中 Vite 4KB 内联阈值） | 43,274 | 15.8% |
| 其余站点样式 | 22,029 | 8.1% |

→ **91.9% 的全局阻塞 CSS 是字体声明**，而真正的站点样式只有 22 KB。`font-display` 全部为 `swap`（202/202），`unicode-range` 分片 202 条，语义正确——问题不在写法，而在「字体声明挤进了每页的阻塞样式表」。

### 3.3 字体资产

- `@fontsource/noto-serif-sc`：dist 内 **196 个 woff2 + 等量 woff 回退**（98 子集 × 2 字重），合计 6.4 MB
- 运行时只按 `unicode-range` 命中实际用到的子集，**不会全量下载**；但**没有任何字体 preload**
- 首页星图移动端静态全景 `images/starmap-panorama.svg` 54 KB（桌面端不加载）

### 3.4 水合策略现状（源码核对）

| 页面 | 岛 | 指令 | 首屏代价 |
| --- | --- | --- | --- |
| `/` | `StarMapGate` | `client:only` | 立即拉 React 运行时 + 桌面端随即 `import('./StarMap')` → ECharts |
| `/` `/map` | `FilterBar` / `PersonOverlay` | `client:load` | 立即水合 |
| `/map` | `GeoMap` / `RegionPanel` | `client:only` | 立即拉 React + 地图 bundle |
| `/insights` | `InsightChart` / 完整度图 | `client:visible` | **已优化**（进视口才加载） |
| `/insights` | `AggregateSankey` | `client:only` | 立即水合 |

结论：`/insights` 已用了 `client:visible`，首页与地图页仍是「首屏即重水合」，这与静态数据吻合（首页/地图是唯一会拉 ECharts 的页面）。

## 四、实测分数（本机终端实测后自动回填）

运行 `npm run lighthouse`（或 `node scripts/lighthouse-check.mjs`）后，本节由脚本在标记块内自动写入分数表、关键指标与不达标项。

**本机终端一键命令**（等价于指令里的三条 `npx lighthouse ... --preset=desktop`，并额外自动回填本节）：

```bash
cd /Users/mba/WorkBuddy/top_person_life/zhuangyuan-galaxy
npm run lighthouse             # 线上三页 · desktop preset（首次会下载 lighthouse，约 1 分钟）
npm run lighthouse -- --view   # 同上，跑完自动打开 HTML 报告
npm run lighthouse -- --local  # 改测本地 preview（4321 端口需先起 npm run preview）
```

<!-- LH:SCORES:BEGIN -->

_（待回填——在本机终端执行 `cd /Users/mba/WorkBuddy/top_person_life/zhuangyuan-galaxy && npm run lighthouse`）_

<!-- LH:SCORES:END -->

## 五、优化清单（按预估收益排序，含具体改法）

> 原则：先测后改。下面每条都已用第三节的实测数据定位到具体资源与字节数，不是泛泛建议。P0/P1 只在实测 Performance < 90 时动手。

### P0-1 把字体声明移出首屏阻塞 CSS（三页共同，收益最大）

- **证据**：阻塞 CSS 273 KB / gzip 109 KB，其中 91.9% 是字体声明；站点真实样式仅 22 KB
- **改法**：`src/layouts/BaseLayout.astro` 把静态 CSS 导入改为 URL 导入 + 异步加载

  ```astro
  ---
  import font400 from '@fontsource/noto-serif-sc/400.css?url';
  import font700 from '@fontsource/noto-serif-sc/700.css?url';
  ---
  <link rel="stylesheet" href={font400} media="print" onload="this.media='all'" />
  <link rel="stylesheet" href={font700} media="print" onload="this.media='all'" />
  <noscript><link rel="stylesheet" href={font400} /><link rel="stylesheet" href={font700} /></noscript>
  ```

- **预期**：首屏阻塞 CSS 从 109 KB(gzip) 降到约 10 KB(gzip)；FCP/LCP 明显提前
- **风险**：字体到达更晚 → 首屏中文先以系统衬线渲染再替换，CLS/视觉跳动可能变大。缓解办法：① 保留 `font-display: swap`；② 用构建脚本统计首屏用字 → 定位命中的 1–2 个子集，单独 `rel="preload" as="font" crossorigin`；③ 或改用 `font-display: optional`（放弃替换，彻底消 CLS）

### P0-2 首屏水合降级：`client:only` → `client:idle`

- **证据**：首页 `StarMapGate`、地图页 `GeoMap` 为 `client:only`，水合即拉 React 运行时（67.7 KB gzip）+ 地图/星图 bundle（37.9 KB gzip）+ ECharts canvas 渲染器（源 421 KB）→ TBT 与「减少未使用 JS」主因
- **改法**：`src/pages/index.astro`、`src/pages/map.astro` 中 `client:only="react"` → `client:idle`（或 `client:visible` + 现有「星图加载中…」骨架）；`/insights` 的 `AggregateSankey` 同改
- **预期**：TBT 下降最明显（桌面端强 CPU 也常因此卡在 90 分线下）
- **注意**：首页星图是核心体验，`client:idle` 会让星图晚数百 ms 出现——需与首屏观感权衡，改后必须复测并肉眼走查

### P1-1 补字体 preload + 收敛字重

- **证据**：三页 `<head>` 无任何 `rel="preload" as="font"`；202 条 `@font-face` 中 700 字重 101 条
- **改法**：给首屏命中的子集加 preload；确认 700 是否只在标题/少量 UI 使用（源码中 `font-bold` 用量可观，**不建议盲目砍**），若确认 700 仅个别元素，可只加载 400 + 用合成粗体
- **预期**：LCP 提前、CLS 收敛；字重收敛可直接砍掉约 100 KB 声明开销

### P1-2 已知平台项：缓存与压缩（记录，不修）

- GitHub Pages 对所有资源（含内容哈希命名的 `_astro/*`）返回 `cache-control: max-age=600` → 回访用户无法长期命中缓存
- GitHub Pages **不支持 brotli**（已实测：`Accept-Encoding: br` 无 `Content-Encoding`，仅 gzip 生效）。若迁 Cloudflare Pages / Netlify，同一份产物 CSS 可再省约 15–20% 传输
- 这两项**无法在 GitHub Pages 侧修改**，列为已知限制，避免后续重复排查；迁站时作为收益项列出

### P2 其他可选项（仅在分数仍不达标时尝试）

- 首次进入的地图切片：`dist/data/maps` 2.0 MB / `dist/data/person` 2.6 MB，核对地图页首屏是否拉取超出可视范围的切片（按朝代懒加载）
- `starmap-panorama.svg` 54 KB：确认是否需要，可移入视口外懒加载
- 无障碍/最佳实践：深色底 + 金属金色文字需人工核对对比度是否达 4.5:1（自动化会命中 color-contrast 审计）

## 六、复测约定

1. **本轮**：本机跑 `npm run lighthouse`，回填第四节 → 若三页 Performance ≥ 90 直接归档结项
2. **A4 入库后**：`npm run build` 重建 + 线上部署完成，再跑一次（对象改为线上 URL），确认 `--deep` 增量未引入性能回退
3. **每次性能改动后**：跑同一条命令对比，结论写回本文件 + 《状元星河-建设进展盘点与下一步规划》§六
4. 脚本产出的原始报告保留在 `docs/lighthouse/`（`*.report.html` 可直接浏览器打开查看瀑布图与审计详情）
