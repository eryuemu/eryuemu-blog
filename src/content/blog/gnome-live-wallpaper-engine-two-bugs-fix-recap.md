---
title: '【折腾向】Ubuntu 26.04 动态壁纸扩展改造全记录：真全屏不暂停的根因 与 GNOME 50 删除 make_below()'
description: 'Ubuntu 26.04 + GNOME Shell 50.1 上给 gnome-wallpaper-engine（v1.2.1）做行为改造，目标是三个：① 开机不自启（不覆盖静态壁纸）；② 窗口最大化时壁纸继续播（配半透明终端）；③ 真全屏自动暂停、退出全屏自动恢复。过程中撞上两个障碍。障碍一：真全屏时壁纸根本不暂停（实测 mpv PID 全程不变），而排查过程中连续踩了两个大坑——先是把"壁纸不播"误判为扩展缺陷（真凶其实是 NVIDIA 驱动升级未重启导致 mpv 崩溃），更根本的是没意识到 GNOME Shell 会缓存扩展 JS，disable/enable 根本不重新加载改过的代码，导致前期所有"改完就观察"的实验结论全部作废；直到插桩诊断 + 注销重登才拿到真相：DING 桌面图标扩展那个永远铺满屏幕、系统判定为"最大化"的窗口 "Desktop Icons 1" 让 isFullscreenLike() 恒为真，AutoPause 状态被卡死。障碍二：退出全屏后壁纸重启会盖住所有应用窗口（且 mpv 图标冒进 Dock）——根因是原版写成 make_above() + make_below() 配对调用，而 GNOME 50 已删除 make_below()，异常被空 catch 吞掉后变成"只抬不压"。两处修复各只改一个方法，含完整"原版 ↔ 修复后"代码对照、md5 校验值与重打步骤。'
pubDate: '2026-09-13T00:48:00+08:00'
category: '开发'
type: 'ai-organized'
---

# 【折腾向】Ubuntu 26.04 动态壁纸扩展改造全记录：真全屏不暂停的根因 与 GNOME 50 删除 make_below()

> **需求**：桌面动态壁纸（视频）在 GNOME 上要实现三个行为——
> ① **开机不自启**（不覆盖静态壁纸）；② **窗口最大化时壁纸继续播**（配半透明终端，最大化也看得见）；③ **真全屏时自动暂停、退出全屏自动恢复播放**。
> **环境**：Ubuntu 26.04 LTS (Resolute Raccoon) · GNOME Shell 50.1 · mutter 50.1 · Wayland · NVIDIA 独显
> **扩展**：`gnome-wallpaper-engine@gjs.com`（Gnome Live Wallpaper v1.2.1），装在 `~/.local/share/gnome-shell/extensions/`
> **撞到的两个障碍**：
> - **障碍一**：**真全屏时壁纸根本不暂停**（实测 mpv PID 全程不变）。根因是 DING 桌面图标扩展那个永远铺满屏幕、系统判定为"最大化"的窗口 `"Desktop Icons 1"`，让扩展的 `isFullscreenLike()` 恒为真，AutoPause 逻辑被卡死。
> - **障碍二**：退出全屏后壁纸重启会**盖住所有应用窗口**（且 mpv 图标冒进 Dock）。根因是上游 API 变更：GNOME 50 删掉了 `make_below()`，而原版代码写的是 `make_above(); make_below();` 的配对调用，后半句抛异常被空 `catch` 吞掉，于是"只抬不压"。
>
> **排查途中踩的两个大坑**（本文重点记录）：
> 1. 把"壁纸不播"**误判成扩展缺陷**——真凶其实是 **NVIDIA 驱动升级未重启**导致 mpv 崩溃；
> 2. **GNOME Shell 会缓存扩展 JS**，`disable`/`enable` 不重新加载改过的代码 —— 这个坑让前期所有"改完就观察"的实验结论**全部作废**。
>
> **修复**：两处，各只改一个方法（第二处只改两个 `try` 块）。
> **本文定位**：需求 → 障碍 → 诊断证据 → 最小改动 → 验证，全流程 + 可重打的最小补丁 + 自包含恢复步骤。**扩展在线升级会覆盖这两处补丁**，所以这篇文档本身就是恢复手册。

关联笔记：[【折腾向】Ubuntu 26.04 让 KDE 与 GNOME 完全隔离的实战全记录](/blog/ubuntu-kde-gnome-dual-desktop-isolation-recap/) · [【折腾向】Ubuntu 26.04 装 KDE 两次翻车全复盘](/blog/ubuntu-kde-two-failed-installs-recap/)

---

## 0. 结论速览（先看这个）

| 项目 | 结论 |
|------|------|
| 需求① 开机不自启 | dconf `autostart=false` 一行解决（只影响"登录时自动启动"） |
| 需求② 最大化不暂停 | 改 `modules/windowUtils.js` 的 `isFullscreenLike()`：排除 `WindowType.DESKTOP`，且不再把"最大化"当全屏 |
| 需求③ 真全屏暂停/退出恢复 | `pause-on-fullscreen=true` + 修好 `isFullscreenLike()` 之后**才真正生效** |
| **障碍一真凶** | DING（`ding@rastersoft.com`）的 `"Desktop Icons 1"` 窗口：永远存在、铺满屏幕、`_isWindowMaximized()` 判定为 true |
| 障碍一为何导致"不暂停" | `isFullscreenLike()` 恒为真 → `hasFullscreen` 永远 true → AutoPause 状态被锁死，真全屏时反而无法正常触发暂停/恢复 |
| **坑 1：最初的"壁纸不播"** | 真凶是 **NVIDIA 驱动 595.84→595.91.07 自动升级未重启** → `Driver/library version mismatch` → mpv 崩溃（`vo_x11_init` 断言）。**与扩展无关** |
| **坑 2：前期实验全部作废** | **GNOME Shell 缓存扩展 JS**，`disable`/`enable` 不重新加载改过的代码 → 必须注销重登 |
| 障碍二真凶 | GNOME 50 删除了 `make_below()`，原版 `make_above(); make_below();` 只成功前半句 → 窗口永久留在顶层 |
| 附带症状 | mpv 图标出现在 Ubuntu Dock —— 同因：`set_skip_taskbar()` 在 GNOME 50 已改名 `skip_taskbar()` |
| 改动量 | `windowUtils.js` 改 1 个方法（+1 行 import）；`wallpaper.js` 改 2 个 `try` 块 |
| 复发风险 | 扩展在线升级会覆盖两处补丁，重打步骤见第 8 节 |

---

## 1. 需求：三个行为目标

动态壁纸扩展（视频壁纸）的默认行为与需求不符，需要改造出三个效果：

| # | 目标 | 默认行为为什么不行 |
|---|------|-------------------|
| ① | **开机不自启** —— 不覆盖静态壁纸 | 扩展默认 `autostart=true`，登录就把静态壁纸顶掉 |
| ② | **窗口最大化时壁纸继续播** | 原版把"窗口最大化"也算作全屏，一旦有窗口最大化就可能停掉壁纸（配半透明终端时体验很差） |
| ③ | **真全屏时自动暂停 / 退出全屏自动恢复** | 这是最核心的一条，但**实测完全不生效**（见第 3 节） |

**先把"全屏"的三种含义分清楚**（这是后面所有判断的前提）：

| 模式 | 怎么进入 | 顶栏在吗 | 算不算"真全屏" |
|---|---|---|---|
| **最大化** | 点窗口右上角方块 / 拖到屏幕顶部 | **在** | ❌ |
| **网页全屏** | 视频播放器右下角"网页全屏"图标 | **在** | ❌ |
| **真全屏** | 按 **F11** / 播放器"全屏"按钮 / 进游戏 | **没了** | ✅ |

**判断标准就一条：看顶栏还在不在。**

---

## 2. 环境与扩展信息

```
系统      Ubuntu 26.04 LTS (Resolute Raccoon) / Wayland / GNOME Shell 50.1 / mutter 50.1
扩展      gnome-wallpaper-engine@gjs.com  (Gnome Live Wallpaper v1.2.1)
路径      ~/.local/share/gnome-shell/extensions/gnome-wallpaper-engine@gjs.com/
壁纸      姬野永远.mp4
```

扩展的关键文件（改动前）：

| 文件 | 原版 md5 / 字节 | 作用 |
|---|---|---|
| `modules/windowUtils.js` | `18f2be57fb7fa6e6e1e320871d457640` / 1367 | 窗口判定工具（含"是否类全屏"） |
| `modules/wallpaper.js` | `05beb3b0c0e91934507877b826464435` / 5774 | 壁纸窗口生命周期与窗口规则 |
| `modules/autoPause.js` | `2e25cd2587fad5c1e4ccdcf9a3012297` / 3084 | 自动暂停/恢复逻辑 |
| `extension.js` | `4c7d8371a9864695b336cc5da528c7a2` / 3449 | 入口 |

---

## 3. 障碍一：真全屏时壁纸不会自动暂停

### 3.1 起点：一个被误判的"壁纸不播"

最初的报障是 **"视频壁纸不播放了"**。第一反应很自然：是不是扩展出 bug 了？

**但真凶与扩展无关：**

```
11:16  Ubuntu 自动升级 NVIDIA 驱动 595.84 → 595.91.07（未重启，内核模块还是旧的）
12:25  nvidia-smi → Failed to initialize NVML: Driver/library version mismatch
       mpv 开始崩溃：vo_x11_init 断言失败
12:33  重启
12:34  mpv 自己起来了（~/.cache/mpv 里出现 12:34 的新 shader 文件）
```

**三方版本核对**（重启后）：

```
内核模块 595.91.07  =  磁盘模块 595.91.07  =  用户态 595.91.07   ✅
nvidia-smi → RTX 5060 Laptop GPU, 595.91.07, 1222 MiB          ✅
```

> ⚠️ **第一条教训：报障的症状描述会误导排查方向。**
> "壁纸不播"听起来像壁纸扩展的问题，实际是显卡层的驱动不匹配——
> **所有吃显卡的程序（不只壁纸）当时都挂了**。
> 排查时先问一句"还有别的东西不正常吗"，比直接钻进出问题的那个软件更快。

### 3.2 坑 1：把它误判成"扩展缺陷"

驱动问题解决后，排查转向了扩展本身，并给出了一个听起来很有说服力的推断：

> 扩展的 `isFullscreenLike()` 把「窗口最大化」也算成了「全屏」，
> 而 `pause-on-fullscreen` 默认是 `true` —— 所以只要有窗口最大化，壁纸就会被停掉。

代码确实是这么写的：

```js
// modules/windowUtils.js（原版）
static isFullscreenLike(metaWin) {
    return metaWin.is_fullscreen() || this._isWindowMaximized(metaWin);
    //                             ↑ 把「窗口最大化」也算成了「全屏」
}
```

**但这个推断被实测直接否定了：**

> **"没有这个 bug 的，因为我一直就用的好好的。"**
>
> **"其实窗口最大化的时候壁纸是一直在播放的 —— 我的终端是透明的，开了最大化也是在播放的，可以看到。"**
>
> **"不论是怎么改，我这个最大化终端是一直能看到视频播放的。"**

> 💡 **第二条教训：能观察到的事实，比能读懂的代码更可靠。**
> 代码里确实有那个分支（读代码没读错），但**推论出的行为与实测不符** ——
> 那就说明推论里漏了某个前提（本例里漏的正是第 3.4 节的缓存问题）。
> **当"代码看起来会这样"和"实测就是这样"冲突时，先信实测。**

### 3.3 坑 2（更根本）：所有"改完就观察"的实验全部作废

排查中做过一组 A/B 对照实验："关掉开关 → mpv 稳定跑；打开 → mpv 秒死"，
据此认定"这个开关就是元凶"。

**直到插桩时才发现这组实验根本无效。**

在 `extension.js` 的 `enable()` 最上面同时插入 `printerr` 和 `log` 两种"必定进日志"的输出，然后 disable/enable：

| 检查项 | 结果 |
|---|---|
| `[WPE-TEST]`（新代码的标记） | ❌ **没有** |
| `[WPE-DIAG]`（新加的诊断） | ❌ **没有** |
| `disable()` 自己的警告 `Source ID ... not found` | ✅ **有**（证明重载确实执行了） |

**→ 结论：GNOME Shell 把扩展的 JS 缓存住了。改文件之后 `disable`/`enable` 不会重新读取代码，必须注销重登。**

（Wayland 下也没法像 X11 那样 `Alt+F2` → `r` 热重启 Shell。）

**这意味着：**

| 作废的结论 | 为什么错 |
|---|---|
| "扩展把最大化当全屏，所以壁纸一直被暂停" | 代码里确实有那段，但**实测最大化时壁纸照播** → 推论错 |
| "改代码修好了最大化的问题" | 改动通过 disable/enable **压根没被加载**，那个"修复"从未生效 |
| "A/B 对照实验证明了 XX" | 观察到的现象**出在反复重载扩展的过程中**（重载时正好有窗口铺满屏幕，暂停状态被锁住），不代表正常使用时的行为 |

> ⚠️ **第三条教训（本文最重要的一条）：**
> **在一个会缓存代码的环境里做实验，"改完立刻观察"是无效的。**
> 这个坑的代价是所有前期实验结论作废、方向跑偏好几轮。
> **正确做法：改代码 → 注销重登 → 再观察。** 慢一分钟，但结论可信。
>
> 而`dconf` 设置是**实时读取**的，改设置不用重登 —— 这两者的区别要分清。

### 3.4 拿到真相：插桩 + 注销重登

绕开上面的坑之后，流程终于对了：**加诊断日志 → 注销重登 → 复现**。日志一次就把真相拍了下来：

```
19:25:03  hasFullscreen=false → 壁纸正常启动         ← 刚登录，桌面图标窗口还没建出来
19:25:04  hasFullscreen=true  → "Desktop Icons 1"（最大化）出现
19:25:04  >>> 判定：暂停 → 调用 wallpaper.stop()     ← 壁纸被杀
19:25:09 之后  一直 shouldPause=true，恢复不了
```

**元凶：`"Desktop Icons 1"` —— 桌面图标扩展（DING，`ding@rastersoft.com`）用来画桌面图标的那个窗口。**

它三个条件全中：

| 条件 | 实际情况 |
|---|---|
| 永远存在 | 30 次采样里次次都在 |
| 铺满整个屏幕 | 系统里算「**最大化**」状态 |
| 不是壁纸窗口 | 所以没被排除掉 |

代进原版代码：

```js
metaWin.is_fullscreen()                  // false —— 它不是真全屏
  || this._isWindowMaximized(metaWin)    // true  ← 就栽在这里
```

**`isFullscreenLike()` 恒为真** → `hasFullscreen` 永远是 true。

而 `AutoPause` 用的是**状态锁**（一旦 `_isPaused=true`，需 `shouldPause` 变回 `false` 才解锁），
桌面图标窗口**永远在** → 条件**永远不会变回 false** → **锁解不开，整条"暂停/恢复"逻辑被卡死**。

> 📌 **这解释了为什么"真全屏不暂停"和"最大化照播"会同时存在：**
> 状态锁被桌面图标层卡住之后，扩展的自动暂停逻辑实际上**已经失去作用**了 ——
> 真全屏时它没能正常进入暂停，最大化时也没有误杀。
> 表面看起来像"这个功能没实现"，实际是**逻辑被卡在一个错误的状态上**。

### 3.5 改动（只改一个方法）

文件：`modules/windowUtils.js`

```js
import Meta from "gi://Meta";          // ← 新增这一行 import

static isFullscreenLike(metaWin) {
    // [本地补丁] 原版：return metaWin.is_fullscreen() || this._isWindowMaximized(metaWin);
    try {
        if (typeof metaWin.get_window_type === "function" &&
            metaWin.get_window_type() === Meta.WindowType.DESKTOP) {
            return false;              // ① 显式排除桌面图标层
        }
    } catch (e) { }
    return metaWin.is_fullscreen();     // ② 只认真正的全屏，不再把「最大化」算进去
}
```

两处语义修正：

1. **显式排除桌面图标层** —— 用 `get_window_type() === Meta.WindowType.DESKTOP` 精确识别 DING 的那个窗口。**用类型判断而不是按标题匹配 `Desktop Icons`**，因为标题会随语言变，类型不会。
2. **不再把「最大化」当「全屏」** —— 这一条同时完成了需求②。

**影响面评估**：`isFullscreenLike` 全工程只有 **1 处调用**（`modules/autoPause.js:104`），`windowFilter.js` / `wallpaper.js` / `indicator.js` 完全不受影响。改动还加了 `typeof` 检查 + `try/catch` 双重保护。

### 3.6 验证（注销重登后，日志为证）

```
hasFullscreen=false  全屏开关=true  shouldPause=false  当前处于暂停态=false  ✅
  || 全屏/最大化窗口: "Desktop Icons 1"    全屏=false 最大化=true
     ／ "...Mozilla Firefox"              全屏=false 最大化=true
     ／ "终端"                             全屏=false 最大化=true
```

| 场景 | 结果 |
|---|---|
| 登录后 | `hasFullscreen=false shouldPause=false` **并保持住**（修复前 1 秒内就变 true 且永不恢复）✅ |
| 浏览器 / 终端 / 桌面图标层**全都最大化** | `hasFullscreen=false` → **壁纸继续播** ✅（需求②达成） |
| **按 F11 真全屏** | 日志 `全屏=true` → `>>> 判定：暂停` → mpv 被杀 ✅（需求③达成） |
| **退出 F11** | `>>> 判定：恢复` → mpv 自动重启（实测 19:29:24 恢复，mpv 立刻起来，CPU 17%）✅ |

完整日志片段：

```
19:28:44  >>> 判定：暂停   ← 按 F11 进真全屏（"...Mozilla Firefox" 全屏=true 被正确识别）
19:29:11  >>> 判定：恢复   ← 退出全屏
19:29:15  >>> 判定：暂停   ← 又按了一次 F11
19:29:24  >>> 判定：恢复   ← 退出，mpv PID 53105 自动重启
```

---

## 4. 障碍二：退出全屏后壁纸盖住所有窗口

> 这个障碍是**在障碍一修完、把 `autostart` 关掉改为手动启动之后才暴露出来的**。

### 4.1 症状

| 步骤 | 表现 |
|---|---|
| 手动 Start 壁纸 | 正常 |
| 按 F11 进全屏 | 壁纸正确暂停 ✅ |
| **退出全屏** | 壁纸恢复，**但跑到最顶层，盖住浏览器和所有应用窗口** ❌ |
| 附带线索 | **mpv 的图标出现在 Ubuntu Dock 里**（壁纸窗口本应隐藏任务栏图标） |

"盖住所有窗口"和"Dock 里冒出图标"看起来是两个不相关的问题，后来发现**是同一个 API 变更造成的**。

### 4.2 根因：配对调用 + 静默 catch

`modules/wallpaper.js` 的 `_applyWindowRules()` 原版代码：

```js
try {
    const moveType = metaWin.get_window_type();
    if (moveType === Meta.WindowType.NORMAL) {
        metaWin.make_above();     // ← ① 执行成功：窗口被标记「永远在顶层」
        metaWin.make_below();     // ← ② GNOME 50 已删除这个 API！抛异常
    }
} catch (_) { }                   // ← 异常被吞掉，第 ② 步等于没执行
```

典型的**"配对调用 + 静默 catch"**陷阱：

| 环节 | 实际发生的事 |
|---|---|
| 作者意图 | 「抬起来再压下去」—— 净效果等于重排一下栈序 |
| 实际执行 | 两个调用在**同一个** `try` 里，**后半句抛异常，前半句已经生效** |
| 异常处理 | `catch (_) { }` **完全吞掉，不留任何日志** |
| 净效果 | 从"抬了又压"变成「**只抬不压**」→ 窗口永久留在顶层 |

用 gjs 直接对 GNOME 50（mutter 50.1）核对 API，一次性看清整片"API 坟场"：

| 扩展调用的方法 | GNOME 50 | 正确的新名字 |
|---|---|---|
| `make_above()` | ✅ 存在 | —— |
| **`make_below()`** | ❌ **已删除** | `unmake_above()` |
| `is_below()` | ❌ 已删除 | `is_above()` |
| `set_skip_taskbar(bool)` | ❌ 已改名 | **`skip_taskbar(bool)`** |
| `set_accept_focus(bool)` | ❌ 已删除 | （无对应） |
| `set_input_region(rect)` | ❌ 已删除 | （无对应） |

**这就解释了 Dock 里为什么冒出 mpv 图标**：`set_skip_taskbar` 同样是个空调用（方法名已改），"跳过任务栏"从未生效。**一个 API 变更解释了症状的两个侧面。**

### 4.3 改动（`modules/wallpaper.js`）

```js
// ① 跳过任务栏：兼容新老 API
if (typeof metaWin.skip_taskbar === "function") {
    metaWin.skip_taskbar(true);          // GNOME 50
} else if (typeof metaWin.set_skip_taskbar === "function") {
    metaWin.set_skip_taskbar(true);      // 旧版兼容
}

// ② 核心修复：显式清除 above 状态 + 压到最底层
if (typeof metaWin.unmake_above === "function") metaWin.unmake_above();
metaWin.lower();
```

三点设计考虑：

1. **用 `typeof … === "function"` 做能力探测**，不硬编码版本号 —— 新旧 GNOME 都能跑，也不会因为小版本号写错而静默失效（这正是原版 `set_skip_taskbar` 的教训）。
2. **两个调用语义不同，缺一不可**：
   - `unmake_above()` 是**清掉"永远在顶层"的标记**；
   - `lower()` 是**压到堆叠顺序底部**。
   只 `lower()` 不清标记，窗口可能因重绘再次浮到上面；只 `unmake_above()` 不 `lower()`，初始层级不对。
3. **不再静默吞异常** —— 把会抛异常的配对调用整个删掉，从根本上消除"半截生效"的可能。

### 4.4 验证（改完必须注销重登）

```
1. 点顶栏图标 → Start Wallpaper
2. 按 F11 进全屏 → 壁纸暂停（mpv 消失）          ✅
3. 退出全屏 → 壁纸恢复，且老实待在所有窗口下面   ✅
   （透过半透明终端能看到它在动，但不覆盖任何窗口）
```

**三步全部符合预期。**

---

## 5. 需求①：开机不自启

这一条与前两个障碍无关，改一个 dconf 键即可：

```bash
dconf write /org/gnome/shell/extensions/gnome-wallpaper-engine/autostart false
```

> ⚠️ **容易搞混的一点**：`autostart=false` 只影响「**登录时自动启动**」。
> 手动 Start 之后，全屏暂停 / 退出恢复**照常工作** ——
> 因为 `AutoPause` 的恢复逻辑直接调 `wallpaper.start()`，**不经过 `autostart` 开关**。
> 换句话说：`autostart` 管的是"要不要开机自己起来"，不是"能不能用"。

**当前完整 dconf 设置**（`/org/gnome/shell/extensions/gnome-wallpaper-engine/`）：

```
autostart           = false                   ← 需求①：开机不自启
current-wallpaper   = '姬野永远.mp4'
pause-on-fullscreen = true                    ← 需求③：真全屏暂停
pause-on-battery    = false
show-indicator      = true                    ← 顶栏图标（手动开关用）
```

**手动控制入口**：顶栏那个"显示器"图标（`video-display-symbolic`）点开：

```
Start Wallpaper   ← 手动开始
Stop Wallpaper    ← 手动停止
─────
Settings
```

---

## 6. 排查中确认的一条关键机制

### GNOME Shell 会缓存扩展 JS —— 改代码必须注销重登

| 改动类型 | 生效方式 |
|---|---|
| **改扩展代码** | **必须注销重登**（Wayland 下没法像 X11 那样 `Alt+F2` → `r` 热重启 Shell） |
| **改 dconf 设置** | **实时读取，不用重登** |

**验证方法**（可复现）：在 `extension.js` 的 `enable()` 最上面插入两种"必定进日志"的输出 —— `printerr` 和 `log`，然后 disable/enable：

```
[WPE-TEST]  （新代码标记）        → 没有出现  ❌
disable() 的警告 Source ID ...    → 出现了    ✅（证明重载确实执行了）
```

**重载执行了，但代码没换 → 说明是缓存。**

这个区分很重要：它解释了为什么"改设置立刻生效，改代码怎么弄都没反应"，
也让验证流程有了明确分界——**改代码的那一半验证，必须先注销重登再测**。

> ⚠️ **这个坑的代价**：本文第 3.2、3.3 节那些作废的结论，
> 根本原因都是"改了代码却以为它生效了"。
> **先确认改动真的加载了，再开始观察行为** —— 否则观察的是旧代码，结论必然错。

---

## 7. 最终状态对照

| # | 需求 | 实现方式 | 状态 |
|---|---|---|---|
| ① | **开机不自启**（不覆盖静态壁纸） | dconf `autostart = false` | ✅ |
| ② | **窗口最大化时壁纸继续播** | `windowUtils.js` 的 `isFullscreenLike` 修复 | ✅ |
| ③ | **真全屏时暂停 / 退出全屏自动恢复** | `pause-on-fullscreen = true` + 修复后的 AutoPause | ✅ |
| ④ | **壁纸不覆盖应用窗口** | `wallpaper.js`：`unmake_above()` + `lower()` | ✅ |
| ⑤ | **手动开关入口** | 顶栏"显示器"图标 → Start / Stop | ✅ |

---

## 8. ⚠️ 扩展升级会覆盖补丁：怎么重打

两处补丁都是**改在扩展自己的源码里**的。如果通过"扩展管理器"或在线更新升级了这个扩展，文件会被覆盖 → **障碍一会复发**。

**重打方法（一分钟）**：

1. 打开 `modules/windowUtils.js`，按第 3.5 节替换 `isFullscreenLike`（记得在文件**顶部**加 `import Meta from "gi://Meta";`）
2. 打开 `modules/wallpaper.js`，按第 4.3 节替换 `_applyWindowRules()` 里的那两段
3. 核对 md5（见第 9.1 节表格）
4. **注销重登**（⚠️ 关键，见第 6 节）

---

## 9. 自包含恢复：改回原版

> **本文档即恢复手册** —— 下面完整列出"原版 ↔ 修复后"的对照，**不需要额外的备份文件**。

### 9.1 改了哪些文件

| 文件 | 状态 | 原版 md5 / 字节 | 修复版 md5 / 字节 |
|---|---|---|---|
| `modules/windowUtils.js` | **改过** | `18f2be57fb7fa6e6e1e320871d457640` / 1367 | `1c8b5d71d6d93a5949c0c4fafcbdd644` / 2412 |
| `modules/wallpaper.js` | **改过** | `05beb3b0c0e91934507877b826464435` / 5774 | `9656214f7e0026f22d3fc0336b0f0967` / 6915 |
| `extension.js` | 原版未改 | `4c7d8371a9864695b336cc5da528c7a2` / 3449 | 同左 |
| `modules/autoPause.js` | 原版未改 | `2e25cd2587fad5c1e4ccdcf9a3012297` / 3084 | 同左 |

### 9.2 改动一：`modules/windowUtils.js`

**原版**（文件**没有** import，`isFullscreenLike` 是这一行）：

```js
export class WindowUtils {
    /* ... isWallpaperWindow / _isWindowMaximized 原样不动 ... */

    static isFullscreenLike(metaWin) {
        return metaWin.is_fullscreen() || this._isWindowMaximized(metaWin);
    }
```

**修复后**（文件顶部加了一行 import，`isFullscreenLike` 换成）：

```js
// 文件最顶部新增这一行：
import Meta from "gi://Meta";

/* ... 中间原样不动 ... */

    static isFullscreenLike(metaWin) {
        try {
            if (typeof metaWin.get_window_type === "function" &&
                metaWin.get_window_type() === Meta.WindowType.DESKTOP) {
                return false;
            }
        } catch (e) { }
        return metaWin.is_fullscreen();
    }
```

**把上面这段换回原版那两行、并删掉顶部 `import Meta ...`，就完全恢复了。**
（`fillsMonitor` / `_isWindowMaximized` / `isWallpaperWindow` 三个方法**从头到尾没动**。）

### 9.3 改动二：`modules/wallpaper.js` 的 `_applyWindowRules()`

**原版**（在 `metaWin.focus_on_click = false;` 之后）：

```js
                // Wayland: 强制窗口跳过任务栏/Alt+Tab，禁止移动和改变层级
                try {
                    metaWin.set_skip_taskbar(true);
                } catch (_) { }
                try {
                    const moveType = metaWin.get_window_type();
                    if (moveType === Meta.WindowType.NORMAL) {
                        metaWin.make_above();
                        metaWin.make_below();
                    }
                } catch (_) { }
```

**修复后**：

```js
                try {
                    if (typeof metaWin.skip_taskbar === "function") {
                        metaWin.skip_taskbar(true);          // GNOME 50 的新名字
                    } else if (typeof metaWin.set_skip_taskbar === "function") {
                        metaWin.set_skip_taskbar(true);      // 旧版兼容
                    }
                } catch (_) { }
                try {
                    const moveType = metaWin.get_window_type();
                    if (moveType === Meta.WindowType.NORMAL) {
                        if (typeof metaWin.unmake_above === "function") {
                            metaWin.unmake_above();
                        }
                        metaWin.lower();
                    }
                } catch (_) { }
```

**把上面这段换回原版那段，就完全恢复了。**
（`wallpaper.js` 的其它方法 —— `start()` / `stop()` / 时钟重试逻辑 —— **一个字没动**。）

### 9.4 恢复步骤

三个文件都在 `~/.local/share/gnome-shell/extensions/gnome-wallpaper-engine@gjs.com/`：

```bash
cd ~/.local/share/gnome-shell/extensions/gnome-wallpaper-engine@gjs.com

# 1) 按 9.2 把 windowUtils.js 的 isFullscreenLike 改回原版，并删掉顶部 import Meta
# 2) 按 9.3 把 wallpaper.js 的那两个 try 块改回原版

# 3) 核对（应与原版 md5 一致）
md5sum modules/windowUtils.js   # 期望 18f2be57fb7fa6e6e1e320871d457640
md5sum modules/wallpaper.js     # 期望 05beb3b0c0e91934507877b826464435

# 4) 注销重登（必须！GNOME Shell 缓存扩展 JS）
```

### 9.5 想完全回到扩展作者的原版

改完 9.4 之后扩展就 100% 是原版了；此时若还想把 `autostart` 恢复成默认：

```bash
dconf reset /org/gnome/shell/extensions/gnome-wallpaper-engine/autostart
# 恢复默认后 = 开机自动播放壁纸
```

---

## 10. 两个障碍的共性，与四条可迁移的经验

| | 障碍一 | 障碍二 |
|---|---|---|
| 表面现象 | 真全屏不暂停 | 壁纸盖住所有窗口 |
| 语义错位 | 「**最大化**」被当成「**全屏**」 | 「**抬了又压**」实际只执行了「**抬**」 |
| 隐藏机制 | 状态锁 —— 需条件**变回 false** 才解锁，而那个条件永远不成立 | 静默 `catch` —— 异常被吞，**没有任何日志** |
| 为什么难查 | 逻辑被卡在错误状态上，表现得像"功能没实现" | 症状出现在**完全不相干**的操作之后 |

### 四条可迁移的经验

**1. 报障症状会误导排查方向。**
"壁纸不播"听着像壁纸的问题，实际是显卡驱动 —— 当时**所有吃显卡的程序都挂了**。
先问"还有别的东西不正常吗"，比直接钻进出问题那个软件更快。

**2. 能观察到的事实，比能读懂的代码更可靠。**
代码里确实写着 `is_fullscreen() || is_maximized()`，但**实测最大化时壁纸照播**。
"代码看起来会这样"和"实测就是这样"冲突时，先信实测 —— 说明推论里漏了前提。

**3. 在会缓存代码的环境里，"改完立刻观察"是无效实验。**
这是本次代价最大的坑：GNOME Shell 缓存扩展 JS，`disable`/`enable` 不重载代码，
导致前期所有"改完就观察"的结论全部作废、方向跑偏好几轮。
**先确认改动真的加载了，再开始观察行为。**
（对照：`dconf` 设置是实时读取的，改设置不用重登。）

**4. `catch (_) { }` 是 bug 的温床。**
尤其当它包住**多个有先后依赖的调用**时，"前半句生效、后半句静默失败"
会造出一个谁也没设计过的中间状态。改成能力探测（`typeof x === "function"`）
比"配对调用等着它成功"稳健得多 —— 上游 API 删除在 Linux 桌面是常态，
GNOME 50 一次就删掉了 `make_below()` / `is_below()` / `set_accept_focus()` / `set_input_region()`，
还把 `set_skip_taskbar()` 改了名。

> **最后一条工程习惯**：两处修复都保留了**原版代码的完整对照**和 **md5 校验值**。
> 补丁打在**第三方扩展源码**里，扩展一升级就没了，
> 而"到底改过什么"如果没有留档，下一次就只能靠猜。
> **能自包含恢复的记录，才算记录。**

---

### 相关阅读

- [【折腾向】Ubuntu 26.04 装 KDE 两次翻车全复盘](/blog/ubuntu-kde-two-failed-installs-recap/)
- [【折腾向】Ubuntu 26.04 让 KDE 与 GNOME 完全隔离的实战全记录](/blog/ubuntu-kde-gnome-dual-desktop-isolation-recap/)
- [七彩虹游戏本无 U 盘安装 Linux 双系统全复盘](/blog/colorful-laptop-no-usb-dual-boot-recap/)
- [联想小新 14 装 Fedora 44 KDE 双系统全记录（下）：一次注销引发的血案](/blog/lenovo-xx14-fedora-kde-logout-black-screen-recap/)
