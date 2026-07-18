---
title: 'Windows 开发环境大扫除：从 C 盘灾难到 WSL2 物理隔离'
description: 'Python、Node.js、Git 在 C 盘到处拉屎怎么办？空文件夹是系统自带的吗？赛博洁癖怎么治？本文从诊断到决策到执行，记录了把 Windows 宿主机清成一张白纸、然后将所有开发环境锁进 WSL2 虚拟磁盘的完整过程。'
pubDate: '2026-07-05'
---

## 一、问题：C 盘在失控

某天开发时浑身难受——Python、Git、Node.js 以及各种依赖，都在 C 盘的各个角落留下了痕迹。`AppData` 和用户文件夹下面莫名出现空文件夹，有的藏着几 GB 缓存。

核心诉求很简单：**C 盘除了 Windows 本身和日常软件，不应该有任何开发的残留。**

---

## 二、诊断：分清敌友

动手之前先搞清楚：哪些是 Windows 亲生的，哪些是开发工具拉的屎。

### 2.1 系统自带的空文件夹

Windows 激活后会默认生成一批占位文件夹，**不需要也不能删**：

| 位置 | 典型文件夹 | 性质 |
|------|-----------|------|
| 用户文件夹下 | `Contacts`、`Links`、`Saved Games`、`Searches`、`3D Objects` | Shell 默认占位，删了系统更新可能自动重建 |
| `AppData` 下 | `Local/Temp`、`Local/Microsoft`、显卡驱动目录 | 系统和 OEM 软件自动创建的配置/临时目录 |

> 它们不占空间，删了反而可能导致 API 路径报错。

### 2.2 容易被误删的系统文件

| 路径 | 实际身份 | 能删吗 |
|------|---------|--------|
| `C:\Windows\Cursors` | 鼠标光标样式文件夹（不是 Cursor IDE） | ❌ |
| `C:\Users\<用户名>\NTUSER.DAT` | 注册表核心文件（HKEY_CURRENT_USER） | ❌ 账号会崩 |
| `C:\$Recycle.Bin\...` | 回收站真实路径 | 清空回收站即可 |
| `C:\Users\<用户名>\.lmstudio-home-pointer` | LM Studio 指针文件，告诉它模型存哪 | ❌ 删了找不到模型 |

---

## 三、决策：三条路选哪条

在动手清理之前，先想清楚：清理完之后怎么办？如果继续在 Windows 上装 Python/Node，过几天又是一地鸡毛。

解决"C 盘拉屎"有三条路。

### 3.1 方案对比

| | A：WSL2 物理隔离 | B：Scoop + 环境变量 | C：传统虚拟机 |
|---|---|---|---|
| 做法 | 开发环境全锁进 `.vhdx` | Scoop 包管理器 + 手动设缓存路径 | VMware/VirtualBox 跑 Linux |
| C 盘污染 | ⭐⭐⭐⭐⭐ 零 | ⭐⭐⭐ 集中在指定目录 | ⭐⭐⭐⭐⭐ 零 |
| 性能 | ⭐⭐⭐⭐ 近原生 Linux | ⭐⭐⭐⭐⭐ 原生 Windows | ⭐⭐⭐ 虚拟化开销 |
| GPU/CUDA | ✅ 直通宿主机显卡 | ✅ 原生 | ❌ 直通配置复杂 |
| 日常软件 | ✅ 微信/游戏正常 | ✅ 不受影响 | ⚠️ 双系统或远程桌面 |
| 重置成本 | 一行命令 | 逐个工具清理 | 删虚拟机文件 |

**方案 B 淘汰**：Scoop 能把软件装在指定目录，但 npm、pip、cargo 的缓存路径需要逐个设环境变量，换电脑又要重来。而且跑在 Windows 上，该慢还是慢。

**方案 C 淘汰**：传统虚拟机是"另一台电脑"，GPU 直通、文件共享、剪贴板互通都很折腾。WSL2 是微软把 Linux 内核嵌进 Windows，轻量得多。

### 3.2 为什么 Windows 写代码天然吃亏

| 维度 | Linux/macOS | Windows |
|------|------------|---------|
| 路径 | `/` 正斜杠，单根目录 | `\` 反斜杠，多盘符 |
| 终端 | bash/zsh，和服务器一致 | CMD/PowerShell，命令不通用 |
| 编译环境 | 原生，库默认为 Linux 编写 | 需 MinGW/Cygwin 模拟 |
| 依赖管理 | `apt`/`brew` 一行搞定 | 各软件各自在 AppData 拉屎 |

> 根本原因：现代开发工具链围着 Unix/Linux 转，Windows 是异形。

### 3.3 为什么不用 Mac 或纯 Linux

| 系统 | 开发体验 | 日常体验 | 本地大模型 | 价格 |
|------|---------|---------|-----------|------|
| macOS | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 统一内存，无 CUDA | 抢钱级 |
| 纯 Linux | ⭐⭐⭐⭐⭐ | ⭐ 微信崩、Office 无 | 有 CUDA，游戏几乎全灭 | 免费 |
| **Windows + WSL2** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | CUDA 随便跑 | 正常 |

> **Windows + WSL2 是性价比最高、最万能的方案**：Windows 管日常和 GPU，WSL2 管代码。

---

## 四、执行：清空 C 盘

决策做完，开始动手。

### 4.1 清理三件套

三款绿色便携工具，解压即用，本身不产生污染：

| 工具 | 用途 | 亮点 |
|------|------|------|
| **WizTree** | 磁盘空间分析 | 比 WinDirStat 快 100 倍，几秒扫完全盘 |
| **Everything** | 文件搜索 | 秒级全盘搜索，支持 `wfn:` 精确匹配 |
| **Geek Uninstaller** | 卸载工具 | 卸载后自动扫描残血注册表和残留文件 |

### 4.2 自动清理

以下由 Claude 通过脚本完成：

- 卸载 Python 3.11.9（含注册表和系统变量）
- 删除 `AppData\Local\pip`（pip 缓存）
- 删除 `AppData\Local\npm-cache`、`AppData\Roaming\npm`（npm 全量清理）
- 清理 Claude Code CLI 残留（`.local\bin\claude.exe`、`.claude`、`.claude.json`）
- 清理其他 AI 缓存（`.ai_completion`、`.copilot`、`.cache`、`.cc-switch`）

### 4.3 手动卸载

| 软件 | 方法 | 备注 |
|------|------|------|
| **Git** | Geek Uninstaller | 卸载本体 + 扫描残血 |
| **LM Studio** | 控制面板 | 保留的话不动 `.lmstudio`（约 8.5 GB） |

### 4.4 验证清零

用 Everything 搜索以下关键词确认无残留：

| 搜索词 | 期望结果 |
|--------|---------|
| `pip` | 无残留 |
| `npm` / `pnpm` / `yarn` | 仅编辑器自带插件目录，无全局缓存 |
| `"\Git"`（带双引号） | 仅项目 `.git` 目录，无 `Program Files\Git` |

> **Everything 技巧**：用 `wfn:.conda` 前缀（完整文件名匹配）精准定位隐藏配置文件夹，避免搜出一堆包含关键字的普通文件。
>
> ⚠️ VS Code 和 Trae 的配置文件（`.vscode`、`.trae-cn`）不要动——只是配置和插件，不包含运行环境。

### 4.5 清临时文件夹

```
C:\Users\<用户名>\AppData\Local\Temp    ← 用户临时文件（%temp% 直达）
C:\Windows\Temp                          ← 系统级临时文件
```

全选删除，提示占用的跳过。

### 4.6 命令速查

以后换电脑可以照抄：

```powershell
# 清理包管理器缓存
pip cache purge
npm cache clean --force
pnpm store prune

# 手动删除残留文件夹（Shift+Delete）：
#   C:\Users\<用户名>\.conda
#   C:\Users\<用户名>\.npm
#   C:\Users\<用户名>\AppData\Local\pip
#   C:\Users\<用户名>\AppData\Roaming\npm
#   C:\Users\<用户名>\AppData\Roaming\npm-cache
#   C:\Users\<用户名>\AppData\Local\Temp
```

---

## 五、落地：WSL2 安装与架构

### 5.1 安装

单 C 盘 900GB，无需迁移，直接默认安装：

```powershell
wsl --install
```

重启后设好 Linux 用户名和密码。

### 5.2 文件互通的铁律

| 方向 | 方法 |
|------|------|
| Windows → WSL2 | 资源管理器输入 `\\wsl$\`，像 U 盘一样浏览 |
| WSL2 → Windows | 自动挂载在 `/mnt/c/` |
| 项目迁移 | 把 `C:\workspace\*` 移到 `/home/<用户名>/workspace/` |

> ⚠️ **铁律：代码文件必须放在 WSL2 原生 ext4 上。** 跨文件系统读写（`/mnt/c/` 下的项目）走 9p 网络协议，比原生慢 5-10 倍。

### 5.3 终极架构

```
Windows 宿主机 (C盘)
├── 浏览器、微信、游戏、Wallpaper Engine
├── Antigravity 2.0 / Codex / VS Code / Trae  ← GUI 编辑器前端
├── LM Studio  ← 本地大模型（NVIDIA 显卡）
└── WSL2 (Ubuntu .vhdx)  ← 唯一的黑盒子
    ├── Node.js / Python / Git
    ├── Claude Code CLI
    ├── node_modules / pip cache
    └── ~/workspace/  ← 所有项目代码
```

> 所有污染源锁在 `.vhdx` 里。环境崩了？一行命令重置 Ubuntu，C 盘不受影响。

### 5.4 Docker 兼容

- Docker Desktop 勾选 "Use the WSL 2 based engine"
- 镜像和容器数据可指定位置，不占 C 盘
- WSL2 终端里直接 `docker run`，与原生 Linux 无异

---

## 六、日常：AI 工具与 Git

核心模式：**UI 在 Windows，运行在 Linux。**

### 6.1 VS Code ⭐⭐⭐⭐⭐

- 装 WSL 插件（`Remote - WSL`）
- 在 WSL2 终端 `cd ~/workspace/项目名` → `code .`
- 左下角显示 `WSL: Ubuntu`，所有操作在 Linux 内部

### 6.2 Trae

- Open Folder → 输入 `\\wsl$\Ubuntu\home\<用户名>\workspace\<项目名>`
- Chat 和 AI 补全正常，代码直存 Linux

### 6.3 Antigravity 2.0

- ⚠️ **不识别 `\\wsl$\` UNC 路径**，必须先将 WSL2 映射为网络驱动器（如 `W:` 盘）
- 之后通过 `W:\home\<用户名>\workspace\` 正常打开项目
- 映射方法详见 [后篇](/eryuemu-blog/blog/wsl2-practical-guide)

### 6.4 Codex 桌面端

- 通过 `\\wsl$\` 或盘符路径访问 Linux 项目
- 本地不需要装 Codex 依赖

### 6.5 Claude Code CLI + cc-switch

整个架构中最特殊的组合。先搞清楚两个概念：

**cc-switch 的真实角色**：它不是一个代理服务器，而是一个**配置写入器**。它的唯一职责是把 DeepSeek 的 API 密钥和端点写入 `C:\Users\...\.claude\settings.json`。写入之后，Claude Code 自己直连 DeepSeek 公网 API（`api.deepseek.com`），不经过任何本地中转。

**你的环境里有两份 Claude Code**：

| | Windows 端 | WSL2 端 |
|---|---|---|
| **谁调用** | Obsidian Claudian 插件 | 你在 WSL2 终端敲 `claude` |
| **配置怎么读** | 直接读同系统的 `settings.json` | 通过 symlink 读 Windows 的 `settings.json` |
| **API 连哪** | 直连 `api.deepseek.com` | 直连 `api.deepseek.com` |

WSL2 通过 symlink 共享 Windows 上的 `settings.json`，所以 cc-switch 写一次，两边同时生效。

> 详细配置过程及四个踩坑记录见 [后篇](/eryuemu-blog/blog/wsl2-practical-guide)。

### 6.6 Git 推送

Windows 的 Git 已卸载，所有 Git 操作在 WSL2 内完成：

- 命令行：WSL2 终端里 `git push`，生成 Linux SSH Key 贴到 GitHub
- 可视化：VS Code/Trae 的源代码管理面板点推送，编辑器自动调用 WSL2 内的 Git
- 凭据：WSL2 可直接调用 Windows 的 Git Credential Manager

> 操作习惯完全不变。

---

## 七、复盘：三条核心认知

### 7.1 分清地基和沙子

| 层级 | 安装方式 | 清理方式 | 代表 |
|------|---------|---------|------|
| 地基 | 官方安装包，写注册表和 PATH | 控制面板卸载 | Windows、浏览器、IDE 前端 |
| 沙子 | 塞进隔离容器，不碰系统 | 删容器即可 | Node.js、Python、依赖包 |

> WSL2 做的事情就是把所有开发环境从地基降级为沙子。

### 7.2 卸载 ≠ 清理干净

`winget uninstall` 只删软件本体，运行时产生的 AppData 缓存和全局包需要手动清理。**Geek Uninstaller + Everything + WizTree** 是清理三件套。

### 7.3 Windows + WSL2 不是妥协

这个组合让你同时拥有：
- Windows 桌面生态（游戏、微信、本地大模型 CUDA 加速）
- Linux 原生开发体验（终端、Docker、开源工具链）
- 物理隔离的干净系统（C 盘永远一张白纸）

---

## 相关笔记

- [WSL2 实战手册：空间账单、symlink 陷阱与 cc-switch 四连坑](/eryuemu-blog/blog/wsl2-practical-guide) ← 后篇：安装后的空间账单、文件系统细节、cc-switch 四连坑
- [Claude Code 安装与配置完全指南](/eryuemu-blog/blog/claude-code-installation-guide) ← Claude Code 原生安装 + CC Switch 配置面板详解
- [HBU-Wiki 开发环境搭建：从fnm到项目级Node.js隔离](/eryuemu-blog/blog/hbu-wiki-dev-env-setup) ← 旧方案（已升级至 WSL2），方法论仍有效
- [社交媒体数据采集-隔离环境搭建](/eryuemu-blog/blog/social-media-data-scraping-isolation) ← 旧方案（已升级至 WSL2），方法论仍有效
- **工具** ← 工具 & 效率 MOC