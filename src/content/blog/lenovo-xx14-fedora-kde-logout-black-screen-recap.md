---
title: '联想小新 14 装 Fedora 44 KDE 双系统全记录（下）：一次注销引发的血案'
description: 'Fedora 44 KDE 新装系统安装中文输入法后第一次点注销即卡死，强制断电后开机黑屏白光标、TTY 切不出、键盘假死但 CapsLk 灯能亮灭。全程还原从玄学到科学的排查：FnLock 陷阱、CapsLk 判断法、发现真正的登录管理器是 plasmalogin（plasmalogin-helper exited with 64）、GRUB 加 3 进纯文本、startplasma-wayland 秒退、换装 SDDM 连环坑（sddm-wayland-plasma、01-breeze-fedora 主题缺失）、群友 pam_environment 建议全是背锅侠，直到停止试错改为只读取证：journalctl -b -1 抓上一轮启动日志，coredumpctl list 发现 kwin_wayland/plasmashell/kded6/plasma-login-greeter 全家 SIGABRT，直接运行 kwin_wayland --version 让动态链接器报出 undefined symbol: _ZN12ScreenLocker...——根因是装输入法的 305 包大事务把 kwin 连带升级到 6.7.4，而无版本号裸依赖的 kscreenlocker 停在 6.6.4，ABI 脱节。修复只需一条 dnf upgrade 对齐版本，再加 1730 包全量更新收尾。次日复盘推翻 Gemini 两个结论：sddm 并非出厂默认（已还原 plasmalogin）、本机根本没有后台自动更新。全程实拍配图。'
pubDate: '2026-09-06T16:10:00+08:00'
category: '开发'
type: 'ai-organized'
heroImage: '../../assets/xx14-black-28-kwin-symbol-lookup-error.jpg'
---

# 联想小新 14 装 Fedora 44 KDE 双系统全记录（下）：一次注销引发的血案

> **症状**：Fedora 44 KDE 新装系统，安装中文输入法后第一次点击注销，进度卡死 → 强制断电后开机卡在 Fedora logo/黑屏白光标 → `Ctrl+Alt+F3` 切不出 TTY，键盘输入完全失效，但 CapsLk 灯能亮灭。
> **对比**：刚装完系统第一次开机可正常进桌面，仅"注销"这一动作触发崩溃。
> **排查方式**：Gemini 全程指导，前半程反复重启服务试错（约十几次强制断电），后半程改为纯文本模式只读取证。
> **根因**：kwin 已被事务连带升级至 6.7.4，其依赖的锁屏库 kscreenlocker 仍为 6.6.4——kwin 对 kscreenlocker 为**无版本号裸依赖**，ABI 不匹配，动态链接器报 `undefined symbol`，所有图形核心进程启动即 SIGABRT。
> **修复**：`dnf upgrade` 对齐两者至 6.7.4 + 全系统 1730 包全量更新。
> **最终状态**：系统还原为出厂默认（plasmalogin 登录管理器，排查期安装的 sddm 六包全部卸载），输入法 fcitx5 正常自启。

关联阅读：[上篇：安装篇](/blog/lenovo-xx14-fedora-kde-dual-boot-install-recap)

---

## 0. 结论速览（先看这个）

| 项目 | 结论 |
|---|---|
| 崩溃表现 | kwin_wayland / plasmashell / kded6 / plasma-login-greeter 启动即 SIGABRT，屏幕黑屏白光标 |
| 直接报错 | `kwin_wayland: symbol lookup error: /lib64/libkwin.so.6: undefined symbol: _ZN12ScreenLocker...` |
| 根因 | kwin 6.7.4 与 kscreenlocker 6.6.4 版本脱节；kwin → kscreenlocker 是无版本号裸依赖，事务升级时未同步 |
| 版本脱节来源 | 安装输入法时的大事务（一次性 305 包）连带升级 kwin；非后台自动更新（本机未装 PackageKit/dnf-automatic） |
| 为什么第一次注销才炸 | 旧桌面进程驻留内存正常运行；注销 = 结束内存进程 + 从硬盘重新拉起登录界面，读到新 kwin + 旧 kscreenlocker 组合即崩 |
| 为什么键盘全失灵 | 显示管理器启动时先独占 DRM/KMS 显示输出与 evdev 输入设备，渲染进程随后崩溃，控制权未归还 |
| 修复命令 | `sudo dnf upgrade --refresh -y kwin kscreenlocker plasma-workspace` → 验证 `kwin_wayland --version` |
| 排查关键转折 | 放弃重启试错，GRUB 加 `3` 进纯文本 + `coredumpctl list` + 直接运行二进制让动态链接器报真错 |
| 次日修正 | Gemini 两个结论被推翻：sddm 并非出厂默认（出厂为 plasmalogin，已还原）；不存在后台自动更新 |

## 1. 起因：装完输入法，第一次点注销

承接上篇：系统装完、基础配置完成，进入输入法安装。Fedora KDE 无预装中文输入法，KDE Plasma 下集成度最好的方案是 Fcitx5，标准三步：

```bash
sudo dnf install -y fcitx5 fcitx5-chinese-addons fcitx5-gtk fcitx5-qt kcm-fcitx5
```

系统设置 → Keyboard → Virtual Keyboard → 选中 Fcitx 5 → Apply；Input Method 页确认含 Pinyin；**注销重新登录生效**。

![在 Trae 里让 AI 安装中文输入法（fcitx5 拼音/五笔、ibus、Rime）——一切从这个普通请求开始](../../assets/xx14-black-14-trae-install-fcitx5.jpg)
*图 1：装输入法的请求本身平平无奇（23:31）*

事后看，这一步的安装事务就是伏笔：它一次性拉起 305 个包（输入法框架 + GTK/Qt 桥接 + 大量连带依赖），kwin 在其中被连带升级到 6.7.4，而 kscreenlocker 停在 6.6.4。注销是这套残缺组合第一次被从硬盘完整加载的时刻。

## 2. 第一回合：注销卡死与常规三板斧

注销进度卡住。按轻中重处置：

1. 按 Esc 看是否出现 `A stop job is running for... (XXs / 1min 30s)` 的等待超时；
2. `Ctrl + Alt + F3` 切 TTY —— 失败；
3. 长按电源键 8~10 秒强制断电。

重启后**开机卡在 Fedora logo 动画**，黑屏。图形登录器在拉起 Wayland 会话时受阻，内核与底层服务实际已启动。进入长达数小时的排查。

![开机卡在 Fedora logo 动画——此后每次开机都复现](../../assets/xx14-black-15-stuck-fedora-logo.jpg)
*图 2：开机卡 logo，图形登录器拉起 Wayland 会话受阻（23:39）*

## 3. 第二回合：TTY 恢复尝试与两个关键现象

### 3.1 FnLock 陷阱：组合键按了没反应的第一个原因

小新 14 的 Esc 键带 FnLock 指示灯。灯灭 = F1~F12 默认为多媒体键，按 `Ctrl + Alt + F3` 实际发出的是 `Ctrl + Alt + 音量减`。

正确姿势：

- `Fn + Ctrl + Alt + F3`；或
- 先按 `Fn + Esc` 点亮 FnLock（切为标准 F 键模式）再按组合键。

### 3.2 CapsLk 判断法：内核是死是活

按 CapsLk 看指示灯：**能正常亮灭 → 内核活着，输入被拦截；完全不亮 → 显卡驱动/内核死锁，只能断电**。后续排查中该判断法反复使用，多数时候灯能亮灭——系统没死，但按键被吞。

### 3.3 找到真正的显示管理器：plasmalogin

`Fn + Ctrl + Alt + F3` 进入 TTY 后看到久违的文本登录界面：

![纯文本模式下的 TTY 登录界面：fedora-xx14 login:](../../assets/xx14-black-16-tty-login.jpg)
*图 3：TTY 文本登录界面——键盘在这里 100% 正常（23:40）*

登录后依次尝试：

```bash
sudo systemctl restart sddm            # 报错：找不到该单元
sudo systemctl restart display-manager
```

![sudo systemctl restart sddm 报红字：Unit sddm.service not found](../../assets/xx14-black-17-sddm-not-found.jpg)
*图 4：sddm.service 不存在——这套系统的登录管理器另有其人（23:43）*

日志显示 Fedora 44 新版 KDE 的登录管理器是 **plasmalogin**（非 sddm），关键报错：

```
plasmalogin-helper exited with 64
```

![systemctl status display-manager：plasmalogin.service，日志尾部 plasmalogin-helper exited with 64](../../assets/xx14-black-18-plasmalogin-exited-64.jpg)
*图 5：真身是 plasmalogin.service，日志尾部 exited with 64（23:51）*

图形登录组件拉起 Wayland 画面时异常退出，开机动画（Plymouth）同时占住屏幕，两头堵死。对应处置：

```bash
sudo plymouth quit                  # 杀开机动画，释放显卡通道
sudo systemctl restart plasmalogin  # 重启正确服务
sudo chvt 1                         # 手动切回图形通道
```

执行 `restart plasmalogin` 之后诡异的事情来了：命令行"卡住"了，`Ctrl + Alt + F1/F2` 也没反应，但 **CapsLk 灯还能亮灭**——内核活着，键盘输入却被吃了。原因：plasmalogin 启动时向内核**独占接管了 DRM/KMS 显示输出和 evdev 输入设备**，随后它的 Wayland 组件崩溃（exited with 64），它死在半空中，控制权没归还。表现就是"整机假死"。

### 3.4 键盘假死的原理

上述现象此后反复出现：显示管理器先抢键盘再崩溃，输入信号无人接管。这不是死机，是被劫持后的空窗。

## 4. 第三回合：纯文本模式 + 手动拉起桌面

### 4.1 GRUB 加 3 进文本模式

为绕开图形登录器抢键盘，重启时 GRUB 菜单按 `e`，`linux` 行尾加一个数字 `3`，`Ctrl + X` 引导——跳过一切图形登录器，直接停在 TTY，键盘 100% 正常。

![GRUB 编辑 linux 行，行尾已加上数字 3](../../assets/xx14-black-19-grub-add-3.jpg)
*图 6：GRUB 按 e 编辑启动参数，行尾加 3 进入纯文本模式（23:59）*

同期实验：删除行尾 `rhgb quiet` 看滚屏日志、加 `plymouth.enable=0` 禁用开机动画。

### 4.2 startplasma-wayland 秒退

TTY 中直接执行 `startplasma-wayland` → `Shutting down... Done.` 秒退。原因：Plasma 6 深度依赖 D-Bus 会话总线，裸敲检测不到会话环境。换：

```bash
dbus-run-session startplasma-wayland
```

![startplasma-wayland 秒退：Shutting down... Done.](../../assets/xx14-black-20-startplasma-wayland-exit.jpg)
*图 7：裸敲 startplasma-wayland 秒退——缺 D-Bus 会话总线（00:02）*

日志刷屏占住前台（xdg-desktop-portal 一路 CRITICAL/WARNING），`Ctrl + C` 退出。此时 Gemini 给出一条后来成为翻盘关键的建议：直接验证组件本身——`kwin_wayland --version`，看输出版本号还是缺库报错。

![dbus-run-session 拉起桌面失败：xdg-desktop-portal 报错刷屏占满整屏](../../assets/xx14-black-21-portal-error-spam.jpg)
*图 8：手动拉桌面时 xdg-desktop-portal 报错刷屏（00:05）*

## 5. 第四回合：换装 SDDM 与连环排除

Gemini 判断 plasmalogin 过新存在冷启动时序 Bug，方案为替换为成熟的 SDDM。此路线经历一连串补充修复，全部无效但留下重要排除项：

```bash
sudo dnf install -y sddm
sudo systemctl disable plasmalogin && sudo systemctl enable --now sddm
# 重启仍卡 → Fedora 44 已移除 X11 通道，缺 Wayland 配套：
sudo dnf install -y sddm sddm-kcm sddm-wayland-plasma
sudo systemctl enable --force sddm.service   # --force 强制接管 display-manager 软链接
```

![补装 sddm-wayland-plasma 0.6.7.4-1.fc44 后执行 systemctl restart display-manager](../../assets/xx14-black-24-dnf-sddm-wayland-plasma.jpg)
*图 9：补齐 SDDM 的 Wayland 配套组件（00:15）*

期间把问题发到了群里，群友"天之川沙夜"给出 Linux 圈的高频经验建议：

![群里天之川沙夜建议：rm -f ~/.pam_environment 看看呢](../../assets/xx14-black-22-group-chat-pam-env.jpg)
*图 10：群友建议删除 ~/.pam_environment——90% 的登录闪退都是输入法环境变量写错位置（00:18）*

顺手完成的一组排除（均非根因，但属于标准清理项）：

| 排除项 | 操作 | 结果 |
|---|---|---|
| pam_environment | `rm -f ~/.pam_environment` | 文件本就不存在——本机从未配置过输入法环境变量，经验主义背锅侠 |
| Plasma 缓存 | `rm -rf ~/.cache/plasma*` | 无效，缓存会自动重建；首跑 `rm -f` 还报了 `Is a directory` |
| /etc/environment | `cat /etc/environment` | 空文件（冷知识：PAM 读取该文件不支持 `export` 关键字，写入会导致登录崩溃，是 Fcitx5 配置的高频雷区） |

![TTY 里执行 rm -f ~/.pam_environment 与 rm -f ~/.cache/plasma*（后者报 Is a directory）](../../assets/xx14-black-23-rm-pam-env-executed.jpg)
*图 11：按群友建议清理环境变量文件与桌面缓存（00:23）*

SDDM 路线最大的干扰项藏在日志里：

![journalctl 显示多个 Boot 会话反复出现 01-breeze-fedora 主题缺失，greeter 同秒 open/close](../../assets/xx14-black-25-sddm-theme-missing.jpg)
*图 12：反复出现 "The configured theme '01-breeze-fedora' doesn't exist"，sddm-greeter 同秒开关（13:00）*

```
The configured theme "01-breeze-fedora" doesn't exist, using the embedded theme instead
pam_unix(sddm-greeter:session): session opened
pam_unix(sddm-greeter:session): session closed
```

主题补齐后依然崩——这是个真实存在的伴生小 bug（`dnf install -y sddm-breeze` 修复），但不是桌面完全无法启动的根本死因。GDM 兜底方案（`dnf install -y gdm`）尚未走完即迎来转折。

## 6. 转折点：停止试错，只读取证

多轮盲目重启后改为**不再启动任何图形界面**，固定在纯文本取证：

```bash
sudo systemctl set-default multi-user.target   # 开机默认固定为文本模式，杜绝反复被图形抢占

journalctl -b -1 -u sddm -n 40 --no-pager      # 上一次开机周期的 sddm 日志
journalctl -b -1 -p 3 --no-pager               # 上一次开机所有 Error 级事件
coredumpctl list                               # 核心转储列表
```

![journalctl -b -1 -u sddm：13:04:41 同一秒内 sddm-greeter session opened 又 closed](../../assets/xx14-black-26-journalctl-prev-boot.jpg)
*图 13：读上一轮开机周期的日志——greeter 刚打开就关闭（13:09）*

两个决定性证据：

**证据一：coredumpctl list 显示全家崩溃。**

![coredumpctl list：23:38 起 plasma-login-greeter/wallpaper 反复 SIGABRT，00:12 起 kwin_wayland、plasmashell、kded6、kscreenlocker_greet 等全部 SIGABRT](../../assets/xx14-black-27-coredumpctl-sigabrt.jpg)
*图 14：核心转储列表——从 plasma-login-greeter 到 kwin_wayland 全家 SIGABRT（13:11）*

```
kwin_wayland           SIGABRT
plasmashell            SIGABRT
kded6                  SIGABRT
plasma-login-greeter   SIGABRT
```

所有 KDE 核心组件一致 SIGABRT（程序主动中止，典型于 qFatal / 缺失动态库 / Qt 平台插件加载失败）。显卡、配置文件、单一服务故障全部排除——指向公共依赖层。

**证据二：脱离服务包装直接运行二进制。**

```bash
kwin_wayland --version
```

![kwin_wayland --version 报出致命证据：symbol lookup error，undefined symbol: _ZN12ScreenLocker7KSldApp14inhibitSuspendEv](../../assets/xx14-black-28-kwin-symbol-lookup-error.jpg)
*图 15：动态链接器亲口报出缺失符号——锁屏库版本脱节实锤（13:15）*

```
kwin_wayland: symbol lookup error: /lib64/libkwin.so.6:
undefined symbol: _ZN12ScreenLocker7KSldApp14inhibitSuspendEv
```

`_ZN12ScreenLocker...` 为 C++ 名字修饰（mangled name），即 ScreenLocker 相关接口——kwin 6.7.4 需要调用新版 kscreenlocker 中的函数，旧库中不存在。

## 7. 根因与修复

### 7.1 根因链

```
安装输入法 → 大事务一次性 305 包 → kwin 被连带升级至 6.7.4
→ kwin 对 kscreenlocker 为无版本号裸依赖 → kscreenlocker 停留 6.6.4
→ 6.7.4 kwin 启动调用新版锁屏接口 → 旧库无此符号 → undefined symbol
→ 全部图形核心进程 SIGABRT → 登录器/锁屏无法渲染 → 黑屏死锁
```

关键设计缺陷：kwin 与 kscreenlocker 是强 ABI 耦合组件，但依赖声明不带版本约束，包管理器不保证两者同步升级。叠加 Fedora 44 为开发分支、仓库组件逐包推送的时间窗口，构成完整的翻车条件。

### 7.2 修复三步

```bash
# 1. 对齐核心组件
sudo dnf upgrade --refresh -y kwin kscreenlocker plasma-workspace

# 2. 验证（关键检验点）
kwin_wayland --version
# 输出 kwin 6.7.4，不再报 symbol lookup error

# 3. 恢复图形启动并重启
sudo systemctl set-default graphical.target
sudo reboot
```

![dnf upgrade 将 kscreenlocker 从 6.6.4 升至 6.7.4，kwin_wayland --version 正常输出 kwin 6.7.4](../../assets/xx14-black-29-fix-kwin-674.jpg)
*图 16：kscreenlocker 6.6.4 → 6.7.4，kwin_wayland --version 恢复正常输出版本号（13:17）*

重启后正常进入桌面。开机弹出的 DrKonqi"问题报告"窗口内全部为**历史核心转储记录**（对应此前十余次启动失败），删除关闭即可。

![修复后进入桌面：欢迎中心提示 Plasma 已更新到 6.7，右侧 DrKonqi 罗列 13 小时前的历史崩溃报告](../../assets/xx14-black-30-desktop-recovered.jpg)
*图 17：桌面恢复，欢迎中心 + 一整屏历史崩溃报告（均为过去式）（13:20）*

### 7.3 全量收尾

为消除其他组件存在同样"半截更新"的可能：

```bash
sudo dnf upgrade --refresh -y
```

![Konsole 中全量 dnf upgrade 跑完输出"完毕！"——1730 个包全部更新](../../assets/xx14-black-31-full-upgrade-done.jpg)
*图 18：1730 个包全量更新完毕，系统进入一致状态（13:29）*

共更新 **1730 个包**（含 glibc、显示协议栈、内核依赖），重启后系统进入一致状态。

## 8. 故障复盘：三个机制问题

**为什么第一次开机正常，第一次注销就崩？** 程序只认其启动那一刻加载进内存的代码。刚装完时镜像自带整套配套的 6.6 旧组件，驻留内存正常运行；随后硬盘上的 kwin 被事务替换为 6.7.4，内存中的旧桌面毫无感知。注销 = 结束内存进程 + **从硬盘重新拉起**登录界面——此刻才加载新 kwin + 旧 kscreenlocker 的残缺组合，当场崩溃。

**为什么键盘彻底失灵？** 见 3.4：显示管理器先独占 DRM/KMS 与 evdev，渲染进程再崩溃，控制权无人归还。这是"看起来像整机冻结、CapsLk 却有反应"的完整解释。

**为什么排查前期全部落空？** 两个干扰项（主题缺失、pam_environment）与一个方法论问题：图形服务崩溃现场随每次启动重建，反复重启服务只能反复得到同样黑屏；转为纯文本 + 只读取证（journalctl -b -1 / coredumpctl / 直接运行二进制）后，两步锁定根因。

## 9. 次日复盘：Gemini 两个结论被推翻

09-06 对系统状态逐项核对时，发现 Gemini 收尾时给出的两个结论不成立，均予以修正。

![次日复盘现场：游戏本跑 Antigravity 交叉验证，小新 14 跑 Trae 整理文章](../../assets/xx14-black-32-next-day-review.jpg)
*图 19：两台 AI 接力复盘的现场（15:41）*

### 9.1 "SDDM 本来就是出厂默认" —— 错

Gemini 收尾称 sddm 为 Fedora KDE 出厂默认显示管理器、无需还原。实际 **Fedora 44 KDE 出厂默认为新一代 plasmalogin**（plasma-login-manager，`plasmalogin.service`）——即第一轮日志中 `plasmalogin-helper exited with 64` 的主角；sddm 全家是排查期才安装的。

还原操作：

```bash
sudo systemctl disable sddm
sudo systemctl enable plasmalogin
sudo dnf remove -y sddm sddm-kcm sddm-wayland-plasma sddm-breeze \
  kde-settings-sddm desktop-backgrounds-compat
```

6 个 sddm 相关包全部卸载，切回 plasmalogin，重启验证登录正常（根因已修复，出厂组件无再崩理由）。

### 9.2 "后台 PackageKit 自动更新替换了 kwin" —— 也不成立

检查发现本机**未安装 PackageKit，也无 dnf-automatic，不存在任何后台自动更新**。翻 dnf 事务历史：kwin 的升级来自安装输入法时那次一次性 305 包的大事务。二者结合，诱因就是"装输入法"这个普通操作本身。

### 9.3 附带发现：63 个被连坐删除的 PIM 包

核对包状态时发现此前一次依赖清理中，AI 执行 `dnf remove -y kmime`，因 kmime 是 KDE PIM（个人信息管理）组件的底层依赖，**连坐删除 63 个包**（kmail、kontact、korganizer、kaddressbook、akregator、kleopatra 等）。已全部重装（66 包，约 194MB），并将该套组件列为永不再动项。

### 9.4 输入法最终收尾

- fcitx5 设为 systemd 用户服务自启，`Ctrl + Space` 切中英，`Ctrl + Shift` 换方案；
- 方案：拼音 / 双拼 / 五笔 / 中州韵（Rime），另装 ibus 智能拼音备用；
- 配置全程未写入 `/etc/environment`（环境变量经安全途径注入）。

## 10. 教训清单

1. **Fedora 44 为开发分支**，仓库组件逐包推送，存在"A 更新了、B 没更新"的时间窗口；大版本刚发布就装机等于赌仓库同步状态。
2. **强 ABI 耦合组件可能只有裸依赖**（kwin → kscreenlocker 无版本约束），装大组件前后跑 `dnf upgrade --refresh` 拉平全系统可显著降险。
3. **图形全灭的标准排查路径**：CapsLk 灯判内核死活 → GRUB 加 `3` 进纯文本（键盘必可用）→ `coredumpctl list` 看谁 SIGABRT → 直接运行可疑二进制（如 `kwin_wayland --version`）让动态链接器报真错。此链路 20 分钟内可锁定根因，比重启试错快一个数量级。
4. **"键盘失灵"≠死机**：显示管理器独占 DRM/KMS 与输入设备后崩溃，输入信号无人接管；CapsLk 有反应即内核存活。
5. **注销/锁屏是从硬盘重新加载组件的时刻**——"装完好好的、一注销就炸"高度指向硬盘上的库文件版本脱节，而非运行态问题。
6. **小新 14 的 F1~F12 默认多媒体键，FnLock 在 Esc 上**；TTY 组合键失灵先查它。
7. **勿向 `/etc/environment` 写 `export`**（PAM 不识别，登录器直接崩），配置 Fcitx5 的高频雷区。
8. **AI 给出的结论也要核对**：本次"sddm 是出厂默认"与"后台自动更新"两个论断均与事实不符；对系统改动保留事务记录（`dnf history`）与还原路径，是第二天能 20 分钟完成修正的前提。

全文完。上篇《[联想小新 14 装 Fedora 44 KDE 双系统全记录（上）：安装篇](/blog/lenovo-xx14-fedora-kde-dual-boot-install-recap)》记录安装与基础配置全流程。
