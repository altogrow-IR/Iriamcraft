import { MATERIALS, type MaterialId } from './materials.ts';
import {
  cells,
  normalizeBlock,
  validBlock,
  type Block,
  type Point,
} from './block-types.ts';
export { MATERIALS, type MaterialId, type Block, type Point };
export type Brush = 'single' | 'line' | 'floor';
export type Blueprint = 'stage' | 'tree' | 'bench' | 'arch';
export type World = {
  version: 2;
  blocks: Block[];
  placed: number;
  shows: number;
  name: string;
};
export const HORIZONTAL_LIMIT = 8192;
export const VERTICAL_LIMIT = 8192;
export const ISLAND_AREA_SCALE = 2.5;
export const ISLAND_RADIUS_X = Math.ceil(Math.sqrt(110 * ISLAND_AREA_SCALE));
export const ISLAND_RADIUS_Z = Math.ceil(Math.sqrt(85 * ISLAND_AREA_SCALE));
export const islandDistance = (x: number, z: number) =>
  (x * x) / (110 * ISLAND_AREA_SCALE) + (z * z) / (85 * ISLAND_AREA_SCALE);
export const key = (p: Point) => `${p.x},${p.y},${p.z}`;
export const inBounds = (p: Point) =>
  Number.isInteger(p.x) &&
  Number.isInteger(p.y) &&
  Number.isInteger(p.z) &&
  Math.abs(p.x) <= HORIZONTAL_LIMIT &&
  Math.abs(p.z) <= HORIZONTAL_LIMIT &&
  Math.abs(p.y) <= VERTICAL_LIMIT;
export const onIsland = (x: number, z: number) => islandDistance(x, z) < 1;
export function blueprint(
  type: Blueprint,
  origin: Point,
  rotation = 0,
): Block[] {
  const result: Block[] = [];
  const add = (x: number, y: number, z: number, material: MaterialId) => {
    let rx = x,
      rz = z;
    for (let i = 0; i < rotation % 4; i++) [rx, rz] = [-rz, rx];
    result.push({
      x: origin.x + rx,
      y: origin.y + y,
      z: origin.z + rz,
      material,
    });
  };
  if (type === 'tree') {
    for (let y = 0; y < 4; y++) add(0, y, 0, 'wood');
    for (let y = 3; y < 6; y++)
      for (let x = -2; x <= 2; x++)
        for (let z = -2; z <= 2; z++)
          if (Math.abs(x) + Math.abs(z) < (y === 5 ? 3 : 4))
            add(x, y, z, 'pink');
  }
  if (type === 'bench') {
    for (let x = -1; x <= 1; x++) {
      add(x, 0, 0, 'wood');
      add(x, 1, -1, 'white');
    }
    add(-1, 1, 0, 'aqua');
    add(1, 1, 0, 'aqua');
  }
  if (type === 'arch') {
    for (let y = 0; y < 4; y++) {
      add(-2, y, 0, 'pink');
      add(2, y, 0, 'pink');
    }
    for (let x = -2; x <= 2; x++) add(x, 4, 0, x === 0 ? 'light' : 'pink');
  }
  if (type === 'stage') {
    for (let x = -3; x <= 3; x++)
      for (let z = -2; z <= 2; z++)
        add(x, 0, z, Math.abs(x) === 3 ? 'pink' : 'white');
    for (let y = 1; y <= 4; y++) {
      add(-3, y, -2, 'pink');
      add(3, y, -2, 'pink');
    }
    for (let x = -3; x <= 3; x++) add(x, 5, -2, x === 0 ? 'light' : 'aqua');
    for (let x = -2; x <= 2; x++) add(x, 1, -2, 'aqua');
  }
  return [...new Map(result.map((b) => [key(b), normalizeBlock(b)])).values()];
}
export function brushBlocks(
  origin: Point,
  material: MaterialId,
  brush: Brush,
  rotation = 0,
): Block[] {
  const blocks: Block[] = [];
  for (
    let x = brush === 'single' ? 0 : -1;
    x <= (brush === 'single' ? 0 : 1);
    x++
  )
    for (
      let z = brush === 'floor' ? -1 : 0;
      z <= (brush === 'floor' ? 1 : 0);
      z++
    )
      blocks.push({
        x: origin.x + (rotation % 2 ? z : x),
        y: origin.y,
        z: origin.z + (rotation % 2 ? x : z),
        material,
      });
  return blocks.map(normalizeBlock);
}
export function place(
  world: World,
  additions: Block[],
): { world: World; error?: string } {
  if (
    !additions.length ||
    additions.some(
      (b) =>
        !inBounds(b) || !validBlock(b) || cells(b).some((c) => !inBounds(c)),
    )
  )
    return {
      world,
      error: `横方向は±${HORIZONTAL_LIMIT}マス・高さは−${VERTICAL_LIMIT}〜${VERTICAL_LIMIT}まで建てられます`,
    };
  if (
    new Set(additions.flatMap(cells).map(key)).size !==
    additions.flatMap(cells).length
  )
    return { world, error: '同じ場所に複数のブロックは置けません' };
  const occupied = new Set(world.blocks.flatMap(cells).map(key));
  if (additions.flatMap(cells).some((b) => occupied.has(key(b))))
    return {
      world,
      error: 'ほかのブロックと重なっています。場所や高さを変えてみよう',
    };
  if (
    !additions.some(
      (b) =>
        (b.y === 0 && onIsland(b.x, b.z)) ||
        [
          [0, -1, 0],
          [0, 1, 0],
          [-1, 0, 0],
          [1, 0, 0],
          [0, 0, -1],
          [0, 0, 1],
        ].some(([x, y, z]) =>
          occupied.has(key({ x: b.x + x, y: b.y + y, z: b.z + z })),
        ),
    )
  )
    return { world, error: '地面やブロックに接する場所を選んでね' };
  return {
    world: {
      ...world,
      blocks: [...world.blocks, ...additions.map(normalizeBlock)],
      placed: world.placed + additions.length,
    },
  };
}
export function remove(world: World, p: Point): World {
  return {
    ...world,
    blocks: world.blocks.filter(
      (b) => !cells(b).some((c) => key(c) === key(p)),
    ),
  };
}
export function expandGround(world: World): { world: World; error?: string } {
  const occupied = new Set(world.blocks.flatMap(cells).map(key));
  const additions: Block[] = [];
  for (let x = -ISLAND_RADIUS_X; x <= ISLAND_RADIUS_X; x++)
    for (let z = -ISLAND_RADIUS_Z; z <= ISLAND_RADIUS_Z; z++)
      if (onIsland(x, z) && !occupied.has(key({ x, y: 0, z })))
        additions.push({ x, y: 0, z, material: 'grass' });
  if (!additions.length) return { world, error: '床はすでに広がっています' };
  return {
    world: {
      ...world,
      blocks: [...world.blocks, ...additions.map(normalizeBlock)],
    },
  };
}
export function initialWorld(): World {
  const map = new Map<string, Block>();
  const add = (x: number, y: number, z: number, material: MaterialId) =>
    map.set(key({ x, y, z }), { x, y, z, material });
  for (let x = -ISLAND_RADIUS_X; x <= ISLAND_RADIUS_X; x++)
    for (let z = -ISLAND_RADIUS_Z; z <= ISLAND_RADIUS_Z; z++)
      if (onIsland(x, z)) add(x, 0, z, 'grass');
  for (let z = -7; z <= 7; z++)
    for (let x = -1; x <= 1; x++) add(x, 0, z, 'sand');
  for (let x = -8; x <= 8; x++)
    for (let z = 2; z <= 3; z++) if (onIsland(x, z)) add(x, 0, z, 'sand');
  for (let x = 4; x <= 8; x++)
    for (let z = 3; z <= 6; z++) if (onIsland(x, z)) add(x, 0, z, 'water');
  for (let z = 3; z <= 6; z++) add(5, 1, z, 'wood');
  for (const b of blueprint('stage', { x: 3, y: 1, z: -4 })) map.set(key(b), b);
  for (const p of [
    { x: -6, y: 1, z: 3 },
    { x: 7, y: 1, z: -2 },
    { x: -1, y: 1, z: -7 },
  ])
    for (const b of blueprint('tree', p)) map.set(key(b), b);
  for (let x = -7; x <= -3; x++)
    for (let z = -5; z <= -1; z++) {
      add(x, 1, z, 'white');
      for (let y = 2; y <= 4; y++)
        if (z === -5 || x === -7 || x === -3)
          add(x, y, z, y === 3 && x === -3 ? 'glass' : 'white');
      add(x, 5, z, 'aqua');
      if (x >= -6 && x <= -4) add(x, 6, z, 'aqua');
      if (x === -5) add(x, 7, z, 'aqua');
    }
  add(-7, 4, 0, 'wood');
  add(-3, 4, 0, 'wood');
  for (let x = -7; x <= -3; x++) add(x, 4, 0, 'pink');
  for (const b of blueprint('bench', { x: 2, y: 1, z: 5 })) map.set(key(b), b);
  for (const p of [
    { x: -8, z: 0 },
    { x: 8, z: 1 },
    { x: -3, z: 6 },
    { x: 2, z: 7 },
    { x: -8, z: -3 },
  ]) {
    add(p.x, 1, p.z, 'wood');
    add(p.x, 2, p.z, 'light');
  }
  return {
    version: 2,
    blocks: [...map.values()].map(normalizeBlock),
    placed: 0,
    shows: 0,
    name: 'はじまりの浮島',
  };
}
export function parseWorld(raw: string): World {
  const v: unknown = JSON.parse(raw);
  if (!v || typeof v !== 'object') throw Error('保存形式を確認してください');
  const w = v as World,
    version = (v as { version: number }).version;
  if (
    (version !== 1 && version !== 2) ||
    !Array.isArray(w.blocks) ||
    !Number.isSafeInteger(w.placed) ||
    w.placed < 0 ||
    !Number.isSafeInteger(w.shows) ||
    w.shows < 0 ||
    typeof w.name !== 'string' ||
    w.name.length > 40
  )
    throw Error('対応していない保存データです');
  const occupied = new Set<string>();
  const blocks = w.blocks.map((b) => {
    if (!b || !inBounds(b) || !validBlock(b, version === 2))
      throw Error('ブロックデータを読み込めません');
    const block = normalizeBlock(
      version === 1 ? { x: b.x, y: b.y, z: b.z, material: b.material } : b,
    );
    for (const c of cells(block)) {
      if (!inBounds(c) || occupied.has(key(c)))
        throw Error('ブロックが重複・範囲外です');
      occupied.add(key(c));
    }
    return block;
  });
  return { version: 2, blocks, placed: w.placed, shows: w.shows, name: w.name };
}
export function liveScore(world: World) {
  const variety = new Set(
    world.blocks.filter((b) => b.y > 0).map((b) => b.material),
  ).size;
  const stage = world.blocks.filter(
    (b) => b.y > 0 && (b.material === 'pink' || b.material === 'light'),
  ).length;
  return {
    visitors: Math.min(
      24,
      3 + Math.floor(world.placed / 12) + Math.floor(stage / 25),
    ),
    stars: 25 + variety * 5 + Math.floor(world.placed / 5),
  };
}
