export interface Friend {
  title: string;
  link: string;
  logo: string;
  desc: string;
}

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
  }
];
