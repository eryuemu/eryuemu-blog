---
title: 'eryuemu.com 域名绑定与 DNS 踩坑实录'
description: '域名买好之后才是真正的战场：Spaceship DNS 配 A/CNAME 记录、Vercel 域名绑定、Vercel "推荐" IP 在国内被墙、切回经典配置后 DNS 缓存迟迟不刷新——每一步都有坑，每一个坑都踩了一遍。'
pubDate: '2026-07-20'
category: '开发'
---

## 一、前置条件

本文承接 [个人博客域名选购指南](/blog/personal-blog-domain-buying-guide)，假设以下事项已完成：

- 已在 Spaceship 以首年优惠价购入 `eryuemu.com`
- `eryuemu-blog` 博客已在 Vercel 部署并稳定运行（默认 `.vercel.app` 域名可访问）
- 本地开发环境基于 WSL2，项目路径 `~/workspace/eryuemu-blog`

> 如果域名还没买，先去 [个人博客域名选购指南](/blog/personal-blog-domain-buying-guide) 看后缀对比和注册商选择。

---

## 二、Spaceship DNS 配置

### 2.1 入口

登录 Spaceship → 域名列表 → 点击 `eryuemu.com` → 在右侧面板底部点击 **高级 DNS**（Advanced DNS）。

### 2.2 需要添加的记录

| 类型 | 主机名 | 值 | TTL | 作用 |
|------|--------|----|-----|------|
| **A** | `@` | `76.76.21.21` | 30 min | 将根域名 `eryuemu.com` 解析到 Vercel 服务器 |
| **CNAME** | `www` | `cname.vercel-dns.com` | 30 min | 将 `www.eryuemu.com` 也指向 Vercel（并自动重定向到根域名） |

> `@` 表示根域名本身，即 `eryuemu.com`（不带任何前缀）。如果列表中有原有的默认 A 记录或 CNAME 记录，先删除再添加新的。

### 2.3 重要：Spaceship 的"草稿"机制

添加记录后，它们会显示为**草稿（Draft）状态**，尚未真正写入 DNS 系统。务必点击页面右下角的 **全部保存** 按钮，让记录正式生效。

这个设计容易被忽略——填完记录就关页面，结果域名怎么都解析不了，回头才发现根本没保存。

### 2.4 为什么是这个 IP（关键决策）

这个话题在第五节会详细展开。先简单说结论：

**Vercel 域名管理页面推荐的"新" IP（`216.198.79.1`）在国内被 GFW 屏蔽。必须使用 Vercel 的经典配置（`76.76.21.21` + `cname.vercel-dns.com`）才能在国内直连。**

---

## 三、Vercel 端域名绑定

### 3.1 Vercel UI 导航注意

Vercel 的界面经历过改版。在较新版本中，**Domains 直接位于项目左侧主导航栏**，不需要先进 Settings。如果你按旧教程找 Settings → Domains 却找不到，直接在左侧菜单里找 Domains 即可。

### 3.2 操作步骤

1. Vercel Dashboard → `eryuemu-blog` 项目 → 左侧导航栏 **Domains**
2. 输入 `eryuemu.com` → Add
3. 弹窗中的默认选项不需要修改：「Redirect apex domains to www」保持勾选即可，作用是让 `eryuemu.com` 和 `www.eryuemu.com` 中一个自动 301 跳转到另一个，避免搜索引擎认为你有两个重复网站
4. 点击 **Add Domain** 确认
5. Vercel 会自动检测 Spaceship 的 DNS 记录。状态从 Pending（检测中）变为绿色的 Valid Configuration 即完成
6. SSL 证书全自动申请，Vercel 在域名验证通过后自动签发 Let's Encrypt 证书，续期同样全自动。整个过程约 2-5 分钟。

---

## 四、中间态：GitHub Pages 和 Vercel 同时正常运行的原理

在切换到 Vercel 的过程中，有一个短暂窗口：`eryuemu.github.io/eryuemu-blog`（GitHub Pages）和 `eryuemu-blog.vercel.app`（Vercel）**两个网址同时正常工作，样式都完好**。

这看起来像魔法，实际上是 GitHub Actions 的 `astro.yml` 中这条命令的功劳：

```yaml
astro build --site "${{ steps.pages.outputs.origin }}" --base "${{ steps.pages.outputs.base_path }}"
```

当 GitHub Actions 编译时，它用**命令行参数强行覆盖** `astro.config.mjs` 中的 `base` 配置，注入 GitHub Pages 专用的二级目录路径 `'/eryuemu-blog'`。而 Vercel 编译时没有这些参数，直接读取 `astro.config.mjs` 中我们改好的、不带 `base` 的配置。

结果就是：同一份源码，在 GitHub Actions 和 Vercel 两个构建环境里，各自读了不同的 `base` 值，各自编译出了正确的版本。只有 GitHub Actions 脚本写对了才会触发这个行为，纯属无心插柳。

> 这个中间态不会持续太久。一旦停用 GitHub Pages 并删除 `.github/workflows/astro.yml`，就只有 Vercel 一条线在工作了。

---

## 五、核心踩坑：Vercel IP 的 GFW 拦截问题

这是整个过程中最隐蔽的坑——表面一切正常，手机一关梯子，网站直接打不开。

### 5.1 问题现象

- 电脑开着代理：一切正常，`https://eryuemu.com` 秒开
- 手机关掉梯子（纯国内网络）：**无法访问**，浏览器转圈后超时
- Vercel 面板显示域名状态正常，SSL 证书正常

### 5.2 根因：域名级屏蔽 vs IP 级屏蔽

这里有一个关键的区分，决定了为什么 `eryuemu.com` 能直连但 `xxx.vercel.app` 不能：

**Vercel 默认域名（`*.vercel.app`）被墙 → 域名级屏蔽。**
由于 Vercel 上托管了海量网站（其中包含被国内视为敏感的内容），GFW 对整个 `*.vercel.app` 根域名进行了 **DNS 污染 + 域名屏蔽**。当你访问 `eryuemu-blog.vercel.app` 时，GFW 在 DNS 解析环节就拦截了请求，根本到不了 IP 层。这和网站本身的内容无关——你的博客就算只有一句 "Hello World"，用 `.vercel.app` 域名在国内一样打不开。

**Vercel 服务器 IP（`76.76.21.21`）没有被墙 → IP 级放行。**
GFW 屏蔽的是域名后缀，而不是 Vercel 的服务器 IP 地址。当你用自己的独立域名 `eryuemu.com` 访问时，DNS 解析返回的是 Vercel 的 IP，GFW 看到的只是一个普通个人网站，没有触发对 `vercel.app` 的屏蔽规则，放行。

> 通俗总结：GFW 在门口查身份证（域名），不是查你的房子地址（IP）。你的 `.vercel.app` 身份证进了黑名单，但 `eryuemu.com` 这张新身份证是干净的，同一个房子（服务器）随便进。

### 5.3 另一个坑：Vercel 推荐的新 IP 反而是被墙的

Vercel 域名管理页面会提示加速 DNS 配置，推荐使用以下"新"记录：

| 记录类型 | Vercel 推荐值 | 实际情况 |
|---------|-------------|---------|
| A | `216.198.79.1` | **此 IP 在国内被 GFW 屏蔽** |
| CNAME | `cname-2.vercel-dns.com` | **此域名在国内被 DNS 污染** |

这些是 Vercel 较新的基础设施地址。由于 Vercel 同时托管了大量被国内屏蔽的境外网站，这些新 IP 段和 CNAME 目标域名已经整体进入了 GFW 的封锁列表。

### 5.4 解决方案：退回经典配置

Vercel 的**旧版基础设施**目前在国内大部分地区仍可直连：

| 记录类型 | 经典值（国内可用） |
|---------|------------------|
| A | `76.76.21.21` |
| CNAME | `cname.vercel-dns.com` |

在 Spaceship 中将 DNS 记录改回经典配置，等待解析生效即可。

### 5.5 为什么经典 IP 还能用

经典 IP（`76.76.21.21`）是 Vercel 早期的基础设施，已稳定运行多年。由于历史上大量合法项目都在使用这些 IP，GFW 如果一刀切会误伤面太广，因此至今未被列入封锁名单。

> Vercel 面板上的黄色警告 "DNS Change Recommended" 仅仅是升级提示，**不代表旧配置会失效**。可以永久忽略它。

---

## 六、DNS 缓存延迟：改了记录还是打不开

### 6.1 问题

在 Spaceship 将 DNS 从"被墙的新 IP"改回经典 IP 后，手机依然打不开。

### 6.2 根因

DNS 记录的 TTL（Time To Live）设为了 **30 分钟**。在这 30 分钟内：

- 你的手机本地 DNS 缓存着"被墙的 IP"
- 你家的路由器也缓存着"被墙的 IP"
- 运营商的递归 DNS 服务器同样缓存着"被墙的 IP"

三层缓存叠在一起，即使你在 Spaceship 后台改了记录，终端设备依然向旧 IP 发请求 → 依然被墙。

更麻烦的是，**国内运营商的 DNS 缓存更新时间常常比设定的 TTL 更长**——它们会忽略短 TTL，按自己的节奏更新。

### 6.3 排查与解决

按优先级从快到慢：

| 方法 | 原理 | 适用场景 |
|------|------|---------|
| **切换网络** | Wi-Fi 切 5G/4G，或反过来。不同网络走不同 DNS 服务器，缓存状态独立 | 手机端首选，最快 |
| **飞行模式重置** | 开启飞行模式 5 秒后关闭，重置手机网络模块，清除本地 DNS 缓存 | 手机端次选 |
| **浏览器强制刷新** | `Ctrl + F5` 跳过浏览器缓存 | 电脑端，但无法清除系统级 DNS 缓存 |
| **手动清 DNS 缓存** | Windows: `ipconfig /flushdns`；Mac: `sudo dscacheutil -flushcache` | 电脑端首选 |
| **等待** | 等 TTL 自然过期 | 以上都无效时的最后手段，通常 5-15 分钟 |

### 6.4 教训

如果以后需要频繁切换 DNS 配置，可以**临时把 TTL 设为 60 秒**（1 分钟），改完后验证通过再调回 30 分钟或更长。这样切换期间的缓存污染窗口只有 1 分钟。

---

## 七、项目收尾：README 重写与架构文档化

这次对话还完成了对 `eryuemu-blog` 项目的最终整理，主要包括：

### 6.1 README.md 重写

在原有 README 基础上补充了：

- **技术栈表格**：Astro（前端框架）、Obsidian（内容源）、WSL2（开发隔离）、Vercel（托管）、Spaceship（DNS）、Waline（评论）、Vercount（统计）
- **系统架构图**：使用 Mermaid 绘制了从本地 Obsidian 写作 → WSL2 脚本处理 → GitHub 推送 → Vercel 自动部署的完整数据流
- **常驻开发服务控制命令**
- 移除了关于 GitHub Pages 的过时说明
- 保留了原网站的全部链接（主域名、Vercel 默认域名、已停用的 GitHub Pages 地址作为历史记录）

### 6.2 架构全景

```
┌──────────────┐    git push    ┌──────────┐   自动构建   ┌──────────┐
│  Obsidian    │ ──────────────→ │  GitHub  │ ───────────→ │  Vercel  │
│  (本地写作)   │                │  (代码仓) │              │  (托管)   │
└──────────────┘                └──────────┘              └────┬─────┘
                                                              │
                            ┌─────────────────────────────────┤
                            │                                 │
                    ┌───────┴───────┐              ┌──────────┴──────────┐
                    │   Waline 后端  │              │   eryuemu.com       │
                    │ (Vercel 项目B) │              │   (Spaceship DNS)   │
                    └───────┬───────┘              └─────────────────────┘
                            │
                    ┌───────┴───────┐
                    │   Supabase    │
                    │  (PostgreSQL) │
                    └───────────────┘
```

### 6.3 migrate.cjs 修复

在审查代码时发现 `migrate.cjs`（Obsidian 笔记转换脚本）中存在一个遗留 Bug：

```js
// 修复前（Bug）：链接指向旧的 GitHub Pages 二级目录
"/eryuemu-blog/blog/${slug}"

// 修复后：指向独立域名的根路径
"/blog/${slug}"
```

如果不修，所有从 Obsidian WikiLink 转换来的文章内链都会跳转到 `https://eryuemu.com/eryuemu-blog/blog/...` → **全部 404**。

### 6.4 头像替换

将项目中的默认头像和 favicon 替换为用户提供的个人头像：

- `src/assets/avatar.jpg` —— 网页内显示的头像
- `public/avatar.jpg` —— 浏览器标签页图标（favicon）
- 在 `BaseHead.astro` 中将 icon 路径改为 `/avatar.jpg`
- 删除了旧的 `favicon.ico` 和 `favicon.svg`

> 浏览器对 favicon 的缓存极其顽固，替换后可能需要 `Ctrl + F5` 或开无痕模式才能看到新图标。

---

## 八、GitHub Pages 环境清理

### 8.1 关闭 GitHub Pages 部署

关闭 GitHub Pages 不会自动发生——需要手动操作：

1. 进入博客仓库 Settings → **Pages**
2. 在页面右上角找到 `...`（三个点）按钮
3. 点击 **Unpublish site**（取消发布网站）

> 注意：这个操作只关闭本仓库的 Pages。你的 **HBU-Wiki** 项目如果也用了 GitHub Pages，完全不受影响。

### 8.2 为什么点了 Unpublish 之后网站还能打开

点完 Unpublish 后，浏览器里 `eryuemu.github.io/eryuemu-blog` 可能仍然能打开。两个原因叠加：

1. **浏览器缓存**：浏览器本地缓存了 HTML/CSS/JS 文件。用无痕模式打开，或 `Ctrl + F5` 强制刷新即可验证。
2. **GitHub CDN 缓存**：GitHub Pages 背后有全球 CDN。后台取消发布后，各 CDN 节点同步删除缓存需要 1-5 分钟。过一会儿再访问，就会变成 404。

只要点击了 Unpublish，后台就已经开始下线，不需要等它完全 404 再继续后续操作。

### 8.3 Deployments 面板残留

GitHub 的 Deployments（部署）区域是**历史日志板**，记录了项目曾经发生过的所有部署事件。即使网站已下线，历史记录和环境卡片不会自动删除。如需彻底清除：

> Settings → Environments → 找到 `github-pages` → 删除

不删除也完全不影响任何功能，纯属视觉洁癖问题。

---

## 九、要不要把域名 DNS 托管到 Cloudflare

域名绑定完成后，网上很多教程会推荐"把域名的 Nameserver 改到 Cloudflare"。这里单独分析一下这个操作对你来说是否必要。

### 9.1 "托管到 CF"到底是什么意思

把域名托管到 Cloudflare，是指将域名的 **DNS 解析服务器（Nameservers）** 从购买商（Spaceship）改成 Cloudflare。之后所有的 DNS 记录管理都在 Cloudflare 后台操作，不再走 Spaceship。

这和我们目前的配置（Spaceship 管理 DNS 记录，直接指向 Vercel IP）是两种不同的架构。

### 9.2 对你来说不必要的原因

**Spaceship 的 DNS 已经够用。**
Spaceship（Namecheap 旗下）的 DNS 后台现代化程度很高，解析生效速度极快（刚才保存后几乎是秒生效），日常管理体验没有痛点。

**Vercel 自带安全防护。**
很多人托管到 Cloudflare 是为了用 CF 的 DDoS 防护和 WAF（Web 应用防火墙）。但你的博客托管在 Vercel 上，Vercel 自带企业级防攻击和防刷流量保护，不需要再套一层 CF。

**避免"套娃"架构。**
如果在 Vercel 前面再套一层 Cloudflare（用户 → Cloudflare → Vercel），会增加 SSL 证书握手失败的概率（CF 著名的 520/525 错误），配置和调试复杂度翻倍。当前架构（Spaceship DNS → Vercel）是**最短路径**，出问题的环节最少。

**多一个管理账号。**
托管到 CF 后，改 DNS 要登录 CF，域名续费要回 Spaceship。多一个账号、多一套密码、多一个可能出问题的地方。

### 9.3 什么时候才值得考虑

| 场景 | 是否值得 |
|------|:--:|
| 想用 Cloudflare Pages 替代 Vercel 托管博客 | ✅ 必须托管 |
| 需要 CF 特色功能（免费企业邮箱转发、Cloudflare Workers 边缘计算、极其复杂的 URL 重定向规则） | ✅ 值得 |
| 域名续费想薅 CF "零利润"批发价 | 🤷 CF 确实便宜一点，但 Spaceship 的价格已经是行业地板，差价可以忽略 |
| 只是想让网站"更快"或"更安全" | ❌ 当前方案已经足够 |

### 9.4 结论

**保持现状。** 当前架构（Spaceship DNS → Vercel）配置简单、访问速度正常、安全防护到位。不要因为网上有人说"托管到 CF"就主动引入不必要的复杂度。等真正遇到现有方案解决不了的问题时，再考虑迁移。

---

## 十、最终状态总览

| 组件 | 状态 | 备注 |
|------|:----:|------|
| `https://eryuemu.com` | ✅ 正常运行 | 国内可直连 |
| `www.eryuemu.com` | ✅ 自动跳转根域名 | Vercel 301 重定向 |
| SSL 证书 | ✅ 自动管理 | Let's Encrypt，Vercel 自动续期 |
| Vercel 自动部署 | ✅ | 每次 `git push` 后 1 分钟内更新 |
| DNS 配置 | ✅ 经典 IP | `76.76.21.21` + `cname.vercel-dns.com` |
| GitHub Pages | ❌ 已下线 | 404，无实际影响 |
| 评论系统 | ✅ Waline + Supabase | 详见 [eryuemu-blog 部署与评论系统搭建全复盘](/blog/eryuemu-blog-deployment-comment-sys) |
| 访客统计 | ✅ Vercount | 每次真实刷新 +1 |
| 项目 README | ✅ 已更新 | 含架构图和技术栈 |
| migrate.cjs | ✅ 已修复 | WikiLink 转换为正确路径 |

---

## 十一、维护备忘录

### DNS 记录速查

```
类型: A     主机: @    值: 76.76.21.21          TTL: 30min
类型: CNAME 主机: www  值: cname.vercel-dns.com  TTL: 30min
```

### 如果以后网站打不开

1. **先确认是 DNS 问题还是服务器问题**：访问 Vercel 默认域名（`eryuemu-blog-xxxx.vercel.app`）看是否正常
2. 如果默认域名正常、独立域名打不开 → DNS 问题，检查 Spaceship 记录是否被意外修改
3. 如果两个都打不开 → Vercel 服务状态或项目本身问题
4. 如果只有不开梯子打不开 → Vercel IP 可能被新一轮封锁，需要关注 Vercel 社区是否有新的可用 IP

---

## 相关笔记

- [个人博客域名选购指南](/blog/personal-blog-domain-buying-guide) ← 域名后缀对比、注册商选择、薅羊毛策略
- [eryuemu-blog 部署与评论系统搭建全复盘](/blog/eryuemu-blog-deployment-comment-sys) ← 博客部署 + Waline + Supabase 完整过程
- [本地知识库与博客搭建思路](/blog/knowledge-base-and-blog-setup) ← Astro 选型与博客整体规划
- [WSL2 实战手册：空间账单、symlink 陷阱与 cc-switch 四连坑](/blog/wsl2-practical-guide) ← 本地开发环境