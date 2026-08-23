---
title: '七彩虹游戏本无 U 盘安装 Linux 双系统全复盘：Fedora 与 Ubuntu 26.04 LTS'
description: '七彩虹 P16 Pro（i9-13900HX + RTX 5060）无 U 盘安装 Linux 双系统的完整复盘：Fedora KDE 方案连闯五道坎（黑屏、卷标报错、自动断电、dracut 超时、Anaconda 整盘拉黑）最终放弃，转投 Ubuntu 26.04 LTS 同样连闯五道坎（解锁命令埋雷、安装器 500 崩溃、overlay 断粮、Wi-Fi 卡更新）后终于装成。从 Windows 端准备、虚拟安装盘制作、EasyUEFI 引导、safe graphics 启动、安装器 500/overlay 崩溃修复，到 NVIDIA 驱动 MOK 签名、双系统时差根治、代理与开发环境配置，全流程 + 原理 + 命令速查。'
pubDate: '2026-08-23T22:54:00+08:00'
updatedDate: '2026-08-24T01:00:00+08:00'
category: '开发'
type: 'ai-organized'
---


# 七彩虹游戏本无 U 盘安装 Linux 双系统全复盘：Fedora 与 Ubuntu 26.04 LTS

> **设备**：七彩虹（隐星）P16 Pro · i9-13900HX + RTX 5060 8GB + Intel AX210 无线网卡 · 1TB NVMe 固态（安装时剩余约 490GB）· 预装 Windows 11
> **目标**：保留 Win11，**无 U 盘硬盘直装** Linux 双系统，Windows 数据零风险
> **结局**：Fedora KDE 方案连踩五坑后放弃 → 转投 **Ubuntu 26.04 LTS**（GNOME），同样连闯五道坎后终于装成：GRUB 双系统切换 + RTX 5060 官方驱动满血 + 代理/输入法/开发环境就绪
> **本文定位**：流程复盘 + 踩坑百科 + 知识库。把"现象 → 排查 → 解决 → 原理"全部记录下来，供以后装任何 Linux 双系统时查阅。

关联笔记：C 盘大扫除 · WSL2 实战手册 · 笔记本选型

---

## 0. 先说原理：无 U 盘安装到底在干什么

### 0.1 核心思路

正常情况下 Linux 安装需要 U 盘/光盘作为"启动介质"（Live 环境）。无 U 盘方案的本质是**把 U 盘换成硬盘里切出来的一块小分区**：

1. 在 Windows 磁盘管理里压缩 C 盘，划出一块 **8GB FAT32 分区**；
2. 把 Linux ISO 镜像里的**全部文件**解压到这个 8GB 分区根目录（相当于"烧录"到虚拟 U 盘）；
3. 用 **EasyUEFI** 在主板 UEFI 启动项里手动添加一项，指向该分区里的 `\EFI\BOOT\BOOTX64.EFI`；
4. 重启后主板引导这个虚拟介质，Live 系统加载进**内存**，然后对预先留好的 100GB 未分配空间执行安装。

### 0.2 双系统日常怎么切换

- 安装成功后，Linux 会自动安装 **GRUB** 引导程序，接管开机流程：开机先出菜单，选 Fedora/Ubuntu 还是 Windows；
- **兜底方案**：开机瞬间狂按 **F7**（七彩虹笔记本通常是 F7，也有 F12）呼出主板自带启动菜单，永远可以手动选 Windows Boot Manager 进 Windows——**装了 Linux 绝不等于进不去 Windows**；
- 风险兜底：即使引导项全乱了，主板启动菜单里也还有 Windows Boot Manager 可选，数据不会丢。

### 0.3 术语速查（后面会反复出现）

| 术语 | 含义 |
|------|------|
| UEFI / EFI | 现代主板固件标准；系统引导文件放在 EFI 分区（FAT32）里 |
| GRUB | Linux 的引导加载器，开机菜单就是它 |
| Live 环境 | 从安装介质启动的"试用系统"，运行在内存里，重启即归零 |
| dracut | Fedora 系的内核引导/挂载框架，负责在启动早期找到根文件系统 |
| Anaconda | Fedora 的图形安装程序 |
| Subiquity | Ubuntu 24.04+ 新版图形安装器的后台服务 |
| nouveau | Linux 内核自带的 NVIDIA **开源**驱动，对新显卡支持极差 |
| nomodeset | 内核参数：禁用显卡内核模式设置，强制 CPU 软件渲染，用于绕过黑屏 |
| /isodevice | 老版本 Ubuntu Live 把安装源分区挂载在这里 |
| /cdrom | 新版本 Ubuntu Live（24.04+）把安装源挂载在这里 |
| overlayfs | 叠加文件系统，新版 Ubuntu 安装器靠它从安装源读取数据 |

---

## 1. 第一阶段：Windows 端准备（所有方案通用的地基）

> 无论最后装什么发行版，这一步都一样。目标：**防止 Windows 锁盘 + 划出空间**。

### 1.1 关闭快速启动（防止 Windows 锁定磁盘）

快速启动会让 Windows 关机时把磁盘挂成"休眠锁定"状态，Linux 安装程序可能因此识别不到/无法写入磁盘。

- 按 `Win + R` 输入 `powercfg.cpl` 回车；
- 左侧点"选择电源按钮的功能" → 点"更改当前不可用的设置"（带蓝色盾牌）；
- 取消勾选"**启用快速启动（推荐）**" → 保存修改。

### 1.2 检查 BitLocker / 设备加密

- 按 `Win + S` 搜索"设备加密"或"BitLocker"；
- 若**已关闭**：直接下一步；
- 若**已开启**：务必先"备份恢复密钥"（48 位恢复密钥拍照存手机），或直接关闭设备加密——否则装系统时磁盘被锁，且万一引导出问题恢复会很麻烦。

### 1.3 磁盘管理：压缩 C 盘

- `Win + X` → 磁盘管理 → 右键 C 盘 → **压缩卷**；
- 输入压缩量 **110592 MB**（= 108 GiB，其中 8 GiB 做虚拟安装盘 + 100 GiB 给 Linux）；
- 点"压缩"，稍等片刻，C 盘右侧出现黑色"未分配"区域。

### 1.4 划出 8GB FAT32 虚拟安装盘 + 100GB 未分配

在黑色未分配区域上右键 → 新建简单卷：

| 选项 | 值 |
|------|-----|
| 简单卷大小 | **8192 MB**（8 GiB） |
| 文件系统 | **FAT32**（不要选 NTFS！） |
| 分配单元大小 | 默认 |
| 卷标 | `FEDORA`（装 Ubuntu 时用 `UBUNTU`） |
| 快速格式化 | 勾选 |

**剩余约 100GB 保持"未分配（黑色条带）"状态，切勿格式化**——这就是 Linux 之后的家。

### 1.5 为什么必须是 FAT32

- UEFI 规范要求引导文件所在分区必须是 FAT32（EFI 分区标准格式）；
- NTFS 无法被 GRUB/UEFI 固件直接读取引导。

---

## 2. 第二阶段：Fedora KDE 方案（失败路线，踩坑百科全书）

> 这一段是全文最值钱的部分：**五道坎，每一道都是"现象—原因—解决"的完整样本**。

### 2.1 下载镜像（小坑：官网改版 404）

- 推荐国内高速源：清华镜像 `mirrors.tuna.tsinghua.edu.cn/fedora/releases/.../Spins/x86_64/iso/`，找 `Fedora-KDE-Live-x86_64-*.iso`（约 2.5~3.5GB）；
- **坑**：Fedora 官网改版，旧链接 `fedoraproject.org/spins/kde/` 跳 404，新版路径是 `fedoraproject.org/zh-Hans/kde/download/`；
- 下载页选择 **"For Intel and AMD x86_64 systems"** 那一项（左侧蓝色盾牌图标是校验文件 Checksum，点它右边的下载箭头才是 ISO）。

### 2.2 制作虚拟安装盘

1. 右键 ISO → "**装载**"（Windows 自带虚拟光驱），"此电脑"里多出一个 DVD 驱动器；
2. 进入 DVD 驱动器，**全选复制所有文件和文件夹**（`EFI`、`images`、`isolinux`、`liveos` 等）；
3. 粘贴到 8GB 分区**根目录**——要求根目录下**直接**能看到 `EFI`、`boot` 等文件夹，绝不能套在子文件夹里；
4. **不要**把 ISO 文件本身拖进去。

> 小坑：复制时提示"替换目标中的文件"→ 正常，说明有残留，选"替换"即可；"此电脑"里出现**两个** DVD 驱动器 → 正常，那是"虚拟光驱设备"和"里面分区"的重复显示，同一回事。

### 2.3 EasyUEFI 添加引导项（关键步骤）

EasyUEFI 是 Windows 下的 UEFI 启动项管理工具（试用版够用）。安装后：

1. 打开 → 点"**管理 EFI 启动项**" → 点"**添加**"（+ 号）；
2. 填写配置：

| 字段 | 值 |
|------|-----|
| 描述 (Description) | `Fedora Install` |
| 类型 (Type) | **Linux 或其他操作系统** (Linux or other OS) |
| 目标分区 (Target Partition) | 磁盘分区条上那个 8GB 的 FAT32 小方块（认准 FED/ FAT / 8.00 字样） |
| 文件路径 (File Path) | 浏览 → `EFI` → `BOOT` → 选 **BOOTX64.EFI**（有 shimx64.efi 也可） |

3. 确定保存后，把新项用"**上移**"箭头挪到列表**最顶端**；
4. 重启。顺利的话直接进入 Fedora 引导菜单；如果直接进了 Windows，开机瞬间狂按 **F7** 手动选择该项。

> 重启之后，第一道坎立刻出现：从菜单选 Fedora，屏幕直接黑屏。

### 2.4 坎 1：第一次引导就黑屏（nouveau × RTX 5060）

**经历**：EasyUEFI 添加引导项并置顶后重启，从 GRUB 菜单选 Fedora，屏幕却一直黑着不动。

**先别急，分两步判断**：

1. **排除正常过渡**：Live 镜像正在把系统解压读入内存，加上核显/独显切换显示模式，中途有 30 秒~1 分钟黑屏是正常的，等 1~2 分钟；
2. **超过 2 分钟仍黑屏** → 长按电源键 5~8 秒强制关机 → 重新开机，再次进入 GRUB 菜单后：
   - 选 **`Troubleshooting`（故障排除）** → **`Start Fedora-KDE-Live in basic graphics mode`（基本图形模式）** → 回车；
   - **本次实际就是走这条路径继续下去的**（当时机器的菜单里有 Troubleshooting，直接可用）；
   - 备选（仅当菜单里没有 Troubleshooting 子菜单、只有一行 `Start Fedora...` 时）：在该启动项上按 **`e`** 键，找到以 `linux` 开头的那一行，在行尾（`quiet`/`rhgb` 后面）空格隔开追加 `nomodeset`，按 `Ctrl + X` 或 `F10` 启动。

**真相**：游戏本双显卡（Intel 核显 + NVIDIA RTX 5060 独显）在未装官方驱动时，内核默认加载开源驱动 **nouveau** 尝试点亮独显，而 nouveau 对较新的 RTX 显卡支持极差，显示初始化失败 → 黑屏。

**结果**：basic graphics mode 下屏幕终于亮了，**但紧接着引导报错 `by-label does not exist`——坎 2 来了**。

### 2.5 坎 2：报错 by-label does not exist（卷标对不上）

**经历**：basic graphics mode 不再黑屏，但引导时直接报 `by-label does not exist`。

**原因**：Fedora 官方 ISO 内部脚本（dracut）**硬编码**了启动时去找卷标为 `Fedora-KDE-Live-44-...` 的介质，而 8GB 分区在 Windows 里命名成了 `FEDORA`——名字对不上，启动脚本搜不到安装源。

**解决**：在 GRUB 菜单选中启动项后按 **`e`** 键编辑启动参数（按 e 编辑正是从这个阶段开始频繁使用的），找到以 `linux` 开头的那一行，把 `root=live:CDLABEL=Fedora-KDE-Live-44` 改成：

```
root=live:LABEL=FEDORA
```

（`LABEL` 必须全大写 L-A-B-E-L。）行尾顺带加 `nomodeset`（和坎 1 同一套显卡兼容思路）。改完按 `Ctrl + X` 或 `F10` 启动。

**结果**：卷标问题解决了，但启动到一半**电脑突然自己断电**——坎 3 来了。

> ⚠️ **关键知识：GRUB 按 e 编辑只对本次启动生效**。修改只写在内存里，不会写进硬盘的 grub.cfg——所以每次重启后参数都会"恢复默认"，这是正常现象，需要每次重新改（当初反复重输参数就是因为这个机制，后面还会多次遇到）。

### 2.6 坎 3：启动中自动断电（Kernel Panic 电源保护）

**经历**：改完卷标参数后启动，引导过程中电脑突然自己关机/断电，重启还会复现。

**原因**：nouveau 在开机瞬间初始化 RTX 5060 失败 → **Kernel Panic（内核崩溃）→ 触发底层 ACPI 电源保护 → 直接断电**。

**解决**：按 `e` 编辑，在 linux 行**行尾追加彻底屏蔽 nouveau 的参数**：

```
nouveau.modeset=0
```

（必要时再加 `rd.driver.blacklist=nouveau`。）改完后的完整行应为：

```
linux ($root)/boot/x86_64/loader/linux quiet rhgb root=live:LABEL=FEDORA rd.live.image nomodeset nouveau.modeset=0
```

**结果**：断电不再出现，但引导又卡在 **dracut-initqueue timeout**——坎 4 来了。

### 2.7 坎 4：卡在 dracut 超时——emergency shell 与设备路径

**经历**：断电问题解决后，引导卡在 `dracut-initqueue timeout` 循环，最终掉进 `dracut:/#` 命令行（emergency shell）。

**处理**：

1. 在 `dracut:/#` 提示符下输入 `blkid`，列出所有分区的真实设备路径和 UUID（实测 8GB 分区是 `/dev/nvme0n1p4`，UUID `22DA-C279`）；
2. 按 `e` 编辑，把 root 参数直接替换为绝对设备路径：

```
linux ($root)/boot/x86_64/loader/linux quiet rhgb root=live:/dev/nvme0n1p4 rd.live.image nomodeset nouveau.modeset=0
```

> 小坑：手输参数时把 `nomodeset` 打成了 `nomodesset`（多了个 s）→ 逐个字符核对。

**为什么无 U 盘引导这么容易出问题**：Live 系统的设计前提是"安装源在外部独立介质（U 盘/光盘）上"。把安装文件强行放在本机同一块 NVMe 固态的分区里引导，内核扫描磁盘总线时容易与固态控制器发生资源竞争，且 udev 规则不会自动为本地 FAT32 分区生成卷标链接——所以最终靠"绝对设备路径"才绕过去。

> 💡 排错技巧：如果卡在加载画面（Colorful 转圈）超过 2 分钟，按 `Esc` 键可以切掉转圈画面、露出底层命令行日志：代码在持续滚动说明一切正常（再等十几秒进桌面）；停在同一行超过 1 分钟不动，说明某个服务初始化受阻，把日志拍下来就能定位卡点。

**结果**：终于进入 KDE 桌面。但这是用 nomodeset 换来的，体验上要付出代价（见 2.8）。

### 2.8 进入桌面的代价：nomodeset 下为什么卡顿、没有动画

好不容易进了 KDE 桌面，但**明显卡顿、没有窗口动画**。原因：

- **纯 CPU 软件渲染（llvmpipe）**：nomodeset 禁用了显卡底层加速，每个像素都由 CPU 硬画；
- **KDE 自动关闭合成器（Compositor）**：检测不到硬件 3D 加速时，毛玻璃、过渡动画全部停用；
- **刷新率锁 60Hz 兼容模式**。

这是**临时状态**，正式装好系统 + 官方驱动后才会恢复 GPU 加速与丝滑动画。Live 环境本身也无法保存任何数据（重启即归零）。但更致命的还在后面：点开安装程序，一块磁盘都看不到（见 2.9）。

### 2.9 最后的坎（致命）：No disks available——Anaconda 整盘拉黑

**经历**：好不容易进了 Fedora 安装程序（Anaconda），点"安装目的地"却显示 **No disks available**，一块硬盘都看不到。

**原因**（这条是 Fedora 无 U 盘方案的死刑判决）：

- 安装镜像解压在本机**唯一**的物理固态硬盘的分区里，Live 系统运行期间内核必须持续读取这块硬盘；
- Anaconda 有底层防误删保护：**禁止修改当前 Live 系统所在的那块物理硬盘**（一旦重划分区表，正在运行的安装程序自身会崩溃并损坏文件系统）；
- 唯一硬盘被当作"启动介质"排除后，可用目标盘列表就是空的。

**结论**：Fedora 的 Live 机制**无法在运行中强行解除该挂载**（没有 Ubuntu 的 /isodevice 卸载机制），无 U 盘方案对 Fedora 此路不通。官方安装器就是设计为"安装源必须在外部介质上"。

### 2.10 Fedora 路线失败总结与无损清理还原

**当前状态**：Windows 数据 100% 完好——所有操作只是在硬盘末尾划了个 8GB 小分区 + 主板里写了一条临时启动项，没碰 Windows 系统分区。

清理还原三步：

1. **回 Windows**：长按电源键关机 → 开机狂按 F7 → 选 Windows Boot Manager；
2. **删引导项**：打开 EasyUEFI → 管理 EFI 启动项 → 把 `Fedora`、`Fedora Install`、`Linpus lite` 等全部删除（保留 Windows Boot Manager 和 EFI USB/DVD/Network）；
3. **收回空间**：`Win + X` → 磁盘管理 → 右键 8GB 分区 → "删除卷"（变回未分配）→ 右键 C 盘 → "扩展卷"合并复原。

**复盘 Fedora 路线的五道坎**：

| 坎 | 现象 | 根因 | 解决 | 结局 |
|----|------|------|------|------|
| 1 黑屏 | 引导后黑屏不动 | nouveau 驱动不了 RTX 5060（显示初始化失败） | Troubleshooting → basic graphics mode | 能绕过 |
| 2 by-label | 引导报卷标找不到 | ISO 硬编码 CDLABEL，与本地卷标 FEDORA 不匹配 | e 编辑改 `LABEL=FEDORA` | 能绕过 |
| 3 断电 | 启动中自动关机 | nouveau 初始化失败 → Kernel Panic → ACPI 电源保护 | e 编辑追加 `nouveau.modeset=0` | 能绕过 |
| 4 dracut 超时 | 卡在 dracut 超时，掉进 emergency shell | udev 无法通过卷标识别本地 NVMe 分区 | `blkid` 查设备路径 → `root=live:/dev/nvme0n1p4` | 能绕过 |
| 5（致命）No disks | 安装程序看不到任何磁盘 | Anaconda 整盘拉黑（安装源与目标盘同体，无法在运行中解除） | 无解 | **死结，放弃** |

前四道坎靠内核参数能绕，第五道是死结——它直接决定了下一阶段的方案选择：**必须选一个能"在运行中解锁本地硬盘"的发行版（Ubuntu 系），且引导阶段要自带 safe graphics 模式**。

---

## 3. 第三阶段：Ubuntu 26.04 LTS 成功路线

> 新开对话，带着上一轮的全部教训重来。**注意**：AI 当时给的教程反复写"Ubuntu 24.04 LTS"，但实际下载安装的是 **Ubuntu 26.04 LTS**——版本信息会过时，一切以官网/镜像站实际最新 LTS 为准（这也是一条教训，见 3.2）。

### 3.1 为什么换 Ubuntu（发行版对比）

针对"独显游戏本 + 双系统 + 无 U 盘"场景：

| 发行版 | 桌面 | 无 U 盘友好度 | 显卡适配 | 结论 |
|--------|------|--------------|----------|------|
| Ubuntu 24.04/26.04 LTS | GNOME | ✅ 无 U 盘直装可行（新版无需解锁） | 安装后一键装官方驱动 | **最终选择** |
| Kubuntu LTS | KDE | ✅ 同上 | 同上 | 喜欢 KDE 就选它 |
| Linux Mint 22 | Cinnamon | ✅ | 自带驱动管理器 | 新手友好 |
| Pop!_OS | COSMIC/GNOME | ⚠️ 无 U 盘方案不明确 | 官方 NVIDIA 专版 ISO，开箱即用 | 有 U 盘时首选之一 |
| Fedora KDE | KDE Plasma 6 | ❌ Anaconda 整盘拉黑 | nouveau 黑屏/断电 | **无 U 盘直接排除** |

选择逻辑：**只认 LTS**（长期支持版，2 年一发布、5 年支持，驱动和社区方案最成熟），避开 xx.10 过渡版。

### 3.2 下载镜像（两个小坑 + 版本过时教训）

- **坑 A（404）**：AI 给的清华镜像直链 `ubuntu-24.04.1-desktop-amd64.iso` 404——Ubuntu 发布小版本后文件名后缀会变（24.04.1/24.04.2/...），要用目录页 `mirrors.tuna.tsinghua.edu.cn/ubuntu-releases/<版本>/` 里现成的文件名；
- **坑 B（下到假文件）**：从官网 `ubuntu.com/download/desktop` 点下载，下载下来的是一个 **85KB 的 thank-you HTML 网页**而不是 5.8GB 的 ISO。判断标准：**体积必须约 5.8GB、后缀必须是 .iso**；
- **版本过时教训**：AI 教程写的是 24.04 LTS，实际下载安装的是 **26.04 LTS**（2026-04 发布）。装机类 AI 教程的版本号和链接都有保质期，下载前先看镜像站最新目录。

### 3.3 重建虚拟安装盘 + EasyUEFI（同 1.4 / 2.3）

1. 磁盘管理：在未分配空间上新建 8GB 简单卷，FAT32，卷标 **`UBUNTU`**；
2. 装载 ISO → 全选复制（`EFI`、`boot`、`casper`、`dists` 等）到 UBUNTU 分区根目录（有残留先清空）；
3. EasyUEFI：添加启动项 → 类型 `Linux 或其他操作系统` → 描述 `Ubuntu-Installer` → 目标分区选 8GB FAT32 → 文件路径 `\EFI\BOOT\BOOTX64.EFI` → 上移置顶 → 重启。

### 3.4 safe graphics 引导

重启进入 GRUB 菜单后，用方向键选 **`Try or Install Ubuntu (safe graphics)`** 回车——该模式自带 nomodeset，直接避开 RTX 5060 的黑屏死锁，加载约 1~2 分钟进桌面。

> 进桌面只是开始。按照当时的引导，第一件事是执行一条"解锁硬盘"的命令——排错之旅就此展开（见 3.5）。

### 3.5 排错全程拆解：从"先输一条命令"到"重启就好了"

> 这一段按**实际发生顺序**逐坎拆解：每一步看到了什么现象、做了什么操作、那一步在干嘛、真相是什么。一共五道坎。

#### 坎 1：进 Live 后"先输一条命令"——umount /isodevice（埋雷的一步）

**当时**：引导流程的第一步是在终端（Ctrl + Alt + T）执行：

```
sudo umount -l -r -f /isodevice
```

**发生了什么**：提示 `no mount point specified` / `not mounted`——因为**新版 Ubuntu 的安装源根本不在 /isodevice**。

**排查**：`lsblk` 一看，8GB 分区（nvme0n1p4）挂在 **`/cdrom`**。

**于是改成**：

```
sudo umount -l -r -f /cdrom
```

再 `lsblk` 确认 nvme0n1p4 的 MOUNTPOINTS 栏变空——看起来"解锁成功"。

**这一步的真相**（两条）：

1. **这个动作本身就是多余的**：老版 Ubuntu（<24.04）的安装源挂在 /isodevice，且老安装器有"安装源所在盘不能动"的限制，所以需要卸载来解锁。**新版（24.04+ / 26.04）完全没有这个限制**，安装器直接就能识别并分区本机 NVMe——"解锁硬盘"是旧教程留下的伪需求；
2. **它还是个雷**：/cdrom 不是普通分区，它是 Live 系统运行所依赖的"安装源"。把它卸掉，等于拆了 Live 系统的地基——这个雷在坎 4 才炸。

#### 坎 2：安装向导一路点过去，接近分区界面时崩溃（"读不了盘"的错觉）

**当时**：关了终端后点安装图标，向导一路"下一步"：语言 → 键盘 → 网络 → 安装选项……快到分区界面时，弹出 **"Something went wrong"**，界面崩溃。

**当时的直觉反应**：坏了，跟 Fedora 那次一样——"读不了盘"（No disks available 的即视感）。

**真相**：**不是读不了盘，是安装器软件自己崩了**。新版安装器（Subiquity）在扫描硬件安全引导（Enhanced SecureBoot/TPM）状态时调用后台 snapd 服务，服务返回 500 异常，安装器没接住就崩了——这是新版安装器的知名原生 Bug。

**证据**：日志里磁盘探测是成功的（`SUCCESS: restricted=False`）；后来分区界面也正常显示了 107.37 GB 空闲空间——**磁盘从头到尾都在**。

**区分清楚**（这是两个完全不同的问题）：

| | Fedora 那次 | Ubuntu 这次 |
|---|------------|------------|
| 表面 | 安装目的地界面看不到磁盘（No disks available） | 向导走到磁盘扫描步骤时崩溃 |
| 根因 | Anaconda 把安装源所在盘"整盘拉黑"（真·读不了） | 安装器调用 snapd 组件出错（软件 Bug） |
| 磁盘 | 被安装器隐藏 | 一直都在 |

#### 坎 3：那堆修复命令——逐条拆解（修的是安装器，不是磁盘）

**当时**：随后在引导下一口气执行了一堆命令。逐条拆开看它们分别修什么：

| 命令 | 修什么 |
|------|--------|
| `sudo systemctl restart snapd` | 重启 snapd 服务——500 错误的直接来源，先把它复位 |
| `ubuntu-desktop-bootstrap` | 重新拉起安装器（新版安装器本身就是一个 snap 应用） |
| `sudo pkill -9 -f subiquity`<br>`sudo rm -rf /run/subiquity*` | 杀掉崩溃后残留的安装器后台进程、清掉旧通信 socket——不然新打开的安装器会连上"旧尸体"继续报错 |
| 连上 Wi-Fi / 手机热点 | 让 snapd 完成组件初始化（联网后 500 不再复现） |
| `sudo snap refresh snapd`<br>`sudo snap refresh ubuntu-desktop-bootstrap` | 把安装器组件更新到带修复补丁的版本 |

**效果**：折腾完后安装器终于不崩了，顺利进到分区界面——**磁盘正常显示，107.37 GB 空闲空间清清楚楚**。

**但注意**：这些修复全部是在 **Live 内存环境**里做的。Live 系统重启即归零，**这些"修好的状态"重启后全部不存在**——这为坎 5 的"重启就好"埋了伏笔。

#### 坎 4：配置好分区，点"安装"又崩——overlay 不存在（坎 1 的雷炸了）

**当时**：分区（107.37 GB 空闲 → Ext4 → /）、账户都配置好了，点"安装"**立刻崩溃**，日志核心报错：

```
mount: 特殊设备 overlay 不存在
```

**为什么崩在"点安装"这一刻**：分区、账户配置只是"纸上谈兵"（在内存里规划，不读源），所以能一路走到最后一步；但**真正写入系统（解压镜像、配置 apt）时，安装器必须读安装源**——而安装源 /cdrom 在坎 1 被卸载了，安装器"断粮" → 崩。

**这里要分清两个"盘"**：

| | 是什么 | 需要"解锁"吗 |
|---|--------|-------------|
| **目标盘**（要装系统的 NVMe） | 安装器要分区、写入的那块盘 | **从来都能识别**，不需要任何解锁 |
| **安装源**（/cdrom） | Live 系统运行所依赖的介质（squashfs 镜像 + overlayfs 叠加层） | 写系统时**必须读它**；被 umount 后安装器就崩 |

（overlayfs = 叠加文件系统：Live 系统的根目录 = 只读的 squashfs 镜像 + 内存里可写的叠加层，而 squashfs 就藏在 /cdrom 里。）

#### 坎 5：重启，什么都不输，直接成功（为什么？）

**当时**：引导改为重启。这次进 Live 后**一行命令都没输**：safe graphics 进桌面 → 连 Wi-Fi → 直接双击安装图标 → 同样的分区配置 → 点安装 → **顺利装完**。

**为什么这次不用输命令就全好了**？因为重启让三件事同时恢复：

1. **安装源恢复了**：Live 重新引导时 casper 启动脚本自动把 /cdrom 和 overlayfs 重新挂载好——坎 4 的雷不存在了；
2. **安装器组件干净了**：snapd 和安装器以出厂初始状态启动——坎 2 的 500 崩溃也不存在了；
3. **目标盘从来没问题**：不需要任何"解锁"，所以也谈不上"恢复"。

**那些修复命令白打了吗**？没有白打——它们确认了问题是安装器软件（而不是磁盘），并且真的让安装器进到了分区界面。但它们改的是 Live 内存里的状态，**在 Live 里修内存状态，永远不如重启一次干净**。

**装到一半又卡住？**（后续"连着 Wi-Fi 卡住"的那一段）：安装最后阶段联网时，安装器会在后台下载安全更新（unattended-upgrades），国内网络超时就会长时间卡住。**断开 Wi-Fi 立即跳过**，立刻进入收尾。然后：定位服务关掉、Ubuntu Pro 跳过、遥测不发送，进桌面。（详见 3.8 安装过程、3.9 首次开机设置）

**复盘：绕远路了吗？**

| 坎 | 当时做了什么 | 真相 |
|----|-------------|------|
| 1 | umount /isodevice → /cdrom | 多余 + 埋雷：新版根本不需要解锁 |
| 2 | 向导崩溃"读不了盘" | 错觉：是安装器 500 Bug，磁盘一直在 |
| 3 | 一堆修复命令 | 修对了（确实是安装器软件），但改的是内存状态 |
| 4 | 点安装崩 overlay | 坎 1 的雷：安装源被卸，安装器断粮 |
| 5 | 重启，不输命令，成功 | 重启 = 安装源恢复 + 组件初始状态，一步到位 |

**正确流程（最终版）**：

1. safe graphics 进 Live 桌面；
2. **连上 Wi-Fi**（让 snapd 正常初始化，避免 500 崩溃）；
3. **直接双击 Install Ubuntu 图标，一行命令都不要输**；
4. 手动分区 → 安装；
5. 如果安装器崩溃：**直接重启 Live**（比在内存里修服务快且干净），重进后先连 Wi-Fi 再开安装器；
6. 安装最后阶段卡住不动（联网下载安全更新）→ **断开 Wi-Fi 立即跳过**。

**一句话总结**："解锁硬盘"从头到尾是伪需求（目标盘一直能读）；umount /cdrom 是旧教程留下的有害动作；安装器 500 是软件 Bug——**重启 Live 一次同时解决所有问题，在 Live 里修内存状态永远不如重启一次干净**。

> 排错结束，安装正式进入分区环节——第一个困惑马上就来了：明明留了 100GB，界面怎么显示 107.37 GB？（见 3.6）

### 3.6 手动分区：107.37 GB 的由来

**现象**：Windows 里明明留了 100GB，Ubuntu 分区界面却显示"空闲空间 107.37 GB"；8GB 分区显示成 8.59 GB。

**原因（空间去哪了）**：

1. **GiB vs GB 显示差异**：Windows 按二进制（1 GiB = 1024 MB）划分，100 GiB = 107,374,182,400 字节；Ubuntu 按十进制（1 GB = 1000 MB）显示 → 107.37 GB。8 GiB → 8.59 GB。**一字节都没少**，纯属两套计数单位；
2. **4K 扇区 1MB 对齐**：NVMe SSD 分区强制按 1MB（2048 扇区）物理对齐，分区工具会裁剪几 MB 的零头，正常现象。

**分区操作**（手动安装最安全，因为已经提前留好了独立空闲空间）：

1. 安装类型选"**手动安装**"（区别于"与 Windows 共存"——共存选项的黑盒逻辑可能会去动已有的 NTFS 分区，手动指定 100% 不碰 Windows）；
2. 列表里选中"空闲空间 107.37 GB"那一行 → 点左下角 **+**：
   - 大小：保持默认最大值（107GB 全用完）；
   - 用于：**Ext4 日志文件系统**；
   - 挂载点：**/**（根目录）；
   - 确定；
3. 底部"用于安装引导程序的设备"保持默认（整盘 /dev/nvme0n1）——**不需要单独分引导分区**，Ubuntu 会直接共用 Windows 的 EFI 分区（nvme0n1p1，100MB 足够）；
4. 现代 Ubuntu 用 swap 文件自动管理交换空间，**不需要手动分 swap 区**。

**写入确认清单核对**（点"安装"前必看）：

- Windows 所有分区（nvme0n1p2/p3/p4/p5，含 892.57GB 的 C 盘）→ 全部"**未更改**"；
- EFI 引导区（nvme0n1p1）→ 仅作为 /boot/efi 挂载点写入引导记录，**不被格式化**；
- 唯一被格式化写入的 → 新建的 nvme0n1p6（Ext4，107GB，挂 /）。

### 3.7 账户与时区设置

- **用户名 vs 主机名**：用户名 = 登录账号，决定 `/home/<用户名>` 路径；主机名 = 局域网设备名。都设成 `eryuemu` 也没问题（终端提示符 `eryuemu@eryuemu:~$`）；之后想改主机名随时可以：
  ```
  sudo hostnamectl set-hostname 新名字
  ```
  实测最终主机名是 `eryuemu-P16-Pro`；
- **活动目录（Active Directory）**：企业域管理用的，个人电脑**不勾选**；
- **时区选上海（Shanghai）**。澄清当年 Linux 课"不能选亚洲"的谣言：
  - 生信课要求的是**系统语言选英文**（避免中文路径/字符集导致工具报错），**与时区无关**；
  - 服务器为了日志对齐用 UTC（0 时区），个人笔记本用 UTC 会慢 8 小时；
  - 双系统 8 小时时差的真正机制见 3.10，与选哪个时区无关，装完一条命令即可根治。

### 3.8 安装过程（两个"看似卡住"）

- **rsync 卡住**：日志停在 `Running command ['rsync', '-aXHAS', ...]` 长时间不滚动——正常，正在后台解压几万个系统文件到固态，期间不输出进度，约 1~3 分钟；
- **卡在"配置硬件/安全更新"**：连了 Wi-Fi 的话，安装器在后台连官方源下载安全更新（unattended-upgrades），国内网络容易超时等待。**最快解法：点右上角断开 Wi-Fi**，触发网络中断自动跳过，立刻进入安装 GRUB 引导阶段。不操作的话 5~10 分钟也会超时跳过；
- 安装完成提示"立即重启"，若卡在黑底白字 `Please remove the installation medium, then press ENTER:`，直接按回车即可（无 U 盘场景没有介质要拔）。

### 3.9 首次开机设置

- 定位服务：保持关闭（隐私 + 省电）；
- Ubuntu Pro：选择"现在跳过"；
- 帮助改进 Ubuntu（遥测）：选"否，不发送系统信息"。

### 3.10 时间问题全家桶（双系统必读）

**机制**：Windows 默认把主板硬件时钟（RTC）当**本地时间**（UTC+8）读写；Linux 默认把 RTC 当 **UTC** 读写。两边对同一块主板时钟的理解不一致 → 来回切换系统时间差 8 小时。

**根治命令**（装完进 Ubuntu 后立即执行，让 Linux 也把 RTC 当本地时间）：
```
timedatectl set-local-rtc 1 --adjust-system-clock
```
终端提示 Warning 是 systemd 的标准安全提示（"可能受夏令时影响"），**不是报错**；中国不实行夏令时，可完全忽略。验证：`timedatectl` 输出含 `RTC in local TZ: yes` 即成功。

**衍生坑：apt 报 "Release 文件已经过期"**——时间倒退 8 小时后，apt 校验软件源时间戳失败。解决：
```
sudo timedatectl set-ntp true        # 网络自动对时
# 若 NTP 没同步成功，手动设置当前时间（照手机时间填）：
sudo date -s "22:30:00" && sudo hwclock -w
```
装驱动这种场景，秒级误差完全无影响；想要精准同步可换阿里云 NTP：
```
sudo sed -i 's/#NTP=/NTP=ntp.aliyun.com/g' /etc/systemd/timesyncd.conf && sudo systemctl restart systemd-timesyncd
```

**Windows 侧也乱了**：回 Windows 后右键任务栏时间 → 调整日期/时间 → 点"立即同步"一次即可。之后两边都存本地时间，达成共识，**永远不再乱**。

### 3.11 GRUB 菜单逐项解读（装完后的开机菜单）

| 菜单项 | 归属 | 用途 |
|--------|------|------|
| Ubuntu | Ubuntu 安装生成 | 正常启动 Ubuntu |
| Advanced options for Ubuntu | Ubuntu 安装生成 | 选旧内核/恢复模式：驱动更新翻车黑屏时回来救砖；忘记密码、修复文件系统用 Recovery Mode |
| Memory test (memtest86+x64) ×2 | Ubuntu 安装生成 | 内存硬件检测工具，平时无用；怀疑内存坏块/频繁死机时离线全盘扫描（带 serial console 字样的串口模式给无显示器服务器用，笔记本用不上） |
| Windows Boot Manager (on /dev/nvme0n1p1) | Windows 原有 | 进 Windows |
| UEFI Firmware Settings | 主板固件 | 免狂按快捷键直接重启进 BIOS（NVMe 开机太快，这个入口很实用） |

另外：主板 BIOS 启动项列表里默认还有 **EFI USB Device / EFI DVD/CDROM / EFI Network** 三项，那是主板固件**出厂自带**的硬件引导接口（就算硬盘全格式化也存在），排在 ubuntu 和 Windows 后面，平时不会被触发，不用管。

### 3.12 Windows 侧清理与时间同步

1. 磁盘管理：右键 **UBUNTU (D:) 8GB FAT32 分区** → "删除卷" → 变回未分配；
2. 右键 C 盘 → "扩展卷" → 一路下一步，8GB 合并回 C 盘；
3. **绝对不要碰**：右侧 100GB 的 Linux 分区（Windows 下显示为无盘符/未知分区，读不出文件系统是正常现象，**弹出"需要格式化"提示时千万别点格式化**）和最左侧 100MB 的 EFI 引导分区；
4. 顺手知识：C 盘根目录的 `DumpStack.log` 是蓝屏/崩溃转储日志，纯文本，可安全删除；大体积 ISO 删除时不进回收站（超过回收站配额直接永久删除），正常现象；
5. 时间：见 3.10 末尾，点"立即同步"。

---

## 4. 装完后的配置与驱动

### 4.1 NVIDIA 显卡驱动（RTX 5060 满血解锁）

**检查现状**：
```
ubuntu-drivers devices
```
会列出推荐驱动。实测推荐 **nvidia-driver-595-open**（RTX 5060 移动版对应 open 内核模块系列）。

**为什么装驱动前一切"不可用"**：当前在用内核自带的 nouveau 开源驱动——它只是让显卡"亮起来"，读不到显存/频率/温度，没有 CUDA 和 3D 加速；实际输出画面的是 Intel 核显（UHD Graphics）。nvidia-smi 提示"驱动不可用"就是这个原因。

**安装**（时间修好之后）：
```
sudo apt update && sudo apt install -y nvidia-driver-595-open
sudo reboot
```

**MOK 签名流程（Secure Boot 下装第三方驱动的必经之路）**：
- 安装过程中会弹密码设置窗口（给驱动签名用的临时密钥），设一个简单密码并**记牢**（如 12345678）；
- 重启后进入蓝底灰字的 **Perform MOK management** 界面，按顺序：`Enroll MOK` → `Continue` → `Yes` → **输入刚才的密码（屏幕无任何字符回显，正常，盲打）** → `Reboot`；
- 完成后驱动正式生效。这套流程只在首次安装时做一次。

**验证**：
```
nvidia-smi
```
实测输出：驱动 595.84、支持最高 CUDA 13.2、RTX 5060 8GB（8151 MiB）、温度 47°C、待机功耗 12W/70W、gnome-shell 已挂载在独显上协同渲染。

**双显卡调度（prime-select）**：对应 Windows 控制中心的模式：

| Windows 控制中心 | Ubuntu 命令 | 含义 |
|------------------|-------------|------|
| 混合模式（默认） | `sudo prime-select on-demand` | 平时核显省电，高性能程序自动调独显 |
| 独显直连 | `sudo prime-select nvidia` | 强制独显，性能最强、耗电大 |
| 纯核显/禁用独显 | `sudo prime-select intel` | 极致续航 |

> 细微差别：Windows 的"独显直连"通过 BIOS 的 **MUX Switch 硬件芯片**物理切断核显输出通路；Linux 的 prime-select 是软件层接管，若笔记本有硬件 MUX，Linux 不一定能驱动它做物理切换。日常用默认 on-demand 即可，不需要手动配置。

### 4.2 磁盘占用分析（19.2GB 都装了什么）

安装完总占用约 19.2GB（105.1GB 总容量 - 85.9GB 可用）：

| 组成 | 大小 | 说明 |
|------|------|------|
| NVIDIA 驱动 + 内核编译套件 | ~3-5 GB | DKMS 动态编译链、CUDA 运行环境、内核头文件 |
| GNOME 桌面 + 预装软件 | ~6-8 GB | 桌面环境、LibreOffice、多媒体组件 |
| Snap 沙盒包 | ~2-3 GB | Firefox 等 Snap 应用自带独立依赖库 |
| apt 安装包缓存 | ~1-2 GB | 装驱动留下的 .deb 缓存 |

瘦身（可选）：
```
sudo apt clean && sudo apt autoremove -y
```
autoremove 时红字提示删除 linux-headers/image 等是**正常**的（清理旧内核组件，会保护当前内核），本次释放约 319MB。

### 4.3 中文输入法

- **自带 IBus 智能拼音够用**：安装时选中文语言就预装了，右上角"中"字图标，按 `Shift`（或 `Super + 空格`）切换中英文，日常打字、写代码、发弹幕完全够；
- 想要更强词库/光标跟随可换 Fcitx5：
  ```
  sudo apt install -y fcitx5 fcitx5-chinese-addons
  ```
  然后"设置 → 区域与语言 → 管理安装的语言 → 键盘输入法系统"改为 fcitx5，注销重登，`Ctrl + 空格` 切换。

### 4.4 电池 87% 不充电之谜

**现象**：插着电源但 Ubuntu 显示"未充电 87%"。

**原因**：Windows 控制中心里设置的 80~90% 充电养护阈值是**直接写入主板 EC 硬件芯片**的，切到任何系统都强制执行。

**供电逻辑**：适配器接入 → 电流直供主板系统总线（VSYS）优先供电运行 → 电量在阈值区间内时，充电控制 MOS 管物理切断充电回路 → 电池纯"旁路待命"。拔电立即变"放电中"；电量跌破下限再插电会自动恢复充电。放心一直插着用，不会过充损耗。

### 4.5 代理软件（Clash Verge Rev，含"鸡生蛋"破局）

**困境**：装代理需要先有代理（下载 GitHub 的 .deb 需要访问 GitHub）。

**三条破局路径**：

1. **镜像加速站**：浏览器访问 `ghproxy.net` 前缀的 GitHub 镜像下载。坑：该域名被 Google Safe Browsing 误报拦截 → 点"查阅详情 → 忽略警告并继续访问"；或终端直链下载：
   ```
   wget https://mirror.ghproxy.com/https://github.com/clash-verge-rev/clash-verge-rev/releases/download/<版本>/clash-verge-rev_<版本>_amd64.deb
   ```
2. **Windows 中转（最稳）**：Ubuntu 自动挂载了 Windows C 盘（文件管理器左侧栏可见），回 Windows 下载 .deb 丢桌面，切回 Ubuntu 直接从挂载盘复制安装；
3. **局域网共享代理**：手机/Windows 的代理软件勾选"允许局域网连接"，在 Ubuntu"设置 → 网络 → 网络代理 → 手动"填入 IP:端口（默认 7890），借用其他设备网络拉订阅，配好后关掉。

**安装与使用**：
```
cd ~/下载        # 注意：中文系统里文件夹叫"下载"，不是 Downloads！
sudo apt install ./Clash.Verge_2.5.2_amd64.deb
```
- **./ 前缀**：告诉 apt 安装"当前文件夹下"的文件，不加会去在线软件库搜；
- **Tab 键自动补全**：文件名永远别手打全，输入前缀按 Tab 让终端补全；
- **坑：双击 .deb 会跳转 Ubuntu 软件中心**，兼容性极差，永远用终端 apt 安装；
- 安装完出现 `_apt` 权限警告（访客账户读不了你的家目录）：**无害**，程序已装好，验证方式：`Win` 键搜索 Clash Verge；
- 安装后：订阅页粘贴机场链接 → 代理页选节点 → **设置里打开"系统代理"**（最关键，很多人漏掉）→ 终端 `curl -I https://www.google.com` 验证 HTTP/2 200；
- 装完 .deb 安装包文件就可以删了（程序已拷贝进系统目录，安装包只是搬运工）。

**Linux 软件形态对比**（Windows 用户视角）：

| 格式 | 对应 Windows 概念 | 特点 |
|------|------------------|------|
| AppImage | 单文件绿色版 | 下载赋权即跑（`chmod +x`），删文件即卸载；老版本可能需要 `sudo apt install libfuse2t64` |
| .tar.gz 解压包 | 绿色压缩包文件夹 | 解压即用，删文件夹即卸载 |
| .deb / apt | 安装程序 (.msi) | `sudo apt install ./xxx.deb`，深度集成系统 |
| Snap / Flatpak | 应用商店沙盒应用 | 商店一键装，沙盒隔离，体积大 |

**架构后缀**：`amd64` = `x86_64` = `x64`（Intel/AMD 电脑）；`arm64` = `aarch64`（手机/树莓派/M 芯片）。.deb 是 Debian 系（Ubuntu/Mint/Deepin），.rpm 是 RedHat 系（Fedora/CentOS），.dmg 是 macOS，.exe 是 Windows。

**root 权限概念**（Windows 用户最容易困惑的点）：`/home/你的用户名/` 是个人领地，随便读写；`/usr`、`/bin` 等系统目录是系统领地，必须 sudo。用 sudo 安装 ≠ 你是 root，只是"临时管理员操作"；软件运行后还是普通用户身份，崩溃也伤不到系统。只要不敲 `rm -rf /`，sudo 完全安全。

### 4.6 原生 Linux vs WSL2（跑 AI Agent 场景）

| 维度 | 原生纯 Linux（推荐） | WSL2 |
|------|---------------------|------|
| GPU/CUDA | 物理直通，零虚拟化损耗 | 经虚拟层转发，个别底层算子有兼容坑 |
| 网络/代理 | 系统代理全局生效（含 Docker） | 独立网段，配宿主机代理经常折腾 |
| 资源 | 系统仅占 1-2GB 内存，其余全给模型 | Windows 宿主吃掉数 GB |
| 文件 I/O | 全速 NVMe 原生读写 | 跨盘访问走 9P 协议，大量小文件性能骤降 |
| Agent 生态 | 所有开源 Agent 的第一公民 | 部分硬件检测/底层调用受限 |

结论：跑 DeepSeek Harness 这类 Agent 或模型部署（vLLM/Ollama），**原生 Ubuntu 明显更优**；WSL 只适合"偶尔写两行脚本不想切系统"。

### 4.7 Docker 三步安装（跑 Agent 的沙盒护甲）

```
sudo apt update && sudo apt install -y docker.io
sudo usermod -aG docker $USER && newgrp docker
sudo apt install -y nvidia-container-toolkit && sudo systemctl restart docker
```
之后跑带 GPU 的容器：
```
docker run -d --gpus all -p 8080:8080 某个Agent镜像名
```
价值：环境隔离（Python/CUDA 版本互不污染）+ 安全沙盒（Agent 在容器里执行破坏性命令也只伤容器，不伤宿主机）。

### 4.8 Agent 能自动装系统吗（Arch + opencode 的启示与边界）

网上很火的"AI Agent 全自动装 Arch"视频，拆解后逻辑是：

- **人类做物理边界**：开机、引导进入 Arch Live 终端环境（Agent 无法在关机状态替你按电源键）；
- **Agent 接管命令**：进入终端后，先手动 `pacman -S opencode` 装好 Agent 工具、填入 API Key，然后 Agent 替用户敲 fdisk/mkfs/pacstrap/grub-install 等 30~50 条命令。

**我们这套流程为什么没有 Agent 的戏份**：Ubuntu 图形安装器是一个写死逻辑的向导程序（GUI 背后就是固定的 shell 命令），全程人点鼠标即可，与 Agent 无关。但理论上进入 Live 环境后，完全可以不点图形界面，开终端让 Agent 用 debootstrap + grub-install 完成同样的安装。

**为什么双系统不建议全自动**：磁盘分区和 EFI 引导是最高风险区，Agent 一旦对硬盘编号产生幻觉（/dev/nvme0n1p1 还是 p3）或执行了全盘清除命令，Windows 和数据几秒内蒸发；且 MOK 签名、BIOS 确认等环节必须人工在场。**最佳姿势：AI 出精确命令，人做最后审核（顾问模式），而不是把格式化硬盘的生杀大权交给自主 Agent。**

---

## 5. 最终状态与速查清单

### 5.1 最终成果

- ✅ Win11 + Ubuntu 26.04 LTS 双系统，GRUB 菜单切换，开机 F7 兜底；
- ✅ Windows 数据全程零损伤（分区表只在末尾动了 8GB 临时区 + 107GB 新分区）；
- ✅ RTX 5060 官方驱动 595.84（MOK 签名完成），prime-select 三模式可用；
- ✅ 双系统时间同步根治（RTC 本地时间共识）；
- ✅ 中文输入法、Clash Verge 代理、Docker、Git 等环境就绪；
- ✅ 清理完成：8GB 临时分区已删并扩回 C 盘。

### 5.2 内核参数速查（GRUB 按 e 编辑，仅本次启动生效）

| 参数 | 作用 |
|------|------|
| `nomodeset` | 禁用显卡内核模式设置，CPU 软件渲染，绕过黑屏 |
| `nouveau.modeset=0` | 屏蔽 nouveau 开源驱动（NVIDIA 新卡必加） |
| `rd.driver.blacklist=nouveau` | 同上，另一种写法 |
| `root=live:LABEL=XXX` | 指定安装源卷标（Fedora 硬编码 CDLABEL 不匹配时改） |
| `root=live:/dev/nvme0n1p4` | 用 blkid 查出的绝对设备路径，最兜底 |

### 5.3 命令速查表

| 用途 | 命令 |
|------|------|
| 解除老版 Ubuntu 挂载锁定 | `sudo umount -l -r -f /isodevice` |
| 查看挂载点 | `lsblk` |
| 查看分区设备路径/UUID | `blkid` |
| 查看显卡与推荐驱动 | `ubuntu-drivers devices` |
| 验证 NVIDIA 驱动 | `nvidia-smi` |
| 切换显卡模式 | `sudo prime-select on-demand/nvidia/intel` |
| 双系统时间根治 | `timedatectl set-local-rtc 1 --adjust-system-clock` |
| 改主机名 | `sudo hostnamectl set-hostname 新名字` |
| 瘦身 | `sudo apt clean && sudo apt autoremove -y` |
| 装本地 deb | `cd ~/下载 && sudo apt install ./xxx.deb` |
| 装输入法（备选） | `sudo apt install -y fcitx5 fcitx5-chinese-addons` |
| Docker 三步 | 见 4.7 |

### 5.4 给后来者的避坑清单

1. **先关快速启动、查 BitLocker**，再动磁盘——否则可能根本识别不到硬盘；
2. **无 U 盘装 Fedora 系直接跳过**（Anaconda 整盘拉黑无解）；Ubuntu/Kubuntu LTS 是正解；
3. 8GB 分区必须 **FAT32**，ISO 文件要**解压到根目录**（EFI/boot 直接可见），不是拖 ISO 进去；
4. 游戏本独显：引导阶段永远选 **safe graphics**，进系统后装官方驱动 + MOK 签名；
5. **新版 Ubuntu（24.04+）不要执行 umount /isodevice 或 /cdrom**——没有 /isodevice，卸载 /cdrom 会毁掉 overlayfs 安装源（第三阶段坎 4 的血泪教训）；
6. AI 教程的**版本号和下载直链会过期**（24.04 → 26.04、404、thank-you 页面），下载前核对镜像站最新目录和文件大小；
7. 手动分区比"与 Windows 共存"更安全（已留好空闲空间时）；写入清单确认 Windows 分区全是"未更改"再点安装；
8. 装完第一件事：`timedatectl set-local-rtc 1` 根治双系统时差，否则 apt 会报 Release 过期；
9. GRUB 按 e 改的参数只对本次启动有效，每次重启都要重改；
10. 任何时候想回 Windows：开机 F7 → Windows Boot Manager，数据 100% 无损。

---

## 附录：装完系统后的扩展知识

### A1. 为什么普通消费者几乎不装 Linux

出厂预装壁垒（OEM 默认 Windows，开机即用）、专有软件生态绑定（Adobe/Office/CAD 无原生替代、内核级反作弊游戏无法运行、政企网银插件不兼容）、消费级硬件优先适配 Windows（双显卡游戏本、RGB 控制、指纹模块）、排错门槛高（Linux 报错直接掉命令行，普通用户视为"电脑坏了"）。而服务器、云原生、Android 底层、Steam Deck 这些领域 Linux 早已是绝对主力——它只是不属于"微波炉式用户"。

### A2. 自动化专业为什么值得学 Linux（个人向）

- **ROS/ROS2**：机器人导航、机械臂规划、SLAM 的唯一天然土壤，官方对 Windows 支持残缺，主流算法包默认跑 Ubuntu；
- **高端嵌入式**：ARM Cortex-A、树莓派、RK3588、NVIDIA Jetson 底层全是嵌入式 Linux；设备树、交叉编译链、GCC/CMake 是进阶必经之路；
- **机器视觉/边缘 AI**：OpenCV 硬件加速、PyTorch 训练、TensorRT 部署、CUDA 环境在 Linux 下更干净稳定；
- **硬件调试**：minicom/picocom 串口、OpenOCD/esptool 烧录、自动化脚本，摆脱重型 IDE 的臃肿。

### A3. 桌面美化生态速览（装完系统想折腾时）

- **GNOME（Ubuntu 原生）**：装 `Extension Manager` + `GNOME Tweaks`，经典插件：Blur my Shell（全局毛玻璃）、Dash to Dock（macOS 风格 Dock）、Burn My Windows（窗口酷炫动画）、Just Perfection（像素级 UI 开关）、Vitals（状态栏硬件监控）；主题站 gnome-look.org（WhiteSur 仿 Mac、Fluent 仿 Win11、Catppuccin/Nord 配色）；
- **KDE**：自由度更极致（"Linux 界的乐高"），设置里"获取新外观"直接下载全局主题/光标/开机动画，小组件（Plasmoids）随意拖放，Klassy/Kvantum 深度定制标题栏与阴影。

### A4. 挂载机制一问：之前挂载的要不要手动取消？

不需要。Linux 的挂载点是内核在**内存**中维护的映射，长按电源键断电瞬间全部清空；Windows 磁盘管理删分区改的是 GPT 分区表，当时没有 Linux 在运行，不存在残留占用。只有"运行中的 Live 系统正占着某块盘"这个瞬间才需要 umount（且新版 Ubuntu 连这个都不需要了）。
