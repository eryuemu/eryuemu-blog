---
title: '域名 & 访问速度 Q&A'
description: '一问一答极简速查版：记录关于域名、GFW 封锁机制、Vercel/GitHub Pages 访问速度与 Cloudflare CDN 的 13 个常见疑问精简解答。'
pubDate: '2026-08-12'
category: '开发'
type: 'ai-organized'
---

Q: 为什么绑了域名就行了?
A: 因为 GFW 拦的是"域名",不是"服务器"。你用 eryuemu-blog.vercel.app 访问,墙看到黑名单上的域名,直接污染 DNS,你连 IP 都拿不到。换成 eryuemu.com 后,墙不认识这个名字,正常解析,正常访问。服务器、内容、IP 全都一样,只是换了张"身份证"。

Q: 为什么 vercel.app 全红,eryuemu.com 基本通?
A: .vercel.app 这个后缀被 GFW 做了 DNS 污染(解析不出真 IP),所以全国谁都打不开。eryuemu.com 是干净域名,解析正常,就通了。

Q: 为什么 github.io 访问 82 个超时,绑了 guide.hbuwiki.top 只有 23 个?
A: 两个地址是同一个服务器(同一组 IP)。区别在于握手时自报家门:报 github.io 的,被 GFW 中途掐掉(82 个);报 guide.hbuwiki.top 的,GFW 不认识,放行(剩 23 个)。那 23 个纯粹是线路差,不是被拦。

Q: 为什么换了 guide 域名后稳定性好很多?
A: github.io 在 GFW 的抽查名单上,保安随机拦,有时放有时掐 → 不稳定。guide.hbuwiki.top 是陌生名字,保安根本不认识 → 每次都放行 → 稳定。

Q: 为什么 github.io 多刷新几次或者换网络就能通?
A: 因为 github.io 的拦截是概率性的,不是 100%。多刷 → 碰上了没拦到的那次就通了。WiFi 换流量 → 不同线路的保安排班不一样,这条路有保安,那条路没有。这和 vercel.app 不同——vercel.app 是地图被抹掉了,怎么刷都找不到,永远进不去。

Q: 为什么 github.com(主站)进不去,但 github.io(Pages)还能用?
A: GitHub 在 GFW 那里不是一个域名,是一堆域名,每个待遇不同。github.com(主站)和 raw.githubusercontent.com(文件下载)被 DNS 污染,直接打不开。github.io(Pages)没被污染(DNS 正常解析),只是握手被概率性干扰,属于待遇最好的那个。评论区说的"GitHub 进不去"和你的 github.io 是两码事。

Q: 为什么 guide.hbuwiki.top 超时 23 个,eryuemu.com 只超时 10 个左右?
A: 因为背后是不同的托管商,服务器离中国的地理距离不一样。guide.hbuwiki.top 用的是 GitHub Pages(Fastly CDN),节点主要在海外;eryuemu.com 用的是 Vercel,边缘节点覆盖更广,部分线路更靠近大陆。同样的跨境访问,不同的服务器,线路质量自然有差异。但 23 和 10 都是跨境正常的物理损耗,不需要纠结。

Q: 什么叫"握手被掐"?
A: 浏览器连接服务器时,必须先报上自己要访问的域名(因为一台服务器上住着几万个网站)。这个自报家门叫 TLS 握手(SNI),GFW 沿途能看见。看到黑名单上的域名,就挂你电话。DNS 解析正常(拿到 IP 了),但电话被中途挂掉,所以部分节点超时。

Q: 博客文章里 216.198.79.1 被墙的说法对吗?
A: 不对。216.198.79.1 和 76.76.21.21 都是 AWS 的 IP,实测国内 TCP 443 和 TLS 都能通过,都没被墙。真正的原因是 .vercel.app 域名被污染,不是 IP 问题。(已修改)

Q: 为什么福建/湖北总超时?
A: 福建是特殊监管试点区,跨境连接天生被折腾。湖北是普通线路丢包。不是你网站的问题,访问任何境外网站都差不多。

Q: Spaceship/Namecheap 买域名能加速吗?
A: 不能。注册商只管"域名翻译成 IP",不碰数据,不加速。你觉得变快,是因为换了个没被墙的域名。

Q: 要挂 Cloudflare 加速吗?
A: 不用。CF 免费版大陆没节点,挂了反而更慢(多绕一圈)。你想要的"绕开拦截"效果,换自定义域名已经拿到了。

Q: colleges.chat 的 cn.colleges.chat 是怎么做的?
A: 他们用了 DNSPod 智能解析 + 新加坡付费 CDN(Aceville),给国内用户单独走一条加速线路。这是花钱的方案,他们是流量大的项目才值得搞。

Q: 为什么 colleges.chat 用的是 collegeschat.github.io 而不是 myxym?
A: collegeschat 是他建的组织账号,项目放组织里,Pages 就用组织名。myxym.github.io 是他个人博客。个人和组织的 Pages 各用各的名字。

---

## 相关笔记

- [域名、GFW 与国内访问：一场测速引发的排查实录](/blog/domain-gfw-and-china-access) ← 同一套结论的精加工版（含实测数据、表格、14 问详解）
