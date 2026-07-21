export interface Friend {
	name: string;
	url: string;
	avatar: string;
	description: string;
	tags?: string[];
}

export const friends: Friend[] = [
	{
		name: '口袋分享记',
		url: 'https://111620.xyz/',
		avatar: 'https://img.111620.xyz/2025/07/29/6887b5efbf768.png',
		description: '斯是陋室，惟吾德馨。所谓过往，皆为序章。',
		tags: ['个人博客', '分享']
	}
];
