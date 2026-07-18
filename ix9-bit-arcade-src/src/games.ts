export type GameKind = 'snake' | 'race' | 'novel';

export interface GameInfo {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  size: string;
  rom: string;
  kind: GameKind;
  controls: string;
}

export const games: GameInfo[] = [
  {
    id: 'neon-snake',
    title: 'NEON SNAKE',
    subtitle: 'ネオン・スネーク',
    genre: 'GRID ACTION',
    size: '40 KB · PRG 2',
    rom: 'roms/neon-snake.nes',
    kind: 'snake',
    controls: '方向キーで移動 / STARTでリセット',
  },
  {
    id: 'apex-8',
    title: 'APEX 8',
    subtitle: 'エイペックス・エイト',
    genre: 'ARCADE RACING',
    size: '40 KB · PRG 2',
    rom: 'roms/apex-8.nes',
    kind: 'race',
    controls: '左右で操舵 / Aでブースト',
  },
  {
    id: 'tsukikage-letter',
    title: '月影のレター',
    subtitle: 'TSUKIKAGE LETTER',
    genre: 'JAPANESE NOVEL',
    size: '40 KB · PRG 2',
    rom: 'roms/tsukikage-letter.nes',
    kind: 'novel',
    controls: 'A / 右 / STARTで読み進める',
  },
];
