---
title: '域名 & 访问速度 Q&A'
description: '一问一答极简速查版：记录关于域名、GFW 封锁机制（DNS 污染 vs SNI 干扰）、Vercel 与 GitHub Pages 部署以及 CDN 加速的 14 个常见疑问精简解答。'
pubDate: '2026-08-12T18:21:35+08:00'
category: '开发'
type: 'ai-organized'
---

## 一、 域名与 GFW 封锁原理

### Q1: 为什么绑了自定义域名就行了？
- **A**: 因为 GFW 拦的是**「域名」**，不是**「服务器」**。你用 `eryuemu-blog.vercel.app` 访问，墙看到黑名单上的域名，直接 DNS 污染，连 IP 都拿不到。换成 `eryuemu.com` 后，墙不认识这个名字，正常解析放行。服务器、内容、IP 全都一样，只是换了张干净的「身份证」。

### Q2: 为什么 *.vercel.app 全红，eryuemu.com 基本全绿？
- **A**: `*.vercel.app` 整个后缀被 GFW 做了 **DNS 污染**（解析不出真实 IP），所以国内节点全红打不开。`eryuemu.com` 是干净的自定义域名，解析正常，请求就能顺利到达 Vercel 边缘节点。

### Q8: 什么叫「握手被掐」？
- **A**: 浏览器连接服务器时，必须先在 TLS 握手（SNI）时报上自己要访问的域名（因为一台服务器 IP 上托管着成千上万个网站）。这个自报家门是**明文传输**的，GFW 沿途能看见。当它在握手环节听到黑名单上的域名（如 `github.io`），就会直接挂掉你的连接。即：**DNS 解析正常（拿到 IP 了），但电话在握手时被中途掐断**。

### Q9: 博客文章里说 216.198.79.1 被墙、得换 76.76.21.21 的说法对吗？
- **A**: **不对**。`216.198.79.1` 和 `76.76.21.21` 都是 AWS 的 IP，实测国内 TCP 443 端口和 TLS 握手均可直连，都没被墙。打不开的真正原因是 `*.vercel.app` 域名被污染，而非 IP 问题。（该脑补说法已修正）

---

## 二、 GitHub Pages 与 SNI 握手干扰

### Q3: 为什么 github.io 访问有 82 个超时，绑了 guide.hbuwiki.top 只有 23 个？
- **A**: 两个地址指向的是**同一组 GitHub 服务器 IP**。区别在于 TLS 握手自报家门：自报 `github.io` 的，被 GFW 中途掐断（82 个）；自报 `guide.hbuwiki.top` 的，GFW 不认识该域名，直接放行（只剩 23 个）。那 23 个纯粹是跨境线路损耗，不是被拦。

### Q4: 为什么换了 guide 域名后稳定性提升很多？
- **A**: `github.io` 在 GFW 的重点抽查名单上，保安随机抽查掐线，有时放有时掐 ➔ **不稳定**。`guide.hbuwiki.top` 是陌生自定义域名，保安根本不认识 ➔ **每次都放行 ➔ 稳定**。

### Q5: 为什么 github.io 多刷新几次或者换网络就能通？
- **A**: 因为 `github.io` 的拦截是**概率性（SNI 随机掐）**的，不是 100% 封死。多刷新几次，碰上了没拦到的那次就通了；WiFi 换流量，不同线路的保安排班和节点不同。这和 `*.vercel.app` 不同——后者是 DNS 地图被抹掉了，怎么刷都找不到，永远进不去。

### Q6: 为什么 github.com（主站）进不去，但 github.io（Pages）还能用？
- **A**: GitHub 在 GFW 眼里不是单一域名，而是一族域名，各自待遇不同：
  - `github.com`（主站）与 `raw.githubusercontent.com`（文件下载）：被 **DNS 污染**，直接打不开。
  - `github.io`（Pages）：未被 DNS 污染（解析正常），只是**握手被概率性干扰**，属于待遇最好的那个。
  - 评论区说的“GitHub 进不去”和你的 Pages 打不开是两码事。

### Q7: 为什么 guide.hbuwiki.top 超时 23 个，eryuemu.com 只超时 10 个左右？
- **A**: 因为背后是不同的托管服务商，边缘节点离中国的地理线路不同。`guide.hbuwiki.top` 用的是 GitHub Pages (Fastly CDN)，节点主要在海外；`eryuemu.com` 用的是 Vercel，边缘节点覆盖更广、部分线路更靠近大陆。但 23 和 10 都是跨境直连正常的物理损耗，无需纠结。

---

## 三、 CDN、注册商与国内加速实战

### Q10: 为什么福建、湖北访问时总出现超时？
- **A**: **福建（及新疆、西藏）**是特殊监管试点区，对跨境流量有额外审查；**湖北**则是普通运营商线路 QoS 丢包。这不是你的网站问题，国内裸连访问任何境外托管网站都差不多。

### Q11: 在 Spaceship / Namecheap 买域名能加速吗？
- **A**: **不能**。域名注册商只负责“把域名登记并解析成 IP”，不触碰内容传输，不提供免费加速。你觉得变快，纯粹是因为域名后缀从被污染的 `*.vercel.app` 换成了干净的 `.com`。

### Q12: 需要给 guide.hbuwiki.top 挂 Cloudflare 加速吗？
- **A**: **不用**。Cloudflare 免费版在大陆没有节点，国内用户套 CF 相当于流量先绕到美国再回来，反而更慢（负加速）。你想要的“绕开 GFW 拦截”效果，绑定自定义域名就已经白拿到了。

### Q13: colleges.chat 的 cn.colleges.chat 国内加速是怎么做的？
- **A**: 他们采用了 **DNSPod 智能解析 + 新加坡付费 CDN (Aceville)**，给国内用户单独走一条免备案亚太加速线路。这是花钱的架构方案，适合流量大的商业/开源大项目。

### Q14: 为什么 colleges.chat 用的是 collegeschat.github.io 而不是 myxym？
- **A**: `CollegesChat` 是他创建的 **Organization（组织账号）**，项目放在组织里，Pages 就用组织名。`MyXym` 是他个人账号，Pages 对应 `myxym.github.io`。个人与组织的 Pages 域名各自独立。

---

## 相关笔记

- [域名、GFW 与国内访问：一场测速引发的排查实录](/blog/domain-gfw-and-china-access) ← 同一套结论的精加工详解版（含实测数据、对比表格与分级治理拆解）
