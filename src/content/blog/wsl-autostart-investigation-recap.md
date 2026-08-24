---
title: 'WSL 开机自启排查全复盘：Win11 26200 + WSL 2.7.10 的 9P 静默唤醒'
description: '游戏本每次开机 WSL 就自动启动、vmmemWSL 常驻占内存，而同样装 WSL 的轻薄本从不自启。一台 AI 查不动换另一台：Claude Code 先翻遍注册表启动项、计划任务、服务依赖，逐个禁用 Clash/iKuuu/Radmin/微软电脑管家/Intel Arc 均无效，4688 进程审计抓不到任何 wsl.exe 调用者，中途还因 State 语义误判把 WSL 搞到 0x8000000d 假死；转给 Antigravity 后补上 9P 证据链（plan9 进程 / p9np.dll / vp9fs.dll），尝试关闭 systemd、清理 Recent、隐藏导航节点全部无效后回退；结论带回 Claude Code 交叉验证，最终锁定：Windows 资源管理器通过 9P 文件系统访问 \\wsl.localhost 静默唤醒 WSL——内建行为，无官方开关。完整时间线、排除清单、证据链、最终方案与三条备选路线全记录。'
pubDate: '2026-08-24T20:00:00+08:00'
category: '开发'
type: 'ai-organized'
---

# WSL 开机自启排查全复盘：Win11 26200 + WSL 2.7.10 的 9P 静默唤醒

> **症状**：游戏本每次 Windows 开机，WSL 的 Ubuntu 自动启动（`vmmemWSL` 进程常驻，闲置也占 700~900MB 内存）；先执行 `wsl --shutdown` 再重启电脑，开机后照样自启。
> **对比**：另一台轻薄本同样装了 WSL 且日常使用，开机从不自启。
> **排查方式**：两台 AI 接力——先 Claude Code 查了三个多小时没结果 → 导出排查摘要转给 Antigravity → Antigravity 也没招、全部回退 → 结论带回 Claude Code 交叉验证收尾。
> **结论**：Windows 资源管理器/Shell 通过 **9P 文件系统协议**（`p9np.dll` / `vp9fs.dll`）在开机时访问 `\\wsl.localhost`，静默唤醒 WSL 发行版——**WSL 内建行为，没有官方开关，无优雅解**。
> **最终方案**：接受自启（闲置约 700MB）+ 桌面「关闭WSL.bat」双击手动 `wsl --shutdown`。
> **本文定位**：按真实时间顺序记录全过程，保留每一步排查、实验、翻车与教训，以后再遇到"WSL 开机自动启动/莫名被唤醒"直接照此查。

关联笔记：[WSL2 实战手册](/blog/wsl2-practical-guide) · [C 盘大扫除](/blog/windows-dev-env-cleanup)

---

## 0. 结论速览（先看这个）

| 项目 | 结论 |
|------|------|
| 现象 | 开机后约 26 秒，`wslservice` 被 `services.exe` 按需启动，同一秒 `vmcompute → vmwp → vmmemWSL` 依次创建，发生在用户登录前 2~3 秒 |
| 真凶 | Explorer/dllhost 开机时通过 9P 客户端访问 `\\wsl.localhost\...`（Recent 历史快捷方式、资源管理器左侧栏 Linux 导航节点等）→ 9P UNC 访问静默唤醒 WSL |
| 为什么轻薄本不自启 | 轻薄本没怎么浏览过 `\\wsl.localhost`，没有 Recent 快捷方式、导航树绑定这些"9P 访问源"，开机没东西可访问 |
| 是不是版本差异 | 不完全排除（游戏本 WSL 2.7.10 vs 轻薄本 2.6.3），但主因是 9P 访问源存在与否，**降级大概率白折腾** |
| 能关掉吗 | 无官方开关；`vmIdleTimeout` 无效（9P 连接让 VM 永不空闲）；`pageReporting` 默认已开启但键名已废弃 |
| 最终方案 | 接受 + 桌面脚本手动关闭；备选：禁用 wslservice + 开关脚本（适合偶尔用的人） |

---

## 1. 起因：两台电脑，一个自启一个不自启

某天早上发现游戏本开机后 WSL 又自己跑起来了。对比同样装 WSL 的轻薄本，怎么都想不通：

| 项目 | 游戏本（出问题） | 轻薄本（正常） |
|------|-----------------|--------------|
| Windows | 11, build 26200.8655（25H2） | 未记录 |
| WSL 版本 | **2.7.10.0**（独立版 / Store 架构） | **2.6.3.0** |
| WSL 内核 | 6.18.33.2-2 | 6.6.87.2-1 |
| WSLg | 1.0.73.2 | 1.0.71 |
| 发行版 | Ubuntu 26.04, WSL2, 唯一发行版 | 有 WSL 但用得少 |
| wsl.conf | `[boot] systemd=true`，`[user] default=eryuemu`，无 boot.command | 相似 |
| .wslconfig | 仅 `memory=4GB, swap=2GB` | 相似 |

> 补充：本机 WSL 数据在 `C:\Users\eryuemu\AppData\Local\wsl\{769e2da3-38dc-4618-bb87-e984a1cd6868}\ext4.vhdx`（约 10GB）；`wslservice` 默认 **AUTO_START**（Start=2），`vmcompute` 是手动。

于是打开 WSL 里的 Claude Code，开始第一轮排查。

---

## 2. 第一回合：Claude Code 常规排查（8:10~8:55）——所有启动项全干净

### 2.1 逐一翻过的位置（全部干净）

- **注册表 Run 键**：HKCU/HKLM `...\CurrentVersion\Run`、`RunOnce`、32 位视图 `WOW6432Node`、`Explorer\StartupApproved`、`Policies\Explorer\Run`、`StartupTasks`
  - 本机实际只有：OneDrive、ColorfulLedKeyboardSet、SecurityHealth、RtkAudUService、Creative App、RadminVPN（均与 WSL 无关）
- **启动文件夹**：用户级 + 所有用户级（`shell:startup`），只有 desktop.ini
- **计划任务**：全量 CSV 检索 + 按触发器（BootTrigger/LogonTrigger）+ 按动作内容（wsl/ubuntu/bat/cmd/vbs/proxy/7890）——都没有；微软自带 `\Microsoft\Windows\Windows Subsystem for Linux\` 任务目录也不存在
- **服务**：`sc enumdepend WSLService` / `vmcompute` 均无依赖者；WSLService 无 TriggerInfo；Winlogon Userinit/Shell 正常
- **Windows Terminal**：settings.json 无 startOnUserLogin
- **Docker**：未安装
- **快速启动**：`HiberbootEnabled = 0`（已排除休眠恢复假说）
- **Hyper-V 自动启动**：`vmms.exe`（Hyper-V 管理器）根本没运行，WSL 的 VM 是 wslservice 直接驱动的轻量方式
- **.wslconfig / wslsettings**：无 autostart 配置（`autostart=true` 只是社区说法，非官方键）

### 2.2 时间线证据（三次开机完全复现）

| 时间点 | 事件 |
|--------|------|
| 8:01:49 | 开机 |
| 8:02:11 | `wslservice` 启动（服务自启，正常） |
| 8:02:13 | 用户登录（2 秒后） |
| **8:02:15** | `vmmemWSL` 被创建——**比 explorer（8:02:17）和所有登录启动项都早** |
| 8:02:26 | 登录启动项（ColorfulLedKeyboardSet）才开始跑 |

### 2.3 第一版结论：被"关机前 wsl --shutdown"实验证伪

当时给出第一版结论："不是开机启动项，是 wslservice 自动恢复了上次的会话"——建议关机前 `wsl --shutdown`。

**用户实测反驳：shutdown 后再重启依然自启。** 第二次验证（8:27:57 开机 → 8:28:24 wslservice → 8:28:28 vmmemWSL，+4 秒）依旧复现 → **"会话恢复"假说排除**。

### 2.4 版本对比：2.7.10 vs 2.6.3

让用户去轻薄本查版本：**WSL 2.6.3.0**。两台机器配置几乎相同但行为不同，当时高度怀疑是 2.7.x 引入的版本行为。翻遍 2.7.0 release notes 没有明说，但现场实验就是证据——版本差异成了第一嫌疑。

> 后来证明：**版本不是主因**（见第 5 节），但这个对比给了后续排查方向。

---

## 3. 第二回合：Claude Code 换打法（8:55~10:08）——从"找启动项"转向"找调用者"

### 3.1 把 wslservice 改成 demand 重启 → 无效

按微软官方建议把服务改成手动：

```powershell
sc.exe config wslservice start= demand   # 注意是 sc.exe，PowerShell 里 sc 是 Set-Content 别名
```

重启后**依然自启**！这就矛盾了：demand 服务开机时根本不会启动，除非**有进程主动调用它**。→ 结论转向：**开机时存在某个"调用者"**，之前的"wslservice 自启后主动拉发行版"判断是错的。

### 3.2 全量服务排查：发现三个网络类嫌疑

列出所有非系统运行中服务，发现开机自启的网络工具：

1. `clash_verge_service`（Clash Verge 代理）
2. `iKuuuVPNHelperService`（机场客户端）
3. `RvControlSvc`（Radmin VPN）

Clash 类客户端常有"为 WSL 设置代理""启动时检测 WSL"的逻辑——嫌疑很大。

### 3.3 排除实验一：禁用三服务重启 → 无效

```powershell
sc.exe config clash_verge_service start= disabled
sc.exe config iKuuuVPNHelperService start= disabled
sc.exe config RvControlSvc start= disabled
```

重启后 `tasklist | findstr /i vmmem` **依然有 vmmemWSL** → 凶手不在它们。

> 顺带验证过：iKuuu 日志里的 "wsl" 只是脱敏 token 随机子串；git 代理配置（172.29.80.1:7892）与开机自启无关。

### 3.4 4688 进程创建审计：抓"一次性进程"

普通进程列表看不到"启动后马上退出"的进程，改用进程创建审计抓全量（中文系统子类别名要用 GUID）：

```powershell
auditpol /set /subcategory:"{0CCE922B-69AE-11D9-BED3-505054503030}" /success:enable
```

重启后导出 1578 条记录分析，关键结论：

- 多次开机复现：wslservice 被 **services.exe** 按需启动（demand 被启动 = 有人调用了 `StartService`）
- 同一秒 vmcompute → vmwp → vmmemWSL 依次创建
- **全程没有任何进程创建 wsl.exe** → 调用者走纯 WSL API（COM/RPC），4688 审计看不到调用者身份
- 与 wslservice **同秒**的 AppModel 激活事件（210/211）确认是 Intel Arc 和 PC Manager 两个 Appx 包

### 3.5 排除实验二：禁用 PC Manager / Intel Arc → 无效

排查发现 Appx 打包服务（`WIN32_PACKAGED_PROCESS`）的坑：它们声明在 `AppxManifest.xml` 里 `StartupType="auto"`，SCM 注册名带空格（如 "PCManager Service Store"），用进程名 `sc` 查会报"服务未安装"。

```powershell
sc.exe config "PCManager Service Store" start= disabled   # 成功
sc.exe config IntelGraphicsSoftwareService start= disabled  # 拒绝访问（权限）
```

重启后**依然有 vmmemWSL** → PC Manager 排除。Intel 服务禁不掉，改在线实验：先 `wsl --shutdown` + 停掉 wslservice/vmcompute，再重启 Intel 服务等 15 秒——**没有触发 WSL**（wslservice 保持 STOPPED）→ Intel 也排除。PC Manager 恢复后手动启动同样不触发。

**到这一步：所有第三方软件全部排除干净。**

### 3.6 翻车插曲：State 残留假说 → 0x8000000d 假死

还剩最后一个系统层假说：wslservice 关闭时没把注册表 `State` 清回 0，开机看到 State=1（"以为发行版在运行"）就自动恢复。

当时检查：WSL 完全停止后 `State` 确实还是 1。于是让用户手动把 State 改成 0 验证——**结果 WSL 直接报 `Wsl/Service/CreateInstance/0x8000000d`（正在进行此分发的安装、卸载或转换），看起来像"WSL 没了"！**

教训（重要）：

- **`State` 的语义是反直觉的**：`State=1` 是"就绪"的正常值；`State=0` 是"安装/转换/卸载中间态"（异常值）
- 把 State 改 0 会让 WSL 拒绝启动；改回 1 立即恢复
- 数据一直安全（在 ext4.vhdx 里），但虚惊一场

### 3.7 阶段性结论

Claude Code 查了三小时：**所有能查的都查完了**——注册表启动项、计划任务、服务依赖与触发器、第三方服务（Clash/iKuuu/Radmin/PC Manager/Intel）、Hyper-V、快速启动、State 全部排除。剩下触发者高度指向 Windows 系统组件，但没法定位。于是用户决定：**把问题打包，换个 AI 看看**。

---

## 4. 转场：问题发给 Antigravity（10:16~10:56）——先救活 WSL，再补上 9P 证据链

### 4.1 接手第一件事：修好 0x8000000d

用户打开 Antigravity（Gemini 系）第一句："首先 我wsl怎么没了 咋回事你看看"。Antigravity 检查发现 `State` 卡在 0（中间态，疑似此前某次操作中断导致），**重置为 1 后 Ubuntu 及全部数据恢复正常**——顺手把 Claude 惹的祸救了回来。

### 4.2 拿到 Claude 的排查摘要，第一波猜测：systemd 常驻

用户把 Claude 的排查摘要（`wsl_autostart_summary.txt`）贴给 Antigravity。Antigravity 的第一波诊断聚焦在 Ubuntu 内部：

- **触发链条**：Windows 登录 → Shell 组件探测 WSL → wslservice 按需拉起 → Ubuntu 启动
- **为什么赖着不关**：开了 `systemd=true`，systemd 拉起 journald/dbus 等几十个后台守护进程 → WSL 认为有任务 → 永远不休眠 → vmmemWSL 常驻

于是执行方案 B：关 systemd + 关 WSLg：

```bash
wsl -u root -e bash -c "sed -i 's/systemd=true/systemd=false/' /etc/wsl.conf"
```

```powershell
Set-Content -Path "$env:USERPROFILE\.wslconfig" -Value "[wsl2]`nmemory=4GB`nswap=2GB`nguiApplications=false"
wsl --shutdown
```

用户重启后反馈：**"不行 依旧有"** → 关 systemd 无效。

> 顺带解答了用户的疑问：为什么 Claude 查几小时没出来？因为它掉进"找谁是凶手"的死胡同（排除法），而 Antigravity 的认知破局点是"**问题本质不是被谁唤醒，而是为什么赖着不关**"——但后来证明这也不是根因。

### 4.3 第二波：9P 证据链（决定性发现）

重启后 Antigravity 实时抓现场，三个证据拼出真相：

1. **Ubuntu 内部只有 `plan9` 进程在跑**：`ps aux` 显示唯一进程是 `plan9`（9P 协议文件系统共享服务）——说明是 Windows 侧有组件在通过 UNC/COM 访问 Linux 文件系统。
2. **Windows 侧模块加载**：`explorer.exe` 加载了 `p9np.dll`（Plan 9 Network Provider），`dllhost.exe`（CLSID `{DFB65C4C-...}` Plan9FileSystem）加载了 `vp9fs.dll`——资源管理器开机时确实在做 9P 访问。
3. **访问源存在**：
   - `C:\Users\eryuemu\AppData\Roaming\Microsoft\Windows\Recent` 里有 **15 个指向 `\\wsl.localhost\Ubuntu\home\eryuemu\...` 的快捷方式**（Claude Code、VS Code 打开过的项目文件、jsonl 日志等）
   - 注册表 `HKLM\SOFTWARE\Classes\CLSID\{B2B4A4D1-2754-4140-A2EB-9A76D9D7CDC6}`（资源管理器左侧栏 "Linux" 节点）默认 `System.IsPinnedToNameSpaceTree = 1`——开机强制固定到导航树

### 4.4 尝试的方案：全部无效后回退

| 尝试 | 操作 | 结果 |
|------|------|------|
| 关 systemd | `/etc/wsl.conf` → `systemd=false` | 无效 |
| 关 WSLg | `.wslconfig` → `guiApplications=false` | 无效 |
| 清 Recent + 关最近文件追踪 | 删 15 个快捷方式；`ShowRecent=0`、`ShowFrequent=0`、`Start_TrackDocs=0` | 无效，且**误伤 Win+R 历史**（见 6.4） |
| 隐藏 Linux 导航节点 | HKCU 覆盖 `System.IsPinnedToNameSpaceTree=0` | 无效 |
| 加超时自动关 VM | `.wslconfig` → `vmIdleTimeout=5000` | 无效 |

Antigravity 尝试了所有方案都没效果后,用户也妥协了:**"这个算是修不好了 估计问题都不在这 就这样吧 我妥协了"**。于是按用户要求,Antigravity 把全部改动 **100% 回退**（systemd=true、.wslconfig 恢复 memory/swap、ShowRecent 恢复、导航图标恢复），并整理了一份 `wsl_investigation_summary.txt` 给用户带走。

---

## 5. 收束：结论带回 Claude Code（10:24 起）——9P 机制最终确认，结案

### 5.1 交叉验证：两家 AI 的证据是同一件事的两面

用户把 Antigravity 的摘要贴回 Claude Code。两边证据一对：

| Claude Code 查到的 | Antigravity 查到的 |
|-------------------|-------------------|
| 无 wsl.exe 进程、服务被按需拉起、调用者不可见 | Explorer/dllhost 加载 9P 客户端（vp9fs.dll / p9np.dll） |
| 4688 审计看不到任何进程创建 wsl.exe | Ubuntu 内部只有 plan9 进程在跑 |
| 所有启动项/服务/计划任务全排除 | Recent 里 15 个 `\\wsl.localhost` 快捷方式 + 导航树 Linux 节点 |

**完全对上**：那个"隐形调用者"就是 **9P 文件系统集成**——资源管理器开机访问 `\\wsl.localhost\...`（Recent 历史、导航树、快速访问里的 wsl 路径）→ 9P UNC 访问自动唤醒 WSL 发行版（没有 wsl.exe 进程，纯文件系统层行为）。

### 5.2 完整机制（真相还原）

```
Windows 开机 → 资源管理器启动
  → 为了显示"最近使用的文件"列表、提取图标、渲染左侧栏 Linux 节点
  → 通过 9P 客户端（p9np.dll / vp9fs.dll）访问 \\wsl.localhost\...
  → 9P UNC 访问自动唤醒 WSL 发行版（无 wsl.exe 进程，纯文件系统集成）
  → wslservice 被按需拉起 → vmcompute → vmwp → vmmemWSL
```

- 这不是启动项、不是服务、不是计划任务——**是文件系统集成**，所以：
  - 禁服务没用（不经过服务启动项）
  - 4688 审计看不到（没有进程创建）
  - 清 Recent / 关导航树图标也没用（Explorer 仍会访问）

### 5.3 为什么轻薄本不自启

**因为轻薄本没有"9P 访问源"**：它没怎么浏览过 `\\wsl.localhost`，Recent 里没有 WSL 文件的历史快捷方式，导航树也没有可访问的内容——开机没东西可访问，自然不会唤醒 WSL。游戏本天天用 Claude Code/VS Code 打开 WSL 文件，访问源是现成的。

### 5.4 结案 + 清理复原

- 更新记忆备忘结案：**WSL 内建行为，无官方开关，只能接受**
- 清理实验残留：删掉 boot_procs / wsl_window / intel_test 的脚本和记录
- 两个排查摘要 txt 归置到 `~/wsl-issue-notes/`
- 复原设置时发现两处漏网：**wslservice 还是 demand**（实验改的没还原）、**进程创建审计还开着**——补跑：

```powershell
sc.exe config wslservice start= auto
auditpol /set /subcategory:"{0CCE922B-69AE-11D9-BED3-505054503030}" /success:disable
```

- 核查发现 Antigravity 声称"100% 回退"其实漏了两处（见 6.4 的 Start_TrackProgs 和 RunMRU）→ **AI 说"全回退/全修复"要核查，别全信**

---

## 6. 最后一条路：妥协但压内存（11:00~11:47）——路线 3 落地

### 6.1 三条备选路线

1. **彻底禁用 wslservice + 一键脚本**（适合偶尔用 WSL 的人）：开机 100% 不自启（9P 触发直接失败），代价是每次用 WSL 多一步，忘了跑会报 `0x80070422`
2. **降级 WSL 到 2.6.3（轻薄本同款）**：数据很好迁移（`wsl --export` 或直接复制 ext4.vhdx），但**不推荐**——轻薄本不自启大概率只是因为没有 9P 访问源，降级未必有效，还可能损失 2.7 的修复
3. **妥协限内存**（最终采用）：接受自启 + 压内存 + 桌面脚本手动关

推荐排序：**3 > 1 > 2**。用户选了 3。

### 6.2 路线 3 第一轮：pageReporting + vmIdleTimeout=60s → 开机报错

```ini
[wsl2]
memory=4GB
swap=2GB
pageReporting=true
vmIdleTimeout=60000
```

重启后**开机弹出 WSL 启动报错**（vmIdleTimeout 太激进，与开机唤醒流程打架：VM 起来 1 分钟内没终端会话就被判定空闲关掉，Explorer 的 9P 访问失败）。改成 4 分钟（`vmIdleTimeout=240000`）后报错消失。

### 6.3 pageReporting 报"未知键"警告（WSL 已知 bug）

开 WSL 第一行报 `wsl: wsl2.pageReporting:...中的键"4"未知`。查证是 **WSL 已知问题（GitHub microsoft/WSL#9899）**：`pageReporting` 键在 WSL 1.1.7 起被移除，官方文档没更新。**默认值本来就是 true，不写也生效**——删掉该行，零损失。

### 6.4 顺手修了 Win+R 历史丢失（Antigravity 误伤）

用户发现 Win+R 输入过的命令不记录、下拉框无历史。排查发现：

- `RunMRU` 键被清空（旧历史永久丢失，不可恢复）
- 元凶是 `HKCU\...\Explorer\Advanced\Start_TrackProgs = 0`——Antigravity 处理"最近文件追踪"时把它顺手关了。**"最近文件追踪"实际是两个开关**：`Start_TrackDocs`（文件历史，它回退了）和 `Start_TrackProgs`（程序历史/Win+R 历史，它漏了）

```powershell
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v Start_TrackProgs /t REG_DWORD /d 1 /f
```

修复后 RunMRU 重新开始记录。

### 6.5 最终验证：无报错、900→700MB、vmIdleTimeout 无效 → 移除

用户重启实测：

- ✅ 开机无报错（4 分钟版不冲突）
- ✅ 闲置内存 900MB → 700MB（默认内存归还生效）
- ❌ **vmIdleTimeout 不触发自动关闭**——Explorer 的 9P 连接让 VM 永远算"活跃"，永不进入空闲

→ 移除 vmIdleTimeout，`.wslconfig` 回到原始最简配置。

### 6.6 桌面脚本定稿：关闭WSL.bat

```bat
@echo off
title WSL Shutdown
wsl --shutdown
echo.
echo WSL has been shut down. Memory released.
timeout /t 2 >nul
```

> 细节：`wsl --shutdown` 不需要管理员权限，双击直接生效不弹 UAC；脚本内容用英文（中文在 .bat 里会因 GBK 编码乱码）；曾试过无窗口静默版（VBS），因"没有反馈"改回带提示的版本。

---

## 7. 最终方案与日常使用流程

1. **开机** → WSL 自启（闲置约 700MB，可接受）
2. **想省内存** → 双击桌面「关闭WSL.bat」→ WSL 关闭，内存归零
3. **要用 WSL/Claude Code** → 打开终端，自动起来，一切照旧

当前系统状态：`.wslconfig` = `memory=4GB, swap=2GB`（原始）；`wsl.conf` = `systemd=true`（原始）；所有服务 auto；注册表/Explorer 设置恢复默认。

---

## 8. 踩坑与教训汇总

- **`State` 语义反直觉**：`State=1` 是"就绪"正常值，`State=0` 是"安装/转换/卸载中间态"——改 0 会让 WSL 报 `0x8000000d` 拒绝启动
- **PowerShell 里 `sc` 是 `Set-Content` 的别名**，改服务要用 `sc.exe`（或 `Set-Service -StartupType Manual`）
- **中文系统 auditpol 子类别名要用 GUID**（`{0CCE922B-69AE-11D9-BED3-505054503030}` = 进程创建）
- **Windows PowerShell 5.1 按 GBK 读脚本**，Linux 侧写的中文 .ps1 会乱码崩溃——脚本用纯英文
- **Appx 打包服务**（PC Manager / Intel Arc）的 SCM 注册名带空格、用 manifest 里的真名才能查
- **"最近文件追踪"是两个开关**：`Start_TrackDocs`（文件历史）+ `Start_TrackProgs`（程序历史），关的时候容易误伤 Win+R
- **`pageReporting` 键已废弃**（GitHub #9899），写了报"未知键"警告，默认 true 不写也生效
- **AI 说"已全部回退/修复"要核查**：交叉验证两家 AI 的结论，发现一方声称"100% 回退"实则漏了 Start_TrackProgs
- **排查顺序建议**：先"常规启动项"再"服务排除"再"审计定位"，每家 AI 查一半就换人，信息断裂（这次靠摘要文件接力才拼完整）

---

## 9. 命令速查（以后复用）

```powershell
# 查看 WSL 版本与状态
wsl --version
wsl -l -v
wsl --status

# 立即关闭 WSL（释放内存）
wsl --shutdown

# 查看 wslservice 启动类型（2=自动 3=手动 4=禁用）
sc.exe qc wslservice

# 备份/还原发行版
wsl --export Ubuntu D:\ubuntu_backup.tar
wsl --import Ubuntu <安装路径> D:\ubuntu_backup.tar

# 查看发行版注册表状态（State=1 正常，0=中间态异常）
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss" /s

# 查看谁依赖 WSL 服务
sc.exe enumdepend WSLService

# 进程创建审计（定位"隐形调用者"）
auditpol /set /subcategory:"{0CCE922B-69AE-11D9-BED3-505054503030}" /success:enable
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688; StartTime=(Get-Date).AddHours(-2)} | % { $e=[xml]$_.ToXml(); $d=$e.Event.EventData.Data; [PSCustomObject]@{T=$_.TimeCreated.ToString('HH:mm:ss'); N=($d|?{$_.Name -eq 'NewProcessName'}).InnerText; P=($d|?{$_.Name -eq 'ParentProcessName'}).InnerText} } | Sort T | Out-File C:\Users\eryuemu\boot_procs.txt -Encoding utf8

# 恢复/关闭审计
auditpol /set /subcategory:"{0CCE922B-69AE-11D9-BED3-505054503030}" /success:disable

# 修复 Win+R 历史（Start_TrackProgs 被误关时）
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v Start_TrackProgs /t REG_DWORD /d 1 /f

# 9P 相关组件（都是正常的系统组件，别删）
# P9NP（网络提供程序）、P9Rdr/P9RdrService（Plan 9 Redirector）、vp9fs.dll、p9np.dll
# 排查访问源：
dir C:\Users\eryuemu\AppData\Roaming\Microsoft\Windows\Recent\ | findstr wsl
reg query "HKLM\SOFTWARE\Classes\CLSID\{B2B4A4D1-2754-4140-A2EB-9A76D9D7CDC6}" /v System.IsPinnedToNameSpaceTree
```

---

## 10. 一句话总结

> **WSL 开机自启 = Windows Shell 开机时通过 9P 访问 `\\wsl.localhost` 把 WSL 唤醒了。这是 WSL 的内建行为，没有官方开关；只要你的 Windows 侧存在"最近打开过 WSL 文件"之类的访问源，它就一定会被唤醒。能做的只有：接受它（反正天天用），或者用脚本手动关。**
