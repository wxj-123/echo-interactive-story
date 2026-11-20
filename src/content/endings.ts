import type { EndingKey } from '../engine/types';

export interface EndingMeta {
  key: EndingKey;
  title: string;
  subtitle: string;
  condition: string;
}

export const ENDINGS: EndingMeta[] = [
  {
    key: 'yongye',
    title: '永夜',
    subtitle: '你会重新变成一个干净的人',
    condition: '终章按下「删除」',
  },
  {
    key: 'huisheng',
    title: '回声',
    subtitle: '你一个人把它说了出来',
    condition: '第一章隐瞒 · 终章保留',
  },
  {
    key: 'guihuan',
    title: '归还',
    subtitle: '你终于把它还给了她',
    condition: '第一章坦白 · 终章保留',
  },
];

export function findEnding(key: EndingKey | undefined): EndingMeta | undefined {
  return ENDINGS.find((e) => e.key === key);
}
