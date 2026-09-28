---
title: 'GitHub 绿格子和贡献者排名为什么对不上：git 三层身份、noreply 邮箱、fork 提交不计入，以及一次 46 条提交的改历史实战'
description: '一次真实的贡献统计排查全记录。项目 Insights → Contributors 显示自己只有 1 个提交而实际推了 13 个；个人页绿格子当天只算 3 个；HBU-Wiki 有 46 条提交头像是灰色默认图。排查后拆出四套互相独立的机制：git 的仓库级/全局/系统级三层身份配置（git 本身完全不校验邮箱真假，实测无配置时报 fatal: 无法自动探测邮件地址（得到 eryuemu@fedora-xx14.(none)））；GitHub 的"提交邮箱必须在账号已验证白名单内"归属规则（解释 eryuemu@users.noreply.github.com 为什么天然可认、253450470+eryuemu@ 那串数字 ID 前缀防的是什么、example.com 为什么永远进不了白名单）；Insights 统计接口 /stats/contributors 与实时接口 /contributors 的缓存差异（同一时刻分别返回 1 和 15）；以及贡献图官方准入规则中 repo not forked 这一条——在 fork 里写的提交即使合并进父仓库默认分支也永不计入，因为 GitHub 记的是"第一次收到这块数据的仓库"而不是"它现在存在于哪些仓库"。随后用 git-filter-repo（git 2.55 已删除内置 filter-branch）通过 mailmap 重写 134 条提交中的 46 条作者邮箱，推送前用文件树 SHA 3474d9c95626ed5d135da341964f26a4bfd297c9 不变来证明内容零改动，用 --force-with-lease 推送，并给出协作者必须执行的 reset 命令。最后用 --show-origin 取证回答"为什么只有 wiki 中招"：同期在 Colorful-Keyboard（07-14/07-15/08-17）和 blog 上的提交全部正常，说明错误邮箱是某个 AI 工具只写进 wiki 那个仓库的 .git/config，仓库级覆盖了正常的全局配置。'
pubDate: '2026-09-28T14:52:00+08:00'
category: '开发'
type: 'ai-organized'
---

# GitHub 绿格子和贡献者排名为什么对不上：git 三层身份、noreply 邮箱、fork 提交不计入

> **触发场景**：给河北大学课程表项目做完一轮开发，推了 13 个提交、PR #2 已合并进上游 `main`。回头去看 GitHub 个人页和仓库的 Contributors 图，两处数字都对不上，另外在 `HBU-Wiki` 仓库里有 46 条提交显示灰色默认头像。
> **涉及仓库与真实数据**：`GZHback/HBUschedule`（16 条归属提交，图只算 3）、`eryuemu/HBU-Wiki`（134 条提交，46 条假身份）、`eryuemu/eryuemu-blog`、`eryuemu/Colorful-Keyborad-Led-Color-Setting`
> **工具环境**：git 2.55.0、Fedora（原生 Linux 双系统，非 WSL）、gh CLI（OAuth device flow）
> **本文定位**：把"现象 → 排查命令 → 底层机制 → 解决办法"完整记一遍，供以后任何一次"贡献没算上"时查阅。

---

## 💡 简明省流版（30 秒速览）

| 现象 | 真实原因 | 一句话结论 |
| --- | --- | --- |
| Contributors 图显示自己 1 个提交，实际 16 个 | 读的是 `/stats/contributors` 缓存快照，且**排除 merge 提交** | 统计图是批量重算的，不是实时的 |
| 个人页绿格子当天只算 3 个 | 那 13 条提交诞生在 **fork 仓库**里 | 官方规则：`repo not forked` |
| 46 条提交头像是灰色 | 提交邮箱 `eryuemu@example.com` 不在账号白名单里，且**永远进不去** | git 不校验邮箱，GitHub 才校验 |
| 只有 wiki 中招，同期其他仓库正常 | 错误邮箱写在 **wiki 的 `.git/config`** 里，仓库级覆盖了正常的全局 | 用 `--show-origin` 能一眼看出是哪层 |
| 改完历史，格子涨的不是今天 | 改历史只换作者邮箱，**提交日期原样保留** | 补的是七八月的格子 |
| 想让贡献被记上 | 直接在非 fork 的上游仓库开分支干活 | 别再绕自己的 fork |

---

## 0. 先给结论：这不是一个 bug，是四套互不相干的机制

排查过程中最容易犯的错，是把"贡献统计"当成一个系统。它实际上是四套独立的东西，各有各的数据源、各有各的缓存周期、各有各的准入规则：

1. **git 自己的身份配置** —— 决定提交对象里写什么邮箱。纯本地行为，与 GitHub 无关。
2. **GitHub 的提交归属** —— 把提交邮箱映射到账号（`author.login`）。实时，绑定邮箱后很快生效。
3. **仓库 Insights → Contributors** —— 读 `/stats/contributors`，批量重算，排除 merge 提交。
4. **个人页贡献图（绿格子）** —— 独立的一套，有自己的准入规则（含 `repo not forked`）和自己的重建周期。

四个环节任何一个卡住，看到的数字就不对，而**症状长得很像**。下面按真实排查顺序逐个拆。

---

## 1. 现象：两处数字都对不上

### 1.1 项目 Insights → Contributors 显示 1 个提交

页面顶部那行小字是关键线索：

```text
Contributions per week to main, excluding merge commits
```

显示 `GZHback #1 · 2 commits`、`eryuemu #2 · 1 commit`。而实际上这个仓库有 16 条提交归属于我。

同时查两个接口，结果直接打架：

```bash
# 实时接口
gh api repos/GZHback/HBUschedule/contributors --jq '.[]|"\(.login) \(.contributions)"'
# eryuemu 15
# GZHback  3

# 图页面用的接口
curl -s -H "Authorization: Bearer $(gh auth token)" \
  https://api.github.com/repos/GZHback/HBUschedule/stats/contributors
# eryuemu 1
# GZHback 2
```

**【原理】** 这两个端点背后是两套东西。`/contributors` 是当场遍历提交算的；`/stats/contributors` 是一份**预计算缓存**，GitHub 按自己的周期重算，缓存能留很久。实测那次返回 HTTP 200（而不是表示"正在计算中"的 202），说明 GitHub 认为这份缓存仍然有效，所以图页面一直显示旧快照。

从数字还能反推出那份快照的计算时刻：合并前 `main` 上只有朋友 2 条非合并提交（第三条是 merge commit，被规则排除），我应该是 0；快照里我是 1，说明它算进了我在网页上改 README 的第一次编辑，但**没算进那 13 条命令行提交**——因为快照生成时，那些提交的作者邮箱还没绑定到账号。

### 1.2 `?b=1` 强制刷新为什么没用

社区流传在图 URL 后加 `?b=1` 能强制重算。实测无效，页面数字纹丝不动。真正让 wiki 那张图更新的动作是后面的 **force push**——仓库有新活动才会触发重算。所以别指望 URL 参数。

### 1.3 个人页绿格子当天只算 3 个

用 GraphQL 读权威数据，比看格子准：

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

16 条归属提交，图里只算 3。这 3 条全部是**直接发生在上游仓库 `main` 上**的动作：合并 PR 产生的合并提交、两次网页端编辑 README。那 13 条命令行提交一条都没算。原因见第 6 节。

---

## 2. git 身份到底是什么：三层配置与优先级

### 2.1 疑问：「我这台机器以前配的是什么邮箱？是没有设置过吗？」

### 2.2 原理：查找顺序是仓库级 → 全局 → 系统级

git 生成提交时按这个顺序找 `user.name` / `user.email`，**找到哪层就用哪层，上层存在则完全屏蔽下层**：

```text
1. 仓库级   <repo>/.git/config
2. 全局     ~/.gitconfig
3. 系统级   /etc/gitconfig
```

想直接看某条配置是从哪个文件生效的，用 `--show-origin`，这是排查身份问题最有用的一个参数：

```bash
git config --show-origin --get user.email
# file:.git/config            eryuemu1213@qq.com        ← 仓库级覆盖着
# file:/home/eryuemu/.gitconfig  eryuemu@users.noreply.github.com  ← 删掉仓库级之后
```

**关键认知：git 本身完全不校验邮箱**。`user.email` 就是自报家门，填 `林肯@白宫` 它照样生成提交。所有真正的校验都发生在 GitHub 那一侧（见第 3 节）。

### 2.3 实测：三层都没配会怎样

在一个干净的空仓库里直接 commit：

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

注意最后一行：git **确实尝试了自动探测**，用"系统用户名 + 主机名"拼出 `eryuemu@fedora-xx14.(none)`。但因为主机没有完整域名，结尾是 `(none)`，这个值明显不可用，于是 git **拒绝采用，直接 fatal 退出**。

结果：**0 个提交**，什么都没发生。不是"提交成了奇怪身份"，是压根没生成提交。

### 2.4 疑问：「删掉仓库级的，全局也没设，那算哪个？」

不算哪个——**提交不了**。但这里必须把两个动作分开：

| 动作 | 需要 git 身份吗 | 需要什么 |
| --- | --- | --- |
| `git commit` | **需要**。身份要写进提交对象（作者名、邮箱、时间戳） | 三层配置里至少有一层 |
| `git push` | **不需要**。只是把已有提交对象传到远端 | 认证凭据（这里是 gh 的 credential helper） |
| GitHub 网页端编辑 | 不需要你本地身份 | GitHub 服务器替你提交，用它账号里存的邮箱 |

所以"删了仓库级又没全局"的真实后果是：命令行提交全部失败，但已有的提交照样能推，网页端照样能改文件。

那一串 `3419144842@qq.com` 的提交就是这么来的——**全部是在 GitHub 网页上点铅笔编辑产生的**，GitHub 用账号邮箱代你署名，跟本地配置毫无关系。

---

## 3. GitHub 凭什么认定一条提交是「你」写的

### 3.1 疑问：`eryuemu@users.noreply.github.com` 为什么能识别，`eryuemu@example.com` 不能？

### 3.2 原理：一张「已验证邮箱白名单」，不做任何字符串匹配

GitHub 给每个账号维护一张邮箱清单。归属判定只有一条规则：

> **提交里的 author 邮箱出现在某个账号的已验证清单里 → 算那个人的；否则就是陌生人。**

它**不看用户名、不看 `user.name` 显示名、不做前缀匹配**。所以 `eryuemu@example.com` 里那个 `eryuemu` 跟你的登录名一模一样，也毫无意义。

三种邮箱的不同命运：

| 邮箱 | 为什么能/不能归属 |
| --- | --- |
| `eryuemu@users.noreply.github.com` | GitHub **自己发给你的**。注册时就生成并预绑定，因为 `users.noreply.github.com` 这个域名归 GitHub 所有，而 `eryuemu` 这个前缀只有你占着。它不需要收验证邮件——归属关系是它自己造的。设计目的是让你提交代码时不必公开真实邮箱。 |
| `3419144842@qq.com`、`eryuemu1213@qq.com` | 真实能收信的邮箱。加进账号 → 点验证邮件里的链接 → 进白名单 → 归属生效。 |
| `eryuemu@example.com` | 永远进不了白名单。`example.com` 是 **IANA 保留的示例域名**，全世界都无法注册，邮件永远寄不到，所以"发验证邮件"这一步在物理上不可能完成。 |

### 3.3 疑问：`253450470+eryuemu@users.noreply.github.com` 前面那串数字是什么？

`253450470` 是账号的**数字 ID**（`gh api user --jq .id` 可查，该账号创建于 2026-01-07）。

GitHub 早期格式是纯 `login@users.noreply.github.com`，后来改成 `ID+login@...`，原因是**用户名可以改、可以释放、可以被别人注册走**，而数字 ID 永久唯一。如果只用用户名，哪天你把 `eryuemu` 这个名字让出去，接手的人就凭空继承了你历史上所有提交的归属。加上 ID 前缀，这个地址就永久钉死在你这个账号上，与叫什么名字无关。

两种格式 GitHub 目前都认，所以历史上那批旧格式提交归属一直正常。

### 3.4 为什么 GitHub 非要校验

因为 git 不校验（2.2 已述），提交里的邮箱字段是可以任意伪造的。如果 GitHub 只看字符串就认，任何人都能把自己写成别人的邮箱刷进别人主页。**"必须是已验证邮箱"这条规则本身就是防伪机制**，不是给用户添麻烦。

---

## 4. 头像不显示：完整原因清单

按出现频率排序，逐条可自查：

1. **提交邮箱没绑定到任何 GitHub 账号** —— 最常见。头像灰色、点不进主页、不算贡献。确认方式见下。
2. **绑定了但未完成验证**（账号邮箱列表里显示 Pending）—— 验证邮件常被 QQ 邮箱丢进垃圾箱。
3. **改了邮箱配置但没改历史** —— 新提交正常，老提交依旧是旧邮箱，头像不会追溯变回来（除非改历史）。
4. **仓库是 fork 且提交在 fork 里产生** —— 头像可以正常显示，但**不计入绿格子**（这是另一码事，见第 6 节，别混淆）。

排查命令：

```bash
# 看这个仓库里所有提交用过哪些邮箱、各多少条
git log --format='%ae' main | sort | uniq -c | sort -rn

# 看某个邮箱的全部提交
git log --author=3419144842@qq.com --format='%ad %s' --date=short main

# 网页上看单条提交的真实邮箱（GitHub 默认藏起来不给看）
# 在 commit 网址后面加 .patch，会直接显示 Author: xxx <邮箱> 那一行
```

---

## 5. 案例取证：为什么 46 条提交是假身份，而且只有 wiki 中招

### 5.1 时间线还原

把 `HBU-Wiki` 的 134 条提交按作者邮箱归类：

```text
46  eryuemu@example.com                 ← 假身份
44  3419144842@qq.com                   ← 网页端编辑
39  eryuemu@users.noreply.github.com    ← 正常命令行
 5  3251711961@qq.com                   ← 合作者
```

按月份和身份交叉：

| 月份 | 3419（网页） | example.com（假） | noreply（命令行） | 合作者 |
| --- | --- | --- | --- | --- |
| 2026-04 | 1 | — | — | — |
| 2026-06 | 40 | — | — | — |
| 2026-07 | — | 3 | — | — |
| 2026-08 | 2 | **43** | 17 | — |
| 2026-09 | 1 | — | 22 | 5 |

再细看 8 月的逐日分布：

```text
08-11  假
08-12  假 + 3419
08-13  假 + 3419
08-14  假
08-15  假
08-20  假
       （08-21 ~ 08-27 无任何提交）
08-28  noreply
08-29  noreply
```

假身份严格存在于 07 月初至 08-20，08-28 起彻底消失，中间停了一周。

### 5.2 疑问：「我游戏本上用同一个工具做的其他项目，怎么就没有这个问题？」

这是最有价值的一问，因为它能区分"全局配错"还是"单仓库配错"。查同期其他仓库：

```text
eryuemu/Colorful-Keyborad-Led-Color-Setting
  20  68362682+moshuiD@users.noreply.github.com   （原作者）
  12  eryuemu@users.noreply.github.com            ← 我的提交，全部正常
   3  3419144842@qq.com
   我的提交日期：2026-07-14、2026-07-15、2026-08-17
```

**这三条日期全部落在 wiki 用假身份的时间窗内，但它们是正常的 noreply。**

### 5.3 结论

那台 Windows 机器的**全局配置一直是对的**。`example.com` 是某个 AI 编码工具**只往 wiki 那个仓库的 `.git/config` 里写了仓库级配置**，按 2.2 的优先级规则，仓库级把正常的全局屏蔽掉了。

所以受影响面恰好等于"被那个工具打开过的那一个仓库"。08-28 身份恢复正常，最合理的解释是那个仓库被重新克隆过——`.git/config` 一消失，就回落到正常的全局。

**通用教训**：AI 编码工具会自己写 git 配置。用 `git config --show-origin --get user.email` 检查每个仓库，比事后改历史省事得多。

---

## 6. 绿格子的准入规则：卡住我的是「fork」这一条

### 6.1 官方原文

GitHub 文档里那段条件的原文：

```text
Commits appear if: email matches account; repo not forked;
branch is default or gh-pages;
plus one of: collaborator, member, forked, or PR/issue opened.
```

四组条件必须同时满足。邮箱那条我已经解决（第 3 节），分支那条也满足（合并进了 `main`），卡住的是中间那句：**`repo not forked`**。

### 6.2 「出生地」而不是「最终归宿」

这里最容易绕晕，因为一条提交在 git 里就是一块数据（一个 SHA），**同一块数据可以同时存在于 fork 和父仓库，两边 SHA 完全一致**——PR 合并干的就是这件事。所以"这条提交在哪个仓库"这个问题，git 本身答不了。

GitHub 定的规则是：**它第一次在哪个仓库收到这块数据，就认定这块数据诞生于那个仓库。**

当时的操作是 `git push origin feat/android-app`，而 `origin` 指向 `eryuemu/HBUschedule`——**一个 fork**。于是这 13 条被永久标记为"fork 里产生的提交"。后来 PR #2 把它们复制进非 fork 的父仓库 `GZHback/HBUschedule` 的 `main`，父仓库里确实有了它们，但 GitHub 不重问"你现在人在哪"，只认当初那条出生记录。

类比：户籍在 A 市，去 B 市干活、成果也算进 B 市项目，但统计"你为 B 市出了多少力"时按户籍算。想算上，得让人第一次出现就在 B 市。

### 6.3 疑问：「改完历史，那 46 条为什么没进今天的格子？」

因为**改历史只替换作者邮箱，提交日期原样保留**。那 46 条是 7 月和 8 月的提交，所以补的是七、八月那些格子的数字。近三天窗口里查 `commitContributionsByRepository`，一条 wiki 都没有，完全符合这个解释。

### 6.4 顺带把时区问题也测清楚

之前怀疑"凌晨提交会被算成前一天"，因为 GitHub 的贡献图历史上按太平洋时间归类。实测看提交对象自带的时区：

```bash
git var GIT_AUTHOR_IDENT
# eryuemu <eryuemu@users.noreply.github.com> 1790539098 +0800
```

提交自带 `+0800`，而规则里"提交按时间戳自带时区"，所以凌晨两点的提交会正确落在当天。这个担心不成立。

---

## 7. 实战：把 46 条假身份提交改回来

### 7.1 第一步就撞墙：`filter-branch` 已经被删了

```bash
git filter-branch --env-filter '...'
# git：'filter-branch' 不是一个 git 命令。参见 'git --help'
```

git 2.55.0 已经把内置的 `filter-branch` 移除（废弃多年后正式下架）。官方替代品是独立项目 `git-filter-repo`，单文件 Python 脚本：

```bash
curl -sSLo ~/.local/bin/git-filter-repo \
  https://raw.githubusercontent.com/newren/git-filter-repo/main/git-filter-repo
chmod +x ~/.local/bin/git-filter-repo
```

### 7.2 用 mailmap 重写作者邮箱

```bash
git clone https://github.com/eryuemu/HBU-Wiki.git && cd HBU-Wiki

printf 'eryuemu <eryuemu@users.noreply.github.com> <eryuemu@example.com>\n' > /tmp/mm.txt
git-filter-repo --mailmap /tmp/mm.txt
```

mailmap 格式是 `正确名字 <正确邮箱> <要匹配的名字 <原邮箱>>`，会同时改 author 和 committer。

### 7.3 推送前必须做的两个校验

改历史最怕的是"顺手改了内容"。两条命令把它钉死：

```bash
git rev-list --count main                    # 134，提交数不能变
git rev-parse main^{tree}                    # 3474d9c95626ed5d135da341964f26a4bfd297c9
```

把 `main^{tree}` 跟改前的值对比——**文件树 SHA 一致，就证明所有文件内容一个字节都没动**，改的纯粹是提交元数据。这是改历史唯一可信的安全证明，比"我看着没变"强得多。

### 7.4 用 `--force-with-lease` 而不是 `--force`

```bash
CUR=$(git ls-remote https://github.com/eryuemu/HBU-Wiki.git refs/heads/main | cut -f1)
git push --force-with-lease=main:$CUR https://github.com/eryuemu/HBU-Wiki.git main
```

`--force-with-lease` 会先核对远端当前 SHA 是否等于你预期的值，不等就拒绝推送。裸 `--force` 会直接覆盖，万一这期间别人推了新东西就无声丢掉了。改历史这种操作不该用裸 force。

### 7.5 协作者必须做的动作（最容易漏）

git 改历史不是"只改那几条"，而是**从第一条被改的提交开始，所有后代提交的 SHA 全部重算**。查时间线就知道影响面：

```text
2026-07-04   最早的假身份提交   ← 从这里开始全变
2026-09-12 ~ 09-20   合作者的 5 条提交  ← 在后面，SHA 也会被改掉
```

所以合作者本地会显示"和远端分叉了""我有 5 个提交没推上去"。必须提前通知他执行：

```bash
git fetch origin
git reset --hard origin/main
```

或者删掉重新克隆。**不提醒的话，他会以为自己丢了东西。**

### 7.6 验证结果

```bash
gh api "repos/eryuemu/HBU-Wiki/commits?per_page=100" --jq '.[].commit.author.email' | sort | uniq -c
```

```text
85  eryuemu@users.noreply.github.com
44  3419144842@qq.com
 5  3251711961@qq.com
```

抽查原来没头像的提交：

```text
7c0cc6c  login=eryuemu  fix(router): 规范化 Vercount 统计 URL…
79d618a  login=eryuemu  feat: 启用 cleanUrls…
96da3a8  login=eryuemu  fix(seo): 用 titleTemplate 修复页面 title…
```

`author.login` 不再是 null，说明归属生效。汇总用的 Contributors 图当时还显示"未归属 46"——那是缓存，等重算。

### 7.7 一个格式返工

第一次我映射成了 `253450470+eryuemu@users.noreply.github.com`（GitHub 现在下发的带 ID 格式），随后按需要改成短格式 `eryuemu@users.noreply.github.com`，以便和已有那 39 条合并成同一个身份。两种格式 GitHub 都认，纯粹是历史整齐度的选择。

---

## 8. 结论：怎么让贡献真的被记上

| 目标 | 做法 |
| --- | --- |
| 提交能归属到人 | 给机器配一次全局身份，用**已绑定 GitHub 的邮箱**：`git config --global user.email "..."` |
| 不被 AI 工具偷偷覆盖 | 定期 `git config --show-origin --get user.email`，看是不是仓库级在作怪 |
| 贡献计入绿格子 | **别在自己的 fork 里干活**。有上游仓库写权限时，直接在上游开分支 → 提 PR → 合并 |
| 已经产生在 fork 里的提交 | 无法追溯计入。要救只能在上游仓库重新生成这些提交（cherry-pick 后重新提交），成本不值当 |
| 看到真实数字 | 别信图，用接口：`gh api repos/<o>/<r>/contributors`（实时）和 GraphQL 的 `contributionCalendar` |

顺带一条工作流收益：直接在非 fork 的上游仓库开分支，除了贡献能记上，还能省掉 fork 那套同步动作（`git fetch upstream && git push origin upstream/main:main`）。

---

## 9. 命令速查表

```bash
# —— 身份配置 ——
git config --show-origin --get user.email          # 当前生效值 + 来自哪个文件
git config --global --list                         # 看全局都设了什么
git var GIT_AUTHOR_IDENT                           # git 实际会写进提交的标识
git config --global user.name  "你的名字"           # 设全局身份
git config --global user.email "已绑定GitHub的邮箱"

# —— 归属排查 ——
git log --format='%ae' main | sort | uniq -c | sort -rn     # 邮箱分布
git log --author=某邮箱 --format='%ad %s' --date=short       # 某邮箱的提交
gh api repos/<o>/<r>/contributors --jq '.[]|"\(.login) \(.contributions)"'   # 实时贡献者
gh api "repos/<o>/<r>/stats/contributors"                    # 图页面用的缓存（202=正在算）

# —— 绿格子 ——
gh api graphql -f query='{user(login:"我"){contributionsCollection(
  from:"2026-09-01T00:00:00Z",to:"2026-09-30T23:59:59Z"){
  contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}'

# —— 改历史 ——
git-filter-repo --mailmap /tmp/mm.txt              # 重写作者邮箱
git rev-list --count main                          # 校验：提交数不变
git rev-parse main^{tree}                          # 校验：内容零改动
git push --force-with-lease=main:<预期远端SHA> origin main
# 通知协作者： git fetch origin && git reset --hard origin/main
```

---

## 10. 一句话总结

**git 只管记录你自报的邮箱，GitHub 只管按自己的白名单和准入规则决定"算不算你"，而"算不算"和"算在哪天""算在哪个仓库"是三套各自独立的判定。** 数字对不上时，先确定卡在哪一层，而不是去改代码或怀疑统计出错。
