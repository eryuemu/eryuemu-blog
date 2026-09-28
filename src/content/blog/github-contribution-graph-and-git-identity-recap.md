---
title: 'GitHub 头像不显示、贡献排名和绿格子：三套独立机制与各自修法'
description: '排查"贡献没算上"这类问题的完整记录。它看着像一个 bug，实际是三套互不相干的机制：一是 git 身份与邮箱（三层配置优先级 仓库级>全局>系统级，git 完全不校验邮箱真假，实测无配置时 fatal: 无法自动探测邮件地址（得到 eryuemu@fedora-xx14.(none)）；GitHub 只按"提交邮箱是否在账号已验证白名单"判定归属，因此 noreply 天然可认、example.com 永远进不去、253450470+ 那串数字 ID 是为防止用户名被回收后冒领历史提交）；二是仓库 Insights→Contributors 排名（读 /stats/contributors 预计算缓存、排除 merge 提交，与实时的 /contributors 同一时刻分别返回 1 和 15，?b=1 强刷无效）；三是个人主页绿格子（官方准入条件 email matches account; repo not forked; branch is default or gh-pages; 卡住的是 repo not forked——13 条提交诞生在 fork 里，即使经 PR 合并进上游 main 也永不计入，因为 GitHub 记的是"第一次收到这块数据的仓库"而非"它现在存在于哪些仓库"）。含一次真实改历史：git 2.55 已删除 filter-branch，改用 git-filter-repo 的 mailmap 重写 HBU-Wiki 134 条提交中的 46 条假邮箱，推送前用文件树 SHA 3474d9c95626ed5d135da341964f26a4bfd297c9 不变证明内容零改动，用 --force-with-lease 推送，并给出协作者必须执行的 reset 命令。最后用 git config --show-origin 取证为什么只有 wiki 中招：同期 Colorful-Keyboard（07-14/07-15/08-17）与 blog 的提交全部正常，说明假邮箱是某个 AI 工具只写进了 wiki 的 .git/config，仓库级覆盖了正常的全局。'
pubDate: '2026-09-28T15:05:00+08:00'
category: '开发'
type: 'ai-organized'
---

# GitHub 头像不显示、贡献排名和绿格子：三套独立机制与各自修法

> **起因**：给河北大学课程表项目推了 13 个提交、PR 已合并进上游 `main`，回头发现 GitHub 上三处数字全对不上，另外自己的 wiki 仓库里有 46 条提交头像是灰色默认图。
> **涉及仓库**：`GZHback/HBUschedule`、`eryuemu/HBU-Wiki`（134 条提交）、`eryuemu/eryuemu-blog`、`eryuemu/Colorful-Keyborad-Led-Color-Setting`
> **环境**：git 2.55.0 · Fedora 原生 Linux · gh CLI（OAuth device flow）· Astro 博客
> **核心结论**：这不是一个 bug，是**三套互不相干的机制**。它们各自的数据源、缓存周期、准入规则都不同，症状却长得很像，所以容易一次踩三个坑。下面按这三个问题分开讲。

---

## 💡 速览

| 问题 | 真实原因 | 修法 |
| --- | --- | --- |
| 提交头像灰色 | 提交邮箱不在 GitHub 账号的**已验证白名单**里 | 把那个邮箱加进账号并验证；已发生的历史要么改邮箱重写，要么不管 |
| 仓库 Contributors 排名数字不对 | 读的是 `/stats/contributors` **预计算缓存**，且排除 merge 提交 | 别信图，用实时接口查；有 push 活动才会触发重算 |
| 个人主页绿格子不涨 | 官方规则要求 **`repo not forked`**，那 13 条诞生在 fork 里 | 以后直接在**非 fork 的上游仓库**开分支干活 |

---

# 一、第一个问题：头像为什么不显示

## 1.1 现象

`HBU-Wiki` 仓库的提交列表里，46 条提交显示灰色默认头像，点不进任何人的主页。

另外 `GZHback/HBUschedule` 上那 13 条命令行提交，在绑定邮箱之前其实也没被归属——不过这不是我观察到的，是事后从数字变化反推的：绑定前 `/contributors` 返回 `eryuemu 2`（只有两次网页编辑），绑定后变成 `15`。中间多出来的 13 个正是命令行提交，说明它们此前处于未归属状态。

## 1.2 原理：git 侧和 GitHub 侧各管一半

这件事必须拆成两半看，混在一起就想不通。

### ① git 侧：身份是三层配置，而且它完全不校验邮箱

git 生成提交时按这个顺序找 `user.name` / `user.email`，**上层存在就完全屏蔽下层**：

```text
1. 仓库级   <repo>/.git/config
2. 全局     ~/.gitconfig
3. 系统级   /etc/gitconfig
```

关键认知：**git 里的 `user.email` 就是自报家门，填 `林肯@白宫` 它照样生成提交**。它不知道、也不关心这个邮箱是不是真的。

想看清某条配置到底从哪层生效，用 `--show-origin`——这是排查身份问题最有用的一个参数：

```bash
git config --show-origin --get user.email
# file:.git/config                       eryuemu1213@qq.com                 ← 仓库级在覆盖
# file:/home/eryuemu/.gitconfig          eryuemu@users.noreply.github.com   ← 删掉仓库级之后
```

### ② GitHub 侧：只认「已验证邮箱白名单」，不做任何字符串匹配

GitHub 给每个账号维护一张邮箱清单，归属判定只有一条规则：

> **提交里的 author 邮箱出现在某个账号的已验证清单里 → 算那个人的；否则就是陌生人。**

它**不看用户名、不看 `user.name` 显示名、不做前缀匹配**。所以 `eryuemu@example.com` 里那个 `eryuemu` 跟登录名一模一样，也毫无意义。

正因为 git 侧不校验，GitHub 侧才必须校验——否则任何人都能把自己写成别人的邮箱刷进别人主页。**"必须是已验证邮箱"本身就是防伪机制。**

## 1.3 逐个答疑

### Q1：`eryuemu@users.noreply.github.com` 是什么？为什么它天然就能识别？

GitHub **自己发给你的**地址。注册那一刻就生成并预绑定，因为 `users.noreply.github.com` 这个域名归 GitHub 所有，而 `eryuemu` 这个前缀只有你占着——所以它不需要收验证邮件，归属关系是它自己造的。

它的用途是：让你提交代码时不必公开真实邮箱。

### Q2：`253450470+eryuemu@users.noreply.github.com` 前面那串数字是什么？为什么要加？

`253450470` 是账号的**数字 ID**（`gh api user --jq .id` 可查）。

早期格式是纯 `login@users.noreply.github.com`，后来改成 `ID+login@...`，原因是**用户名可以改、可以释放、可以被别人注册走**，而数字 ID 永久唯一。若只用用户名，哪天你把 `eryuemu` 这个名字让出去，接手的人就凭空继承了你历史上所有提交的归属。加上 ID 前缀，这个地址就永久钉死在你的账号上，与叫什么名字无关。

两种格式 GitHub 目前都认，所以历史上那批旧格式提交归属一直正常。

### Q3：`eryuemu@example.com` 为什么不能识别？

两层原因叠加：

1. 它不在你账号的白名单里，GitHub 也不认那个前缀（见 1.2 的"不做字符串匹配"）。
2. 它**永远进不了白名单**。`example.com` 是 IANA 保留的示例域名，全世界都无法注册，邮件永远寄不到，所以"发验证邮件 → 点链接"那一步在物理上不可能完成。

那它是怎么出现在提交里的？因为 **git 不校验**，任何工具随手编一个格式合法的字符串就能提交。AI 编码工具发现 git 没有身份配置时，习惯给自己造一个 `用户名@example.com`。

### Q4：如果仓库级删掉、全局也没设，那算哪个邮箱？

**哪个都不算——提交根本不会发生。** 实测：

```bash
git init && echo x > a.txt && git add a.txt && git commit -m test
```

```text
作者身份未知

*** 请告诉我您是谁。

运行

  git config --global user.email "you@example.com"
  git config --global user.name "Your Name"

来设置您账号的默认身份标识。
如果仅在本仓库设置身份标识，则省略 --global 参数。

致命错误：无法自动探测邮件地址（得到 'eryuemu@fedora-xx14.(none)'）
```

注意最后一行：git **确实尝试了自动探测**，用"系统用户名 + 主机名"拼出 `eryuemu@fedora-xx14.(none)`。但主机没有完整域名，结尾是 `(none)`，这值明显不可用，于是 git **拒绝采用，直接 fatal 退出**。结果是 **0 个提交**——不是提交成了奇怪身份，是压根没生成。

### Q5：那这种情况下还能 push 吗？

能。必须把两个动作分开：

| 动作 | 需要 git 身份吗 | 实际需要什么 |
| --- | --- | --- |
| `git commit` | **需要**（身份要写进提交对象） | 三层配置里至少有一层 |
| `git push` | **不需要**，只是传已有提交对象 | 认证凭据（gh 的 credential helper） |
| GitHub 网页端编辑 | 不需要你本地身份 | GitHub 服务器用你账号邮箱替你提交 |

顺带纠正一个我自己踩过的判断错误：wiki 里有 44 条提交用 `3419144842@qq.com`，我一度以为"这不是 noreply，那肯定是 GitHub 网页端编辑"。**错**——44 条里只有 3 条真是网页编辑。

区分方法是看 **committer**：网页端编辑由 GitHub 服务器代提交，`committer.email` 是 `noreply@github.com`；本地提交则 author 与 committer 一致。

```bash
gh api "repos/eryuemu/HBU-Wiki/commits?per_page=100" \
  --jq '.[] | select(.commit.committer.email=="noreply@github.com") | "\(.commit.author.date[0:16])  \(.commit.message|split("\n")[0])"'
# 2026-08-12T14:01  Update professional data section in README
# 2026-08-13T10:20  Remove future plans from README
# 2026-09-20T05:51  删除readme中"当前内容"时效性板块
```

只有这 3 条。剩下 41 条 author=committer=`3419144842@qq.com`，是**轻薄本上配置的本地 git 身份**（真实邮箱，已绑定账号，所以归属一直正常）。

**教训：判断"提交从哪来"，光看 author 邮箱不够，必须 author + committer 一起看。**

### Q6：那轻薄本为什么是 `3419144842@qq.com`？也是配出来的吗？

是配置的，而且有独立证据能证明这个邮箱的身份：**那 3 条真正的网页端编辑，author 就是 `3419144842@qq.com`**。网页端编辑由 GitHub 服务器代提交，它只能用你 GitHub 账号里登记的邮箱——所以这个地址必然就是你账号的登记邮箱。

轻薄本当初大概率是照着 GitHub 官方那个 "Set up Git" 引导页配的，那个页面会**把你的账号邮箱预填进命令里**：

```bash
git config --global user.name  "eryuemu"
git config --global user.email "3419144842@qq.com"   # ← 页面按你的账号自动填好
```

复制粘贴执行完，这台机器的身份就等于账号邮箱。所以"轻薄本用 3419"不是巧合，也不是工具乱写。

### Q7：到底怎么控制这次用 3419、下次用 noreply？是不是就是邮箱填得不一样？

命令行提交——**对，就是字面意思，填什么就是什么**。`git config user.email` 后面写什么字符串，提交里就记什么，git 不校验、不猜、不去查你的 GitHub 账号。两条命令地位完全平等：

```bash
git config --global user.email "3419144842@qq.com"                # 要 3419 这个身份
git config --global user.email "eryuemu@users.noreply.github.com" # 要 noreply 身份
```

**noreply 不是某种特殊身份，它只是一个恰好被 GitHub 预先绑定好的邮箱地址。** 三者的真实差别只在"GitHub 认不认"和"要不要暴露真实邮箱"：

| 填进去的邮箱 | 是否归属 | 代价 |
| --- | --- | --- |
| `eryuemu@users.noreply.github.com` | ✅ 认（GitHub 预绑定） | 无，且不暴露真实邮箱 |
| `3419144842@qq.com` | ✅ 认（手动绑定+验证过） | 真实邮箱永久留在公开提交记录里，可被爬虫收集 |
| `eryuemu@example.com` | ❌ 不认 | 头像灰、不算贡献，且永远修不好 |

既然两个都能正常归属，选哪个实际只决定一件事：**要不要在公开仓库暴露真实邮箱**。

但有一个入口**不归 `git config` 管**，这才是"同一个人身上有时 3419 有时 noreply"的真正原因：

| 提交方式 | 身份由谁决定 |
| --- | --- |
| 命令行 `git commit` | 你 `git config` 里填的那个，随便填 |
| GitHub 网页端编辑 / 网页上点 merge | GitHub 账号设置里的 **Keep my email addresses private** 开关，`git config` 管不着 |

这个开关关掉（默认）时，网页操作用你的真实账号邮箱；打开后改用 `253450470+eryuemu@users.noreply.github.com`，GitHub 的原话是：

> We'll remove your public profile email and use `253450470+eryuemu@users.noreply.github.com` when performing **web-based Git operations** (e.g. edits and merges) and sending email on your behalf.

所以两条路各用各的配置，同一个人出现多种邮箱完全正常——只要这些邮箱都在你账号的白名单里，归属就不会丢。

**想按项目固定用不同身份**，别靠手动改，用条件包含，按目录自动切换：

```ini
# ~/.gitconfig
[includeIf "gitdir:~/project/hbu/"]
    path = ~/.gitconfig-hbu
```

`~/.gitconfig-hbu` 里写那套身份即可。比逐个仓库 `git config` 可靠，也不会在被工具偷偷覆盖后自己还没发现。

### Q8：`noreply` 是不是 git 的默认值？不设置就会自动用它？

**不是。git 没有任何默认邮箱，noreply 必须你自己写进配置，不写就没有。**

不设置时 git 的兜底动作是**探测「系统用户名 + 主机名」**，这台机器上实测得到的是：

```text
致命错误：无法自动探测邮件地址（得到 'eryuemu@fedora-xx14.(none)'）
```

注意两点：一是它拼出来的是 `用户名@主机名`，跟 `users.noreply.github.com` 毫无关系——**那是 GitHub 的域名，git 根本不知道它存在**；二是主机没有完整域名时结尾是 `(none)`，git 认为这个值不可用，于是**直接 fatal 拒绝提交**（见 Q4），而不是"退而求其次用个默认值"。

那为什么很多人第一次配就是 noreply、看起来像系统自带？因为 **GitHub 官方的 "Set up Git" 引导页会推荐并预填 noreply 地址**，你复制粘贴执行完，它就成了你的配置。来源是引导页，不是 git。

### Q9：「可以填 noreply，也可以填 3419 这种认证过的」——这个理解对吗？

对，但要把两层意思分开，否则容易踩坑：

```text
git 层面    ：user.email 是自由字符串，填什么都行，它不校验、不拦你
GitHub 层面 ：只有账号白名单里的邮箱才会被认成"你"
```

| 你填的 | git 让不让填 | GitHub 认不认 | 结果 |
| --- | --- | --- | --- |
| `eryuemu@users.noreply.github.com` | ✅ | ✅ 预绑定 | 归属正常，且不暴露真实邮箱 |
| `3419144842@qq.com` | ✅ | ✅ 手动绑定+验证过 | 归属正常，真实邮箱公开可见 |
| `eryuemu@example.com` | ✅ 照样能提交能推 | ❌ | 头像灰、不算贡献，代码一切正常 |

最后一行是这个坑最隐蔽的地方：**正因为 git 不拦，那 46 条假身份提交一路 commit、push、合并全部成功，过程中没有任何报错**，只有头像和统计会悄悄漏掉。等发现时已经攒了 46 条。

实操上记一句就够：**填 noreply，或者填你确定已经绑定并验证过的邮箱**；两者都能正常归属，区别只在要不要把真实邮箱撒进公开仓库。

### Q10：为什么只有 wiki 中招？同期用同一个工具做的其他项目没事？

这是最有价值的一问，它能区分"全局配错"还是"单仓库配错"。取证过程见 1.4。

## 1.4 取证：为什么受影响面恰好是一个仓库

先把 wiki 的 134 条提交按作者邮箱归类：

```text
46  eryuemu@example.com                 ← 假身份
44  3419144842@qq.com                   ← 轻薄本的本地身份（仅 3 条是网页编辑）
39  eryuemu@users.noreply.github.com    ← 正常命令行
 5  3251711961@qq.com                   ← 合作者
```

按月份交叉：

| 月份 | 3419（轻薄本） | example.com（假） | noreply（命令行） | 合作者 |
| --- | --- | --- | --- | --- |
| 2026-04 | 1 | — | — | — |
| 2026-06 | 40 | — | — | — |
| 2026-07 | — | 3 | — | — |
| 2026-08 | 2 | **43** | 17 | — |
| 2026-09 | 1 | — | 22 | 5 |

8 月的逐日分布（带提交条数）才是真相：

```text
08-11  假 ×5
08-12  假 ×23   网页 ×1
08-13  假 ×8    网页 ×1
08-14  假 ×3
08-15  假 ×2
08-20  假 ×2
        ← 08-21 ~ 08-27 整整一周，一条提交都没有
08-28  noreply ×2
08-29  noreply ×15
09 月  全是 noreply（混着合作者的 5 条和网页端编辑）
```

**假身份与 noreply 从未在同一天并存过**，是干净的前后两段。上面那张月度表格里 8 月同时出现"假 43 / noreply 17"，只是因为 8 月这个月**横跨了切换点**，并不代表两套环境同时在跑——查身份问题必须按天看，按月聚合会掩盖切换点。

同一天里唯一混进来的另一种身份（08-12 14:01、08-13 10:20 那两条）正是上面查出的**网页端编辑**——committer 是 `noreply@github.com`，由 GitHub 服务器代提交，跟本地配置无关，所以不构成"两套环境并存"的反例。

### 同期其他仓库取证：为什么只有 wiki 中招

再查同期用同一个工具做的其他仓库：

```text
eryuemu/Colorful-Keyborad-Led-Color-Setting
  20  68362682+moshuiD@users.noreply.github.com   （原作者）
  12  eryuemu@users.noreply.github.com            ← 我的提交，全部正常
   3  3419144842@qq.com
   我的提交日期：2026-07-14、2026-07-15、2026-08-17
```

**这三条日期全部落在 wiki 使用假身份的时间窗内，但它们是正常的 noreply。**

所以那台 Windows 机器的**全局配置从头到尾都是对的**。假邮箱是某个 AI 工具**只写进了 wiki 那个仓库的 `.git/config`**，按 1.2 的优先级规则，仓库级把正常的全局屏蔽掉了。受影响面恰好等于"被那个工具打开过的那一个仓库"。

### 那一周空窗在干什么：刷装 Ubuntu 双系统

那么 08-21 ~ 08-27 这一周空窗、以及 08-28 身份突然恢复正常，是什么动作造成的？日期证据来自自己写的另一篇装机复盘：

```bash
grep pubDate src/content/blog/colorful-laptop-no-usb-dual-boot-recap.md
# pubDate: '2026-08-23T22:54:00+08:00'   updatedDate: '2026-08-24T01:00:00+08:00'
```

**Ubuntu 26.04 双系统是 8 月 23–24 日装的**，正好落在那一周中间。完整的环境迁移链条：

| 时间 | 机器 / 系统 | 工具 | wiki 提交用的邮箱 |
| --- | --- | --- | --- |
| 4/29 ~ 6/27 | 轻薄本 · Windows | Antigravity（命令行本地提交） | `3419144842@qq.com` |
| 7-05 前后 | 换到游戏本 · Windows（配环境、WSL2） | 装 Antigravity | 7-04 起转成假身份 |
| 7-04 ~ 8-20 | 游戏本 · Windows | Antigravity | **`eryuemu@example.com`** |
| 8-23 ~ 8-24 | **游戏本刷装 Ubuntu 26.04 双系统** | — | 空窗，无提交 |
| 8-28 起 | 游戏本 · Ubuntu | 命令行 git | `eryuemu@users.noreply.github.com` |

把三套环境的身份并排列出来，问题的孤立性就一目了然：

| 环境 | 生效身份 | 是否绑定账号 | 结果 |
| --- | --- | --- | --- |
| 轻薄本 · Windows | `3419144842@qq.com` | ✅ | 归属正常 |
| 游戏本 · Windows（全局） | `eryuemu@users.noreply.github.com` | ✅ | 归属正常 |
| 游戏本 · Windows（**仅 wiki 仓库级**） | `eryuemu@example.com` | ❌ 无法绑定 | 46 条无头像 |
| 游戏本 · Ubuntu | `eryuemu@users.noreply.github.com` | ✅ | 归属正常 |

也就是说：**同一款工具在三台/套环境里有两次是正常的，只在游戏本的 wiki 那一个仓库上写出了假身份**。所以不能笼统说"Antigravity 会污染 git 配置"，准确说法是"它曾在那一个仓库里写过一条仓库级配置"——具体是版本差异还是某次会话的偶发行为，已经无从考证，但影响面可以确定：**只有一个仓库**。

**机制**：换系统后是在新环境里**重新克隆**的 wiki。新克隆的 `.git/config` 从零生成，Antigravity 当初写进去的那条仓库级假邮箱自然不存在了，于是 git 回落到正常的全局配置，身份当场恢复。

> **一个排查教训**：这一段我先前写反过——当时只凭"9 月才装 Ubuntu"的口头记忆，就下了"恢复发生在 Windows 时期、与换系统无关"的结论。但自己的博客里就有带 `pubDate` 的装机复盘，一查便知是 8/23。**查自己的历史别靠记忆，去翻提交记录和文章日期。**

**通用教训**：AI 编码工具会自己写 git 配置。定期用 `git config --show-origin --get user.email` 检查每个仓库，比事后改历史省事得多。

## 1.5 头像不显示的完整原因清单

1. 提交邮箱没绑定到任何 GitHub 账号 —— 最常见。
2. 绑定了但**未完成验证**（账号邮箱列表显示 Pending）。QQ 邮箱的验证邮件常进垃圾箱。
3. 改了配置但**没改历史** —— 新提交正常，老提交仍是旧邮箱，头像不会追溯变回来。
4. 仓库是 fork、提交在 fork 里产生 —— 头像可以正常显示，但**不计入绿格子**。这是另一套规则，别和前三条混淆（见第三部分）。

## 1.6 修法

**治将来**：给机器设一次全局身份，用已绑定 GitHub 的邮箱。

```bash
git config --global user.name  "你的名字"
git config --global user.email "已绑定GitHub的邮箱"
```

**治已发生的历史**：重写作者邮箱。完整过程记在第二部分末尾（和 Contributors 的问题一起处理更省事）。

---

# 二、第二个问题：仓库 Contributors 排名不对

## 2.1 现象

`GZHback/HBUschedule` 的 Insights → Contributors 显示：

```text
Contributions per week to main, excluding merge commits

GZHback   #1   2 commits
eryuemu   #2   1 commit
```

而实际上我有 16 条提交归属到自己名下。

## 2.2 Q：为什么同一个仓库，两个接口给出的数字不一样？

因为它们根本不是同一套东西。实测同一时刻：

```bash
# 实时接口：当场遍历提交算
gh api repos/GZHback/HBUschedule/contributors --jq '.[]|"\(.login) \(.contributions)"'
# eryuemu 15
# GZHback  3

# 图页面用的接口：预计算缓存
curl -s -H "Authorization: Bearer $(gh auth token)" \
  https://api.github.com/repos/GZHback/HBUschedule/stats/contributors
# eryuemu 1
# GZHback 2
```

**【原理】** `/contributors` 是实时的；`/stats/contributors` 是一份**预计算缓存**，GitHub 按自己的周期批量重算。那次实测返回 HTTP 200 而不是 202（202 表示"正在计算中"），说明 GitHub 认为这份缓存仍然有效，于是图页面一直显示旧快照。

从数字还能反推出缓存的计算时刻：合并前 `main` 上只有合作者 2 条非合并提交（第三条是 merge commit，被规则排除），我应该是 0；缓存里我是 1，说明它算进了我在网页上改 README 的第一次编辑，但**没算进那 13 条命令行提交**——因为快照生成时，那些提交的作者邮箱还没绑定到账号。

## 2.3 Q：那行 `excluding merge commits` 是什么意思？

Insights 的 Contributors 图**不计 merge 提交**。所以合作者的 `3251711961@qq.com` 在实时接口里是 3 条（含一条 `Merge branch 'main'`），在这张图里是 2 条。看这张图时得把这条规则算进预期。

## 2.4 Q：`?b=1` 强制刷新为什么没用？

社区流传在图 URL 后加 `?b=1` 能强制重算。实测无效，数字纹丝不动。

真正让统计更新的动作是**仓库有新活动**。后来给 wiki 做 force push 之后，那张图才跟着变。所以别指望 URL 参数，也别为了刷图去推空提交。

## 2.5 修法

看真实数字用接口，别看图：

```bash
gh api repos/<owner>/<repo>/contributors --jq '.[]|"\(.login) \(.contributions)"'
```

图会自己慢慢追上。

## 2.6 实战：把 46 条假身份提交改回来

wiki 那 46 条既是头像问题也是排名问题，一起处理。

### 第一步就撞墙：`filter-branch` 已被删除

```bash
git filter-branch --env-filter '...'
# git：'filter-branch' 不是一个 git 命令。参见 'git --help'
```

**git 2.55.0 已经把内置的 `filter-branch` 移除**（废弃多年后正式下架）。官方替代品是独立项目 `git-filter-repo`，单文件 Python 脚本。

### 用 mailmap 重写

```bash
git clone https://github.com/eryuemu/HBU-Wiki.git && cd HBU-Wiki

printf 'eryuemu <eryuemu@users.noreply.github.com> <eryuemu@example.com>\n' > /tmp/mm.txt
git-filter-repo --mailmap /tmp/mm.txt
```

mailmap 格式是 `正确名字 <正确邮箱> <要匹配的名字 <原邮箱>>`，会同时改 author 和 committer。

### 推送前必须做的两个校验

改历史最怕"顺手改了内容"。两条命令把它钉死：

```bash
git rev-list --count main     # 134，提交数不能变
git rev-parse main^{tree}     # 3474d9c95626ed5d135da341964f26a4bfd297c9
```

把 `main^{tree}` 与改前的值对比——**文件树 SHA 一致就证明所有文件内容一个字节都没动**，改的纯粹是提交元数据。这是改历史唯一可信的安全证明。

### 用 `--force-with-lease`，不要用裸 `--force`

```bash
CUR=$(git ls-remote https://github.com/eryuemu/HBU-Wiki.git refs/heads/main | cut -f1)
git push --force-with-lease=main:$CUR https://github.com/eryuemu/HBU-Wiki.git main
```

`--force-with-lease` 会先核对远端当前 SHA 是否等于你预期的值，不等就拒绝推送。裸 `--force` 会直接覆盖，万一这期间别人推了新东西就无声丢掉。

### 协作者必须做的动作（最容易漏）

git 改历史不是"只改那几条"，而是**从第一条被改的提交开始，所有后代提交的 SHA 全部重算**。查时间线就知道影响面：

```text
2026-07-04   最早的假身份提交          ← 从这里开始全变
2026-09-12 ~ 09-20   合作者的 5 条提交  ← 在后面，SHA 也会被改掉
```

合作者本地会显示"和远端分叉""我有 5 个提交没推上去"。必须提前通知他执行：

```bash
git fetch origin
git reset --hard origin/main
```

或者删掉重新克隆。**不提醒的话，他会以为自己丢了东西。**

### 验证

```bash
gh api "repos/eryuemu/HBU-Wiki/commits?per_page=100" --jq '.[].commit.author.email' | sort | uniq -c
# 85  eryuemu@users.noreply.github.com
# 44  3419144842@qq.com
#  5  3251711961@qq.com
```

抽查原来没头像的提交：

```text
7c0cc6c  login=eryuemu  fix(router): 规范化 Vercount 统计 URL…
79d618a  login=eryuemu  feat: 启用 cleanUrls…
96da3a8  login=eryuemu  fix(seo): 用 titleTemplate 修复页面 title…
```

`author.login` 不再是 null，归属生效。汇总图当时还显示"未归属 46"——那是缓存，等重算。

---

# 三、第三个问题：个人主页绿格子不涨

## 3.1 现象

13 条命令行提交 + PR 合并进上游，当天绿格子只算 3 个。

用 GraphQL 读权威数据，比数格子准：

```bash
gh api graphql -f query='{user(login:"eryuemu"){contributionsCollection(
  from:"2026-09-24T00:00:00Z",to:"2026-09-29T23:59:59Z"){
    contributionCalendar{weeks{contributionDays{date contributionCount}}}
    commitContributionsByRepository(maxRepositories:25){
      repository{nameWithOwner} contributions{totalCount}}}}}'
```

```text
day 2026-09-25 = 3
day 2026-09-27 = 2
day 2026-09-28 = 4
repo GZHback/HBUschedule = 3
repo eryuemu/dialogue-to-blog-skill = 1
repo eryuemu/eryuemu-blog = 1
```

16 条归属提交，只算 3。而这 3 条全部是**直接发生在上游仓库 `main` 上**的动作：合并 PR 产生的合并提交、两次网页端编辑 README。那 13 条命令行提交一条都没算。

## 3.2 Q：准入规则到底是什么？

GitHub 文档里那段条件的原文：

```text
Commits appear if: email matches account; repo not forked;
branch is default or gh-pages;
plus one of: collaborator, member, forked, or PR/issue opened.
```

四组条件必须同时满足。逐条对照我的情况：

| 条件 | 我的情况 |
| --- | --- |
| email matches account | ✅ 已绑定并验证 |
| **repo not forked** | ❌ **卡在这里** |
| branch is default or gh-pages | ✅ 最终在 `main` |
| collaborator / member / forked / PR opened | ✅ 我是上游协作者且开了 PR |

## 3.3 Q：什么叫「提交诞生在哪个仓库」？它合并进上游了还不算吗？

不算。这是最容易绕晕的一点，因为一条提交在 git 里就是一块数据（一个 SHA），**同一块数据可以同时存在于 fork 和父仓库，两边 SHA 完全一致**——PR 合并干的就是这件事。所以"这条提交在哪个仓库"，git 本身答不了。

GitHub 定的规则是：**它第一次在哪个仓库收到这块数据，就认定这块数据诞生于那个仓库。**

当时的操作是 `git push origin feat/android-app`，而 `origin` 指向 `eryuemu/HBUschedule`——**一个 fork**。于是这 13 条被永久标记为"fork 里产生的提交"。后来 PR #2 把它们复制进非 fork 的父仓库 `GZHback/HBUschedule` 的 `main`，父仓库里确实有了它们，但 GitHub 不重问"你现在人在哪"，只认当初那条出生记录。

打个比方：户籍在 A 市，去 B 市干活、成果也算进 B 市项目，但统计"你为 B 市出了多少力"时按户籍算。想算上，得让**人第一次出现就在 B 市**。

## 3.4 Q：那 46 条改完历史，为什么补的不是今天的格子？

因为**改历史只替换作者邮箱，提交日期原样保留**。那 46 条是 7 月和 8 月的提交，所以涨的是七、八月那些格子。近三天窗口里查 `commitContributionsByRepository`，一条 wiki 都没有，完全符合这个解释。

## 3.5 Q：凌晨提交会被算成前一天吗？

之前怀疑过这点（GitHub 贡献图历史上按太平洋时间归类）。实测看提交对象自带的时区：

```bash
git var GIT_AUTHOR_IDENT
# eryuemu <eryuemu@users.noreply.github.com> 1790539098 +0800
```

提交自带 `+0800`，而规则是"提交按时间戳自带时区归类"，所以凌晨两点的提交正确落在当天。这个担心不成立，也不需要去改账号时区设置。

## 3.6 修法

**以后直接在非 fork 的上游仓库开分支干活。** 有写权限时，别绕自己的 fork。

```bash
# 把上游设成主推送目标，而不是 origin（fork）
git remote set-url origin https://github.com/GZHback/HBUschedule.git
git push -u origin feat/xxx
```

这样提交第一次出现就在非 fork 仓库，四个条件全满足，格子照记。附带好处：省掉 fork 那套同步动作（`git fetch upstream && git push origin upstream/main:main`）。

已经产生在 fork 里的那 13 条**无法追溯计入**——要救只能在上游重新生成这些提交（cherry-pick 后重新提交），为了一排格子做这件事不值当。

---

# 四、命令速查

```bash
# —— git 身份 ——
git config --show-origin --get user.email          # 生效值 + 来自哪个文件（最有用）
git config --global --list                         # 全局都设了什么
git var GIT_AUTHOR_IDENT                           # 实际会写进提交的标识（含时区）
git config --global user.name  "你的名字"
git config --global user.email "已绑定GitHub的邮箱"

# —— 归属排查 ——
git log --format='%ae' main | sort | uniq -c | sort -rn    # 邮箱分布
git log --author=某邮箱 --format='%ad %s' --date=short      # 某邮箱的全部提交
gh api repos/<o>/<r>/contributors --jq '.[]|"\(.login) \(.contributions)"'   # 实时
gh api "repos/<o>/<r>/stats/contributors"                   # 图用的缓存（202=正在算）
gh api user --jq .id                                       # 你账号的数字 ID
# 网页看单条提交的真实邮箱：commit URL 后加 .patch

# —— 绿格子 ——
gh api graphql -f query='{user(login:"我"){contributionsCollection(
  from:"2026-09-01T00:00:00Z",to:"2026-09-30T23:59:59Z"){
  contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}
  commitContributionsByRepository{repository{nameWithOwner} contributions{totalCount}}}}}'

# —— 改历史 ——
git-filter-repo --mailmap /tmp/mm.txt              # git 2.55 起 filter-branch 已删除
git rev-list --count main                          # 校验：提交数不变
git rev-parse main^{tree}                          # 校验：内容零改动
git push --force-with-lease=main:<预期远端SHA> origin main
# 通知协作者： git fetch origin && git reset --hard origin/main
```

---

# 五、一句话总结

**git 只负责记录你自报的邮箱，GitHub 负责决定"算不算你"、"算在哪个仓库"、"算在哪一天"——而后三者是三套各自独立的规则、缓存和准入条件。** 数字对不上时，先判断卡在哪一层，而不是怀疑统计出错或者去改代码。
