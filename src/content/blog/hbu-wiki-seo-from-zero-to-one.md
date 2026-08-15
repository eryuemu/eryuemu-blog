---
title: '个人站点 SEO 从 0 到 1：HBU Wiki 被搜索引擎收录全复盘'
description: '背景：eryuemu.com（blog，Astro + Vercel）谷歌/Bing 均能搜到；guide.hbuwiki.top（HBU Wiki，VitePress + GitHub Pages）两个引擎都搜不到。从诊断 → 代码修复 → 官方提交收录 → 预期效果，完整走了一遍新站 SEO 全流程。'
pubDate: '2026-08-14'
category: '开发'
type: 'ai-organized'
---

## 一、诊断：为什么 wiki 搜不到？

| 致命缺失 | 后果 |
|---------|------|
| 没有 `sitemap.xml`（VitePress 未配 `sitemap.hostname`） | 爬虫不知道有哪些页面 |
| 没有 `robots.txt` | 爬虫连 sitemap 地址都找不到 |
| `lang` 标成 `en-US` | 误导引擎把中文内容判成英文 |
| 内容页无独立 title/description | 即使爬到也无法精准展示 |
| 无 canonical | 爬到了也不确定哪个是正式 URL |

**为什么 blog 能自己收录？** blog 有 sitemap/robots 基础 + 已上线一段时间 + 有一定外链（GitHub 仓库公开等），所以搜索引擎能自然发现。

---

## 二、修复：代码层面做了什么

### HBU Wiki（`.vitepress/config.mjs` + 页面 frontmatter）

- `lang: 'zh-CN'` 修正语言
- 顶层 `sitemap.hostname: 'https://guide.hbuwiki.top'` → **开启 VitePress 自动生成 sitemap.xml**（全站 9 个页面）
- 新建 `public/robots.txt`：`Allow: /` + `Sitemap:` 指路
- `transformHead({ pageData })` 钩子 → 为每个页面**动态注入 canonical + og:title/description/url**（读 frontmatter，无重复标签）
- `srcExclude: ['**/CLAUDE.md', '**/README.md']` → 排除项目内部文档，防止污染搜索结果
- 6 个核心内容页（转专业/数据探索器/绩点分析/选课避雷/官方资料/周边指南）补 YAML `title` + `description`

### Blog（Astro：`src/consts.ts` + `src/components/BaseHead.astro`）

- `SITE_DESCRIPTION` 改为贴合实际的：**二月木的个人博客 — 建站折腾 · AI 工具 · Galgame**
- 补 `og:locale = zh_CN`、`og:site_name`、完整 Twitter Card（title/description/image）——主要影响**社交分享卡片**（发微信/推特时的预览），对排名影响不大
- 注入 JSON-LD 结构化数据：`WebSite` + `SiteNavigationElement`（首页/文章/心迹/友链/关于）
- **遗留修复**：canonical/sitemap/JSON-LD 统一到 `www.eryuemu.com`（线上 308 重定向后的正式域名）

---

## 三、核心知识 ①：收录三件套

```
sitemap.xml（页面清单）  ← robots.txt 指路 ←  主动提交（登记户口）
```

1. **sitemap.xml**：全站页面清单，告诉爬虫"我有哪些页面"，防止它随缘瞎逛漏掉关键页。
2. **robots.txt**：爬虫的入口文件，`Sitemap:` 字段指到 sitemap 地址。VitePress 配 `sitemap.hostname` 即自动生成，Astro 用 `@astrojs/sitemap` 插件自动生成 `sitemap-index.xml`（索引地图，内含 `sitemap-0.xml` 子地图）。
3. **主动提交**：去 Search Console / Bing Webmaster 提交 sitemap 并验证所有权 = 在引擎那里"登记户口"。

**手动提交 vs 自然爬取**：最终收录效果和权重**完全一样**，引擎不区别对待。但新站手动提交一次明显更好：
- **速度**：手动 = 优先处理队列（几小时~2 天），自然爬取 = 可能几周甚至一个月才轮到你
- **仪表盘**：绑定 Search Console 后有官方后台，能看到哪些页面收录失败及原因、搜索词、点击量——不再是"黑盒"

---

## 四、核心知识 ②：展示三件套 —— 搜索结果每个字来自代码哪里

```
🌐 www.eryuemu.com                     ← [1] canonical URL
eryuemu's blog                         ← [2] <title> 标签（蓝色大标题）
二月木的个人博客 — 建站折腾 · AI 工具 · Galgame  ← [3] <meta name="description">（灰色摘要）
```

- **[1] 网址**：`<link rel="canonical">` —— 告诉引擎"我的正式地址是这个"
- **[2] 蓝色标题**：每页 `<title>`（VitePress/Astro 由 frontmatter 生成）
- **[3] 灰色摘要**：`<meta name="description">`，**Google 的行为差异**：Bing 倾向直接展示后台 description；Google 更智能——当搜索词（如"eryuemu 是谁"）与正文某段高度匹配时，会直接从**正文抓取段落**当摘要（首页 Hero 自我介绍被当作摘要就是这个原因）

![Bing 搜索结果中展示的站点主标题与摘要](../../assets/seo-bing-search-eryuemu.png)
*图：Bing 搜索结果中展示的站点主标题与摘要*

![Google 搜索结果优先提取首页 Hero 自我介绍正文作为动态摘要](../../assets/seo-google-search-hero-snippet.png)
*图：Google 搜索结果优先提取首页 Hero 自我介绍正文作为动态摘要*

---

## 五、核心知识 ③：黑盒部分 —— Sitelinks 子链接卡片

友链那种搜索结果下方 6~8 个方块子入口（🐑薅薅羊毛、📷摄影相册……）叫 **Sitelinks**。

![友链博客「口袋分享记」在 Bing 搜索结果中展示的 Sitelinks 站内多格子快捷卡片](../../assets/seo-sitelinks-pocket-share.png)
*图：友链博客「口袋分享记」在 Bing 搜索结果中展示的 Sitelinks 站内多格子快捷卡片*

- **没有代码能强制开启**，是引擎算法根据站点质量自动决定
- 只能"喂条件"提高概率：
  1. 搜品牌词排名第一
  2. 网站导航架构清晰（首页明确链接各栏目）
  3. 结构化数据 `SiteNavigationElement`（相当于递一张"官方导航清单"，不给的话引擎自己猜）
  4. 上线一段时间 + 点击量积累
- 时间预期：收录后 **1~3 个月**，满足条件会逐步展开

---

## 六、提交收录操作流程（Google + Bing）

### Google Search Console
1. `search.google.com/search-console` → 添加资源 → **网址前缀**（比"网域"省事：网域必须去 DNS 加 TXT 记录；网址前缀支持 HTML meta 标记验证，10 秒完成）

![Google Search Console 欢迎页添加资源](../../assets/gsc-add-property-welcome.png)
*图：Google Search Console 欢迎页添加资源*

2. 验证方式选 **HTML 标记** → 把 `<meta name="google-site-verification" content="...">` 写进站点 `<head>`（本案例：wiki 提交于 `89bdc94`，blog 提交于 `bea8c1d`）→ 点验证

![Google Search Console 验证所有权弹窗（支持 HTML 标记与 HTML 文件验证）](../../assets/gsc-verify-ownership-modal.png)
*图：Google Search Console 验证所有权弹窗（支持 HTML 标记与 HTML 文件验证）*

![所有权验证成功后 Google 发送的官方站长开通通知邮件](../../assets/gsc-welcome-email.png)
*图：所有权验证成功后 Google 发送的官方站长开通通知邮件*

3. 左侧「站点地图」 → 输入 `sitemap.xml`（wiki）/ `sitemap-index.xml`（blog）→ 提交

![HBU Wiki 提交站点地图 sitemap.xml 界面](../../assets/gsc-sitemap-submit.png)
*图：HBU Wiki 提交站点地图 sitemap.xml 界面*

![博客 eryuemu.com 提交站点地图 sitemap-index.xml 界面](../../assets/gsc-blog-sitemap-submit.png)
*图：博客 eryuemu.com 提交站点地图 sitemap-index.xml 界面*

4. 顶部搜索栏输入首页 URL → 先点「**测试实际网址**」（会派实时爬虫实测一次）→ 显示"网址可编入索引"后点「**请求编入索引**」

![Google Search Console 网址检查与申请编入索引（已发现 - 尚未编入索引）](../../assets/gsc-url-inspection-request-indexing.png)
*图：Google Search Console 网址检查与申请编入索引（已发现 - 尚未编入索引）*

**常见现象**：
- 刚提交显示"**无法抓取**"：同步延迟的假报错，几小时~明天自动变绿
- "已发现 - 尚未编入索引"：正常中间状态

![刚提交站点地图时常见的同步延迟假报错「无法抓取」](../../assets/gsc-sitemap-initial-status.png)
*图：刚提交站点地图时常见的同步延迟假报错「无法抓取」（正常现象，无需慌张）*

### Bing Webmaster Tools
- 支持**从 Google Search Console 一键导入**：授权 Google 账号 → 自动同步两个站的所有权验证 + sitemap
- 导入时若提示数据未同步（Google 刚绑定几分钟），手动添加 + HTML meta 验证同样 1 分钟搞定

![Bing Webmaster Tools 支持从 Google Search Console 一键同步站点与 Sitemap](../../assets/bwt-import-from-gsc.png)
*图：Bing Webmaster Tools 支持从 Google Search Console 一键同步站点与 Sitemap*

### 为什么 Bing 里 wiki 显示 9、blog 显示 1？
- VitePress 生成**单层直属地图** `sitemap.xml`（直接列出 9 个页面）→ 一眼数出 9
- Astro 生成**地图索引** `sitemap-index.xml`（只含 1 个指向子地图的链接）→ 显示 1，等引擎翻开子地图后变 28

![Bing Webmaster Tools 成功读取 HBU Wiki 的 sitemap.xml（状态成功，已发现 9 个 URL）](../../assets/bwt-sitemaps-success-9.png)
*图：Bing Webmaster Tools 成功读取 HBU Wiki 的 sitemap.xml（状态成功，已发现 9 个 URL）*

---

## 七、深度对比：Google 与 Bing 的收录哲学与 SEO 体检机制

### 7.1 URL 检查实测：已成功编制索引 vs 前台 site: 延迟

提交第二天（8月15日早晨），在 Bing 站长工具的「URL 检查」中输入 `https://guide.hbuwiki.top/`，返回状态：

![Bing 站长工具 URL 检查显示已成功编制索引](../../assets/bwt-url-inspection-indexed-seo-warning.png)
*图：Bing 站长工具 URL 检查显示「已成功编制索引」，同时提示 2 条 SEO 优化建议*

然而此时在 Bing 搜索前台输入 `site:guide.hbuwiki.top` 查询，依然显示暂无结果：

![前台 site:guide.hbuwiki.top 暂无结果](../../assets/bwt-site-search-empty-delay.png)
*图：前台 site:guide.hbuwiki.top 暂无结果（搜索引擎前后台数据同步周期的正常现象）*

#### 为什么“后台绿了，前台依然搜不到”？

这是所有新手站长最容易误判为“配置失败”的阶段。实际上，搜索引擎是由两个**完全解耦的子系统**构成的：

```
你的网站提交
    │
    ▼
【后端索引系统 (Indexing Engine)】─── 已完成 ✅
- 爬取页面、解析中文、生成倒排索引库
- 表现：后台 URL 检查亮起绿色「已成功编制索引」
    │
    ▼  （每天固定批次打包，向全球搜索分发集群广播 ⏳ 耗时 12~48 小时）
    │
【前台服务集群 (Serving Cluster)】─── 正在同步中 ⏳
- 响应全球用户实时搜索的分布式缓存切片节点
- 表现：前台 site: 查询暂未命中，等待下一次批处理广播推送到位后瞬间出现
```

- **结论**：后台既然已经打上绿色对勾，说明**技术与收录流程已 100% 通过**，无需做任何多余操作，静待 1~2 天让前台缓存切片广播完成即可。

#### ⚠️ 下方「2 找到 SEO/GEO 问题」是什么？
这是 Bing 内置的静态代码体检建议，**不影响已收录的事实**：
1. **标题太短（错误）**：首页 `<title>` 原为 `HBU Wiki`（8 个字符），Bing 建议 15~60 字符以覆盖更多搜索词。
2. **缺少图像 Alt 属性（通知）**：顶部导航栏 Logo 未设置 `alt` 文本。

### 7.2 针对性代码修复

在 `HBU-Wiki/.vitepress/config.mjs` 中进行三处优化：
1. **首页标题扩充**：`title: "HBU Wiki - 河北大学生存指南"`（8 → 16 字符，进入 Bing 建议的 15~60 区间），同时新增导航栏 `siteTitle: 'HBU Wiki'` 维持 UI 简洁。
2. **Logo Alt 补全**：`logo: { src: '/hbuwiki.png', alt: 'HBU Wiki Logo' }`。
3. **子页 Title 修正**：VitePress 的 `<title>` 由「frontmatter title | siteTitle」**自动拼接**（站点标题 = 全站签名后缀，改一次影响所有页面）。直接改 site title 会让所有子页 title 变成「xxx | HBU Wiki - 河北大学生存指南」（超长、且与 og:title 不一致）。`transformHead` 返回 title 标签**无效**（会产生两个 `<title>`，引擎只认 VitePress 默认的第一个）。改用官方 `titleTemplate`：
   ```js
   titleTemplate: ':title | HBU Wiki',   // 子页 → 「xxx | HBU Wiki」短格式
   ```
   首页 `index.md` frontmatter 加 `titleTemplate: false` → 保持完整「HBU Wiki - 河北大学生存指南」。全站 `<title>` 与 og:title 完全一致。
   **类比**：公司改邮件签名，老板改完自己的没发现，所有员工落款都拖了长签名——站点标题是全局的，只看首页改永远不够。

### 7.3 Google Search Console vs Bing Webmaster Tools 的工具哲学

| 维度 | Google Search Console (GSC) | Bing Webmaster Tools (BWT) |
|---|---|---|
| **核心定位** | **极简底线**：只报硬性致命故障（能否抓取/索引/移动端体验） | **全科体检**：兼职 SEO 审计工具（类似 Lighthouse 打分） |
| **对待短标题** | 正常收录；前台由算法**动态提取网页正文最匹配段落**展示 | 正常收录；但后台面板会严格标红提示建议加长 |
| **对待图片 Alt** | 正常收录；不主动报警 | 报通知项，建议补充无障碍与图片搜索信息 |
| **一句话总结** | “只要能看我就收录，展示时我靠算法动态优化” | “收录归收录，但我会按规范白纸黑字给你做代码体检” |

---

## 八、数据看板：GSC vs Umami（上游 vs 下游）

| | Google Search Console | Umami / Vercount |
|---|---|---|
| 管辖范围 | **进站前**（引擎内部） | **进站后**（网页行为） |
| 统计对象 | 仅 Google 搜索用户 | 所有渠道所有访客 |
| 核心数据 | 曝光量、关键词、排名 | 访客数/PV、停留时长、设备、地理位置 |
| 一句话 | 别人怎么从 Google 找到你 | 进站之后看了什么、看了多久 |

![HBU Wiki 接入的 Umami 实时数据大屏（统计进站后的真实访客、浏览量与停留时长）](../../assets/umami-analytics-dashboard.png)
*图：HBU Wiki 接入的 Umami 实时数据大屏（统计进站后的真实访客、浏览量与停留时长）*

- 两个工具**互补**，专业站长配置 = 两者都看
- 注：博客底部"访问人数/总访问量"计数器与 wiki 用的是**同一套 Vercount API**（events.vercount.one），通过 Cookie 去重统计 UV、每次加载累计 PV，本地 localhost 不计入
- 个人博客不加 Umami 大屏也完全可以：底部计数器 + Search Console 已够用，保持轻量

---

## 九、生效时间表与验证方法

| 项目 | 预期时间 |
|------|---------|
| Bing 收录 | 1~3 天 |
| Google 收录（已请求编入索引） | 2~7 天 |
| Blog 描述更新 | 3~7 天（等爬虫回访重爬） |
| Sitelinks 子链接卡片 | 1~3 个月（点击量积累后） |

**验证是否被收录**（浏览器地址栏直接搜）：
```
site:guide.hbuwiki.top
site:eryuemu.com
```
有结果列出即已入库；或者看 Search Console 左侧「网页索引」的已编入数量。

---

## 十、后续维护（零成本）

- 新增文章/页面：**不需要任何额外配置**。VitePress/Astro 构建时自动把新链接加进 sitemap.xml，引擎下次爬取自动发现
- 改标题/描述：blog 改 `consts.ts` 的 `SITE_TITLE/SITE_DESCRIPTION`；wiki 改 `config.mjs` → git push 即可，引擎 3~7 天内更新展示
- 搜索引擎会不会因为"手动提交过"就高看你的站？**不会**，提交只是加速发现，排名还是靠内容、结构、点击积累
