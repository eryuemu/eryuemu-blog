---
title: '社交媒体数据采集：零污染隔离环境搭建'
description: '一次与 AI 的深度协作：从"我要抓小红书选课帖子"到"拥有一套可复用的、绝对干净的爬虫工作环境"。核心收获不是爬虫本身，而是一套**赛博洁癖友好的项目隔离方法论**。'
pubDate: '2026-07-04'
---

> ⚠️ **架构已升级（2026-07-05）**：本文记录的是在 Windows 宿主机上用 `uv` + 虚拟环境做 Python 项目隔离的方案。目前开发环境已整体迁移至 WSL2，ScrapingTools 项目在 Linux 虚拟磁盘内运行，Python 和 Playwright 浏览器内核全部锁在 WSL2 里，从根部解决了隔离问题。本文的隔离方法论仍然有效，只是实现方式已升级。详见 [C 盘大扫除（前篇）](/blog/windows-dev-env-cleanup) 和 [WSL2 实战手册（后篇）](/blog/wsl2-practical-guide)。

---

## 一、背景

- **需求**：收集小红书、微博上关于"选课"的帖子及评论，做数据分析
- **痛点**：手动截图效率极低，且无法导出为结构化数据（Excel/CSV）
- **约束**：新电脑，未装 Python/Git，有强烈"赛博洁癖"——不接受系统污染

---

## 二、方案选型：MediaCrawler vs 自写脚本

| 维度 | MediaCrawler（开源） | 自写 Playwright 脚本 |
|------|---------------------|---------------------|
| **维护性** | GitHub 数万星，社区持续更新，平台改版后几天内修复 | 自己维护，平台一改版就罢工 |
| **功能** | 开箱即用：搜索、抓帖、抓评论、导出 CSV | 按需定制，但每个功能都要从头写 |
| **风控** | 内置 Cookie 持久化、扫码登录、模拟真人行为 | 需要自己处理，容易触发封号 |
| **长期成本** | 极低，`git pull` 更新即可 | 高，持续维护让人崩溃 |

> **结论：长期使用，无脑选 MediaCrawler。** 自写脚本只适合临时一次性抓取或极其冷门的网站。

---

## 三、赛博洁癖部署哲学

### 3.1 核心原则

```
全局只装"地基"（Git + Python，通过 winget 正规安装）
       ↓
所有项目、依赖、浏览器内核全部锁死在专属文件夹
       ↓
不想要了 → 右键删除文件夹 → 系统恢复如初
```

### 3.2 什么是"地基"，什么是"沙子"

| 层级 | 内容 | 安装方式 | 清理方式 |
|------|------|---------|---------|
| **地基** | Git、Python | winget（微软官方包管理） | Windows 设置 → 应用 → 卸载 |
| **沙子** | 爬虫代码、依赖包、浏览器内核 | 全部塞进项目文件夹 | 右键删除文件夹 |

> 地基是必须的，就像看网页需要浏览器。沙子是可丢弃的，用完即走。

---

## 四、具体搭建步骤

### 4.1 安装地基（仅一次）

```powershell
# Git
winget install --id Git.Git -e --source winget

# Python
winget install --id Python.Python.3.12 -e --source winget
```

### 4.2 创建项目文件夹

```
C:\workspace\ScrapingTools\MediaCrawler\
```

### 4.3 拉取代码并创建虚拟环境

```bash
cd C:\workspace\ScrapingTools\MediaCrawler
git clone https://github.com/NanmiCoder/MediaCrawler.git .
python -m venv .venv
```

### 4.4 激活虚拟环境并安装依赖

```powershell
# 激活（Windows PowerShell）
.venv\Scripts\Activate.ps1

# 安装依赖
pip install -r requirements.txt

# 安装浏览器内核（⚠️ 必须先设环境变量，见 4.5 节）
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\playwright_browsers"
playwright install
```

### 4.5 防坑：Playwright 浏览器内核隔离

**这是最容易被忽视的"隐形垃圾"来源。**

默认情况下，执行 `playwright install` 时，Playwright 会把 Firefox 和 WebKit 的完整浏览器内核（两百多兆）下载到系统全局缓存：

```
C:\Users\你的用户名\AppData\Local\ms-playwright\
```

**后果：** 即使你删除了 `MediaCrawler` 整个文件夹，这几百兆的浏览器垃圾仍然残留在 C 盘深处，成为"赛博幽灵"。

**解决方案：环境变量强制隔离**

```powershell
# 安装前先设定目标路径为项目文件夹内
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\playwright_browsers"
playwright install
```

这样浏览器内核就会被下载到项目内的 `playwright_browsers\` 文件夹，而非系统目录。

**启动脚本 `run_crawler.ps1`**

每次运行爬虫时，需要确保环境变量指向正确的路径，否则 Playwright 还是会去系统目录找（找不到就报错）。为此创建一个启动脚本：

```powershell
# run_crawler.ps1 —— 项目专用启动器
$env:PLAYWRIGHT_BROWSERS_PATH = "$PSScriptRoot\playwright_browsers"

# 激活虚拟环境
. "$PSScriptRoot\.venv\Scripts\Activate.ps1"

# 运行你的爬虫命令（按需替换）
python main.py --platform xhs --lt qrcode --type search --keywords "选课"
```

> **现在的物理隔离状态：**
> 
> ```
> MediaCrawler\
>   ├── .venv\                 # Python 依赖包（数十 MB）
>   ├── playwright_browsers\   # 浏览器内核（200+ MB）
>   ├── run_crawler.ps1        # 启动器（指定路径）
>   └── ...
> ```
> 
> 全部锁死在一个文件夹内。**删除文件夹 = 1KB 垃圾都不留。**

---

## 五、虚拟环境到底是什么？

**物理上：就是一个名叫 `.venv` 的隐藏文件夹。**

- 激活前：`pip install` 会把包装到系统 Python 目录（污染全局）
- 激活后：所有包被关进 `.venv` 的深处，与系统 Python 彻底隔离

### 打个比方

| 概念 | 比喻 |
|------|------|
| 全局 Python | 发电厂（提供基础能力） |
| `.venv` 虚拟环境 | 独立厂房 + 私接电线 |
| 删除文件夹 | 推平厂房，发电厂毫发无损 |

---

## 六、日常使用模式

### 6.1 项目隔离

以后任何新项目，遵循同一模式：

```
C:\workspace\ScrapingTools\
  ├── MediaCrawler\        # 社交媒体爬虫
  │   └── .venv\
  ├── MyNewTool\           # 未来的其他工具
  │   └── .venv\
  └── ...
```

每个项目的依赖互不干扰（A 项目要 v1.0，B 项目要 v2.0，照样共存）。

### 6.2 工作空间分离

在 Antigravity 中，不同项目开不同工作空间：

| 工作空间                                      | 用途       |
| ----------------------------------------- | -------- |
| `HBU Wiki`                                | 写笔记、知识管理 |
| `C:\workspace\ScrapingTools\MediaCrawler` | 数据采集专用   |

> 好处：逻辑隔离，对话上下文不混杂。在爬虫空间里说"帮我跑小红书"，无需解释路径。

---

## 七、关键认知

> **"赛博洁癖"不是不装东西，是装的东西随时可以干干净净地抹掉。**
>
> 这套方案的精髓在于分层：
> - 地基层（Git/Python）通过正规渠道安装，正规渠道卸载
> - 项目层（代码/依赖/浏览器内核）全部锁在一个文件夹里，物理删除即终结
>
> 不再怕"装了一堆东西不知道散落在哪"，不再怕"卸载不干净留垃圾"。
>
> 这就是用 AI 辅助搭建开发环境的价值——不是帮你敲几条命令，而是帮你建立一套**可复用的、符合你洁癖标准的工程习惯**。

### 最大的教训：Playwright 浏览器内核陷阱

这次搭建中差点翻车的隐藏问题：**`playwright install` 默认把浏览器内核下到系统 C 盘 `AppData` 深处，而非项目文件夹。** 如果不是出于洁癖习惯追问了一句"依赖都在文件夹里吧"，几百兆的垃圾就永久留在系统盘了。

教训：**很多工具都有"自作主张写入全局目录"的恶习。** 遇到新的 CLI 工具时，先查它有没有环境变量能控制数据目录——几乎所有正经工具都有，但文档往往不会主动强调。主动设、主动锁，才能做到真正的零污染。

---

## 相关笔记

- **工具** ← 工具 & 效率 MOC
- [Claude Code 安装与配置完全指南](/blog/claude-code-installation-guide) ← 同样的"零污染"装机哲学
- [本地知识库与博客搭建思路](/blog/knowledge-base-and-blog-setup) ← 知识库 vs 博客的思考