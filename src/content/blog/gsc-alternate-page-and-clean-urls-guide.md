---
title: 'GSC 报警「备用网页」与「未编入索引」全复盘：VitePress Clean URLs 与多站 SEO 规范化'
description: '接续 8 月 18 日博客根域名重定向排查。详细复盘 8 月 20 日 GSC 两封邮件的前后因果、博客与知识库问题的内在关联，以及在 VitePress 中落地 Clean URLs 解决备用网页的完整实战。'
pubDate: '2026-08-20'
category: '开发'
type: 'ai-organized'
---

## 一、前后脉络：从 8 月 17 日到 8 月 20 日发生了什么？

把这几天收到的三封 GSC 邮件按时间线摆在一起，整个过程非常清晰：

![8 月 17 日博客首次收到 GSC 邮件——提示「全站网页」因「网页会自动重定向」未编入索引](../../assets/gsc-email-blog-redirect-alert-aug17.png)
*图 1：8 月 17 日博客首次收到 GSC 邮件——提示「全站网页」因「网页会自动重定向」未编入索引*

![8 月 20 日博客第 2 次收到 GSC 邮件——提示「站点地图中的网页」存在重定向](../../assets/gsc-email-blog-redirect-alert.png)
*图 2：8 月 20 日博客第 2 次收到 GSC 邮件——提示「站点地图中的网页」存在重定向*

![8 月 20 日知识库第 1 次收到 GSC 邮件——提示副站新原因「备用网页（有适当的规范标记）」](../../assets/gsc-email-hbuwiki-alternate-page-alert.png)
*图 3：8 月 20 日知识库第 1 次收到 GSC 邮件——提示副站新原因「备用网页（有适当的规范标记）」*

### 1.1 之前发生了什么？怎么干的？（8 月 17 ~ 18 日）
- **现象**：8 月 17 日，博客 `eryuemu.com` 首次收到 GSC 邮件（图 1），提示 4 篇博客文章因「网页会自动重定向」未编入索引；
- **排查与解决**：排查发现 Vercel 默认把根域名 `eryuemu.com` 自动 308 重定向到了 `www.eryuemu.com`。于是在 **8 月 18 日**，我们将博客主站正式反转确立为不带 www 的根域名 `eryuemu.com`，并在 GSC 控制台点击了「验证修正情况」。

### 1.2 现在又发生了什么？（8 月 20 日）
时隔两天，8 月 20 日下午邮箱同时收到了两封新邮件：
1. **博客的第 2 封信（图 2）**：标题写着 *「站点地图中的网页无法被编入索引：网页会自动重定向」*。这其实是 Google 爬虫在处理 `sitemap-index.xml` 报表时的阶段性账单——因为我们在 18 号提交的验证还在队列中排队（通常需要 1~2 周），系统按例行机制发送了这封信，并不是新 Bug；
2. **知识库副站的第 1 封信（图 3）**：知识库 `guide.hbuwiki.top` 首次报警，提示了从未见过的 **「备用网页（有适当的规范标记）」**。

---

## 二、两篇文章与两个站点的内在关联

为什么博客和知识库会接连收到 GSC 的未收录报警？它们之间有什么共同点？

| 站点 | 所属项目 | 遇到的报警 | 问题本质 | 解决动作 |
| :--- | :--- | :--- | :--- | :--- |
| **博客主站** | `eryuemu.com` (Astro) | 网页会自动重定向 | **域名层不统一**：根域名与 `www` 两个入口打架 | 8/18 统一为主域名 `eryuemu.com` |
| **知识库副站** | `guide.hbuwiki.top` (VitePress) | 备用网页（规范标记） | **路径层不统一**：无后缀路径与 `.html` 两个格式打架 | 8/20 统一为干净路径 `cleanUrls: true` |

**核心本质是一模一样的**：  
搜索引擎爬虫在访问站点时，发现**同一个页面可以通过两种不同的 URL 访问到**。为了防止内容重复造成权重分散，Google 会按照规则把其中一个判定为「重定向」或「备用网页」，只收录它认为的正规版本。

---

## 三、知识库排查：什么是「备用网页（有适当的规范标记）」？

进入 `https://guide.hbuwiki.top/` 的控制台：

![HBU Wiki 网页索引编制总览（未编入索引 6 vs 已编入索引 7）](../../assets/gsc-hbuwiki-indexing-overview.png)
*图 4：HBU Wiki 网页索引编制总览（未编入索引 6 vs 已编入索引 7）*

![未编入索引原因明细列表（备用网页 4 个，已发现 2 个，已抓取 0 个）](../../assets/gsc-hbuwiki-unindexed-reasons.png)
*图 5：未编入索引原因明细列表（备用网页 4 个，已发现 2 个，已抓取 0 个）*

### 3.1 破除名词误区
> [!NOTE]
> **「备用网页」不是指网站有备用服务器或镜像站。**  
> 在 Google 的术语体系中，**「备用网页（Alternate Page）」指的是「同一个页面的不同 URL 变体」**。

点击进入「备用网页」详情页：

![备用网页详情页及受影响趋势折线](../../assets/gsc-hbuwiki-alternate-canonical-drilldown.png)
*图 6：备用网页详情页及受影响趋势折线*

![受影响的 4 个无后缀示例 URL 列表](../../assets/gsc-hbuwiki-alternate-canonical-urls.png)
*图 7：受影响的 4 个无后缀示例 URL 列表*

受影响的 4 个 URL 为：
- `https://guide.hbuwiki.top/academics/transfer-materials`
- `https://guide.hbuwiki.top/academics/data-explorer`
- `https://guide.hbuwiki.top/academics/course-recommendations-xhs`
- `https://guide.hbuwiki.top/academics/transfer`

### 3.2 为什么会出现这个现象？
知识库是基于 **VitePress** 构建并托管在 **GitHub Pages** 上的。排查 `.vitepress/config.mjs` 发现代码在细节上“打架”了：

1. **写侧边栏时**：为了顺手，写的是不带 `.html` 的无后缀链接（如 `/academics/transfer`）；
2. **部署在 GitHub Pages**：GitHub Pages 内部会自动把 `/academics/transfer` 映射到 `academics/transfer.html` 并返回页面；
3. **页面 SEO 脚本**：`transformHead` 里写了一句 `.replace(/\.md$/, '.html')`，在 HTML 头部生成了 `<link rel="canonical" href=".../transfer.html" />`；
4. **Google 的判定**：爬虫访问了无后缀地址，但页面声明了带 `.html` 才是标准主地址，于是 Google 把无后缀版本记为「备用网页」，权重全额集中到 `.html` 页面。

这证明 Canonical 标签确实生效了，但为了让全站更整洁、消除 GSC 的多版本分流，最好把知识库也彻底统一为现代的 **Clean URLs（不带 .html）**。

### 3.3 补充：另外 2 个「已发现 - 尚未编入索引」
知识库还有 2 个页面处于已发现状态：

![已发现 - 尚未编入索引详情趋势](../../assets/gsc-hbuwiki-discovered-not-indexed-drilldown.png)
*图 8：已发现 - 尚未编入索引详情趋势*

![2 个处于发现排队中的 .html 示例 URL](../../assets/gsc-hbuwiki-discovered-not-indexed-urls.png)
*图 9：2 个处于发现排队中的 .html 示例 URL*

![已抓取 - 尚未编入索引页面为 0](../../assets/gsc-hbuwiki-crawled-not-indexed-empty.png)
*图 10：已抓取 - 尚未编入索引数量为 0*

这是 Google 从 Sitemap 中获知了 `about.html` 和 `analytics.html`，正在待抓取队列中排队，属于正常等待期。

---

## 四、博客现状复核：17 篇待爬取与 7 篇验证中

切换回个人博客 `https://eryuemu.com/` 的控制台：

![个人博客网页索引编制总览（已发现 17 个，网页会自动重定向 7 个）](../../assets/gsc-blog-unindexed-overview-17-7.png)
*图 11：个人博客网页索引编制总览（已发现 17 个，网页会自动重定向 7 个）*

### 4.1 17 篇文章「已发现 - 尚未编入索引」
![博客已发现 - 尚未编入索引详情趋势](../../assets/gsc-blog-discovered-not-indexed-drilldown.png)
*图 12：博客已发现 - 尚未编入索引详情趋势*

![博客 17 篇待爬取文章 URL 列表](../../assets/gsc-blog-discovered-not-indexed-urls.png)
*图 13：博客 17 篇待爬取文章 URL 列表*

博客新提交的 17 篇文章全部处于待抓取队列，爬虫会按权重周期性分批来爬。

### 4.2 7 个页面「网页会自动重定向」（验证中）
![博客网页会自动重定向详情（8 月 18 日验证进行中）](../../assets/gsc-blog-redirect-drilldown-validating.png)
*图 14：博客网页会自动重定向详情（8 月 18 日验证进行中）*

![受影响的 7 个重定向 URL 列表](../../assets/gsc-blog-redirect-url-list.png)
*图 15：受影响的 7 个重定向 URL 列表*

我们在 8 月 18 日改好 Vercel 并点击了「验证修正情况」，Google 正在重新验证这 7 个 URL。

### 4.3 URL 检查明细
在 GSC 检查单篇文章 `https://eryuemu.com/blog/ai-translation-reflections-e-society/`：

![单篇 URL 检查结果（网址尚未收录到 Google）](../../assets/gsc-blog-url-inspection-not-on-google.png)
*图 16：单篇 URL 检查结果（网址尚未收录到 Google）*

![引荐来源明细——Google 探测到了带/不带 www、带/不带斜杠多种路径，已锁定规范地址](../../assets/gsc-blog-url-inspection-referring-sources.png)
*图 17：引荐来源明细——Google 探测到了带/不带 www、带/不带斜杠多种路径，已锁定规范地址*

---

## 五、知识库改造实战：两步搞定 Clean URLs

在 `HBU-Wiki/.vitepress/config.mjs` 中进行修改，使知识库全站统一为不带 `.html` 的 Clean URLs：

```diff
 export default defineConfig({
   base: '/',
   title: "HBU Wiki - 河北大学生存指南",
+  cleanUrls: true, // 1. 开启 cleanUrls，生成现代干净无后缀 URL
 
   sitemap: {
     hostname: 'https://guide.hbuwiki.top'
   },
 
   transformHead({ pageData }) {
-    const canonicalUrl = `https://guide.hbuwiki.top/${pageData.relativePath}`
-      .replace(/index\.md$/, '')
-      .replace(/\.md$/, '.html')
+    const cleanPath = pageData.relativePath
+      .replace(/index\.md$/, '')
+      .replace(/\.md$/, '')
+    const canonicalUrl = `https://guide.hbuwiki.top/${cleanPath}`
```

### 5.1 本地编译验证
在 WSL 中执行 `npm run docs:build`：
- **Sitemap（`.vitepress/dist/sitemap.xml`）**：所有链接均变为 `https://guide.hbuwiki.top/about`、`.../academics/transfer`，`.html` 全部去除；
- **HTML 页面（`.vitepress/dist/about.html`）**：`<link rel="canonical" href="https://guide.hbuwiki.top/about">` 彻底与内链统一。

---

## 六、排坑插曲：WSL2 中 Git Push 遇 Connection Refused

在 WSL2 中对 HBU-Wiki 提交代码执行 `git push` 时，遇到了报错：

```bash
fatal: unable to access 'https://github.com/eryuemu/HBU-Wiki.git/': Failed to connect to github.com port 443: Could not connect to server
```

### 6.1 根因定位
1. 在 WSL2 中执行 `getent hosts github.com`，发现返回了 `127.0.0.1`；
2. 原来 Windows 主机开着 **Steam++（Watt Toolkit）** 加速工具，在 Windows 的 `hosts` 文件中写入了 `127.0.0.1 github.com`；
3. WSL2 默认同步了 Windows 的 DNS 解析，导致 WSL 尝试连接自身的 `127.0.0.1:443`，而 WSL 内部并没有对应服务，直接被系统拒绝连接。

### 6.2 解决方案
在 WSL2 的 `/etc/hosts` 中显式绑定 GitHub 真实官方 IP：

```bash
sudo sh -c "echo '20.205.243.166 github.com' >> /etc/hosts"
```

配置后重新执行 `git push origin main`，代码秒级成功推送。

---

## 七、总结

1. **前后因果清晰**：
   - 8 月 17 日博客首封邮件 ➔ 8 月 18 日把博客反转为根域名 `eryuemu.com` 并提交验证；
   - 8 月 20 日博客第 2 封邮件是验证排队期的例行账单；
   - 8 月 20 日知识库副站邮件是新出现的「备用网页」；
2. **两站问题本质相通**：
   - 博客解决了**域名层**（根域名 vs www）的二选一；
   - 知识库解决了**路径层**（无后缀 vs .html）的二选一；
3. **保持 URL 绝对统一**：
   站内链接、Sitemap、Canonical 保持 100% 相同格式（全面使用 Clean URLs），就是最规范、最省心的 SEO 实践。

> 📖 **回到前篇**：[《GSC 提示「网页会自动重定向」未编入索引？根域名与 www 规范化全复盘》](/blog/gsc-page-redirect-and-domain-canonical-guide/)
