---
title: '一个博客为什么同时跑三套访问统计：Vercount、Waline 与 Umami 的分工、粒度与四个隐性坑'
description: '起因是一次意外：文章还没上线，本地开发服务器反复刷新就把它的阅读量刷成了 3。顺着查下去，把博客里三套统计系统彻底拆开看一遍——Vercount 的 site_uv/site_pv 是全站级、page_pv 才是按 URL；Waline 名义上是评论系统，但它的 Article 表用 URL path 存阅读量；Umami 负责来源与设备。文中带全部实测数字（1307 人 / 7034 次、www 与裸域是两套独立计数、每篇阅读量的真实取值），并记录四个隐性坑：改 slug 导致阅读量腰斩、换域名导致页脚归零、本地预览污染线上数据、全站浏览数与文章阅读数永远对不上账。最后给出防污染的域名白名单实现与验证方法。'
pubDate: '2026-10-24T13:08:27+08:00'
category: '开发'
type: 'ai-organized'
---

# 一个博客为什么同时跑三套访问统计：Vercount、Waline 与 Umami 的分工、粒度与四个隐性坑

> **核心背景**：一篇还没发布的文章，在本地开发服务器里刷新了几下，页脚的“N 次阅读”就变成 3 了。这暴露出一个我一直没搞清的问题：我这个博客到底有几套访问统计？它们各自记什么、存在哪、按什么粒度累加？为什么页脚的全站数和每篇文章的阅读数不是同一个来源？
>
> **本文内容**：三套系统的分工与存储粒度（附全部实测数字）→ 四个隐性坑及成因 → 这次怎么修以及怎么验证“确实没污染”。

---

## 一、三套系统分别是谁

| 你看到的数字 | 数据来源 | 存储粒度 | 全站实测值 |
| --- | --- | --- | --- |
| 页脚“访客 / 浏览” | Vercount `events.vercount.one` 的 `site_uv` / `site_pv` | **整个域名一套数**，不分页面 | 1307 人 / 7034 次 |
| 每篇文章底部“N 次阅读” | 自建 Waline 服务端 `comments.eryuemu.com` 的 `Article.time` | **按 URL path**，每篇一个数 | 见下文逐篇取值 |
| Umami 统计大屏（页面上不显示） | `cloud.umami.is` | 按 host + path + 会话 | 通过分享链接查看 |

三套不是重复建设，它们各自解决一个不同的问题：页脚要的是“这站一共来过多少人”，文章要的是“这篇被读了几次”，Umami 要的是“这些人从哪来、用什么设备、看了多久”。前两者需要**计数**，第三者需要**维度**，实现路线完全不同。

---

## 二、Vercount：一个“站点级”计数器，但它其实也藏了按页数据

调用发生在 `src/components/Footer.astro`，两处关键细节：

```js
// 将计数请求映射到历史统计标识（www.eryuemu.com），无缝继承 7 月以来积累的人数与访问量
const statUrl = window.location.href.replace(/^https?:\/\/eryuemu\.com/, 'https://www.eryuemu.com');
```

页脚代码读取的字段只有两个：

```js
const siteUv = Number(data.site_uv || 0);
const sitePv = Number(data.site_pv || 0);
```

### 实测：同域下不同路径返回完全相同

对五个不同 URL 做只读 GET：

```text
https://www.eryuemu.com/                                      site_uv 1307  site_pv 7034  page_pv 2577
https://www.eryuemu.com/blog/                                 site_uv 1307  site_pv 7034  page_pv 956
https://www.eryuemu.com/blog/url-trailing-slash-…/            site_uv 1307  site_pv 7034  page_pv 106
https://www.eryuemu.com/blog/repo-standards-files-guide/      site_uv 1307  site_pv 7034  page_pv 0
```

两个结论：

1. **`site_uv` / `site_pv` 是全站级**，无论传哪个 URL 返回都一样。所以页脚这个数天生不能拿来分文章统计。
2. **返回体里还有一个 `page_pv`，它确实是按 URL 存的**（首页 2577、`/blog/` 956、某篇长文 106）。也就是说“文章阅读量也走 Vercount”技术上是可行的，只是我没读这个字段。

顺带确认了这个第三方接口不会因查询而涨数：**五次调用 `site_pv` 恒为 7034**，与页脚代码注释里“GET 请求仅获取当前数据，完全不增加 `site_pv` 和 `site_uv`”一致。

---

## 三、Waline：它明明是评论系统，为什么在读数字

因为 Waline 服务端自带一张 `Article` 表，而阅读量的存储键正是**页面 URL path**。接口只有两个形态：

```text
只读：GET  https://comments.eryuemu.com/api/article?path=/blog/xxx&type=time   →  {"data":[{"time":3}]}
写入：POST https://comments.eryuemu.com/api/article  {"path":"/blog/xxx","type":"time","action":"inc"}
```

实测逐篇取值（注意键是**去掉尾斜杠**的 path，源码里 `cleanPath = pathname.replace(/\/+$/, '')`）：

| 文章 path | Waline `time` |
| --- | --- |
| `/blog/repo-standards-files-guide` | 3 |
| `/blog/repo-standards-files-guide/`（带尾斜杠） | 0 |
| `/blog/url-trailing-slash-directory-index-guide` | 4 |
| `/blog/the-sixteenth-fool` | 8 |

**同一路径带不带尾斜杠，是两个独立计数**——这一条后来成了坑（见第五节）。

之所以选 Waline 而不是再引一个第三方，实际理由是：评论和阅读量**用同一个 path 作为键**，天然对齐；而且服务端在我自己手里，不用相信任何外部服务的统计口径。

代价也在这张表上：`action:'inc'` 是**唯一的写接口，没有归零、没有设值、没有扣减**。一旦某个 path 被写脏，公开接口层面清不掉。

---

## 四、Umami：负责“人从哪来”，页面上一行数字都不显示

`src/components/BaseHead.astro` 里注入 `https://cloud.umami.is/script.js` 并带上 `data-website-id`。它与前两者的本质差别是：Vercount 和 Waline 是**计数器**（一个整数），Umami 是**分析器**（会话、来源、设备、时长、页面路径）。所以它不可能在页脚显示成一个好看的整数，它的数据在统计大屏里看。

---

## 五、四个隐性坑

### 坑一：改 slug 会让阅读量腰斩

Waline 以 path 为键，所以文章改名 + 配 301 之后，访客浏览器最终落地的是**新 path**，计数从 0 重新开始，旧 slug 已累计的阅读量变成孤儿数据。我踩过的实例是《转专业第一年》由 8 掉到 3。

解法是继承表：`src/consts.ts` 里的 `PAGEVIEW_INHERIT` 声明“新 path ← 旧 path”，展示时把旧 path 的累计值并入当前文章，**递增请求仍然写在当前 path**。因此总数 = 旧 slug 历史累计 + 新 slug 新增，之后继续正常增长。

规则：**以后每次改 slug，除了 `vercel.json` 里的 301，必须在这里补一行映射。**

### 坑二：`www` 与裸域是两套完全独立的计数

同一时刻实测：

```text
https://www.eryuemu.com/…   site_uv 1307   site_pv 7034
https://eryuemu.com/…       site_uv 2      site_pv 12
```

Vercount 把两者当作两个不同的站点。页脚那行 `statUrl` 替换就是为了把裸域访客也记进 www 的历史数据里。**推论：如果哪天换主域、去掉 www 或改跳转方向，这行映射必须同步改，否则页脚数字直接从 0 开始**——和坑二同类，都是“统计键”与“URL 形态”耦合造成的。

### 坑三：本地预览会污染线上数据（这次就是这么发现三套系统的）

三套系统在改动前的防护水平完全不同：

| 系统 | 本地 dev 会不会写线上 | 原因 |
| --- | --- | --- |
| Vercount 页脚 | **不会** | 代码里有 `hostname === 'localhost' || '127.0.0.1'` 判断，直接显示“1 (本地)”并 return |
| Waline 阅读量 | **会，那 3 次就是它** | 只判断了“本次会话是否已记过”和“站长免记账”，完全没有域名判断 |
| Umami | dev **不会**，但 `npm run build` 后本地 `preview` **会** | 注入条件是 `import.meta.env.PROD`，dev 被挡住，而生产构建产物在任何主机上都注入 |

也就是说，一段代码写了防护，另一段没写，而它们的失效方式还各不相同。

### 先掰清一件事：在本地打开，不等于“没上网”

这件事最容易想反：页面明明是我在本地浏览器里打开的，怎么会碰到线上的数据？

因为**那块计数板不在我这台电脑上**。每篇文章的阅读数存在自己的 Waline 服务端，浏览器打开文章页时会做两件事：先向服务器**问一次**“这篇几次了”，再**报一次**“我又看了一遍，+1”。这两个动作都是真实的网络请求，从 `localhost` 照样发得出去。所以“本地打开”只决定**页面代码从哪来**，不决定**数据写到哪去**。

顺带把两个都叫“本地”的东西分开：

| | `dev`（边改边看） | `preview`（验收打包成品） |
| --- | --- | --- |
| 你打开的是什么 | 每次存盘后现场编译出来的页面 | `dist` 里的**成品文件**，也就是要上传上线的那一份 |
| 页面自带的标记 | “我在开发中” | “我是正式版”（因为它就是为上线准备的） |
| 靠标记判断的防护能否生效 | 能 | **不能**——成品分不清你是关起门试穿，还是真穿出门见客 |
| 靠网址名判断的防护能否生效 | 能 | 能 |

一句话：**标记会骗人，网址不会。** 标记回答的是“这份代码是从哪个模式编译出来的”，而本地验收成品时，那个答案和线上完全一样；只有网址名老实回答了“你现在到底在哪个站点上”。

### 那我实际用的是哪种？

我的日常流程是 `dev` 起服务、浏览器开 `localhost` 看一眼、没问题就 push，`preview` 基本不碰。所以对照上面那张表，这三家统计里**真正被写脏的只有一家**：

- Vercount 页脚：认网址 → 从没被本地刷过；
- Umami：认标记 → 在我只用 `dev` 的前提下它也没漏，那个洞是**潜在**的，只有跑一次 `preview` 才会暴露（我这次专门跑了一次来验证，确认改完后成品同样不记账）；
- **Waline 每篇阅读量：既没认网址也没认标记，只认“这次会话记过没有”——所以那 3 次全记在它头上。**

三家漏一家，漏的恰好是最被在意的那个数字。这就是为什么“我以为早就防好了”和“确实被污染了”两件事能同时成立。

### 补一句：为什么我会以为“早就防好了”

防污染的代码确实早就存在，而且不止一份——问题是**三套系统各写各的，覆盖范围互不重叠**：

| 既有防护机制 | 覆盖哪些系统 | 本地 dev 里是否生效 | 本地 `preview` 里是否生效 |
| --- | --- | --- | --- |
| `hostname === 'localhost' \|\| '127.0.0.1'` 判断 | 只有 Vercount 页脚 | 生效 | 生效 |
| `import.meta.env.PROD` 条件 | 只有 Umami | 生效 | **不生效**（构建产物在任何主机都注入） |
| 站长免记账模式 `?eryuemu0721` | **三套全覆盖** | **不生效** | **不生效** |

唯一“三套通吃”的是免记账模式，它把标记写进 `localStorage`。但 **`localStorage` 是按 origin 隔离的**：我在 `https://eryuemu.com` 上开启免记账，`http://localhost:4322` 这个 origin 里根本不存在那个键。这次实测取回的结果就是 `ownerFlag: null`。所以它从结构上就保护不了本地开发——**不是忘了开，是开了也到不了本地**。

这正是这次改动方式上的区别：`SITE_HOSTS` 不依赖任何访问者侧的状态，它写在代码里、随构建产物走。无论从哪个 origin 打开、无论谁的浏览器有没有开免记账，只要主机名不在白名单就不记账。三套系统也因此第一次统一到同一条规则上。

### 坑四：全站浏览数永远不等于各篇文章阅读数之和

页脚 7034 次包含首页、心迹、关于、RSS 等**所有页面**的访问；Waline 只给文章级数字。两者口径不同，任何时候都对不上账。这不是 bug，是设计，但如果哪天想在页面上并列展示这两个数，最好提前想清楚要不要加一句说明——否则一定有人问“为什么加起来不对”。

---

## 六、这次怎么修的

统一改成**运行时按主机名白名单判断**，只在生产域名记账。`src/consts.ts` 新增：

```ts
export const SITE_HOSTS = ['eryuemu.com', 'www.eryuemu.com'];
```

三处接入：

- **Waline**（`src/layouts/BlogPost.astro`）：递增条件从 `!alreadyViewed && !isOwner` 改为再加一个 `&& SITE_HOSTS.includes(window.location.hostname)`。只读展示不受影响——本地照样能看到线上累计的真实数字。
- **Umami**（`src/components/BaseHead.astro`）：把构建期 `import.meta.env.PROD` 判断换成运行时判断，只有主机名在白名单内才动态创建并插入 `script` 标签。这样 `astro preview` 与 Vercel 预览部署也不再记账。
- **Vercount**：原本就有 localhost 判断，未改动；但既然白名单已经存在，后续可以统一口径。

**副作用要写清楚**：白名单意味着以后新增任何域名（换主域、加站点镜像、用 Vercel 临时域名做正式入口）都必须记得补一行，否则线上阅读量会“看起来坏了”——不再增长。这是一个用可控性换来的新失效点。具体到我这个站：名单里写的是 `eryuemu.com` 与 `www.eryuemu.com`，正好是正式在用的两个域名，所以线上计数不受影响；但如果直接用 Vercel 分配的 `xxx.vercel.app` 打开页面分享，那个网址不在名单里，**不会计数**。

### 验证方法：不能只看“数字没变”

“打开本地页面后服务端数字还是 3”这件事本身不能证明修复生效，因为页面脚本可能压根没跑。**要先证明脚本确实执行了，再看它有没有写。** 在 `127.0.0.1:4322` 打开页面后取回页面状态：

```text
hostname              127.0.0.1
pageviewShown         "3"        ← 阅读量被填成真实数字，说明脚本跑了、也连上了线上 Waline
umamiScriptInjected   false      ← Umami 脚本未被注入
sessionKeys           []         ← waline_pv_* 这个键没有写入
ownerFlag             null       ← 免记账模式没开，跳过记账靠的是白名单本身
```

其中 `sessionKeys` 为空是最关键的一条：递增分支成功后会写入 `waline_pv_<path>`，没写就说明走的是只读分支。最后再查服务端仍是 `{"time":3}`，四处证据闭合。

---

## 七、留给以后的维护清单

| 触发场景 | 必须同步改动的位置 |
| --- | --- |
| 文章改 slug | `vercel.json` 的 301 **+** `consts.ts` 的 `PAGEVIEW_INHERIT` |
| 换主域名 / 调整 www 跳转 | `Footer.astro` 的 `statUrl` 映射 **+** `consts.ts` 的 `SITE_HOSTS` |
| 新增统计系统 | 一并纳入 `SITE_HOSTS` 判断，并在本地 dev 用同样方法验证“脚本跑了但没写” |
| 想把文章阅读量也换成 Vercount 的 `page_pv` | 需要先验证 `page_pv` 是否随访问递增（本次只做了只读查询，未确认写入行为） |

一句话总结：**同一个“访问量”在这个博客里其实是三个不同的东西——全站级、页面级、会话级。它们各自的存储键决定了各自的脆弱点：path 决定改名会腰斩，host 决定换域名会归零，而有没有判断主机名，决定本地开发会不会把线上数据写脏。**
