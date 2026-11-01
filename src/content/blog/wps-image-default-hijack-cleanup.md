---
title: '整治 WPS：一个看图插件在注册表里留了 46 个入口'
description: '装完 WPS，双击图片就变成了「WPS 图片」，可设置页里明明写着照片。本文按“发生了什么 → 是什么情况 → 如何解决 → 补充问答”四段展开：先摆出注册表、Shell 解析、真实双击三方互相矛盾的证据；再讲清 Win11 25H2 的默认应用其实存了两层（UserChoice 与 UserChoiceLatest），WPS 只写新层所以设置页看不出来，以及「打开方式」那一栏是由 46 个 WPS.PIC 文件类、HKLM/HKCU 两份 photolaunch 注册、3 个 wpsappext Appx 扩展、8 处图片预览劫持、45 条能力清单声明拼出来的；然后给出逐层拆除的真实过程（含一次被取消的 UAC）与核对数字；最后把当时的七个疑问逐条补上——包括四次第三方写默认的原始错误码（0x80070005、0x80070483）、60 组哈希反推全部不匹配、预览窗格为什么照样能看（以及我一次写错的结论）、看图本体 30 MB 为什么故意留着、左侧那个「河北大学」是什么。'
pubDate: '2026-11-01T15:51:28+08:00'
updatedDate: '2026-11-01T19:11:00+08:00'
category: '开发'
type: 'ai-organized'
---

# 整治 WPS：一个看图插件在注册表里留了 46 个入口

> **核心背景**：Windows 11 25H2（build 26200）装了 WPS Office 12.1.0.28022，之后双击 `.jpg` 直接进「WPS 图片」，但「设置 → 应用 → 默认应用」里图片类型显示的是照片。照片包版本 `Microsoft.Windows.Photos_2026.11090.22001.0_x64__8wekyb3d8bbwe`，账户 SID `S-1-5-21-...-1001`。
>
> **本文结构**：一、发生了什么（三方证据互相打架）→ 二、是什么情况（默认应用存了两层 + 打开方式的五处来源）→ 三、如何解决（逐层拆除与核对）→ 四、补充问答（当时的七个疑问）→ 五、命令速查 → 六、一句话总结。

## 💡 速览

| | 内容 |
| --- | --- |
| 现象 | 设置页显示照片，双击却是 WPS 图片；右键「打开方式」里多一个 WPS 图片 |
| 原因 | 25H2 的默认项实际存在 `UserChoiceLatest`，WPS 只写这一层；旧 `UserChoice` 退化成给 UI 看的副本 |
| 解决 | 删掉新层 + 拆掉 46 个文件类、3 个 Appx 扩展、8 处预览劫持、45 条能力声明；HKLM 那部分要管理员 |
| 遗留 | `webp/heic/tif/tiff/ico` 现在没有默认（能设，只能你亲手设）；看图本体 30 MB 故意保留 |

---

## 一、发生了什么

### 1.1 三方证据互相打架

第一次查注册表，`.jpg` 的默认项看起来完全正常：

```
HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg\UserChoice
    ProgId    REG_SZ    AppX43hnxtbyyps62jhe9sqpdzxn1790zetc
    Hash      REG_SZ    Q9jybXYiAU8=
```

而 `AppX43hnxtbyyps62jhe9sqpdzxn1790zetc` 解析出来就是照片本体：

```
AppUserModelID   : Microsoft.Windows.Photos_8wekyb3d8bbwe!App
ApplicationName  : @{Microsoft.Windows.Photos_2026.11090.22001.0_x64__8wekyb3d8bbwe?ms-resource://.../AppDisplayName}
```

但用 Shell 自己的解析函数（`Shlwapi!AssocQueryString`，资源管理器双击时走的就是这套）问一遍，答案立刻翻脸：

```
.jpg  APPNAME: WPS 图片
      EXE    : C:\WPS\WPS Office\12.1.0.28022\office6\photolaunch.exe
      CMD    : "C:\WPS\WPS Office\12.1.0.28022\office6\photolaunch.exe" /photo /view "%1"
```

`.png` `.gif` `.bmp` `.webp` `.tif` `.heic` `.ico` 全部同样返回 photolaunch。再真双击一次 `C:\Windows\Web\Wallpaper\Windows\img0.jpg` 做目标级验证：

```
   Id ProcessName  MainWindowTitle
14580 photolaunch
23056 photolaunch  img0.jpg  WPS图片
```

三方证据：**注册表说照片，Shell 解析说 WPS，实测双击是 WPS**。三个里面只有注册表是“好的”，说明问题不在我查的那个键里，注册表里还有一处我没看到的东西。

### 1.2 顺带暴露出来的两件事

- 右键「打开方式」里躺着一个 **WPS 图片**，而它只是个看图插件；
- 清理完之后，`.webp` `.heic` `.tif` `.tiff` `.ico` 这几个格式变成“没有默认”，双击弹选择框——这既不是修坏了，也不是我漏设，原因见 Q1。

---

## 二、是什么情况

### 2.1 默认应用其实存了两层，旧的那层不做主

同一个扩展名下有两个键：

```
FileExts\.jpg\UserChoice          ProgId=AppX43...   Hash=Q9jybXYiAU8=
FileExts\.jpg\UserChoiceLatest    Hash=iPDnIOG4u6s=
                          \ProgId  ProgId=WPS.PIC.jpg
```

`UserChoiceLatest` 是 Win11 后期新增的一层，里面还套一个 `ProgId` 子键。它的优先级高于旧 `UserChoice`——这条是实测出来的：删掉新层，旧层立刻生效（见 3.1）。旧键因此退化成“给设置页显示”的副本。

于是 WPS 的抢法很鸡贼：**它不动旧键，让设置页继续显示照片，只往新键里写自己。** 至于新层要不要过哈希校验，第二章先不结论，Q2 用四次失败反证：要。

### 2.2 「打开方式」那一栏由五处拼出来

| 来源 | 注册表位置 | WPS 当时占了什么 |
| --- | --- | --- |
| 类型候选 | `HKLM\SOFTWARE\Classes\<ext>\OpenWithProgids`、`HKCU\Software\Classes\<ext>\OpenWithProgids` | 没写（它走别的通道） |
| 程序类 | `HKLM\SOFTWARE\Classes\WPS.PIC.<ext>`，`shell\open` 带 `FriendlyAppName = WPS 图片` | **46 个类**（连 `.xmind` 都被它当图片） |
| 按 exe 名登记 | `...\Classes\Applications\photolaunch.exe\shell\open`，同样带 `FriendlyAppName` | **HKLM 与 HKCU 各一份** |
| 最近用过 | `FileExts\<ext>\OpenWithList` + `MRUList` | `.jpg` 里 `e = photolaunch.exe` |
| 打包应用 | Appx 包声明 + `windows.fileExplorerContextMenus` | `wpsappext1/2/3` |

列表上那四个字「WPS 图片」的文字来源就是 `FriendlyAppName`，它出现在 `WPS.PIC.jpg\shell\open` 和 `Applications\photolaunch.exe\shell\open` 两处。

除了“打开方式”，还有两处也是同一个插件留下的：

- **预览劫持**：`.jpg .jpeg .png .gif .bmp .tif .webp .svg` 八个扩展的 `ShellEx\{8895b1c6-b41f-4c1c-a562-0d564250836f}`（IPreviewHandler 的接口 GUID）都指向 `{d7ac9243-9d84-4498-8192-d7ad263b63c8}` → `...\Kingsoft\wps_international\addons\pool\win-x64\pdfwspv_3.1.0.8040\pdfwspv.dll`，而且 HKCU 与 HKLM 各写了一份。
- **能力清单**：`HKLM\SOFTWARE\kingsoft\Office\6.0\wpsoffice\Capabilities\FileAssociations` 下有 45 条图片声明（`.ai .arw .bmp ... .x3f .xpm`）。这是 WPS 向系统声明“我能打开这些类型”的底稿——只删类不删声明，等于身份注销了但户口底单还在。

另外 `PreviewHandlers` 清单里躺着 5 个 WPS 条目：`{0C7FEF07…}`（WPS 图片预览器）、`{A1BBCFD9…}`（WPS 演示）、`{E260F96C…}`（WPS 文字）、`{d7ac9243…}`（PDF 用的那个）、`{A3DA03D4…}`（压缩包）。前三个的实现来自那三个 Appx 包。

### 2.3 这些登记是什么时候写进去的

注册表键的 `LastWriteTime` 要用 `RegQueryInfoKey` 才拿得到（PowerShell 不直接暴露）：

```
.wbm   LatestProg=WPS.PIC.wbm   lw=2026-06-29 11:44:45 (UTC)
.docx  LatestProg=WPS.Docx.6    lw=2026-06-29 11:44:45 (UTC)
.rtf   LatestProg=WPS.RTF.6     lw=2026-06-29 11:44:45 (UTC)
.epub  LatestProg=KWPS.EPUB.9   lw=2026-06-29 11:44:45 (UTC)
.ofd   LatestProg=KWPS.OFD      lw=2026-06-29 11:44:45 (UTC)
.mobi  LatestProg=KWPS.MOBI.9   lw=2026-06-29 11:44:45 (UTC)
```

六个不同扩展、同一分钟内写完 —— 这是安装器一次性批量写的，不是运行期间慢慢改的。**这条时间线决定了后面怎么判断复发**：只要不再触发安装/升级流程，删干净不会自己长回来。

### 2.4 一个容易看错的地方：照片有三个 ProgId

同一台机器上，下面三个 ProgId 的 `AppUserModelID` 全都是 `Microsoft.Windows.Photos_8wekyb3d8bbwe!App`：

| ProgId | 出现在哪 |
| --- | --- |
| `AppX43hnxtbyyps62jhe9sqpdzxn1790zetc` | `.jpg/.png/.gif/...` 的 `UserChoice` 与 `UserChoiceLatest` |
| `AppX4mntx4h978m1v9gtzv0ewksfd6pmwsre` | `.jpg/.png/.tif/...` 的 `OpenWithProgids` 候选列表 |
| `AppX9rkaq77s0jzh1tyccadx9ghba15r6t3h` | `.arw/.cr2/.nef/.orf/...` 等 RAW 扩展的 `UserChoice` |

名字来自包注册时的不同 contract，指向同一个程序。**查的时候不能只认一个 ProgId**，否则会误判成“装了三个照片”。

---

## 三、如何解决

### 3.1 先在一个扩展上做白鼠实验

不批量动手，先只删 `.jpg` 的新层，刷新外壳，真双击一次：

```powershell
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg\UserChoiceLatest' -Recurse -Force
ie4uinit.exe -show
Start-Process 'C:\Windows\Web\Wallpaper\Windows\img0.jpg'
```

```
16436 Photos   C:\Program Files\WindowsApps\Microsoft.Windows.Photos_2026.11090.22001.0_x64__8wekyb3d8bbwe\Photos.exe
19400 Photos   img0.jpg
photolaunch count: 0
```

“删新层 → 旧层生效”成立之后，才批量处理其余扩展：一次脚本删掉 38 个图片扩展的 `UserChoiceLatest`，加上先做白鼠的 `.jpg` 和后来复查补上的 `.wbm`，一共 40 处。

**副作用要写清楚**：删完之后过一会儿再查，`.jpg/.jpeg/.png/.gif/.bmp/.heif/.avif` 的 `UserChoiceLatest` 又出现了，内容已经是照片 ProgId。这不是 WPS 回来，是系统在默认项被成功使用后自己把新层补写回去（**这条机制是推断**，我观察到的只是“它带着照片 ProgId 重新出现”）。所以判断复发的依据是**看 `ProgId` 的值**，而不是看键存不存在——只查“有没有 UserChoiceLatest 键”会误报。

### 3.2 用户层（不需要管理员）

| 动作 | 对象 |
| --- | --- |
| 卸载 Appx 扩展 | `wpsappext1/2/3_1.0.0.2_neutral__km9wtz8rh8me0`，manifest 里只有 `windows.comServer` 与 `windows.fileExplorerContextMenus`，`NonRemovable=False` |
| 删 HKCU 预览劫持 | 八个扩展的 `Software\Classes\<ext>\ShellEx\{8895b1c6-…}` |
| 删 HKCU 的 exe 登记 | `Software\Classes\Applications\photolaunch.exe`（这条是复查时才发现的漏网） |
| 删提示抑制记录 | `ApplicationAssociationToasts` 里 46 条 `WPS.PIC_*` |
| 清最近使用 | `.jpg` 的 `OpenWithList` 去掉 `e=photolaunch.exe`，`MRUList` 从 `aedcb` 改成 `adcb` |

### 3.3 管理员层（需要 UAC）

HKLM 下的东西普通权限删不掉，做法是把删除动作写进脚本，用 `Start-Process -Verb RunAs` 提权执行并 `-Wait`：

```powershell
Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\...\cleanup-admin.ps1'
```

| 删除对象 | 数量 |
| --- | --- |
| `HKLM\SOFTWARE\Classes\WPS.PIC.*` | 46 个键 |
| `HKLM\SOFTWARE\Classes\Applications\photolaunch.exe` | 1 |
| 图片扩展的 HKLM 预览劫持 | 8 处 |
| `PreviewHandlers` 里三个打包 WPS 条目 | 3 个值（`{0C7FEF07}` `{A1BBCFD9}` `{E260F96C}`） |
| 能力清单里的图片声明 | 45 条 |

**这里踩了一个坑**：第一次弹 UAC 时没注意，直接返回 `操作已被用户取消`，脚本什么都没做——**提权失败是静默的**。第二次点「是」才真正执行。所以提权脚本必须自己写日志，事后靠计数核对，不能靠“命令没报错”判断成功。

### 3.4 核对：计数与真双击

```
WPS.PIC 类: 0
photolaunch 注册 HKLM/HKCU: False / False
wpsappext Appx: 0
图片预览劫持映射: 0
能力清单图片项: 0
图片 UserChoiceLatest 被 WPS 占用: 0
jpg 当前默认: AppX43hnxtbyyps62jhe9sqpdzxn1790zetc
```

真双击两张图（`.png` 是当场用 `System.Drawing` 生成的 64×64 测试图，测完删除），拉起的都是 `Photos.exe`，`photolaunch` 计数 0。

### 3.5 从零照抄清单

顺序不能乱：先确认现象，再删新层，最后才拆注册身份。

1. **看真实解析，别先看设置页**

   ```powershell
   (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg\UserChoice').ProgId
   (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg\UserChoiceLatest\ProgId').ProgId
   ```

   两条不一致、且第二条是别家程序 → 就是本文这种情况。

2. **备份**（可选）：`reg export "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts" fileexts-backup.reg /y`
3. **删新层**：先一个扩展试通（3.1），再批量。
4. **卸载 Appx**：`Get-AppxPackage -Name 'wpsappext*' | Remove-AppxPackage`
5. **删 HKCU 侧登记**：预览 `ShellEx`、`Applications\photolaunch.exe`、`WPS.PIC_*` 提示、`OpenWithList` 里的记录（记得同步改 `MRUList`）。
6. **以管理员删 HKLM 侧登记**：`WPS.PIC.*` 全部类、`Applications\photolaunch.exe`、图片扩展的 `ShellEx`、`PreviewHandlers` 三个条目、能力清单里的图片项。
7. **刷新并验证**：`ie4uinit.exe -show`，然后真双击 `.jpg` 和 `.png` 看进程名，再核对 3.4 那串计数。
8. **补默认**：`.webp`、`.heic`、`.tif`、`.tiff`、`.ico` 这五个没有脚本路径，只能你自己在设置里点（见 Q1、Q2）。

---

## 四、补充问答

### Q1 webp 这些是不是根本没设默认？我设置里看不到

**是，确实一个默认都没有**，而且这不是漏设：

```
.webp   UserChoice=<无>  Latest=<无>
.heic   UserChoice=<无>  Latest=<无>
.tif    UserChoice=<无>  Latest=<无>
.tiff   UserChoice=<无>  Latest=<无>
.ico    UserChoice=<无>  Latest=<无>
```

为什么“没设置”才是原状？从这台机器留下的状态看，WPS 抢默认只写新层、不碰旧层：被它写过的扩展里，旧层要么仍是照片 ProgId（`.jpeg` `.png` `.gif` `.bmp` `.heif`），要么根本不存在（`.webp` `.heic` `.tif` `.tiff` `.ico`）。既然看不到它删旧层的痕迹，这几个扩展在装 WPS 之前旧层就是空的——弹“选择打开方式”正是装 WPS 之前的行为。**这一句是从状态反推的推断，不是我观察到的过程。**

不过系统自己的出厂意图清单里，这几个是归照片的：

```
C:\Windows\System32\OEMDefaultAssociations.xml（文件日期 2025-09-16）
  <Association Identifier=".webp" ProgId="AppX43hnxtbyyps62jhe9sqpdzxn1790zetc" ApplicationName="Photos" />
  <Association Identifier=".heic" ... />  <Association Identifier=".ico"  ... />
  <Association Identifier=".tif"  ... />  <Association Identifier=".tiff" ... />
```

这份 XML 只在**新建用户档案**时应用，对已有档案不生效，所以这台机器上从没落成 `UserChoice`。照片应用本身支持这些格式——它的 manifest 里声明了 76 种扩展名，含 `.webp` `.tif` `.tiff` `.ico` `.heic` `.heif` `.avif` `.jxl`，也含 `.svg` `.mp4` `.mov` `.wmv` `.mkv`。

**结论摆正**：webp 能设成照片，你自己在设置里点一下或首次打开勾「始终」，十秒的事；做不到的是“用脚本替你设”（Q2）。

### Q2 为什么脚本设不了默认

四条路全部失败，错误码原样留着：

| 尝试 | 结果 | 证据 |
| --- | --- | --- |
| 官方接口 `IApplicationAssociationRegistration::SetAppAsDefault(AppX43…, .jpg)` | 拒绝 | `hr=0x80070005`（E_ACCESSDENIED） |
| 同接口对 `.webp` 用候选列表里的 ProgId / AUMID | 认为无关联 | `hr=0x80070483`（ERROR_NO_ASSOCIATION） |
| 用 PS-SFTA 的哈希算法写 `UserChoice`（照片 ProgId，`Hash=F6tbNSzJ8H0=`） | 被无视 | `AssocQueryString` 返回 `C:\WINDOWS\system32\OpenWith.exe "%1"`，实测双击弹选择框（PID 15964） |
| 换成候选列表里那个照片 ProgId（`Hash=JEo3pEnQUac=`） | 被无视 | 又弹一次 OpenWith（PID 13896） |
| 写 `UserChoiceLatest`（照片 ProgId + 同一份哈希） | 被无视 | 再弹 OpenWith（PID 7776） |

为了排除“是不是照片这个 AppX 身份对 `.webp` 无效”这个干扰变量，换纯 Win32 的 `MSEdgeHTM` 再试一次（写进去 `Hash=1u373tKrd5M=`），`AssocQueryString` 仍然返回 OpenWith。**这才是决定性一步**：连 Edge 这种普通 ProgId 都不认，说明卡点在哈希校验，不在 AppX 解析。

另一个观察：手写 `UserChoice` 之后系统并没有把键删掉，值还在那儿，只是被无视。**所以“键存在”不能当证据，必须实测。**

还试着反推 WPS 那份被系统承认的哈希：已知扩展名、SID、ProgId、键写入时间（精确到分钟），用 PS-SFTA 的 `Get-Hash` 暴力组合——

```
精度 3 种（分钟 / 秒 / 100ns）× 体验字符串 2 种（shell32.dll 提取 / 空）× ProgId 2 种（Latest 里的 / UserChoice 里的）
= 每个扩展 12 组，6 个扩展共 60 组
.wbm   NO MATCH (stored=V+Y+K1wyaK8=)
.docx  NO MATCH (stored=aqF5Nn9acis=)
.rtf   NO MATCH (stored=5rM04RNT+5Q=)
.epub  NO MATCH (stored=0wwNXNOxAAs=)
.ofd   NO MATCH (stored=kP9BQxTfMJg=)
.mobi  NO MATCH (stored=yJYuCDZEnu8=)
```

60 组全部不匹配。输入参数本身没问题：从 `SysWOW64\shell32.dll` 与 `System32\shell32.dll` 提取到的体验字符串都是 `User Choice set via Windows User Experience {D18B6DD5-6124-4341-9318-804003BAFA0B}`，与硬编码值一致。

**这条否定结论的强度要说明白**（三组信号）：

| 信号 | 内容 |
| --- | --- |
| 正向对照 | 只证明“代码确实跑了”：同一份 `Get-Hash` 被成功调用并产出 60 个互不相同的候选值；它对 `.webp` 产出的哈希确实落进了注册表（`F6tbNSzJ8H0=`，可回查键值） |
| 负向结果 | 60 组候选与 6 个真实存储值无一相等 |
| 排除干扰 | 输入项（SID、ProgId、时间戳、体验字符串）逐项打印核对过，时间戳换算用的就是键自己的 `LastWriteTime`，不是猜的 |

正向对照只证明函数执行过，没证明算法在这版本仍有效。所以 60 组不匹配有两种解释——新层用了另一套算法，或者公开算法整体已过期。上面那四次失败同样指向“这条路走不通”。两种解释都不影响结论，但别把它当成“我已经破解了新算法”。WPS 到底怎么拿到被承认的哈希，我不知道，不编。

一句可以原样复述出去的断语：**默认应用这扇门只能从里面开——门没坏，只是外面没有钥匙孔。**

### Q3 「打开方式」里那个 WPS 图片是怎么没的，算连根拔除吗

不算拔除，算**拆登记**。2.2 那张表里五处来源逐个删掉之后，列表再也拼不出“WPS 图片”这四个字（它的文字来源是 `FriendlyAppName`，出现在 `WPS.PIC.jpg\shell\open` 与 `Applications\photolaunch.exe\shell\open` 两处）。程序文件本身一个没动（Q5）。

### Q4 预览窗格的处理器是什么意思？这里我写错了一次

**先说错误**：我当时顺嘴断了一句“图片的预览登记删掉后，预览窗格会显示没有可用的预览”。用户当场打开预览窗格反驳：“预览我看这不是能看吗，你删了还是没删，给我绕晕了。”他是对的，那句没经过验证。

重查之后的结论：图片预览一直能看，而且现在画它的不是 WPS。

**降一层解释**：资源管理器右侧那块预览画面，是系统按扩展名查一张“这种文件该找谁来画”的登记表，登记表里写的是别人提供的一段代码。WPS 当初把这些格子改成“找 WPS 画”，我删掉的只是这几格改写；系统一看没人被指定，就动用自己内置的画图能力。

一句可以原样复述的断语：**登记被删了，能力还在。**

判据命令：

```powershell
$ph = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'   # IPreviewHandler
Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\.jpg\ShellEx\$ph"     # 空 → WPS 那条已删
Get-ItemProperty 'Registry::HKEY_CLASSES_ROOT\SystemFileAssociations\image\ShellEx\{e357fccd-a995-4576-b01f-234630154e96}'
#   {C7657C4A-9F68-40fa-A4DF-96BC08EB3551}
Get-ItemProperty 'Registry::HKEY_CLASSES_ROOT\CLSID\{C7657C4A-9F68-40fa-A4DF-96BC08EB3551}\InprocServer32'
#   C:\WINDOWS\system32\PhotoMetadataHandler.dll   ← 现在画预览的是它，微软自带
```

`.pdf` 的预览登记**故意留着**（仍指向 WPS 的 `{d7ac9243-…}` → `pdfwspv.dll`）：用户实测双击 PDF 是 Edge、预览用 WPS 正好，明确说“PDF 留着可以”。

**副作用要写清楚**：预览窗格这件事的表现是“看起来什么都没变”。以后怀疑清理没生效，不能拿预览窗格当证据，要看上面那两条注册表查询。

### Q5 看图软件本体到底删了没有

没删，故意的：

| 对象 | 大小 |
| --- | --- |
| `photolaunch.exe` | 1.2 MB |
| `addons\photo` | 12.4 MB |
| `addons\photoeditlite` | 9.4 MB |
| `addons\photopreviewerlite` | 3.2 MB |
| `addons\ksphotokit` | 3.0 MB |
| `addons\kphototool` | 0.7 MB |
| 合计 | **约 30 MB**（WPS 整个安装目录 1804.4 MB，占 1.6%） |

删 WPS 安装目录里的东西，会被它自己的自检或更新拉回来，还可能报“组件缺失”。为省 30 MB 不值当。现在的状态是：文件在，但没有任何注册指向它，系统不会调它——除非手动双击那个 exe。

### Q6 左侧多出来的「河北大学」是你说的扩展吗

是它，但跟图片无关。定义如下：

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Desktop\NameSpace\{EEEEFCF7-867B-4FA2-9ABD-884CF531B625}
CLSID\{EEEEFCF7-…}
    companyName          = 河北大学
    companyId            = 617908790
    UserId               = 1876718740
    LastTargetFolderPath = C:\WPS\WPS Cloud\WPSDrive\1876718740\WPS企业云盘\河北大学
    System.IsPinnedToNamespaceTree = 1
    DefaultIcon = C:\WPS\WPS Office\12.1.0.28022\office6\qingnse.dll,58
```

它是 WPS 云盘（企业/教育空间）钉在导航栏的入口，本体就是那个本地缓存文件夹。同时 `explorer.exe` 里加载着 WPS 的模块：`qingnse64.dll`、`qingshellext64.dll`、`kbaseconfigcenter64.dll`、`addons\kpluginconfigcenter\kpluginconfigcenter64.dll`。

想只隐藏入口，删那条 HKCU 的 `NameSpace` 子键即可（不需要管理员；WPS 里再点一次“在资源管理器中打开”就会重新钉上）。本次决定保留。

### Q7 会不会复发，怎么查

- **会复发的路径**：WPS 升级或重装（2.3 那条时间线证明这批登记是安装时一次写的），或者在 WPS 里点了“设为默认/文件关联”。
- **不会自己长回来**：日常启动不写这些键（本次清理后到复查为止，`WPS.PIC` 类计数一直为 0）。
- **怎么查**：只看 `ProgId` 的值，不看键是否存在（3.1 那条副作用）。我把复查写成了脚本，双击即出报告：

```
~/workspace/wps-image-assoc/check.cmd     只读复查
~/workspace/wps-image-assoc/clean.cmd     预览要删什么；clean.cmd apply 才执行（HKLM 部分需管理员）
```

---

## 五、命令速查

```powershell
# Shell 眼里某扩展的真实打开命令（ASSOCSTR_COMMAND=1 / EXECUTABLE=2 / FRIENDLYAPPNAME=4）
Add-Type -TypeDefinition '<P/Invoke Shlwapi!AssocQueryString>'
[AssocQ]::Query(1, '.jpg')

# 注册表键的写入时间（PowerShell 不直接给）
Add-Type -TypeDefinition '<P/Invoke advapi32!RegOpenKeyEx + RegQueryInfoKey>'
[RegTime]::GetLastWrite($true, 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.wbm\UserChoiceLatest')

# 照片应用的 ProgId / AUMID / 支持的 76 种格式
$pkg = Get-AppxPackage Microsoft.Windows.Photos
[regex]::Matches((Get-Content "$($pkg.InstallLocation)\AppxManifest.xml" -Raw), '<uap:FileType>[^<]+</uap:FileType>')

# 系统出厂默认关联清单
Select-String 'webp|heic|\.ico|\.tif' C:\Windows\System32\OEMDefaultAssociations.xml

# WPS 图片的全部落点
(Get-ChildItem 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes' | ? PSChildName -like 'WPS.PIC.*').Count
Get-AppxPackage -Name 'wpsappext*'
reg query 'HKLM\SOFTWARE\kingsoft\Office\6.0\wpsoffice\Capabilities\FileAssociations'

# 提权执行删除脚本（UAC 被取消是静默失败，必须看日志）
Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\...\cleanup-admin.ps1'

# 刷新外壳关联缓存
ie4uinit.exe -show
```

---

## 六、一句话总结

Win11 25H2 的默认应用其实存了两层，WPS 只写新层所以设置页看不出来；把新层连同 46 个文件类、3 个 Appx 扩展、8 处预览登记、45 条能力声明一起拆掉，图片就回到照片——只是剩下几个没有默认的格式，得你自己动手点一次，因为那扇门现在只允许从里面开。
