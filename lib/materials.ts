export type MaterialId =
  | 'grass'
  | 'wood'
  | 'white'
  | 'pink'
  | 'aqua'
  | 'glass'
  | 'leaf'
  | 'light'
  | 'stone'
  | 'water'
  | 'sand'
  | 'lightGray'
  | 'gray'
  | 'black'
  | 'brown'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'mint'
  | 'blue'
  | 'navy'
  | 'purple'
  | 'brick'
  | 'darkBrown'
  | `glass${'Pink' | 'Yellow' | 'Green' | 'Aqua' | 'Blue' | 'Purple'}`;
export type Category = '基本' | 'カラー' | 'ガラス' | '自然';
export const MATERIALS: {
  id: MaterialId;
  name: string;
  color: string;
  category: Category;
}[] = [
  { id: 'grass', name: '芝生', color: '#8cccad', category: '自然' },
  { id: 'wood', name: 'ウッド', color: '#c7a27c', category: '基本' },
  { id: 'white', name: '白レンガ', color: '#f3eee5', category: '基本' },
  { id: 'pink', name: 'さくら', color: '#f4a8c4', category: 'カラー' },
  { id: 'aqua', name: 'ミント', color: '#68cbd2', category: 'カラー' },
  { id: 'glass', name: 'ガラス', color: '#b8e6ee', category: '基本' },
  { id: 'light', name: '星あかり', color: '#ffda86', category: 'カラー' },
  { id: 'leaf', name: '木の葉', color: '#58ad94', category: '自然' },
  { id: 'stone', name: '石', color: '#a2abc0', category: '基本' },
  { id: 'water', name: '水', color: '#68c7e7', category: '自然' },
  { id: 'sand', name: '砂', color: '#ead5ad', category: '自然' },
];

const colors: [MaterialId, string, string][] = [
  ['lightGray', 'ライトグレー', '#d3d4da'],
  ['gray', 'グレー', '#89919e'],
  ['black', 'ブラック', '#424454'],
  ['brown', 'ブラウン', '#a78370'],
  ['red', 'レッド', '#d67f86'],
  ['orange', 'オレンジ', '#e9ac79'],
  ['yellow', 'イエロー', '#efdb8b'],
  ['lime', 'ライム', '#bdd789'],
  ['green', 'グリーン', '#76aa86'],
  ['mint', 'ミントグリーン', '#a1d9bf'],
  ['blue', 'ブルー', '#829fcf'],
  ['navy', 'ネイビー', '#596a91'],
  ['purple', 'パープル', '#b29acb'],
  ['brick', 'レンガ', '#be8a7c'],
  ['darkBrown', 'ダークブラウン', '#70594f'],
];
MATERIALS.push(
  ...colors.map(([id, name, color]) => ({
    id,
    name,
    color,
    category: 'カラー' as const,
  })),
);
for (const [suffix, name, color] of [
  ['Pink', 'ピンク', '#edb4d3'],
  ['Yellow', 'イエロー', '#f2df97'],
  ['Green', 'グリーン', '#a3d1ac'],
  ['Aqua', 'アクア', '#8cd9da'],
  ['Blue', 'ブルー', '#8aaedb'],
  ['Purple', 'パープル', '#bd9edb'],
] as const)
  MATERIALS.push({
    id: `glass${suffix}`,
    name: `${name}ガラス`,
    color,
    category: 'ガラス',
  });
MATERIALS.find((m) => m.id === 'glass')!.category = 'ガラス';
MATERIALS.find((m) => m.id === 'glass')!.name = 'クリアガラス';
MATERIALS.find((m) => m.id === 'aqua')!.name = '水色';
export const isGlass = (id: MaterialId) => id.startsWith('glass');
