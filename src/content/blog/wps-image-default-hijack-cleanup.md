---
title: '整治 WPS：一个看图插件在注册表里留了 46 个入口'
description: '装完 WPS，双击图片就变成了「WPS 图片」，可设置页里明明写着照片——顺着这条矛盾查下去，发现 Win11 25H2 的默认应用其实存了两份，旧的那份已经不做主了。全文带全部实测数据：三个不同 ProgId 指向同一个照片应用、WPS 那批劫持项的键写入时间戳全是 2026-06-29 11:44:45、四次尝试用第三方方式写默认的原始错误码（0x80070483 / 0x80070005 / 手写哈希被无视），以及 46 个 WPS.PIC 文件类、3 个 wpsappext Appx 扩展、8 个图片扩展的双份预览劫持、45 条能力清单声明是怎么被逐层拆掉的。另外交代哪些东西故意留着（看图本体 30 MB、PDF 预览、左侧那个「河北大学」云盘入口），以及我自己一次写错的结论和判据。'
pubDate: '2026-11-01T15:51:28+08:00'
category: '开发'
type: 'ai-organized'
---

# 整治 WPS：一个看图插件在注册表里留了 46 个入口

> **核心背景**：装 WPS Office 12.1.0.28022 之后，双击 `.jpg` 直接进了「WPS 图片」，但「设置 → 应用 → 默认应用」里图片类型显示的是照片。环境是 Windows 11 25H2（build 26200）、账户 SID `S-1-5-21-...-1001`、照片包版本 `Microsoft.Windows.Photos_2026.11090.22001.0_x64__8wekyb3d8bbwe`。
>
> **本文内容**：按当时真实提出的六个问题分章——为什么设置页和实际不一致、「打开方式」里那个选项怎么消失的、预览窗格到底删没删、webp 为什么设不成照片、左侧多出来的「河北大学」是什么、以及照抄能用的清理清单。所有数字与命令都是当场跑出来的。

## 💡 速览

| 问题 | 真实原因 | 修法 |
| --- | --- | --- |
| 设置页显示照片，双击却是 WPS | 25H2 的默认项实际存在 `UserChoiceLatest\ProgId`，旧 `UserChoice` 只是给 UI 看的 | 删掉被劫持的 `UserChoiceLatest`，系统回落到旧键的照片 |
| 「打开方式」里出现 WPS 图片 | 46 个 `WPS.PIC.*` 文件类 + HKLM/HKCU 两份 `Applications\photolaunch.exe` + MRU 记录 | 逐层删注册表 + 卸载 3 个 Appx 扩展包 |
| 预览窗格是不是被我弄坏了 | 没有。图片的预览登记删掉后，Windows 回落到自带的 `PhotoMetadataHandler.dll` | 不用管；我先前那句“预览会变空”是错的 |
| webp/heic/tif 设不成照片 | 25H2 拒绝一切第三方写默认：手写哈希被无视、官方接口返回 `0x80070005` | 只能在系统设置里手点，或首次打开时勾「始终」 |
| 左侧多了「河北大学」 | WPS 企业云盘钉的命名空间入口，指向本地缓存目录 | 保留（可只删那条 HKCU 键隐藏） |
| 看图软件本体删了吗 | 没删。`photolaunch.exe` + 5 个插件目录共约 30 MB 还在，只拆了入口 | 故意保留，删了会被 WPS 自检拉回 |

---

## 一、设置页写着照片，双击却开成 WPS

### 1.1 现象

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

但用 Shell 自己的解析函数问一遍，答案立刻翻脸：

```powershell
# Shlwapi!AssocQueryString，资源管理器双击时走的就是这套
.jpg  APPNAME: WPS 图片
      EXE    : C:\WPS\WPS Office\12.1.0.28022\office6\photolaunch.exe
      CMD    : "C:\WPS\WPS Office\12.1.0.28022\office6\photolaunch.exe" /photo /view "%1"
```

`.png` `.gif` `.bmp` `.webp` `.tif` `.heic` `.ico` 全部同样返回 photolaunch。再真双击一次 `C:\Windows\Web\Wallpaper\Windows\img0.jpg` 做目标级验证，拉起的是：

```
   Id ProcessName  MainWindowTitle
14580 photolaunch
23056 photolaunch  img0.jpg  WPS图片
```

注册表说照片，Shell 说 WPS，实测确实是 WPS。三个证据里只有注册表是“好的”，说明问题就出在注册表里还有一处我没看到的东西。

### 1.2 原理：默认应用存了两层，旧的那层已经不做主

同一个扩展名下有两个键：

```
FileExts\.jpg\UserChoice            ProgId=AppX43...        Hash=Q9jybXYiAU8=
FileExts\.jpg\UserChoiceLatest      Hash=iPDnIOG4u6s=
                             \ProgId  ProgId=WPS.PIC.jpg
```

`UserChoiceLatest` 是 Win11 后期新增的一层，里面还套了一个 `ProgId` 子键。它的优先级高于旧 `UserChoice`——这条是实测出来的：删掉新层，旧层立刻生效（见 1.4）。旧键因此退化成一个“给设置页显示”的副本。所以 WPS 抢默认的方式很鸡贼——它不动旧键，让设置页继续显示照片，只往新键里写自己。至于新层是否还要过哈希校验，下一章用失败案例反证：要。

这里有个反面信息值得记：`UserChoice` 里那个照片 ProgId 并不是唯一身份。同一台机器上，下面三个 ProgId 的 `AppUserModelID` 全都是 `Microsoft.Windows.Photos_8wekyb3d8bbwe!App`：

| ProgId | 出现在哪 |
| --- | --- |
| `AppX43hnxtbyyps62jhe9sqpdzxn1790zetc` | `.jpg/.png/.gif/...` 的 `UserChoice` 与 `UserChoiceLatest` |
| `AppX4mntx4h978m1v9gtzv0ewksfd6pmwsre` | `.jpg/.png/.tif/...` 的 `OpenWithProgids` 候选列表 |
| `AppX9rkaq77s0jzh1tyccadx9ghba15r6t3h` | `.arw/.cr2/.nef/.orf/...` 等 RAW 扩展的 `UserChoice` |

三个名字来自包注册时的不同 contract，指向的是同一个程序。查的时候不能只认一个 ProgId，否则会误判成“装了三个照片”。

### 1.3 取证过程

定位到 `UserChoiceLatest` 靠的不是猜，是把 `FileExts\.jpg` 整个子树列出来：

```powershell
Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg'
#   subkey: OpenWithList
#   subkey: OpenWithProgids
#   subkey: UserChoice
#   subkey: UserChoiceLatest      ← 多出来的这个
```

`OpenWithList` 里还留着一行佐证：`MRUList = eadcb`，第一个字符 `e` 对应 `e = photolaunch.exe`——最近一次真正打开过这文件的程序是 WPS 图片。

顺手把劫持的写入时间也查了。注册表键的 `LastWriteTime` 要用 `RegQueryInfoKey` 才拿得到（PowerShell 不直接暴露）：

```
.wbm   LatestProg=WPS.PIC.wbm   lw=2026-06-29 11:44:45 (UTC)
.docx  LatestProg=WPS.Docx.6    lw=2026-06-29 11:44:45 (UTC)
.rtf   LatestProg=WPS.RTF.6     lw=2026-06-29 11:44:45 (UTC)
.epub  LatestProg=KWPS.EPUB.9   lw=2026-06-29 11:44:45 (UTC)
.ofd   LatestProg=KWPS.OFD      lw=2026-06-29 11:44:45 (UTC)
.mobi  LatestProg=KWPS.MOBI.9   lw=2026-06-29 11:44:45 (UTC)
```

六个不同扩展、同一分钟内写完——这是安装器一次性批量写的，不是运行期间慢慢改的。**这条时间线很重要**：它意味着只要不再触发安装/升级流程，删干净之后不会自己长回来。

### 1.4 修法

先只在一个扩展上做最小白鼠实验：删掉 `.jpg` 的 `UserChoiceLatest`，刷新外壳，再真双击一次。

```powershell
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg\UserChoiceLatest' -Recurse -Force
ie4uinit.exe -show
Start-Process 'C:\Windows\Web\Wallpaper\Windows\img0.jpg'
```

结果：

```
16436 Photos   C:\Program Files\WindowsApps\Microsoft.Windows.Photos_2026.11090.22001.0_x64__8wekyb3d8bbwe\Photos.exe
19400 Photos   img0.jpg
photolaunch count: 0
```

确认“删新键 → 旧键生效”成立之后，才批量处理其余扩展：一次脚本删掉 38 个图片扩展的 `UserChoiceLatest`，加上先做白鼠的 `.jpg` 和后来复查补上的 `.wbm`，一共 40 处。

**副作用要写清楚**：删完之后过一会儿再查，`.jpg/.jpeg/.png/.gif/.bmp/.heif/.avif` 的 `UserChoiceLatest` 又出现了，内容已经是照片 ProgId。这不是 WPS 回来了，是系统在默认项被成功使用后自己把新层补写回去。**判据是看 `ProgId` 值而不是看键是否存在**——只查“有没有 UserChoiceLatest 键”会误报成复发。

---

## 二、「打开方式」里那个 WPS 图片是怎么消失的

清理之后用户右键再看「打开方式」，WPS 图片这一项没了，于是问：这是把组件连根拔除了，还是只删了右键那条注册表？

### 2.1 那个列表由五处拼出来

| 来源 | 注册表位置 | WPS 当时占了什么 |
| --- | --- | --- |
| 类型候选 | `HKLM\SOFTWARE\Classes\<ext>\OpenWithProgids`、`HKCU\Software\Classes\<ext>\OpenWithProgids` | 没写（它靠别的通道） |
| 程序类 | `HKLM\SOFTWARE\Classes\WPS.PIC.<ext>`，`shell\open` 带 `FriendlyAppName = WPS 图片` | **46 个类** |
| 按 exe 名登记 | `...\Classes\Applications\photolaunch.exe\shell\open`，同样带 `FriendlyAppName` | **HKLM 与 HKCU 各一份** |
| 最近用过 | `FileExts\<ext>\OpenWithList` + `MRUList` | `.jpg` 里 `e = photolaunch.exe` |
| 打包应用 | Appx 包声明 + `windows.fileExplorerContextMenus` | `wpsappext1/2/3` |

列表上那四个字「WPS 图片」的文字来源就是 `FriendlyAppName`，它出现在 `WPS.PIC.jpg\shell\open` 和 `Applications\photolaunch.exe\shell\open` 两处。所以答案是：**不是卸载组件，是把这五处登记逐个拆掉**。

### 2.2 拆掉的完整清单

| 对象 | 数量/标识 | 需要管理员 |
| --- | --- | --- |
| `WPS.PIC.*` 文件类（HKLM） | 46 个，含 `.xmind` 都被它当图片 | 是 |
| `Applications\photolaunch.exe` | HKLM 1 份 + HKCU 1 份（HKCU 那条是复查时补发现的漏网） | 否 |
| Appx 扩展包 | `wpsappext1/2/3_1.0.0.2_neutral__km9wtz8rh8me0`，manifest 里只有 `windows.comServer` 与 `windows.fileExplorerContextMenus` | 否 |
| 图片预览登记 | `.jpg .jpeg .png .gif .bmp .tif .webp .svg` 的 `ShellEx\{8895b1c6-b41f-4c1c-a562-0d564250836f}`，HKCU 与 HKLM 各一份 | HKLM 那份要 |
| 打包预览处理器条目 | `{0C7FEF07…}`（WPS 图片）、`{A1BBCFD9…}`（WPS 演示）、`{E260F96C…}`（WPS 文字） | 是 |
| 能力清单声明 | `HKLM\SOFTWARE\kingsoft\Office\6.0\wpsoffice\Capabilities\FileAssociations` 下 45 条图片项 | 是 |
| 提示抑制与 MRU | `ApplicationAssociationToasts` 里 46 条 `WPS.PIC_*`；`.jpg` 的 `MRUList` 从 `aedcb` 改成 `adcb` | 否 |

能力清单那一处值得单独说：它是 WPS 向系统声明“我能打开这些类型”的底稿。只删 `WPS.PIC.*` 类而留声明，等于把身份注销了但户口底单还在，下次它自己或用户点一下“设为默认”就能重建。所以拆的时候两处一起删。

### 2.3 HKLM 那部分怎么执行

普通权限跑 `Remove-Item` 只能动 HKCU，HKLM 下的类删不掉。做法是把删除动作写进一个脚本，用 `Start-Process -Verb RunAs` 提权执行并 `-Wait`：

```powershell
Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\...\cleanup-admin.ps1'
```

第一次弹 UAC 时用户没注意，直接返回 `操作已被用户取消`，脚本什么都没做——**提权失败是静默的**，必须靠脚本自己写日志、事后再核对计数。第二次点了「是」才真正执行。

### 2.4 清理后的核对

```
WPS.PIC 类: 0
photolaunch 注册 HKLM/HKCU: False / False
wpsappext Appx: 0
图片预览劫持映射: 0
能力清单图片项: 0
图片 UserChoiceLatest 被 WPS 占用: 0
jpg 当前默认: AppX43hnxtbyyps62jhe9sqpdzxn1790zetc
```

`.jpg`、`.png` 两张图真双击验证，拉起的都是 `Photos.exe`（`.png` 是当场用 `System.Drawing` 生成的 64×64 测试图，测完删除）。

---

## 三、预览窗格：这里我写错了一次

### 3.1 错误结论与被打脸的现象

我在解释“删了图片的预览登记”时，顺带断了一句“图片预览可能会显示没有可用的预览”。用户当场打开预览窗格反驳：**“预览我看这不是能看吗，你删了还是没删，给我绕晕了。”**

他是对的，我的断言没经过验证。重查之后结论是：图片预览一直能看，而且现在画它的不是 WPS。

### 3.2 预览处理器是什么（一句话版）

资源管理器右侧那块预览画面，是系统按扩展名去查一张“这种文件该找谁来画”的登记表，登记表里写的是一段别人提供的代码。WPS 当初把这些格子改成了“找 WPS 画”，我删掉的只是这几格改写；系统一看没人被指定，就动用自己内置的那套画图能力。

一句可以原样复述出去的断语：**登记被删了，能力还在。**

### 3.3 判据

```powershell
$ph = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'   # IPreviewHandler
# 图片上有没有指定预览器 → 全空，说明 WPS 那条已删
Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\.jpg\ShellEx\$ph"   # 无
# 那现在谁在画 → 图片类自带的缩略图组件
Get-ItemProperty 'Registry::HKEY_CLASSES_ROOT\SystemFileAssociations\image\ShellEx\{e357fccd-a995-4576-b01f-234630154e96}'
#   {C7657C4A-9F68-40fa-A4DF-96BC08EB3551}
Get-ItemProperty 'Registry::HKEY_CLASSES_ROOT\CLSID\{C7657C4A-9F68-40fa-A4DF-96BC08EB3551}\InprocServer32'
#   C:\WINDOWS\system32\PhotoMetadataHandler.dll
```

`.pdf` 的预览登记我**故意留着**（仍指向 WPS 的 `{d7ac9243-…}` → `pdfwspv.dll`），因为用户实测双击 PDF 是 Edge、预览用 WPS 正好，明确说“PDF 留着可以”。

**副作用要写清楚**：预览窗格这件事的表现形式是“看起来什么都没变”。以后如果怀疑清理没生效，不能拿预览窗格当证据，要看上面那两条注册表查询的结果。

---

## 四、webp 为什么设不成照片

### 4.1 现象：设置里“看不到”

清理之后，`.webp .heic .tif .tiff .ico .wbm` 双击会弹“选择打开方式”。用户查设置后说：**“是不是根本就没设置默认，我这边看不到。”**

他对了一半，而且对的那一半正是结论：**这几个扩展确实一个默认都没有**，不是我漏设：

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
  <Association Identifier=".heic" ... />  <Association Identifier=".ico" ... />
  <Association Identifier=".tif"  ... />  <Association Identifier=".tiff" ... />
```

这份 XML 只在**新建用户档案**时应用，对已有档案不生效，所以这台机器上从没落成 `UserChoice`。照片应用本身是支持这些格式的，manifest 里 `.webp .tif .tiff .ico .heic .heif .avif .jxl` 全在支持列表内——卡点纯粹在“谁来写这条默认”。

### 4.2 四条第三方写法全部失败

| 尝试 | 结果 | 证据 |
| --- | --- | --- |
| 官方接口 `IApplicationAssociationRegistration::SetAppAsDefault(AppX43…, .jpg)` | 拒绝 | `hr=0x80070005`（E_ACCESSDENIED） |
| 同接口对 `.webp` 用候选列表里的 ProgId / AUMID | 认为无关联 | `hr=0x80070483`（ERROR_NO_ASSOCIATION） |
| 用 PS-SFTA 的哈希算法写 `UserChoice`（照片 ProgId，`Hash=F6tbNSzJ8H0=`） | 被无视 | `AssocQueryString` 返回 `C:\WINDOWS\system32\OpenWith.exe "%1"`，实测双击弹出选择框（PID 15964） |
| 换成候选列表里那个照片 ProgId（`Hash=JEo3pEnQUac=`） | 同样被无视 | 又弹一次 OpenWith（PID 13896） |
| 写 `UserChoiceLatest`（照片 ProgId + 同一份哈希） | 同样被无视 | 再弹 OpenWith（PID 7776） |

为了排除“是不是照片这个 AppX 身份对 `.webp` 无效”这个干扰变量，换了一个纯 Win32 的处理器 `MSEdgeHTM` 再试一次，写进去 `Hash=1u373tKrd5M=`，`AssocQueryString` 仍然返回 OpenWith。**这才是决定性一步**：连 Edge 这种普通 ProgId 都不被认，说明问题在哈希校验，不在 AppX 解析。

顺带一个观察：手写 `UserChoice` 之后系统并没有把键删掉，值还在那儿，只是被无视。所以“键存在”不能当证据，必须实测。

### 4.3 反推 WPS 那份哈希：没推出来

既然 WPS 写的 `UserChoiceLatest` 系统认，那它的哈希是不是就是公开那套 v1 算法？拿它自己的数据做反推校验——已知扩展名、SID、ProgId、键写入时间（精确到分钟），用 PS-SFTA 的 `Get-Hash` 逐个试：

```
精度 3 种（分钟 / 秒 / 100ns）× 体验字符串 2 种（shell32.dll 提取 / 空）× ProgId 2 种（Latest 里的 / UserChoice 里的）
= 每个扩展 12 组，共 6 个扩展 60 组
.wbm   NO MATCH (stored=V+Y+K1wyaK8=)
.docx  NO MATCH (stored=aqF5Nn9acis=)
.rtf   NO MATCH (stored=5rM04RNT+5Q=)
.epub  NO MATCH (stored=0wwNXNOxAAs=)
.ofd   NO MATCH (stored=kP9BQxTfMJg=)
.mobi  NO MATCH (stored=yJYuCDZEnu8=)
```

60 组全部不匹配。同时确认了输入参数本身没问题：从 `SysWOW64\shell32.dll` 和 `System32\shell32.dll` 提取到的体验字符串都是 `User Choice set via Windows User Experience {D18B6DD5-6124-4341-9318-804003BAFA0B}`，与硬编码值一致。

**这是一个否定结论，按三组信号交**：

| 信号 | 内容 |
| --- | --- |
| 正向对照 | 只证明“代码确实跑了”：同一份 `Get-Hash` 被成功调用并产出 60 个互不相同的候选值；它对 `.webp` 产出的那个哈希确实落进了注册表（`F6tbNSzJ8H0=`，可回查键值） |
| 负向结果 | 60 组候选与 6 个真实存储值无一相等 |
| 排除干扰 | 输入项（SID、ProgId、时间戳、体验字符串）逐项打印核对过，时间戳换算用的就是键自己的 `LastWriteTime`，不是猜的 |

**这条否定结论的强度要说明白**：正向对照只证明函数执行过，没证明算法在这版本上仍然有效。所以 60 组不匹配有两种解释——新层用了另一套算法，或者公开算法整体已过期。4.2 那四次失败（连 Win32 的 `MSEdgeHTM` 都不认）同样指向“这条路走不通”，两种解释都不影响结论，但别把它当成“我已经破解了新算法”。

所以只能得到一句老实话：**`UserChoiceLatest` 用的是另一套校验，我没复现出来**。WPS 是怎么拿到被系统承认的哈希的，这一条是推断范围之外，我不编。

### 4.4 唯一可行的修法

- 首次双击该格式 → 选照片 → 勾「始终使用此应用」；或
- 设置 → 应用 → 默认应用 → 按文件类型设置默认值 → 逐个选照片。**不要**在照片应用页点“设为默认值”：照片的 manifest 里声明了 76 种扩展名，含 `.svg`、`.mp4`、`.mov`、`.wmv`、`.mkv`，那个按钮会一次性把 76 种全部改给照片。

**副作用要写清楚**：这条限制是双向的。以后任何“帮你把默认应用改回来”的工具（包括我写的 `clean.cmd`）都只能**删掉别人的劫持**，不能替你指定新默认；删完是“没有默认”，表现成弹选择框，看起来像没修好。

---

## 五、左侧那个「河北大学」是什么

清理过程中我提过一句“资源管理器还加载着 WPS 的 shell 扩展”，用户对着截图问：是不是就是导航栏里多出来的「河北大学」？

是它，但它跟图片无关。查出来的定义：

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

它是 WPS 云盘（企业/教育版空间）钉在导航栏的一个入口，本体就是那个本地缓存文件夹。同时 `explorer.exe` 里确实加载着 WPS 的模块：

```
C:\WPS\WPS Office\12.1.0.28022\office6\qingnse64.dll
C:\WPS\WPS Office\12.1.0.28022\office6\qingshellext64.dll
C:\WPS\WPS Office\12.1.0.28022\office6\kbaseconfigcenter64.dll
C:\WPS\WPS Office\12.1.0.28022\office6\addons\kpluginconfigcenter\kpluginconfigcenter64.dll
```

想只隐藏入口，删那条 HKCU 的 `NameSpace` 子键即可（不需要管理员，WPS 里再点一次“在资源管理器中打开”就会重新钉上）。用户决定保留。

---

## 六、从零照抄：自己清一遍 WPS 图片接管

顺序不能乱：先确认现象，再删新层，最后才拆注册身份。

1. **确认到底谁在开图**（先看真实解析，别先看设置页）

   ```powershell
   (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg\UserChoice').ProgId
   (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg\UserChoiceLatest\ProgId').ProgId
   ```

   两条不一致，且第二条是别家程序 → 就是本章这种情况。

2. **备份**（可选但建议）

   ```cmd
   reg export "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts" fileexts-backup.reg /y
   ```

3. **删被劫持的新层**，一个扩展试通再批量：

   ```powershell
   Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.jpg\UserChoiceLatest' -Recurse -Force
   ie4uinit.exe -show
   ```

4. **卸载 Appx 扩展**（普通权限即可）：

   ```powershell
   Get-AppxPackage -Name 'wpsappext*' | Remove-AppxPackage
   ```

5. **删 HKCU 侧登记**（普通权限）：`Software\Classes\<ext>\ShellEx\{8895b1c6-…}`、`Software\Classes\Applications\photolaunch.exe`、`ApplicationAssociationToasts` 里的 `WPS.PIC_*`、`OpenWithList` 里的 photolaunch 并同步改 `MRUList`。

6. **删 HKLM 侧登记**（需要管理员）：`WPS.PIC.*` 全部类、`Applications\photolaunch.exe`、图片扩展的 `ShellEx\{8895b1c6-…}`、`PreviewHandlers` 里三个打包条目、`kingsoft\Office\6.0\wpsoffice\Capabilities\FileAssociations` 里的图片项。

7. **验证**：真双击一张 `.jpg` 和一张 `.png`，看进程名；再核对计数全为 0。

8. **补默认**：`.webp`、`.heic`、`.tif`、`.tiff`、`.ico` 这五个没有脚本路径，只能到设置里手点（第四章）。

---

## 七、命令速查

```powershell
# Shell 眼里某扩展的真实打开命令（ASSOCSTR_COMMAND=1 / EXECUTABLE=2 / FRIENDLYAPPNAME=4）
Add-Type -TypeDefinition '<P/Invoke Shlwapi!AssocQueryString>'   # 见正文 3.3
[AssocQ]::Query(1, '.jpg')

# 注册表键的写入时间（PowerShell 不直接给）
Add-Type -TypeDefinition '<P/Invoke advapi32!RegOpenKeyEx + RegQueryInfoKey>'
[RegTime]::GetLastWrite($true, 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.wbm\UserChoiceLatest')

# 照片应用的 ProgId / AUMID / 支持格式
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

## 八、一句话总结

Win11 25H2 的默认应用其实存了两层，WPS 只写新层所以设置页看不出来；把新层和 46 个文件类、3 个 Appx 扩展、8 处预览登记一起拆掉，图片就回到照片——但想让脚本顺手把 webp 也设成照片是不可能的，那一层现在只有系统自己写得进去。
