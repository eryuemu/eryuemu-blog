// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = "eryuemu's blog";
export const SITE_DESCRIPTION = '你好，我是 eryuemu（二月木）。主修自动化专业。重度软硬件折腾控、赛博洁癖患者。这里记录了我折腾大模型、WSL2、Linux、eSIM、QQ 机器人、书法与二次元的日常。';
export const WALINE_SERVER_URL = 'https://comments.eryuemu.com'; // 请在此处填入您的 Waline 服务端地址，如果没有域名可以暂时填 Vercel 分配的域名
export const UMAMI_WEBSITE_ID = 'cc1efd93-dc34-45ab-85e2-9b3d28c373bd'; // Umami Cloud 分配给博客的专属 Website ID
export const UMAMI_DASHBOARD_URL = 'https://cloud.umami.is/share/8266GJJSrID9mjsc'; // Umami 免登录公开统计大屏地址

// 只有这些主机名才允许写入任何统计计数（Waline 阅读量、Umami PV）。
// 本地 dev/preview、Vercel 预览部署（*.vercel.app）都不在其中：
// 开发时反复刷新预览页会真实累加线上 Waline 的 path 计数，Umami 也会多出本地 PV。
// 以后加域名（如 www 或新站）就在这里补一项。
export const SITE_HOSTS = ['eryuemu.com', 'www.eryuemu.com'];

// Waline 的文章阅读量以「URL path」为存储键，一旦文章改名（slug 变更）且配置了 301，
// 访客浏览器里最终落地的是新 path，计数就会从 0 重新开始，旧 slug 已累计的阅读量变成孤儿数据。
// 这里声明「新 path ← 旧 path」的继承表：展示时把旧 path 存储的计数值并入当前文章，
// 而递增请求依然写在当前 path 上，因此总数 = 旧 slug 历史累计 + 新 slug 新增，浏览量不再腰斩。
// 规则：以后每次改 slug，除了 vercel.json 里的 301，就在这里补一行映射。
export const PAGEVIEW_INHERIT: Record<string, string[]> = {
	// 《转专业第一年，我彻底看清了大学评奖》← 原名《排在第十六个的傻子》
	'/blog/first-year-major-transfer-college-awards': ['/blog/the-sixteenth-fool'],
	// 《Ubuntu 26.04 动态壁纸扩展改造全记录》← 旧 slug 带 two-bugs 的长命名
	'/blog/gnome-live-wallpaper-engine-fix-recap': ['/blog/gnome-live-wallpaper-engine-two-bugs-fix-recap'],
};

