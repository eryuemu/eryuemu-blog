---
title: 'WSL2 实战手册：空间账单、文件系统与 cc-switch 四连坑'
description: '接续 [[开发/Windows 开发环境大扫除：从C盘灾难到WSL2物理隔离|C 盘大扫除（前篇）]]——WSL2 装好之后发生了什么：10GB 空间去哪了、`.vhdx` 藏在哪、`/mnt/c` 为什么慢得离谱、Windows GUI 工具怎么访问 Linux 文件、以及让 Claude Code CLI 通过 cc-switch 中转接入 DeepSeek 时踩的四个连环坑。'
pubDate: '2026-07-05'
---

## 一、装完之后：空间和位置

### 1.1 10GB 账单

WSL2 装完，C 盘少了约 10GB。完全正常。逐笔拆开：

| 项目 | 大小 | 说明 |
|------|------|------|
| Ubuntu 操作系统底层 | ~2 GB | Linux 内核 + 核心系统文件 |
| 编译工具链 | ~1.5 GB | `build-essential`、图形依赖库 |
| 开发工具链 | ~1 GB | NVM + Node.js、Python 3 + pip + uv、Claude Code CLI |
| 项目文件（含 Git 历史） | ~1.4 GB | HBU-Wiki + ScrapingTools |
| Playwright 浏览器内核 | ~1 GB | Linux 版 Chromium、Firefox、WebKit |
| WSL2 虚拟内存交换文件 | ~2-3 GB | 根据物理内存自动分配，关机后休眠释放 |

> 这 10GB 全部封装在**一个** `.vhdx` 文件里。对比散装 Windows 开发环境（在 AppData 各处产生几万个碎文件），这是天堂级的整洁。

### 1.2 .vhdx 在哪

```
C:\Users\<用户名>\AppData\Local\Packages\CanonicalGroupLimited.Ubuntu_79rhkp1fndgsc\LocalState\ext4.vhdx
```

用 WizTree 扫描 C 盘就能看到它。想换到别的盘？`wsl --export` → `wsl --import` 重新指定路径。

### 1.3 崩了也不怕

`.vhdx` 是标准虚拟磁盘格式。即使 Windows 崩了进不去：

1. 把 `.vhdx` 文件拷出来
2. 挂载到任意 Linux 机器上，代码和数据全在
3. 或在新系统 `wsl --import` 一行复活

> 换电脑？把 `.vhdx` 拷过去就完事了。

---

## 二、文件系统：两个世界，两种速度

### 2.1 ext4 vs 9p：为什么不能把项目放 `/mnt/c` 下面

WSL2 里有两个截然不同的文件系统：

| 路径 | 文件系统 | 性能 | 用途 |
|------|---------|------|------|
| `/home/<用户名>/...` | ext4（WSL2 原生） | ⭐⭐⭐⭐⭐ | **项目代码必须放这里** |
| `/mnt/c/Users/...` | 9p 网络协议 → NTFS | ⭐⭐ | 跨系统传小文件 |

`/mnt/c` 每次读写都要经过 Windows NTFS 内核转换，`npm install` 比原生 ext4 慢 5-10 倍。

**实践原则**：
- ✅ cc-switch 的 `settings.json` 桥接文件可以走 `/mnt/c`（1KB，启动时读一次，无影响）
- ❌ 项目代码和 `node_modules` 禁止放 `/mnt/c`
- ❌ 不要在 WSL2 里 `cd /mnt/c/workspace && npm run dev`

### 2.2 Windows 端如何访问 WSL2 文件

从 Windows 的 GUI 工具打开 WSL2 里的项目，有三种方式。

**方式一：`\\wsl$\` UNC 路径（系统内置）**

```
\\wsl$\Ubuntu\home\<用户名>\workspace\<项目名>
```

| 工具 | 支持情况 |
|------|---------|
| VS Code + WSL 插件 | ✅ 完美，直接 `code .` |
| VS Code 无插件 | ✅ Open Folder 输入 UNC 路径 |
| Trae | ✅ Open Folder 输入 UNC 路径 |
| **Antigravity 2.0** | ❌ **不识别 UNC 路径** |
| Codex 桌面端 | ⚠️ 视版本而定 |

**方式二：映射为网络驱动器（推荐）**

Antigravity 2.0 不认 `\\wsl$\`，必须给它一个标准盘符。

1. 资源管理器地址栏输入 `\\wsl$\Ubuntu`，回车
2. 右键 `home` → 映射网络驱动器
3. 选盘符 `W:`，勾选"登录时重新连接"

之后所有工具都能用 `W:\home\<用户名>\workspace\` 访问：

| 工具 | 盘符路径 |
|------|---------|
| VS Code | ✅ |
| Trae | ✅ |
| Antigravity 2.0 | ✅ 解决了 UNC 不识别问题 |
| Codex 桌面端 | ✅ |

> W 盘只是 `\\wsl$\Ubuntu\` 的别名，底层数据仍在 `.vhdx` 里，没有任何东西被复制到 C 盘。

**方式三：`/mnt/c/` 反向访问（WSL2 → Windows）**

从 WSL2 终端访问 Windows 文件：

```bash
cd /mnt/c/Users/eryuemu/
```

仅用于跨系统传小文件和 cc-switch 桥接。**不要在 `/mnt/c/` 上跑项目。**

### 2.3 三种方式总结

| 方式 | 路径格式 | 性能 | Antigravity | 适用场景 |
|------|---------|------|------------|---------|
| UNC 路径 | `\\wsl$\Ubuntu\...` | ⭐⭐⭐ | ❌ | VS Code、Trae |
| 映射盘符 | `W:\home\...` | ⭐⭐⭐ | ✅ | **所有** GUI 工具 |
| `/mnt/c/` 反挂 | `/mnt/c/Users/...` | ⭐⭐ | — | 传小文件、桥接配置 |

---

## 三、工具链铁律：NVM vs 系统 Node.js

WSL2 里装 Node.js 很容易顺手 `apt install nodejs`，这是坑。

| 对比维度 | NVM 版 ✅ | 系统级 `apt install` ❌ |
|---------|----------|----------------------|
| 安装位置 | `~/.nvm/versions/node/...` | `/usr/bin/` |
| 权限 | 无需 `sudo`，全局包干净 | 必须 `sudo`，全局包带 root 权限 |
| 版本切换 | `nvm install 18` 一键 | 被系统库锁死 |
| 冲突风险 | 独立沙盒 | 与 NVM 版并存时命令混乱 |

> **铁律**：在 WSL2 里永远用版本管理器（nvm、fnm、pyenv、uv），永远不碰 `apt install` 的开发工具。发现系统级 Node.js 后立刻 `apt remove` 卸载。

---

## 四、cc-switch 的真实角色：配置写入器，不是代理

搞清楚 cc-switch 到底做了什么——这个认知直接影响后面的踩坑理解。

### 4.1 它不是什么

cc-switch **没有**在 `localhost` 上启动代理服务。它不会中转 API 请求，镜像网络也没有用到。

### 4.2 它实际做了什么

cc-switch 的唯一职责是**把 DeepSeek 的密钥和端点写入 `settings.json`**。写完之后，Claude Code 自己直接连 DeepSeek 公网 API。

你的 `settings.json` 实际内容：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "sk-...",
    "ANTHROPIC_MODEL": "deepseek-v4-pro",
    ...
  }
}
```

`ANTHROPIC_BASE_URL` 指向的是 DeepSeek 公网服务器，不是 `localhost`。

### 4.3 真实链路

```
┌─ cc-switch（Windows 桌面端）──────────┐
│                                        │
│  唯一职责：把 DeepSeek 密钥 + 端点     │
│  写入 C:\Users\...\.claude\settings.json │
│                                        │
└────────────────┬───────────────────────┘
                 │ 写入文件
                 ▼
┌─ C:\Users\eryuemu\.claude\settings.json ─┐
│                                            │
│  ANTHROPIC_BASE_URL: api.deepseek.com     │
│  ANTHROPIC_AUTH_TOKEN: sk-...             │
│                                            │
└──┬──────────────────────┬─────────────────┘
   │ 直接读取（同系统）     │ symlink 读取（跨系统）
   ▼                       ▼
┌──────────────┐    ┌──────────────────────┐
│ claude.exe   │    │ WSL2 内 claude        │
│ （Windows）   │    │                       │
│              │    │ ~/.claude/settings     │
│ Obsidian     │    │ .json ──symlink──▶    │
│ Claudian 调用 │    │ /mnt/c/.../settings   │
│ 这个二进制    │    │ .json                 │
└──────┬───────┘    └───┬───────────────────┘
       │                │
       │    各自直连     │
       ▼                ▼
  https://api.deepseek.com/anthropic
  （公网，不经过任何本地代理）
```

### 4.4 两个 Claude Code 实例

| | Windows 端 | WSL2 端 |
|---|---|---|
| **启动者** | Obsidian Claudian 插件 | 你在 WSL2 终端敲 `claude` |
| **二进制** | `C:\Users\...\.local\bin\claude.exe`（4.5KB .NET assembly） | `/home/.../.nvm/.../bin/claude`（Node.js 脚本） |
| **配置读取** | 直接读同系统的 `.claude\settings.json` | 通过 symlink 读 Windows 的 `settings.json` |
| **API 调用** | 直连 `api.deepseek.com` | 直连 `api.deepseek.com` |
| **工作目录** | Obsidian vault 路径 | `/home/eryuemu/workspace/...` |

> 两份 `settings.json` 的内容完全一样——因为 WSL2 那份就是 symlink 指向 Windows 那份。cc-switch 写一次，两边同时生效。

---

## 五、四连坑

### 第一坑：cc-switch 被恢复出厂设置

**现象**：cc-switch 里开关 Claude Code 卡片，WSL2 里 `claude` 仍要求 `/login`。

**根因**：前篇大扫除时执行了"清理 AI 缓存（`.cc-switch`）"，把 cc-switch 的本地配置文件夹整个删了。DeepSeek API Key 和服务地址全部消失，cc-switch 回到出厂状态。

**修复**：在 cc-switch 中重新填入 DeepSeek API Key 和服务地址。

---

### 第二坑：Claude Code v2.1 改了配置路径

**现象**：重新配置后开关仍然无效。

**根因**：Claude Code v2.1 把配置文件从根目录的 `.claude.json` 迁到了 `~/.claude/settings.json` 子路径。cc-switch 写入新路径时，因为父目录 `.claude` 在大扫除中被整删了，写入**静默失败**——不报错，也不生效。

**修复**：在 Windows 上手动重建 `C:\Users\<用户名>\.claude` 空文件夹。

---

### 第三坑：两个系统两份文件

**现象**：文件夹有了，WSL2 里的 Claude Code 还是读不到配置。

**根因**：WSL2 和 Windows 的文件系统是隔离的。`~/.claude/settings.json`（WSL2 内）和 `C:\Users\...\.claude\settings.json`（Windows 上）是两份完全独立的文件。cc-switch 写的是 Windows 那份，Claude Code 读的是 WSL2 那份——两条平行线。

**修复**：在 WSL2 内创建符号链接（symlink），让 `~/.claude/settings.json` 指向 Windows 宿主机的对应文件。

**洁癖收益**：Windows 上的 `.claude` 文件夹仅存一个 1KB 的 `settings.json`，插件和聊天历史全锁在 WSL2 的 ext4 上。

---

### 第四坑：Symlink 被 Windows 物理拆除 ⚠️ 最隐蔽

**现象**：symlink 搭好后一切正常。过了一段时间（或用 Windows 编辑器碰过那个文件后），桥又断了。

**根因**：**Symlink 是 Linux 文件系统的元数据，Windows 不认识。** 当你通过 `\\wsl$\` 网络路径从 Windows 端浏览到 WSL2 里的 symlink 时，Windows 不理解那是一个"指针"，会直接把目标文件内容**复制**过来，把 symlink 替换成一个真实的普通文件。桥就这样被物理拆除了。

这尤其容易发生在用 VS Code（通过 `\\wsl$\`）不小心浏览到 `~/.claude/` 目录时。

**终极修复**：换个方向建桥——让 symlink 本体藏在 Linux 深处，目标指向 Windows 侧（通过 `/mnt/c/` 挂载点）：

```bash
# 在 WSL2 内部执行
rm -rf ~/.claude/settings.json
ln -s /mnt/c/Users/eryuemu/.claude/settings.json ~/.claude/settings.json
```

这样 symlink 的目标在 Windows 侧（`/mnt/c/...`），本体藏在 WSL2 里。Windows 编辑器几乎不会触碰到 `~/.claude/`，即便不小心覆盖了，重新跑一行命令秒修。

> **核心教训**：跨文件系统边界的 symlink，方向决定生死。让本体留在 Linux 深处、指向 `/mnt/c/` 下的 Windows 文件，而不是反过来。

---

## 六、验证与总结

### 6.1 桥梁验证

```bash
# 在 WSL2 终端执行
cat ~/.claude/settings.json
```

如果输出是 cc-switch 写入的真实配置（能看到 deepseek 端点），不是空 `{}`，桥就是通的。

**反向验证**：Windows 记事本打开 `C:\Users\eryuemu\.claude\settings.json`，改一个字保存。回到 WSL2 `cat ~/.claude/settings.json`——改动立刻可见，说明 symlink 是活的。

### 6.2 四坑总结

| 坑 | 现象 | 根因 | 修法 |
|----|------|------|------|
| 第一坑 | cc-switch 开关无效 | `.cc-switch` 被连带清理 | 重填 DeepSeek 配置 |
| 第二坑 | 重填后仍无效 | v2.1 路径迁移，父目录不存在 | 重建 `.claude` 空目录 |
| 第三坑 | 重建后仍读不到 | WSL2/Windows 文件隔离 | 建 symlink 桥梁 |
| 第四坑 | 用着用着又断 | Windows 触碰 symlink，元数据被替换 | symlink 方向反转 |

### 6.3 核心教训

> **清理时区分"垃圾"和"桥梁"。** `.cc-switch` 和 `.claude` 不是缓存——它们是 cc-switch → Claude Code 通信链条的关键节点。把它们删了等于把桥炸了。
>
> **Symlink 在跨系统边界上很脆弱。** Windows 不认 Linux 的 symlink 元数据，一旦触碰就会降级为普通文件。让本体藏在 Linux 深处、指向 `/mnt/c/` 下的 Windows 文件，才是稳定方案。

---

## 相关笔记

- [Windows 开发环境大扫除：从C盘灾难到WSL2物理隔离](/eryuemu-blog/blog/windows-dev-env-cleanup) ← 前篇：诊断、决策、清理全流程
- [Claude Code 安装与配置完全指南](/eryuemu-blog/blog/claude-code-installation-guide) ← Claude Code 原生安装 + CC Switch 面板详解
- [HBU-Wiki 开发环境搭建：从fnm到项目级Node.js隔离](/eryuemu-blog/blog/hbu-wiki-dev-env-setup) ← 旧方案（已升级至 WSL2）
- **工具** ← 工具 & 效率 MOC