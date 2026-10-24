# 地理数据来源与许可（SOURCES）

本目录及 `public/data/maps/` 内所有地理数据的来源、许可与坐标系统记录于此。**新增任何地理数据文件时必须在此登记。**

## 0. Cliopatria 疆域轮廓（现行历史底图，2026-10-24 换源）

- **文件**：`cliopatria/dynasty-outlines-v1.geojson`（八朝政权级疆域轮廓，86KB）
- **来源**：Seshat Global History Databank **Cliopatria** v0.2.1（2026-10-03 发布；GitHub `Seshat-Global-History-Databank/cliopatria`，Zenodo `zenodo.org/records/13363121`）
- **许可**：**CC BY 4.0**（LICENSE.md 原文核实）——允许使用、分享、改编与再分发，须署名、附许可链接、说明改动。**再分发限制不存在**，切片可入公开 Git 与 Pages。
- **下载日期**：2026-10-24（git-blobs SHA-256 `a1e7093b64990bf97cd3c31bda96de1cafed822c` 对应的 blob，即 `cliopatria.geojson.zip`，46,005,176 B）
- **本站加工（即「改动说明」内容）**：① 按 8 个切片年截取对应政权年段轮廓（唐 741 / 五代 960 八政权 / 宋 1111 / 辽 1111 / 金 1189 / 元 1330 / 明 1582 / 清 1820）；② 每多边形抽稀至约 400 顶点；③ 政权名英→站内用 name 字段保留原文，前端展示用朝代色系。提取脚本逻辑记录于 `outputs/ai-tasks/2026-10-24-四线推进交接.md` §①。
- **学术引用**：Cliopatria 论文 *A dataset of polities, 3400 BCE–2024 CE*（Sci Data, DOI `10.1038/s41597-025-04516-9`）。
- **产物**：`public/data/maps/{dynasty}.json`（`scripts/build-geo-maps.ts` 生成，name=政权名，beg/end=数据年段）
- **辽代独立轮廓**：Liao Dynasty 1111–1125 年段，**宋图同源问题就此消解**（旧 CHGIS 无辽要素，liao.json 曾实为北宋政区）。
- **验证**：422 个有坐标人物按射线法归属新轮廓 422/422 命中（点面归属改政权级粒度）。
- **注意**：历史疆域为学术示意，不作国界依据；页面须固定显示该声明。疆域为 polity 级（非府级政区），地区列表不再按府分组。

## 1. CHGIS V6 时间序列（历史政区底图；**2026-10-24 起已弃用为底图**，保留作古今地名映射参考）

- **文件**：`chgis/raw/v6_time_pref_pgn_utf_wgs84/`（府级面）、`v6_time_pref_pts_utf_wgs84/`（府治点）、`v6_time_cnty_pts_utf_wgs84/`（县治点）
- **来源**：Harvard Dataverse · CHGIS V6（China Historical Geographic Information System, Version 6）
  - 府级面数据集：<https://dataverse.harvard.edu/api/access/datafile/2966510>
  - 数据集入口：<https://dataverse.harvard.edu/dataverse/chgis_v6>（V6 Time Series Dataverse）
  - 项目主页：<https://chgis.fas.harvard.edu/>（哈佛大学费正清中国研究中心 / 复旦大学历史地理研究中心）
- **下载日期**：2026-10-13
- **许可（EULA 原文，2026-10-20 补全）**：`License: free for academic research, no commercial use, resale, or redistribution permitted.`（见压缩包内 `CHGIS_V6_README.txt`）
  - 即：**免费学术使用，禁止商用、转售与再分发**。此前本文件只写"免费学术使用，须署名"，漏掉了 `no redistribution`，属记录不准，已更正。
  - **本站现状与 EULA 存在冲突且尚未解决**：`public/data/maps/*.json` 是 CHGIS 府级面的简化衍生切片，现入公开 Git 并经 GitHub Pages 公网分发。取得许可（路径 A）、换源（B）、限制公开（C1/C2/C3）三条处置路径与全部待决事项见 `outputs/ai-tasks/T03-地图来源与整改方案.md` §4–§5。**在获得书面许可或完成限制公开之前，不得在本文件或页面文案中把许可写成"已解决"。**
  - 规范引用串：`CHGIS, Version: 6. © Fairbank Center for Chinese Studies of Harvard University and the Center for Historical Geographical Studies at Fudan University, 2016.` 本站署名位置：`/about` 页面「地图数据来源与合规」节、`/map` 页固定标注、本文件。
- **坐标系**：WGS84
- **处理**：`scripts/build-geo-maps.ts` 按朝代切片年过滤（`BEG_YR ≤ 年 ≤ END_YR` **且 `TYPE_CH != "非政区国土"`**）→ mapshaper weighted 简化 → `public/data/maps/{dynasty}.json`
- **重切记录（2026-10-20 T10）**：输入 shp SHA-256 `71811aa7a1531e81a9fd6a5b84f1dac6632c0d9619130851871bad8875f9a96c`、压缩包 SHA-256 `d3aa9f397916f3ca017b9b6379854796846e2348d7303afc47375984a7e12f72`、mapshaper 0.7.83；八朝要素数 120/145/163/163/162/253/244/281，`非政区国土` 面 0 个，合计 2,014,761 B；逐份 md5 与验收方法见 `data/CHANGELOG.md` 同日条目与 `scripts/verify-geo-maps.mjs`
- **注意**：历史疆域为学术示意，不作国界依据；页面须固定显示该声明。

### 朝代切片年表

| 朝代 | 切片年 | 说明 |
|---|---|---|
| 唐 | 741（开元廿九年） | 道/州建制稳定期 |
| 五代十国 | 960（北宋初近似） | CHGIS 对五代政权覆盖有限，为近似切片 |
| 宋 | 1111（政和元年） | 北宋版图最大期 |
| 辽 | 1111（与宋同年） | **与宋图同源**：CHGIS V6 府级面无辽京道/五京道要素，`liao.json` 实为北宋 1111 政区，不是辽的疆域；页面底部常驻 `liao.map_note` 说明。是否改为"只显示点位"或另找辽代数据源待决（T03 D5） |
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
- **重切必须显式授权**：`scripts/build-geo-maps.ts` 默认跳过重切，只有 `BUILD_MAPS=1 npm run build:maps` 才真正改写切片（2026-10-20 曾因普通 `npm run build` 静默重切七朝切片，已还原并加锁）。切片是"受来源与合规约束的生成产物"，不接受构建噪声式变更
- **重切后必须验收**：`node scripts/verify-geo-maps.mjs --baseline <整改前的 ref 或目录>`，全部通过（0 失败）才可提交
- 重建顺序：先 `BUILD_MAPS=1 npm run build:maps`（切片变化时），再 `npm run build:data`（点面归属依赖切片产物）
