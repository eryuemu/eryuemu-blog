---
title: 'HBU-Wiki 开发环境搭建：从 fnm 到项目级 Node.js 隔离'
description: '新电脑只有 Git 和 Python，需要开发一个 VitePress 项目（HBU-Wiki）。在不污染系统的前提下搭建本地开发环境，经历了三个方案的反复推演和一次编码翻车，最终实现了"双击即用、删文件夹即销毁"的终极隔离方案。'
pubDate: '2026-07-04'
---

> ⚠️ **架构已升级（2026-07-05）**：本文记录的是在 Windows 宿主机上做项目级隔离的方案。目前开发环境已整体迁移至 WSL2，Node.js、Python、项目代码全部锁在 Linux 虚拟磁盘内，从根部解决了隔离问题。本文的"地基 vs 沙子"方法论仍然有效，只是实现方式从"塞进项目文件夹"升级为"塞进 WSL2"。详见 [C 盘大扫除（前篇）](/eryuemu-blog/blog/windows-dev-env-cleanup) 和 [WSL2 实战手册（后篇）](/eryuemu-blog/blog/wsl2-practical-guide)。

---

## 一、背景

- **场景**：新电脑，仅安装了 Git 和 Python，无任何 Node.js 环境
- **目标**：在本地运行 `npm run docs:dev`，实时预览 HBU-Wiki（VitePress 项目）的网页效果
- **约束**：强烈"赛博洁癖"——不接受任何系统级残留

> HBU-Wiki 项目地址：https://github.com/eryuemu/HBU-Wiki

---

## 二、三个方案的递进推演

### 2.1 方案一：纯内容编辑（0 环境依赖）

只写 Markdown，不装任何环境。改完 `git push`，靠 GitHub Actions 自动构建部署。

| 优点 | 缺点 |
|------|------|
| 真正的零污染，Git 已有 | 无法本地预览网页效果，改 CSS/主题配置时必须盲写 |

> 适用场景：只写文章不改样式的纯内容贡献者。

### 2.2 方案二：fnm 版本管理器（在用户目录留下痕迹）

通过 `winget install Schniz.fnm` 安装 Rust 写的 Node.js 版本管理器，然后用它下载 Node.js。

| 优点 | 缺点 |
|------|------|
| 终端直接 `npm run dev`，体验最丝滑 | fnm 本体 + 下载的 Node 版本全存在 `C:\Users\<用户名>\AppData\Roaming\fnm` |

> 洁癖度 90%，方便度 100%。适合能接受 AppData 里多一个文件夹的用户。

### 2.3 方案三：便携版 Node.js 塞进项目（最终选择）

将 Node.js 绿色便携版直接解压到项目目录的 `.node` 隐藏文件夹，纯项目级隔离。

| 优点 | 缺点 |
|------|------|
| 所有环境锁死在项目文件夹内 | 首次启动需下载依赖（1-2 分钟） |
| 删除项目文件夹 = Node.js 从电脑物理蒸发 | 需要一个启动脚本配置临时环境变量 |
| 不修改系统/用户环境变量 | 项目文件夹体积增大（多一个便携 Node） |

> 洁癖度 100%，方便度通过"双击启动脚本"弥补。

---

## 三、实际执行路径（踩坑全记录）

### 第一幕：先装了 fnm

```powershell
winget install Schniz.fnm
fnm install --lts
```

一切顺利，`npm run docs:dev` 跑起来了。

### 第二幕：发现 AppData 残留

用户敏锐地发现了 `C:\Users\<用户名>\AppData\Roaming\fnm` 文件夹，提出质疑。

> **核心冲突**：`winget uninstall` 只卸载软件本体，不删除软件运行时产生的数据目录（已下载的各版本 Node.js 缓存）。

### 第三幕：切换方案三

1. 清理 fnm 残留：`Remove-Item` 强制删除 `AppData\Roaming\fnm`
2. 下载 Node.js Windows 绿色便携版（ZIP），解压到 `HBU Wiki\.node\`
3. 关键：将 `.node` 和 `node_modules` 加入 `.gitignore`

### 第四幕：启动脚本中文乱码翻车

用户双击 `.bat` 脚本后出现一地乱码：

```
'囦欢澶逛复鏃跺姞鍏ョ幆澧冨彉閲...' 不是内部或外部命令
```

**根因**：Windows 终端默认编码是 GBK，而脚本用 UTF-8 保存。`chcp 65001` 在脚本头部切换 UTF-8 之前，GBK 就已经把后面的中文注释"吞掉"了，导致换行符丢失、多行代码拼成一行乱码。

**修复**：将脚本中的中文注释全部替换为英文。逻辑不变，编码问题彻底消失。

---

## 四、最终架构：密封结界

```
C:\workspace\HBU Wiki\
├── .node\              # Node.js 绿色便携版（隐藏）
├── node_modules\       # 项目依赖库（npm install 产物）
├── docs\               # VitePress 文档源文件
├── 双击启动开发.bat      # 一键启动脚本
└── .gitignore          # 已忽略 .node 和 node_modules
```

### 运行原理

1. 双击 `.bat` → 脚本临时将 `.node` 加入当前窗口的 PATH
2. 检测 `node_modules`，若无则自动 `npm install`
3. 执行 `npm run docs:dev`，启动本地服务器并打开浏览器
4. 关闭黑窗口 → 环境变量消散，系统恢复如初

### 终极销毁

```
选中 HBU Wiki 文件夹 → 右键删除 → 清空回收站
```

电脑上不会有任何 Node.js 注册表残留、后台服务或垃圾文件。干净得像从没装过。

---

## 五、node_modules 是什么？

第一次运行后项目里多了一个 `node_modules` 文件夹——这是前端项目的标配：

- **本质**：`npm install` 时从网络下载的第三方依赖代码（包括 VitePress 框架本身）
- **洁癖安全性**：所有内容锁死在项目文件夹内，绝不向外扩散
- **可丢弃性**：删了无所谓，下次启动脚本会自动检测并重新下载
- **不入库**：`.gitignore` 已忽略，不会污染 GitHub 仓库

---

## 六、关键认知

> **"赛博洁癖"不是不装东西，是装的东西随时可以干干净净地抹掉。**
>
> 这次的推演过程揭示了一个分层逻辑：

| 层级 | 代表 | 安装方式 | 清理方式 |
|------|------|---------|---------|
| 地基 | Git、Python | winget 正规安装 | Windows 设置 → 卸载 |
| 沙子 | Node.js、依赖包、浏览器内核 | 塞进项目文件夹 | 右键删除文件夹 |

> **Node.js 在这个方案里从"地基"降级成了"沙子"**——它不是系统必须有的东西，只是这个项目的临时工具。这种"降级思维"是整个方法论的精髓：
>
> - fnm 方案：Node.js 是"地基"（全局安装，污染用户目录）
> - 便携版方案：Node.js 是"沙子"（项目专属，随删随走）
>
> 另外，`.bat` 脚本的中文乱码是一个经典坑。Windows 上写跨编码的启动脚本，要么开头第一行必须是 `chcp 65001` 且不能在此之前有任何非 ASCII 字符（包括 BOM），要么干脆全用英文。后者更稳。

---

## 相关笔记

- **工具** ← 工具 & 效率 MOC
- [Claude Code 安装与配置完全指南](/eryuemu-blog/blog/claude-code-installation-guide) ← 同样的"零污染"装机哲学
- [社交媒体数据采集-隔离环境搭建](/eryuemu-blog/blog/social-media-data-scraping-isolation) ← 地基 vs 沙子的分层方法论
- [本地知识库与博客搭建思路](/eryuemu-blog/blog/knowledge-base-and-blog-setup) ← 知识库 vs 博客的思考，HBU-Wiki 的 VitePress 定位