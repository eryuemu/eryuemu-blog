---
title: 'eryuemu-blog 部署与评论系统搭建全复盘'
description: '从零到上线：GitHub 仓库重命名 → Vercel 部署 Astro 博客 → Waline 评论系统 + Supabase 数据库 → Vercount 真实访客统计。中间踩过 IPv6 不兼容、ESM/CommonJS 版本冲突、LeanCloud 停止注册三个大坑，最终全部打通，评论框完美运行。'
pubDate: '2026-07-18'
---

## 一、前置决策：几个"选哪个"

在动手之前，有几个选择要做。每个选择都在对话里有过讨论，最终决策如下：

### 1.1 部署平台：Vercel vs GitHub Pages

| 维度     | GitHub Pages            | Vercel ✅                      |
| ------ | ----------------------- | ----------------------------- |
| 配置复杂度  | 需手写 GitHub Actions 部署脚本 | 零配置，导入仓库自动识别 Astro            |
| 分支预览   | 无                       | 每个分支自动生成临时测试链接                |
| 动态后端支持 | 仅静态，无法跑 Serverless 函数   | 原生支持，Waline 后端可以直接部署在上面       |
| 国内访问   | 慢但偶尔能上                  | 默认域名被墙，需绑独立域名                 |
| 管理集中度  | 博客和评论分两个平台管             | 博客 + Waline 后端都在一个 Vercel 账号下 |

> **结论：Vercel。** 免写配置、支持云函数、管理集中。

### 1.2 评论系统：Giscus vs Waline vs Disqus

> 这是整个对话里讨论得最充分的选择之一。HBU-Wiki 用的是 Giscus，新博客要不要继续用？核心取决于**读者群体是谁**。

#### Giscus（HBU-Wiki 在用）

**原理**：基于 GitHub Discussions API。所有评论实际保存在你仓库的 Discussions 区，不经过任何第三方服务器。

**优点**：
- **零后端依赖**：不需要数据库、不需要部署服务器，完全托管在 GitHub
- **完全免费、无广告**，加载速度极快
- **极客体验好**：支持 Markdown、Emoji Reactions，界面简洁现代
- **平台无关**：因为 Giscus 是纯浏览器端通过 GitHub API 拉取评论，**无论博客部署在 GitHub Pages、Vercel 还是 Netlify，行为完全一样**

**在 Astro 中的集成**：比 VitePress 更简单——直接在 Astro 组件里放一个 `<script>` 标签即可，不需要 Vue/React 组件。

**致命缺点**：读者**必须登录 GitHub** 才能评论。非程序员读者直接卡死。

#### Waline

**原理**：客户端 JS + 轻量级后端（Vercel 云函数）+ 数据库（Supabase/LeanCloud）。

**优点**：
- **支持匿名评论**：随便填昵称和邮箱就能发，零门槛
- **功能丰富**：邮件提醒、微信通知、IP 属地、评论表情包、垃圾过滤
- **界面精美**，和现代博客主题搭配自然

**缺点**：部署稍繁琐，需要额外注册数据库并在 Vercel 部署后端。

#### Disqus（老牌方案）——不推荐

**缺点远大于优点**：免费版广告多且低俗；国内加载极慢甚至被墙；脚本臃肿严重拖慢网页。

#### 三方案对比总表

| 维度 | Giscus | Waline ✅ | Disqus |
|------|--------|----------|--------|
| 评论门槛 | **必须登录 GitHub** | **匿名即可** | 可匿名（但体验差） |
| 后端依赖 | 零，数据存 GitHub Discussions | Vercel 云函数 + 数据库 | 完全依赖 Disqus 服务器 |
| 适合读者群 | 纯技术/程序员 | 技术 + 日常 + 游戏混合读者 | 全球通用但国内残废 |
| 功能丰富度 | 基础评论 + Emoji | 邮件提醒、IP 属地、表情包、反垃圾 | 丰富但广告多 |
| 国内访问 | ✅ GitHub API 未被墙 | ❌ 默认域名被墙，需绑独立域名 | ❌ 极慢/被墙 |

> **结论：Waline。** 博客定位是"大杂烩"——技术文章、Galgame 评测、日常随笔都有。非程序员读者没有 GitHub 账号，Waline 的匿名评论门槛更低。如果以后觉得维护 Waline 麻烦，随时切回 Giscus 也只需要换一个 `<script>` 标签。

### 1.3 博客框架：VitePress vs Astro

| 维度 | VitePress（HBU-Wiki） | Astro ✅ |
|------|----------------------|---------|
| 核心定位 | 文档/Wiki 站 | 内容驱动型网站（博客、媒体） |
| 页面架构 | SPA（前端路由跳转） | MPA（标准浏览器跳转，可配 View Transitions 实现 SPA 级过渡） |
| 客户端 JS 体积 | 较重（Vue 运行时 + 路由） | **默认零 JS**，只在交互"孤岛"注入 |
| 技术栈绑定 | 必须 Vue | 不限，Vue/React/Svelte 都行 |

> **结论：Astro。** Wiki 才需要频繁切页的 SPA 体验；博客追求首屏加载速度和 SEO，Astro 的零 JS 默认输出更极致。

### 1.4 发布路线：先部署 vs 先填内容 vs 先买域名

最终路线：**先部署（免费域名） → 边写边调样式 → 内容充实后再买域名绑定。**

理由：域名按年计费，如果买了但博客拖几个月才写完，浪费钱。先打通 `本地写 → git push → 自动上线` 的流水线最重要。

---

## 二、阶段一：GitHub 仓库重命名

### 2.1 命名限制

最初想用 `eryuemu's blog`——**不行。** GitHub 仓库名只能包含字母、数字、连字符（`-`）、下划线（`_`）、英文句号（`.`），**不能有空格和单引号**。

备选方案：
- `eryuemu-blog` ← 最终选择，简单直观，和本地文件夹名一致
- `eryuemus-blog`（去掉引号变复数）
- `eryuemu_s_blog`（下划线替代）

### 2.2 操作步骤

1. GitHub 网页端：仓库 Settings → General → Repository name → 改为 `eryuemu-blog` → Rename
2. 本地终端：`git remote set-url origin https://github.com/eryuemu/eryuemu-blog.git`

> **教训**：GitHub 网页端改名后，本地 remote 不会自动更新，必须手动改。此外，GitHub 会自动把旧 URL 重定向到新 URL，但不建议依赖重定向，直接改掉最干净。

---

## 三、阶段二：Vercel 部署博客主体

### 3.1 Vercel 注册踩坑

**手机验证强制：** 即使你用 Google/GitHub 登录，Vercel 对所有新账号都要求短信验证（防滥用/防机器人）。选 `+86` 中国区号，国内手机号可正常接收验证码。

**Team URL 命名：** 注册完成后需要设置一个 workspace 名称，它决定你的后台管理地址（如 `vercel.com/eryuemu-blog`）。`eryuemu` 已被占用，最终用了带后缀的替代名。**这个 URL 只是后台标识，绑定独立域名后读者看不到它。**

### 3.2 导入与部署

1. Vercel 授权 GitHub 时选择 **"Only select repositories"**，只勾选 `eryuemu-blog`——最小权限原则
2. Import 仓库后，Vercel **自动识别出 Astro 框架**，无需任何配置
3. 直接点 Deploy，30-60 秒构建完成，获得免费域名（形如 `eryuemu-blog-xxxx.vercel.app`）

### 3.3 小插曲：Node.js 版本警告

构建日志中出现黄色 Warning：

```
Detected "engines": { "node": ">=22.12.0" } ... will automatically upgrade when a new major Node.js Version is released.
```

**不影响运行**，但表示将来 Vercel 升级 Node 大版本时项目会自动跟进。如果介意，可以把 `package.json` 中 `"node": ">=22.12.0"` 改为 `"node": "22.x"` 锁定主版本。

### 3.4 Ready Stale 状态说明

在 Vercel 的 Deployments 列表中，可能出现 "Ready Stale" 标签。**这不是错误**，意思是"此部署已成功，但后来有更新的提交，它不是最新版本了"。切到 Overview 就能看到最新部署。

---

## 四、阶段三：页脚数据修复

### 4.1 问题

原模板 `Footer.astro` 中硬编码了模拟数据：
- 建站日期：**2024 年**（实际是今天刚部署的）
- 访问量：**1623 人、2817 次浏览**（假的，不会随访问增长）

### 4.2 修复

1. **运行天数重置**：将建站时间精确设为 **2026-07-18T16:42:00**（Vercel 首次部署成功的时刻），让计时从零开始
2. **真实访客统计**：从 HBU-Wiki 项目中搬来了 **Vercount API**（`vercount.one`），这是一个开源公益计数器，每次真实刷新自动 +1（本地 localhost 不计数）

> Vercount 基于 Cloudflare Workers 运行，完全免费，无广告。即使未来这个服务关闭，也可以一键切换到其他计数器（如不蒜子）。

---

## 五、阶段四：评论系统选型与数据库踩坑

### 5.1 为什么最终选了 Waline

核心原因：**读者门槛。** 博客是大杂烩，会有非程序员读者——他们没 GitHub 账号。如果强制 GitHub 登录才能评论，等于把一半潜在互动挡在门外。

但 Waline 需要数据库。接下来就是"数据库选型 → 被拦 → 转向"的过程。

### 5.2 LeanCloud：出师未捷

Waline 的传统搭档是 LeanCloud 国际版（免费、免实名）。

注册页面直接提示：

> **"服务下线中，我们不再支持注册新账号"**

这条路彻底堵死。LeanCloud 已停止接纳新用户。

### 5.3 转向 Supabase

**Supabase** 是目前替代 LeanCloud 最主流的选择：

| 维度 | LeanCloud | Supabase ✅ |
|------|-----------|------------|
| 注册方式 | 邮箱注册（已关闭） | **GitHub 一键登录** |
| 数据库类型 | 自研 NoSQL | 标准 **PostgreSQL** |
| 免费额度 | 已停止新用户 | 500MB 存储 / 2 个免费项目 |
| 生态兼容 | 仅 Waline 支持 | 全行业通用 |

**初始化配置：**
- 项目名：`blog-comments`
- 区域：**Singapore**（`ap-southeast-1`，离国内最近）
- 计费：Free Plan
- 数据库密码：点 Generate a password 自动生成（务必复制保存）

---

## 六、阶段五：Waline 后端部署与排障全记录

这是整个过程中**最曲折**的阶段，一共触发并解决了 **三个递进的 Bug**。

### 6.1 Bug #1：环境变量命名不匹配 → SQLite 回退

**操作**：在 Vercel 创建 `waline-comments` 项目，按 Supabase 的引导填了 `SUPABASE_URL` 和 `SUPABASE_KEY` 两个环境变量。

**现象**：部署后访问 500 错误，Runtime Logs 显示：

```
DATABASE_ERROR: SQLite database filepath is not set.
```

**根因**：Waline 不认 `SUPABASE_URL` / `SUPABASE_KEY` 这两个变量名。它对 PostgreSQL 有自己固定的命名约定（`PG_*` 前缀）。没识别到任何 PG 变量 → 以为用户想用 SQLite → 发现也没配 SQLite 路径 → 报错。

**修复**：在 Supabase 项目首页的 "Get connected" 面板中，**将 Type 从 URI 切换为 Parameters**，复制出原生数据库连接参数，按 Waline 的命名填入 Vercel 环境变量：

| Vercel Key | 来源 |
|-----------|------|
| `PG_HOST` | Supabase Host 字段 |
| `PG_PORT` | Supabase Port 字段（先用 5432，后来改成 6543） |
| `PG_USER` | Supabase User 字段 |
| `PG_DB` | Supabase Database name（默认 `postgres`） |
| `PG_PASSWORD` | 创建项目时生成的数据库密码 |
| `PG_SSL` | 直接填 `true`（Supabase 强制加密） |

### 6.2 Bug #2：IPv6/IPv4 协议不兼容

**现象**：填完 6 个 PG 变量后重新部署，依然 500 错误。Runtime Logs 显示数据库连接超时。

**根因**：

```
你当时复制的参数来自 Supabase 的 "Direct connection" 面板:
  Host:  db.qajrwfmnplycgdznnaya.supabase.co
  Port:  5432

Supabase 的直连（Direct Connection）默认仅支持 IPv6。
Vercel 的服务器目前只支持 IPv4。
→ 两边协议不兼容，包根本发不过去。
```

**修复**：在 Supabase 的 "Get connected" 面板中，将 Connection Method 从 **Direct connection** 切换为 **Transaction pooler**（连接池），它会提供支持 IPv4 的参数：

| 参数 | Direct（IPv6 不可用） | Pooler（IPv4 可用） ✅ |
|------|----------------------|----------------------|
| `PG_HOST` | `db.qajrwfmnplycgdznnaya.supabase.co` | `aws-0-ap-southeast-1.pooler.supabase.com` |
| `PG_PORT` | `5432` | **`6543`** |
| `PG_USER` | `postgres` | **`postgres.qajrwfmnplycgdznnaya`**（拼接项目 ID） |

> **关键细节**：Pooler 的 User 需要在 `postgres` 后面拼接项目 ID 后缀（`.qajrwfmnplycgdznnaya`），这是和 Direct 最大的不同。

修改这三项并重新部署后，数据库连通成功。

### 6.3 Bug #3：ESM/CommonJS 模块规范冲突

**现象**：数据库连通后，访问依然 500 错误。日志精确报错：

```
Error [ERR_REQUIRE_ESM]: require() of ES Module ...
```

**根因**：

- Waline 最新版（v3）依赖的一些 Markdown 渲染组件全面升级为 **ES Module**
- 但 Waline 内部使用的 **ThinkJS** 服务端框架仍基于 **CommonJS**
- 运行时 `require()` 尝试加载 ESM 模块 → 直接崩溃

**修复尝试过程（两次失败）**：

| 尝试 | 操作 | 结果 |
|------|------|------|
| 1 | 加 `"type": "module"` + 全部改为 `import/export` 语法 | ❌ ThinkJS 不兼容 ESM 模式 |
| 2 | 入口文件改为 `index.mjs` + 更新 `vercel.json` 路由 | ❌ 底层依赖链仍然冲突 |

**终极修复**：

在 `package.json` 中**强制降级锁死** `@waline/vercel` 到上一个稳定版本 `1.41.1`，将所有代码还原为纯 CommonJS 格式：

```json
{
  "dependencies": {
    "@waline/vercel": "1.41.1"
  }
}
```

推送后 Vercel 自动重建，报错彻底消失。访问评论服务地址，返回 Waline 的正常初始化响应。

> 这是 **Waline 官方目前悬而未决的 Bug**。降级锁死版本是目前社区公认的 workaround。

---

## 阶段六：域后排查——评论系统的三个后续 Bug

评论系统在部署完成后看似正常，域名绑定完成后再次测试时发现评论功能实际不可用。排查过程暴露出三个连锁问题，每一个都在前一个解决后才暴露下一个。

### 6.4 Bug #4：PG_PASSWORD 填成了 Stripe 密钥

**现象**：博客页面评论区加载失败，Waline API 返回 500，错误信息：

```json
{"errno": 500, "errmsg": "password authentication failed for user \"postgres\""}
```

**排查**：登录 Vercel → `waline-comments` 项目 → Settings → Environment Variables，检查 `PG_PASSWORD` 的值。发现填入的不是数据库密码，而是一个 `sk_live_a12...` 开头的字符串——这是 **Stripe 支付密钥**，和 PostgreSQL 毫无关系。

**根因**：在初始配置阶段，可能从某个地方复制粘贴了错误的密钥。Stripe 密钥和数据库密码都是长随机字符串，肉眼无法区分。

**修复**：将 `PG_PASSWORD` 的值替换为 Supabase 创建项目时设置的真实数据库密码，保存后 Redeploy。

### 6.5 Bug #5：数据库表从未创建

**现象**：密码修复后，Waline API 返回新的 500 错误：

```json
{"errno": 500, "errmsg": "relation \"wl_comment\" does not exist"}
```

**根因**：Supabase 创建的是空 PostgreSQL 数据库。Waline 需要的三张表（`wl_comment`、`wl_counter`、`wl_users`）从未被创建。正常流程下，Waline 应该在首次启动时自动建表，但由于前面密码错误导致连接都未建立，建表步骤被跳过了。

**修复**：在 Supabase 控制台的 SQL Editor 中手动执行 Waline 的完整建表 SQL：

1. 左侧导航栏 → **SQL Editor**（`>_` 图标）
2. New query → 粘贴 [Waline 官方 PostgreSQL 建表语句](https://waline.js.org/guide/database.html#postgresql)
3. 点击 Run（遇到 RLS 警告时选择 "Run without RLS"——Waline 使用直连数据库方式，不需要行级安全策略）

执行成功后不需要重新部署 Vercel，因为数据库连接已经通了，Waline 会自动检测到表的存在。

### 6.6 Bug #6：Vercel 默认域名在国内被墙

**现象**：境外网络评论正常，国内用户（不开梯子）评论区加载失败。

**根因**：博客前端 `src/consts.ts` 中的 `WALINE_SERVER_URL` 配置为 `https://waline-comments-one-tau.vercel.app`。`*.vercel.app` 根域名被 GFW 整体屏蔽，国内用户无法访问任何以此域名结尾的服务。这和博客前端用自定义域名 `eryuemu.com` 能正常访问是同一个原理（详见 **eryuemu.com 域名绑定与 DNS 踩坑实录#5.2 根因：域名级屏蔽 vs IP 级屏蔽**）。

**修复（三步）**：

**第一步：在 Spaceship 添加 CNAME 记录**

| 类型 | 主机 | 值 | TTL |
|------|------|----|-----|
| CNAME | `comments` | `cname.vercel-dns.com` | 30 min |

> 注意主机名不要带空格（空格会导致 Spaceship 校验报错）。

**第二步：在 Vercel 绑定子域名**

登录 Vercel → `waline-comments` 项目 → Domains → 添加 `comments.eryuemu.com`。Vercel 自动验证 DNS 并签发 SSL 证书。

**第三步：修改博客代码并重新部署**

```typescript
// src/consts.ts
export const WALINE_SERVER_URL = 'https://comments.eryuemu.com';
```

提交推送后 Vercel 自动构建，评论功能在国内网络下完全可用。

> 子域名绑定完成后，可以用 `curl https://comments.eryuemu.com` 验证。返回 `{"errno":0,"errmsg":"","data":{...}}` 表示一切正常。

---

## 七、最终成果

| 组件 | 地址/状态 |
|------|----------|
| **博客前端** | Vercel 自动构建部署，每次 `git push` 1 分钟内更新 |
| **评论后端** | `https://comments.eryuemu.com`（自定义子域名，国内可直连） |
| **数据库** | Supabase PostgreSQL，新加坡节点，`blog-comments` 项目 |
| **访客统计** | Vercount API，真实刷新 +1 |
| **评论效果** | 文章底部完美渲染 Waline 输入框，支持匿名评论 |

---

## 八、架构全景图

### 8.1 "无人便利店"类比

| 组件           | 现实角色     | 职责                     |
| ------------ | -------- | ---------------------- |
| **GitHub**   | 设计图纸库    | 存放博客源码 + 评论服务器代码       |
| **Vercel**   | 施工队 + 铺面 | 检测代码更新 → 自动构建 → 提供在线网址 |
| **Supabase** | 保险柜      | 安全存取所有评论数据             |
| **Waline**   | 收银台      | 接收评论请求 → 校验 → 写入数据库    |
| **Vercount** | 红外线计数器   | 记录每次真实页面访问             |
|              |          |                        |

### 8.2 数据流拓扑

```
                    +------------------------------------+
                    |        用户的浏览器 (手机/电脑)    |
                    +---------+----------------+---------+
                              |                |
        A. 打开博客页面        |                | C. 提交或读取评论
   (下载纯 HTML/CSS/JS 静态文件) |                | (通过 API 请求接口)
                              v                v
                 +------------+---+       +----+-----------+
                 | 博客前端网站   |       |  Waline 后端   |
                 | (Vercel 项目A) |       | (Vercel 项目B) |
                 +--------+-------+       +--------+-------+
                          ^                        |
                          | 自动构建发布            | D. 读写评论数据
                          |                        v
                 +--------+-------+       +--------+-------+
                 | GitHub 代码仓库|       | Supabase 数据库|
                 |  (源文件存放)  |       |   (数据持久化)  |
                 +----------------+       +----------------+
```

### 8.3 两条核心工作流

**发布文章**：
```
Obsidian 写 .md → git push → Vercel 检测 GitHub 更新 → 编译 Astro → 1 分钟内全球 CDN 上线
```

**读者评论**：
```
读者输入评论 → 浏览器 JS → POST 到 Waline 后端 → Waline 校验后 INSERT 到 Supabase
→ 返回确认 → 页面实时刷新评论列表
```

### 8.4 这套架构为什么先进

- **绝对安全**：博客前端是纯静态 HTML 文件，没有运行中的服务器后台可供注入攻击；评论后台有 Vercel 和 Supabase 的企业级防火墙保护
- **极速访问**：Astro 编译输出零冗余 JS，Vercel 全球 CDN 节点让网页秒开
- **零维护成本**：不需要租服务器、装 Linux、配 Nginx、备份数据库——一切由托管平台自动处理

---

## 九、踩坑清单

| # | 坑 | 现象 | 根因 | 解决 |
|---|-----|------|------|------|
| 1 | 页脚数据假死 | 天数 800+、访问量 1620+，怎么刷新都不变 | 模板硬编码模拟数据 | 重置建站时间为部署时刻 + 接入 Vercount 真实 API |
| 2 | LeanCloud 无法注册 | "服务下线中，我们不再支持注册新账号" | LeanCloud 停止接纳新用户 | 转用 Supabase（GitHub 一键登录） |
| 3 | Waline 不认数据库变量 | `SQLite database filepath is not set` | 填了 `SUPABASE_URL`/`SUPABASE_KEY`，但 Waline 只认 `PG_*` 前缀 | 改用 6 个 `PG_HOST`/`PG_PORT`/`PG_USER`/`PG_DB`/`PG_PASSWORD`/`PG_SSL` |
| 4 | IPv6/IPv4 不通 | 500 超时，数据库连接失败 | Supabase Direct Connection 仅 IPv6，Vercel 仅 IPv4 | 切换为 Transaction Pooler（端口 6543，User 拼接项目 ID） |
| 5 | ESM 模块冲突 | `require() of ES Module` | Waline v3 依赖 ESM，ThinkJS 框架是 CommonJS | 降级锁死 `@waline/vercel@1.41.1`，还原 CommonJS |
| 6 | 评论区无法加载（密码错误） | Waline 后端 500，"password authentication failed for user 'postgres'" | `PG_PASSWORD` 环境变量被错误填成了 Stripe 密钥（`sk_live_a12...`）而非数据库密码 | 将 `PG_PASSWORD` 改为正确的 Supabase 数据库密码 |
| 7 | 评论区无法加载（表不存在） | Waline 后端 500，"relation 'wl_comment' does not exist" | 数据库是空的，从未运行过 Waline 的建表 SQL | 在 Supabase SQL Editor 中执行 Waline 的建表语句（`wl_comment`、`wl_counter`、`wl_users`） |
| 8 | 国内网络无法评论 | 境外访问正常，国内用户评论区加载失败 | 评论后端使用 Vercel 默认域名 `*.vercel.app`，该后缀在国内被 GFW 屏蔽 | 为评论后端绑定自定义子域名 `comments.eryuemu.com`（CNAME → `cname.vercel-dns.com`），博客前端代码改用新地址 |

---

## 十、各平台分工与免费额度分析

### 10.1 四平台分工总览

| 平台 | 角色 | 具体干了什么 |
|------|------|-------------|
| **Spaceship** | 域名注册商 | 持有 `eryuemu.com` 的所有权，DNS 解析将域名流量指向 Vercel 服务器 |
| **GitHub** | 代码仓库 | 存放博客前端代码（`eryuemu-blog`）和评论后端代码（`waline-comments`），Vercel 监听这里的更新自动构建 |
| **Vercel** | 托管 + 计算 | 前端：编译 Astro → 静态网页 → 全球 CDN 分发；后端：运行 Waline 的 Node.js 云函数，处理评论读写 |
| **Supabase** | 数据库 | 存储所有评论数据（用户名、邮箱、内容、时间），Waline 后端通过 PostgreSQL 协议读写 |

### 10.2 分析：谁负责什么

| | 博客页面本身 | 评论功能 |
|---|---|---|
| **代码存在哪** | GitHub `eryuemu-blog` | GitHub `waline-comments` |
| **由谁运行** | Vercel（编译后分发静态文件） | Vercel（运行 Waline 云函数） |
| **数据存在哪** | 无数据库（纯静态 HTML） | Supabase（PostgreSQL） |
| **用户怎么访问** | `eryuemu.com` → Spaceship DNS → Vercel IP | 博客页面的 JS 脚本 → Waline API → Supabase |

### 10.3 免费额度分析

| 平台 | 计划 | 关键额度 | 个人博客够用吗 |
|------|------|---------|:--:|
| **Spaceship** | — | **唯一付费项**。域名按年租赁，`.com` 续费 ~$10/年（约 72 元） | 💰 每年续费 |
| **GitHub** | 个人免费 | 单仓库 1GB | ✅ 代码几 MB |
| **Vercel** | Hobby | 月流量 100GB / 构建 6000 分钟 | ✅ 几万访问耗 2-3GB |
| **Supabase** | Free Plan | 500MB 存储 / 2 个免费项目 | ✅ 几十万条评论 |
| **Vercount** | 公益开源 | 无限制 | ✅ 纯白嫖 |

### 10.4 Supabase 休眠机制详解

Supabase 免费版有一个重要限制：**连续 7 天没有任何读写操作，数据库会被自动暂停（Paused）**。

被暂停后的表现：
- 博客页面正常显示，但评论区加载失败（因为后端连不上数据库）
- 数据**不会丢失**，只是服务被休眠了

恢复方法：
1. 登录 Supabase 后台
2. 找到 `blog-comments` 项目
3. 点击 **Restore**（恢复）按钮，数秒内重新激活

预防措施：
- 只要偶尔有人访问博客并加载评论区（触发了数据库读取），就永远不会休眠
- 如果博客长期没人看，可以自己每隔几天访问一次，或者后台手动 Resume

### 10.5 费用总结

```
整个博客系统的持续性开销 = 域名续费（约 72 元/年）

其余一切（代码托管、网站运行、评论后端、数据库、CDN 加速）= 0 元
```

---

## 十一、关键配置速查

### Supabase → Vercel 环境变量（Waline 项目）

```
PG_HOST=aws-0-ap-southeast-1.pooler.supabase.com
PG_PORT=6543
PG_DB=postgres
PG_USER=postgres.qajrwfmnplycgdznnaya
PG_PASSWORD=<创建项目时生成的密码>
PG_SSL=true
```

### Waline 版本锁定（package.json）

```json
{
  "dependencies": {
    "@waline/vercel": "1.41.1"
  }
}
```

### Vercel Node.js 警告消除（可选）

```json
// 改前（会触发黄色警告）
"node": ">=22.12.0"
// 改后（锁定主版本，不再警告）
"node": "22.x"
```

---

## 十二、Obsidian → Astro 发布管线设计

> 用户的核心工作流设想：在 Obsidian 里写草稿（或让 AI 总结对话后写入）→ 筛选可发布的文章 → git push → 博客自动上线。这里的工程问题是：**怎么让 Obsidian 文件夹和 Astro 项目之间不靠手动复制粘贴？**

### 12.1 前置优势：YAML Frontmatter 天然兼容

Obsidian 的 Properties（属性）保存为 `.md` 时，底层就是标准 YAML Frontmatter：

```yaml
---
tags:
  - 爬虫
  - Python
created: 2026-07-04
status: 已完成
---
```

这和 Astro 的 **Content Collections** 完全同构。不需要任何格式转换，只需要让 Astro 读到 Obsidian 的 `.md` 文件即可。

### 12.2 方案 A：软链接（Symlink）直连（推荐）

在 Obsidian 的 `博客/` 文件夹和 Astro 项目的 `src/content/blog/` 之间建立软链接——系统层面认为它们是同一个文件夹：

```
Obsidian Vault                       Astro 项目
├── 博客/  ──── symlink ────→ src/content/blog/
│   ├── 文章A.md                        ├── 文章A.md  （同一文件）
│   └── 文章B.md                        └── 文章B.md  （同一文件）
├── Galgame/                    ├── src/
├── 学业/                       ├── public/
└── ...                         └── ...
```

**工作流**：
1. 在 Obsidian 任意位置写草稿
2. 决定发布时，在 Obsidian 内把笔记**拖进 `博客/` 文件夹**
3. 终端里 `git commit && git push`
4. Vercel 检测到 GitHub 更新 → 自动构建 → 1 分钟内上线

**好处**：Obsidian 里的任何修改实时同步到 Astro 项目，不需要手动复制粘贴。

**需要适配的细节**：
- Astro Content Collection 的 Schema 需要微调，匹配你 Obsidian 里的 `tags`、`created`、`status` 等属性格式
- Wiki-link（`**note**`）需要做路径映射或转换为标准 Markdown 链接

### 12.3 方案 B：手动复制 / 脚本拷贝（备选）

- Obsidian 写完 → 右键复制 `.md` → 粘贴到 `src/content/blog/` → push
- 也可以写一个简单脚本一键拷贝

**比方案 A 差在哪**：每次修改都要重新复制，Obsidian 和 Astro 里的文件是两份独立副本，容易不同步。

### 12.4 实施时机

对话中达成的共识：**先部署 + 搞定评论系统，发布管线后续再做。** 目前博客已经上线、评论已经跑通，这条管线是下一步的优先事项。

---

## 十三、未完成事项（待办）

- [x] **购买独立域名**（`eryuemu.com`）并绑定 Vercel——已通过 Spaceship 购入并配置 DNS（详见 [eryuemu.com 域名绑定与 DNS 踩坑实录](/blog/eryuemu-domain-binding-and-dns-troubleshooting)）
- [ ] **打通 Obsidian → Astro 发布管线**——按方案 A（Symlink）实施，详见**上一章**
- [ ] **定制 Waline 评论框样式**——暗黑模式适配、字体微调
- [ ] **Astro Content Collection Schema 适配**——让 `tags`、`created`、`status` 等 Obsidian 属性被 Astro 正确识别

---

## 十四、日常运营与维护指南

### 14.1 发布新文章的日常流程

Obsidian 写完新文章后，在 WSL2 终端执行三步：

```bash
# 1. 将 Obsidian 笔记同步并转换为项目 Markdown 文件
node migrate.cjs

# 2. 提交到本地 Git
git add .
git commit -m "feat: add new post"

# 3. 推送至 GitHub（Vercel 自动构建）
git push origin main
```

推送后 Vercel 自动构建，通常在 **1 分钟内**新文章就在 `eryuemu.com` 上线了。

### 14.2 SaaS 托管的核心优势：零服务器维护

因为所有系统都托管在 SaaS 平台（GitHub、Vercel、Supabase），你不需要做任何传统运维工作：

| 传统 VPS 需要做的 | 你需要做吗 |
|---|---|
| 安装/更新 Linux 系统补丁 | ❌ 不用 |
| 配置 Nginx/Apache | ❌ 不用 |
| 防御 DDoS 攻击 | ❌ Vercel 自带 |
| 备份数据库 | ❌ Supabase 自动备份 |
| 续期 SSL 证书 | ❌ Vercel 自动续期 |
| 监控服务器负载 | ❌ 不用 |
| 域名续费 | ✅ **唯一需要做的事** |

### 14.3 域名续费备忘

这是整套系统唯一的持续开销。建议：

1. 在 Spaceship 后台开启 **Auto-renew（自动续费）** 并绑定支付方式
2. 或者在日历里设一个每年提前一周的提醒，手动续费
3. `.com` 域名续费价格约 $10/年（约 72 元），按 ICANN 规定每年涨幅上限 7%，不会暴涨
4. **绝对不要让域名过期**：过期后有 70-80 天保护期，期间会被抢注机器人秒杀

### 14.4 Waline 评论系统升级

Waline 后端的代码托管在 GitHub 的 `waline-comments` 仓库。如果以后需要升级：

1. 在 GitHub 网页端进入 `waline-comments` 仓库
2. 点击 **Sync fork** 同步 Waline 官方仓库的最新更新
3. Vercel 检测到代码更新 → 自动构建 → 评论后端自动升级

整个过程中评论数据不受影响——数据存在 Supabase，和 Vercel 云函数是分离的。

### 14.5 系统组件关系速查

当你排查问题时，按这个链路定位故障：

```
用户浏览器
  │
  ├── 打不开网站？
  │     → 查 Spaceship DNS 记录（A: 76.76.21.21, CNAME: cname.vercel-dns.com）
  │     → 查 Vercel 域名状态（Domains 页面是否绿色）
  │     → 查 Vercel 部署日志（最近一次构建是否成功）
  │
  ├── 网站能打开，但评论框加载失败？
  │     → 查 Vercel waline-comments 项目是否正常运行
  │     → 查 Supabase 数据库是否被休眠（连续 7 天无读写会自动暂停）
  │     → 查环境变量 PG_* 是否正确
  │
  └── 网站能打开，但样式错乱、图片挂掉？
        → 多半是 base 路径问题（Vercel 部署时 base 应为 /）
        → 查 astro.config.mjs 确认 base 配置
```

---

## 相关笔记

- [本地知识库与博客搭建思路](/blog/knowledge-base-and-blog-setup) ← Astro 选型与博客整体规划
- [个人博客域名选购指南](/blog/personal-blog-domain-buying-guide) ← 域名选购决策
- [eryuemu.com 域名绑定与 DNS 踩坑实录](/blog/eryuemu-domain-binding-and-dns-troubleshooting) ← 域名 DNS 配置 + Vercel 绑定
- [HBU-Wiki 开发环境搭建：从fnm到项目级Node.js隔离](/blog/hbu-wiki-dev-env-setup) ← HBU-Wiki（VitePress + GitHub Pages + Giscus）的经验
- [WSL2 实战手册：空间账单、symlink 陷阱与 cc-switch 四连坑](/blog/wsl2-practical-guide) ← 本地开发环境
- [Windows 开发环境大扫除：从C盘灾难到WSL2物理隔离](/blog/windows-dev-env-cleanup) ← WSL2 架构决策