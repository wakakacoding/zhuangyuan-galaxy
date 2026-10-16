# WebM 导出 · 真机验证清单

> **任务**：M5-c 指令 T7b —— 星图「年份播放 ⏺ 导出」四档真机验证（回退路径可用性）
> **被测功能**：首页星图底部播放条的「⏺ 导出」按钮（`src/components/viz/StarMap.tsx` · `startRecording`）
> **被测版本**：线上 `main@e4d9949` → `_astro/StarMap.CLGt4ZpT.js`（本地 dist 同名逻辑 `StarMap.BceIedUR.js`，MIME 数组逐字节一致）
> **入口**：<https://wakakacoding.github.io/zhuangyuan-galaxy/>（星图即首页）
> **状态**：静态分析 ✅ 完成（§1/§2/§5 含代码级预判）｜真机实测 ⬜ 待回填（§6）
> **测试清单产出**：2026-10-15

---

## 1. 实现事实（代码级，实测前须知的全部参数）

| 项 | 事实 | 源码位置 |
|---|---|---|
| 采集方式 | `canvas.captureStream(30)` + `MediaRecorder`，**实时录制**（屏幕上看到什么就录什么） | StarMap.tsx:269 |
| 码率 / 分片 | `videoBitsPerSecond: 8_000_000`；`rec.start(250)` 250ms 分片 | StarMap.tsx:270,289 |
| 播放区间 | 620 → 1912 年；`YEARS_PER_SEC = 1292/60` → **1× 全程 60 秒**，2× 30 秒，4× 15 秒 | StarMap.tsx:22-25 |
| 倍速继承 | 点导出**不重置倍速**，沿用手动选中的 1×/2×/4×（遮罩提示时长随之变化） | StarMap.tsx:287-290 |
| 预期体积 | ≈1 MB/秒 → 1× 约 40–60 MB，2× 20–30 MB，4× 10–15 MB（画面简单时 VP9 实际码率常低于设定值） | — |
| **MIME 优先级** | `video/webm;codecs=vp9` → `video/webm;codecs=vp8` → `video/webm` → `video/mp4`，取首个 `isTypeSupported` 为 true 者 | StarMap.tsx:26-30 |
| 文件名 | `状元星河-千年点亮.webm` / `.mp4`（中文名，见 R5） | StarMap.tsx:279 |
| 下载时机 | 播放抵达 1912 年后，在 `MediaRecorder.onstop` 里 `a.click()` —— **非用户手势触发**（见 R2） | StarMap.tsx:273-284 |
| 录制中交互 | `z-30` 半透明遮罩锁死全页交互（防 tooltip 入镜），播放条被盖住 → **录制中无法取消，只能等播完** | StarMap.tsx:532-545 |
| 不支持时 | 按钮 `disabled` + title「当前浏览器不支持录制，请用 Chrome / Edge」 | StarMap.tsx:512-514 |
| 后台节流防护 | `dt = Math.min(dt, 0.1)` —— 切后台回来不会跳年，但从冻结处继续（见 R3） | StarMap.tsx:209 |

---

## 2. 四档支持矩阵（官方事实 + 本站代码预判）

**浏览器事实基线**（来源见附录 B）：

- `canvas.captureStream()`：Chrome 51+ / Safari 11+ / iOS Safari 11+ / Android Chrome ✅ 全档可用
- `MediaRecorder`：Chrome 47+ / **Safari 14.1+（macOS）、14.5+（iOS）** ✅ 全档可用
- ⚠️ **Safari 14.1–18.3 只能录 `video/mp4`（H.264+AAC）**；**Safari 18.4 / iOS 18.4（2025-03）起新增 `video/webm`（VP8/VP9+Opus）录制**

| 档 | 设备 / 浏览器 | 引擎基线 | 预判命中 MIME | 预判产物 | 与设计意图是否一致 |
|---|---|---|---|---|---|
| **A** | 桌面 Chrome（macOS/Windows） | Chromium 149+ | `video/webm;codecs=vp9` | `.webm` | ✅ 基准档，符合 |
| **B** | Safari macOS | **Safari 26.x** | **`video/webm;codecs=vp9`** | **`.webm`** | ❌ **预期出 mp4，实际出 webm** |
| **C** | Safari iOS | **iOS 26.x** | **`video/webm;codecs=vp9`** | **`.webm`** | ❌ **同上** |
| **D** | Android Chrome | Chromium 149+ | `video/webm;codecs=vp9` | `.webm` | ✅ 符合 |

> **核心预判**：指令表写的「Safari 走 mp4 回退」只在 **Safari ≤ 18.3** 成立。本机与测试设备均为 2026 年系统（Safari 26.x / iOS 26.x），**四档预期全部命中 vp9 webm，mp4 分支实际不会被触发**。这既意味着「回退路径」需重新定义为「产物在目标设备可播可用」，也意味着 B/C 档的产物是 WebM 而非 MP4 —— 直接带来 R1 的下游影响。

**产物可播性事实（决定 §3 S8 判定）**：

- WebM 容器播放：Safari 14.1+（macOS）/ iOS 15+ 支持；VP9-in-WebM 自 Safari 16 稳定
- ⚠️ WebM+Opus 在 **iOS 15.4–17.3** 的 `video`/`audio` 元素中无法播放（WebKit bug 238546，iOS 17.4 修复）→ B/C 档设备（iOS 26）**自播预期 OK**
- ⚠️ **QuickTime Player 不支持 WebM**（macOS 双击打不开，需 Chrome / Safari / VLC）
- ⚠️ 微信 / 剪映 / 部分剪辑软件导入 WebM 兼容性差 —— 这是「导出分享」这一用户目标的实际卡点

---

## 3. 四档走查步骤（每档照做，结果填 §6）

前置：**保持屏幕常亮、不要切换标签页或 App、不要锁屏**（见 R3）；建议先用 1× 基准档，再补 2×/4×。

| # | 步骤 | 记录点 |
|---|---|---|
| S1 | 打开线上星图页，滚到星图，确认播放条可见、⏺ 导出按钮**未置灰** | 按钮态（灰/可点） |
| S2 | 打开控制台（桌面 F12；iOS 需 Safari 桌面「开发」菜单远程调试，或改用 §4-C 目视法），粘贴并运行**脚本 A** | 抄录完整输出（UA / 命中 MIME / 预期文件名） |
| S3 | 粘贴并运行**脚本 B**（3 秒微录制自检），观察是否自动下载 | 是否下载 / 文件大小 / 容器 |
| S4 | 点 ⏺ 导出，确认播放从 620 年重新开始、遮罩显示「正在录制 · YYYY 年」与进度条 | 起始年 |
| S5 | 全程注视：年份水印（公元+干支）滚动是否流畅、有无卡顿/掉帧/画面撕裂 | 流畅度 |
| S6 | 播到 1912 年后观察是否**自动触发下载**（iOS 可能弹提示或跳预览） | 自动下载成功 / 被拦 / 无反应 |
| S7 | 记录产物：扩展名、容器、体积、时长（与年份区间是否吻合 60s） | 见 §6 表 |
| S8 | 二次使用验证（任选 2 项）：① 用 Safari 打开该文件能否播放 ② QuickTime 双击 ③ 微信发送给文件传输助手并手机端打开 ④ 剪映/其他剪辑软件导入 | 可用 / 不可用 |

**专项复测**（每档至少做 1 项）：

- **T-1 倍速**：切 2× 后录制 → 应约 30 秒、体积约减半，水印滚动加快
- **T-2 干扰**：录制中切到别的标签页 10 秒再切回 → 画面应停在切走那一刻，回来**不跳年**（代码有 `dt≤0.1` 防护）
- **T-3 锁屏/切 App**（移动档）：录制中锁屏 10 秒 → 观察是否中断、下载是否仍触发
- **T-4 开头闪帧**：回看视频第 0–0.3 秒，是否出现「全亮→骤暗到 620 年」的闪帧（录制启动早于第一帧播放的时序风险）
- **T-5 中途取消**：录制中点画面任意处 → 确认遮罩锁死、无取消入口（预期行为，记录即可）

---

## 4. 诊断脚本（复制即用，粘贴到星图页控制台）

### A. 能力矩阵（秒出，四档必跑）

```js
(() => {
  const MIMES = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4','video/mp4;codecs=avc1.42E01E'];
  const hasMR = typeof MediaRecorder !== 'undefined';
  const matrix = {};
  if (hasMR) for (const m of MIMES) matrix[m] = MediaRecorder.isTypeSupported(m);
  const hit = MIMES.find((m) => hasMR && MediaRecorder.isTypeSupported(m)) ?? null;
  const cs = document.querySelectorAll('canvas');
  let big = null;
  for (const c of cs) if (!big || c.width * c.height > big.width * big.height) big = c;
  const out = {
    UA: navigator.userAgent,
    MediaRecorder: hasMR,
    'canvas.captureStream': typeof HTMLCanvasElement.prototype.captureStream === 'function',
    canvas数量: cs.length,
    最大canvas尺寸: big ? big.width + 'x' + big.height : '无',
    '本站命中MIME': hit,
    '预期文件名': hit ? (hit.includes('mp4') ? '状元星河-千年点亮.mp4' : '状元星河-千年点亮.webm') : '（按钮将置灰）',
  };
  console.table(matrix);
  console.log(JSON.stringify(out, null, 2));
  return out;
})()
```

### B. 3 秒微录制自检（验证端到端链路，免等 60 秒）

```js
(async () => {
  const cs = document.querySelectorAll('canvas');
  let canvas = null;
  for (const c of cs) if (!canvas || c.width * c.height > canvas.width * canvas.height) canvas = c;
  if (!canvas) { console.warn('未找到 canvas —— 请确认在星图页运行'); return; }
  const MIMES = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
  const mime = MIMES.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  if (!mime) { console.warn('MediaRecorder 不可用或无可录格式'); return; }
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const type = mime.split(';')[0];
    const blob = new Blob(chunks, { type });
    console.log('微录制完成', { mime, type, bytes: blob.size, chunks: chunks.length });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'webm-check-3s.' + (type.includes('mp4') ? 'mp4' : 'webm');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  rec.onerror = (e) => console.error('录制出错', e);
  rec.start(250);
  console.log('开始 3 秒微录制 · mime =', mime, '· canvas =', canvas.width + 'x' + canvas.height);
  setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 3000);
})()
```

### C. iOS 无远程调试时的目视替代（C 档）

iOS 若不便接桌面 Safari 调试：直接把**脚本 A** 的 `console.log(JSON.stringify(out))` 改为 `alert(JSON.stringify(out, null, 2))` 执行，截图弹窗即可（`console.table` 会静默丢弃，只留 alert 那份）。脚本 B 改为 `alert('bytes=' + blob.size + ' type=' + type)`。

---

## 5. 判定标准

| 结论 | 判据 |
|---|---|
| ✅ 通过 | S2 命中 MIME 与 §2 预判一致；S3/S6 下载成功；S7 扩展名/时长与倍速吻合；S8 至少 2 项可用；无 0 字节文件、无卡死 |
| ⚠️ 带风险通过 | 录制与播放成功，但 S8 二次使用受限（如 QuickTime 打不开 webm、微信端预览不佳）→ 记录为「体验债」，进 M6 清单 |
| ❌ 失败 | ① 按钮置灰（能力探测误判）② S3/S6 下载被拦或 0 字节 ③ 视频时长明显短于 60/30/15 秒（录制丢帧）④ 产物完全无法播放 |

**失败 → 开 issue 排修**，模板见附录 A（一个失败项一个 issue）。

---

## 6. 回填记录表（真机实测后填写）

**设备信息**

| 档 | 设备型号 | 系统版本 | 浏览器版本 | 测试人 | 日期 |
|---|---|---|---|---|---|
| A 桌面 Chrome | | | | | |
| B Safari macOS | | | | | |
| C Safari iOS | | | | | |
| D Android Chrome | | | | | |

**脚本 A 输出**（每档抄录一行）

| 档 | 本站命中 MIME | 预期文件名 | 与 §2 预判是否一致 |
|---|---|---|---|
| A | | | |
| B | | | |
| C | | | |
| D | | | |

**主流程结果**

| 档 | S3 微录制 | S6 自动下载 | 扩展名 | 体积 | 时长 | S8 可播/可用（注明方式） | 结论 |
|---|---|---|---|---|---|---|---|
| A | | | | | | | |
| B | | | | | | | |
| C | | | | | | | |
| D | | | | | | | |

**专项复测**

| 档 | T-1 倍速 | T-2 切后台 | T-3 锁屏 | T-4 开头闪帧 | T-5 中途取消 |
|---|---|---|---|---|---|
| A | | | — | | |
| B | | | — | | |
| C | | | | | |
| D | | | | | |

**问题登记**

| # | 档位 | 现象 | 复现步骤 | 升级为 issue |
|---|---|---|---|---|
| 1 | | | | ☐ |
| 2 | | | | ☐ |

---

## 7. 静态分析预判风险（待实测确认 → 决定是否排修）

### R1 · Safari 18.4+ 走 webm 而非 mp4（**高**）

- **现象**：Safari 26.x / iOS 26.x 上 `isTypeSupported('video/webm;codecs=vp9')` 已为 true，命中优先级数组第一项 → 产物是 `.webm`，与指令表「Safari → mp4 回退」的设计意图相反。
- **影响**：macOS 端 QuickTime 双击打不开；微信/剪辑软件导入 WebM 兼容性差；「导出可直接分享」的目标在苹果生态打折。
- **判定**：脚本 A 的「本站命中 MIME」在 B/C 档返回 `video/webm;codecs=vp9` 即确认。
- **建议修复**（实测确认后执行）：`pickRecordMime` 按引擎分流，WebKit 系优先 mp4 并显式带 codecs：

  ```ts
  const isWebKit = typeof navigator !== 'undefined' &&
    navigator.vendor === 'Apple Computer, Inc.' && !/chrome|crios|android/i.test(navigator.userAgent);
  const RECORD_MIMES = isWebKit
    ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  ```

  修完在 B/C 档复测，产物应为 `.mp4` 且 QuickTime 可直接播放。

### R2 · 非用户手势触发的下载可能被拦（**中**）

- **现象**：下载发生在播放结束（60 秒后）的 `onstop` 回调里，属程序触发下载，Safari/iOS 对非用户手势的下载有拦截/提示策略，可能变成「无反应」或跳到预览页。
- **判定**：S6 是否真正落盘成文件。
- **建议修复**：录制结束后不自动下载，改为在遮罩内显示「✅ 录制完成 · 保存视频」按钮，由用户点击触发 `a.click()` —— 既是用户手势（绕开拦截策略），也顺带解决 R5 的文件名提示问题。

### R3 · 录制依赖 rAF：切后台/锁屏会冻结画面（**中**）

- **现象**：录制期间切标签页/切 App/锁屏 → rAF 停摆 → 视频冻结在那一年，总时长不变但内容缺失（切回不跳年，因 `dt≤0.1` 防护）。
- **影响**：误操作即产出「半截」视频，用户不会重录。
- **建议修复**：录制期间申请 Screen Wake Lock（`navigator.wakeLock.request('screen')`，Safari 16.4+ 支持）；监听 `visibilitychange`，隐藏超 1 秒即取消录制并提示「录制中断，请保持页面在前台」。

### R4 · mp4 分支未带 codecs 参数（**低**）

- **现象**：`video/mp4` 无 codecs 时，部分 Safari 版本 `isTypeSupported` 返回 true，但构造 `MediaRecorder` 或实际编码仍可能失败（落到 vp9 时会掩盖此问题，故罕见于实测）。
- **建议修复**：随 R1 一并显式使用 `video/mp4;codecs=avc1.42E01E`，并给 `new MediaRecorder` 加 `try/catch` + `rec.onerror` 兜底（当前代码无错误处理，失败时遮罩会一直停在「正在录制」而用户不知情）。

### R5 · 中文文件名（**低**）

- **现象**：`状元星河-千年点亮.webm` 在部分 Android 下载器/微信文件系统下可能乱码。
- **建议修复**：文档标题用中文、文件名用 ASCII（如 `zhuangyuan-1000years.webm`），或在 R2 的保存按钮旁展示文件名。

---

## 附录 A · issue 模板（失败项排修）

```md
标题：[星图导出] <档位> <一句话现象>
正文：
- 档位/设备：<型号 · 系统 · 浏览器版本>
- 被测版本：main@<sha>（_astro/StarMap.<hash>.js）
- 复现步骤：1. 打开 <线上 URL> 2. …（照 §3 S1–S8）
- 期望：<如 扩展名 .mp4 且可被 QuickTime 播放>
- 实际：<如 产物为 .webm，QuickTime 无法打开>
- 诊断输出：脚本 A 的 JSON（粘贴）
- 附件：导出文件 / 录屏
- 严重度：阻塞（无法导出）/ 体验债（可导出但下游不好用）
```

## 附录 B · 事实来源

| 事实 | 来源 |
|---|---|
| MediaRecorder 各浏览器 MIME 支持矩阵；Safari 14.1–18.3 仅 mp4、18.4 起支持 WebM(VP8/VP9+Opus) | <https://www.testmuai.com/learning-hub/mediarecorder-browser-support/> |
| Safari 18.4 新增 WebM 录制（WebKit 官方发布说明） | <https://webkit.org/blog/16574/webkit-features-in-safari-18-4/> |
| `isTypeSupported` 兼容性（Chrome 47+ / Safari 14.1+ / iOS Safari 14+） | <https://developer.mozilla.org/docs/Web/API/MediaRecorder/isTypeSupported> |
| `canvas.captureStream()` 兼容性（Chrome 51+ / Safari 11+ / iOS Safari 11+） | <https://caniuse.com/canvas-capturestream> |
| WebM 播放支持（Safari 14.1+/iOS 15+）；iOS 15.4–17.3 WebM+Opus 不可播（WebKit bug 238546，17.4 修复） | <https://www.testmu.ai/web-technologies/mediarecorder/> |
| 本站实现参数（MIME 顺序、码率、时长、下载时机） | `src/components/viz/StarMap.tsx:22-30, 264-291, 469-545` |

---

*回填完成后：§6 表填齐 → 判定结论回写本节顶部状态行 → 失败项按附录 A 开 issue → 回写 `状元星河-建设进展盘点与下一步规划.md` §四 T7b 行。*
