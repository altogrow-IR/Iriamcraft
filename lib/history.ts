import { cells, type Point } from './block-types.ts';
import { key, type World, type Block } from './world.ts';
type Meta = Pick<World, 'name' | 'placed' | 'shows'>;
export type HistoryCommand = {
  added: Block[];
  removed: Block[];
  updated: { before: Block; after: Block }[];
  before: Meta;
  after: Meta;
};
export function difference(before: World, after: World): HistoryCommand {
  const old = new Map(before.blocks.map((b) => [key(b), b])),
    next = new Map(after.blocks.map((b) => [key(b), b]));
  const command: HistoryCommand = {
    added: [],
    removed: [],
    updated: [],
    before: { name: before.name, placed: before.placed, shows: before.shows },
    after: { name: after.name, placed: after.placed, shows: after.shows },
  };
  for (const [k, b] of old) {
    const n = next.get(k);
    if (!n) command.removed.push(b);
    else if (b !== n && JSON.stringify(b) !== JSON.stringify(n))
      command.updated.push({ before: b, after: n });
  }
  for (const [k, b] of next) if (!old.has(k)) command.added.push(b);
  return command;
}
export function applyHistory(
  world: World,
  c: HistoryCommand,
  reverse = false,
): World {
  const map = new Map(world.blocks.map((b) => [key(b), b]));
  for (const b of reverse ? c.added : c.removed) map.delete(key(b));
  for (const b of reverse ? c.removed : c.added) map.set(key(b), b);
  for (const update of c.updated) {
    const b = reverse ? update.before : update.after;
    map.set(key(b), b);
  }
  const meta = reverse ? c.before : c.after;
  return { ...world, ...meta, blocks: [...map.values()] };
}
export function inRange(
  p: { x: number; y: number; z: number },
  a: typeof p,
  b: typeof p,
) {
  return (['x', 'y', 'z'] as const).every(
    (axis) =>
      p[axis] >= Math.min(a[axis], b[axis]) &&
      p[axis] <= Math.max(a[axis], b[axis]),
  );
}

export function blocksInRange(world: World, a: Point, b: Point): Block[] {
  return world.blocks.filter((block) =>
    cells(block).some((c) => inRange(c, a, b)),
  );
}
