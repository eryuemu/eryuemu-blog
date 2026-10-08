export interface Friend {
  title: string;
  link: string;
  logo: string;
  desc: string;
  tags?: string[];
}

export const myProjects: Friend[] = [
  {
    title: 'HBU Wiki · 生存指北',
    link: 'https://guide.hbuwiki.top/',
    logo: '/friends/hbuwiki.png',
    desc: '非官方学生生存指北，汇集转专业真实数据、选课推荐与校园生活避坑。',
    tags: ['生存指北', '校园攻略'],
  },
  {
    title: 'HBU Wiki',
    link: 'https://hbuwiki.top/',
    logo: '/friends/hbuwiki.png',
    desc: '河北大学非官方校园知识库与生活百科，由河大师生共同维护。',
    tags: ['校园百科', '知识库'],
  },
];

export const friends: Friend[] = [
  {
    title: '口袋分享记',
    link: 'https://111620.xyz/',
    logo: '/friends/koudai-share.png',
    desc: '所谓过往，皆为序章。虚室生白️',
  },
  {
    title: "Jaffrez's Blog",
    link: 'http://jaffrez.io',
    logo: 'http://jaffrez.io/avatar.jpg',
    desc: '一名热衷于计算机的学生。',
  },
  {
    title: '池泛的小窝',
    link: 'https://chortle.asia',
    logo: 'https://chortle.asia/uploads/image/avater_1786082652615.jpg',
    desc: '山水有相逢，来日皆可期',
  },
  {
    title: '杜鹃声',
    link: 'https://afogsheep-github-io.pages.dev/',
    logo: 'https://afogsheep-github-io.pages.dev/images/avatar.webp',
    desc: 'AAAFORGE的技术博客',
  },
  {
    title: "LonelyBingの小窝",
    link: 'https://lonelybing.top',
    logo: 'https://img.lonelybing.top/file/头像/1789400498937.jpg',
    desc: '一名普普通通の大学生~',
  },
  {
    title: '雪雪档案馆',
    link: 'https://yuki-archive.ankotree.chatgpt.site/',
    logo: '/friends/yuki-archive.png',
    desc: '把喜欢的事，慢慢存起来。',
  },
];
