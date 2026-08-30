export interface ProjectLink {
	name: string;
	url: string;
	type: 'site' | 'github' | 'upstream' | 'demo' | 'doc';
}

export interface Project {
	id: string;
	title: string;
	desc: string;
	role?: string; // 身份角色：作者、核心贡献者等
	tags: string[];
	category: 'featured' | 'tools';
	links: ProjectLink[];
	status?: 'active' | 'beta' | 'archived';
	iconType: 'web' | 'wiki' | 'keyboard' | 'ai' | 'script';
}

export const projects: Project[] = [
	{
		id: 'eryuemu-blog',
		title: 'eryuemu-blog',
		role: '作者 / 独立开发',
		desc: '基于 Astro 5 构建的极简个人博客与技术知识空间，支持暗黑模式、流媒体音乐播放与心迹记录。',
		tags: ['Astro', 'TypeScript', 'MDX', 'CSS3'],
		category: 'featured',
		status: 'active',
		iconType: 'web',
		links: [
			{
				name: '博客主站 (eryuemu.com)',
				url: 'https://eryuemu.com',
				type: 'site',
			},
			{
				name: 'GitHub 源码',
				url: 'https://github.com/eryuemu/eryuemu-blog',
				type: 'github',
			},
		],
	},
	{
		id: 'hbu-wiki',
		title: 'HBU-Wiki',
		role: '发起与核心共建',
		desc: '校友共建的河北大学维基百科知识指南，帮助在校生及新生了解校园生活、规章选课与获取有效信息。',
		tags: ['Vue 3', 'VitePress', 'Markdown', 'GitHub Pages'],
		category: 'featured',
		status: 'active',
		iconType: 'wiki',
		links: [
			{
				name: '指南副站 (Pages)',
				url: 'https://guide.hbuwiki.top',
				type: 'site',
			},
			{
				name: '知识库主站',
				url: 'https://hbuwiki.top',
				type: 'site',
			},
			{
				name: 'GitHub 仓库',
				url: 'https://github.com/eryuemu/HBU-Wiki',
				type: 'github',
			},
		],
	},
	{
		id: 'colorful-keyboard',
		title: 'Colorful-Keyborad-Led-Color-Setting',
		role: '核心贡献者 (PR 已合并)',
		desc: '针对七彩虹游戏笔记本的键盘 LED 背光颜色控制与管理工具，支持自定义多分区灯效与颜色调节。已向上游主仓库提交功能优化 PR 并完成合入。',
		tags: ['C#', '.NET', 'WinForms', 'Hardware Control'],
		category: 'tools',
		status: 'active',
		iconType: 'keyboard',
		links: [
			{
				name: '官方主仓 (Upstream)',
				url: 'https://github.com/moshuiD/Colorful-Keyborad-Led-Color-Setting',
				type: 'upstream',
			},
			{
				name: '贡献 Fork 分支',
				url: 'https://github.com/eryuemu/Colorful-Keyborad-Led-Color-Setting',
				type: 'github',
			},
		],
	},
	{
		id: 'himeno-towa-ai',
		title: '姬野永远 (Himeno Towa) · Skills 与角色卡',
		role: '作者 / Skills 与角色卡',
		desc: '基于《永不落幕的前奏诗》（それよりノ前奏詩）女主角「姬野永远」剧情精细蒸馏生成的 Skills 技能数据包与 AI 角色卡，还原角色性格与言行细节，支持导入 SillyTavern 等酒馆客户端沉浸式对话。',
		tags: ['姬野永远', '永不落幕的前奏诗', 'Skills', 'AI 角色卡', 'SillyTavern', 'Galgame'],
		category: 'tools',
		status: 'active',
		iconType: 'ai',
		links: [
			{
				name: 'GitHub 仓库',
				url: 'https://github.com/eryuemu/Soreyori-no-Prologue-Himeno-Towa-AI-Character-and-Skills',
				type: 'github',
			},
		],
	},
	{
		id: 'jwc-monitor',
		title: 'HBU 教务通知与选课监控助手',
		role: '作者 / 自动化工具',
		desc: '自动定时抓取与解析河北大学教务处选课、补退选及重要教务通知，并在桌面实时弹出关键通知提醒。',
		tags: ['Python', 'Automation', 'Web Scraping', 'Cron'],
		category: 'tools',
		status: 'active',
		iconType: 'script',
		links: [],
	},
];
