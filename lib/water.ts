import { key, inBounds, type Block, type Point } from './world.ts';
import { cells, shapeOf } from './block-types.ts';
export type WaterCell = Point & { level: number; falling: boolean };
export const NEIGHBORS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export function simulateWater(blocks: Block[]): WaterCell[] {
  const solid = new Set<string>(),
    sources: Block[] = [];
  let bottom = 0;
  for (const b of blocks) {
    bottom = Math.min(bottom, b.y - 1);
    if (shapeOf(b) === 'waterSource') sources.push(b);
    else for (const c of cells(b)) solid.add(key(c));
  }
  const found = new Map<string, WaterCell>(),
    queue: WaterCell[] = sources.map((b) => ({
      x: b.x,
      y: b.y,
      z: b.z,
      level: 7,
      falling: false,
    }));
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i],
      k = key(p),
      previous = found.get(k);
    // Below the lowest construction water drains into the sky; no artificial floor.
    if (
      p.y < bottom ||
      !inBounds(p) ||
      solid.has(k) ||
      (previous && previous.level >= p.level)
    )
      continue;
    const below = { ...p, y: p.y - 1 };
    p.falling = !solid.has(key(below));
    found.set(k, p);
    if (p.falling) queue.push(below);
    else if (p.level > 1)
      for (const [x, z] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        queue.push({
          x: p.x + x,
          y: p.y,
          z: p.z + z,
          level: p.level - 1,
          falling: false,
        });
  }
  return [...found.values()];
}
