# 地理数据来源与许可（SOURCES）

本目录及 `public/data/maps/` 内所有地理数据的来源、许可与坐标系统记录于此。**新增任何地理数据文件时必须在此登记。**

## 1. CHGIS V6 时间序列（历史政区底图）

- **文件**：`chgis/raw/v6_time_pref_pgn_utf_wgs84/`（府级面）、`v6_time_pref_pts_utf_wgs84/`（府治点）、`v6_time_cnty_pts_utf_wgs84/`（县治点）
- **来源**：Harvard Dataverse · CHGIS V6（China Historical Geographic Information System, Version 6）
  - 府级面数据集：<https://dataverse.harvard.edu/api/access/datafile/2966510>
  - 数据集入口：<https://dataverse.harvard.edu/dataverse/chgis_v6>（V6 Time Series Dataverse）
  - 项目主页：<https://chgis.fas.harvard.edu/>（哈佛大学费正清中国研究中心 / 复旦大学历史地理研究中心）
- **下载日期**：2026-10-13
- **许可**：CHGIS 数据供免费学术使用，须署名（EULA 见压缩包内 `CHGIS_V6_README.txt`）。本站署名位置：`/about` 页面「数据来源」节。
- **坐标系**：WGS84
- **处理**：`scripts/build-geo-maps.ts` 按朝代切片年过滤（`BEG_YR ≤ 年 ≤ END_YR`）→ mapshaper weighted 简化 → `public/data/maps/{dynasty}.json`
- **注意**：历史疆域为学术示意，不作国界依据；页面须固定显示该声明。

### 朝代切片年表

| 朝代 | 切片年 | 说明 |
|---|---|---|
| 唐 | 741（开元廿九年） | 道/州建制稳定期 |
| 五代十国 | 960（北宋初近似） | CHGIS 对五代政权覆盖有限，为近似切片 |
| 宋 | 1111（政和元年） | 北宋版图最大期 |
| 辽 | 1111（与宋同年） | 辽南京道等 |
| 金 | 1189（大定廿九年） | |
| 元 | 1330（至顺元年） | 行省/路 |
| 明 | 1582（万历十年） | 布政司/府 |
| 清 | 1820（嘉庆廿五年） | CHGIS 最完整切片 |

## 2. 现代中国边界

- **状态（2026-10-13 M4）**：**已撤除**。原使用的高德 DataV.GeoAtlas 数据（`100000_full.json`，无审图号）已从代码与产物中删除；地图页不再叠加任何现代矢量边界层，geo 坐标系改由当前历史切片兼任（boundingCoords 固定不变）。
- **合规口径**：页面固定标注「现代对照请以自然资源部标准地图服务为准」并链接 <http://bzdt.ch.mnr.gov.cn/>；about 页「地图数据来源与合规」小节同步声明。
- **上线前自查**：按《地图管理条例》对历史层做边界核对（历史疆域示意声明已常驻）；若未来恢复现代对照层，须使用带审图号的标准图件。

## 3. 古今地名映射表

- **文件**：`placenames.csv`（手工维护，208+ 条）
- **字段**：`hist,modern,lat,lng`（hist 为匹配键，支持简/繁混合，构建期归一）
- **坐标来源**：现代地名治所坐标，逐条人工查自公开地图服务；历史县治已消亡者（如遂安）映射至其现代承继行政区
- **匹配规则**：最长键优先；同长时后收录者优先（便于县名覆盖府名的精度修正）；`河南|` 式带 `|` 键表示「仅匹配籍贯字段恰为该值」（避免误吞「河南省xx县」式记录）
- **覆盖**：409/421 有籍贯记录者命中（97.2%）；剩余 12 条为蒙古/八旗/女真等非地理籍贯，按「空值合法」原则不映射

## 4. 仓库管理约定

- `chgis/raw/` 原始数据（约 31MB）不入 Git；按本文件第 1 节链接重新下载解压即可复现
- `public/data/maps/*.json`（约 2MB）为构建产物，**入 Git**，使无 CHGIS 原始数据时亦可构建网站
- 重建顺序：先 `npm run build:maps`（切片变化时），再 `npm run build:data`（点面归属依赖切片产物）
