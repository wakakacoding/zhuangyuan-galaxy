# 状元星河（zhuangyuan-galaxy）

一眼望尽 1283 年：唐武德五年（622）至清光绪三十年（1904），654 位有姓名可考的文状元，一张可探索的星图。

互动可视化网站：星图（年份播放/WebM 导出）· 籍贯地图（CHGIS 历史政区八朝切片）· 关系网络（Louvain 社区标注）· 数据问答 · 人物页 SSG ×654。

## 构建

```bash
npm install
npm run build    # build:maps → build:data → build:panorama → astro build
npm run preview  # 本地预览
```

- `build:maps`：CHGIS 原始 shp（`data/geo/chgis/raw/`，**不入库**，获取方式见 `data/geo/SOURCES.md`）→ 八朝 GeoJSON 切片。**无原始数据时自动跳过重建**，复用已入库的 `public/data/maps/*.json`。
- `build:data`：YAML 源（`data/`）→ Zod 校验 → 编译 JSON 分包（`public/data/`）+ 统计预计算 + Louvain 社区发现。
- `build:panorama`：生成移动端静态星图全景 SVG。

## 数据约定

- 史料三级可信度（A 正史碑录 / B 方志年谱 / C 笔记传说），A 级必须挂出处否则构建失败；空值合法，「史料阙如」如实呈现。
- 繁简归一表单一真源：`data/t2s.json`（前后端与构建脚本共享）。
- 数据修订即 commit，勘误请用 issue 模板（人名/朝代/讹误/出处依据）。

## 技术栈

Astro 5 + React 19 交互岛 + TypeScript + Tailwind + ECharts 5（按需）+ d3 子模块 + nanostores + zod。
