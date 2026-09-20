import { Euler, Quaternion, Vector3 } from 'three';
import {
  cells,
  normalizeBlock,
  ZERO,
  shapeOf,
  validBlock,
  type Block,
  type Point,
  type BlockRotation,
  type QuarterTurn,
} from './block-types.ts';
import { initialWorld, key } from './world.ts';

export type CustomBlueprint = {
  id: string;
  version: 1;
  name: string;
  createdAt: number;
  updatedAt: number;
  blocks: Block[];
  size: Point;
  anchor: Point;
};
const initialTerrain = new Map(
  initialWorld()
    .blocks.filter((b) => b.terrain)
    .map((b) => [key(b), b]),
);
export function isTerrain(b: Block) {
  if (b.terrain !== undefined) return b.terrain;
  const original = initialTerrain.get(key(b));
  return (
    !!original && original.material === b.material && shapeOf(b) === 'cube'
  );
}
export function bounds(blocks: Block[]) {
  const min = { x: Infinity, y: Infinity, z: Infinity },
    max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const b of blocks)
    for (const c of cells(b))
      for (const a of ['x', 'y', 'z'] as const) {
        min[a] = Math.min(min[a], c[a]);
        max[a] = Math.max(max[a], c[a]);
      }
  return {
    min,
    max,
    size: { x: max.x - min.x + 1, y: max.y - min.y + 1, z: max.z - min.z + 1 },
  };
}
export function createBlueprint(
  blocks: Block[],
  name: string,
  includeTerrain = false,
): CustomBlueprint {
  const chosen = blocks.filter((b) => includeTerrain || !isTerrain(b));
  if (!chosen.length)
    throw Error(
      '保存するブロックがありません。地面を含めるか、範囲を選び直してください。',
    );
  const { min, max, size } = bounds(chosen);
  const anchor = {
    x: Math.floor((min.x + max.x) / 2),
    y: min.y,
    z: Math.floor((min.z + max.z) / 2),
  };
  return {
    id: crypto.randomUUID(),
    version: 1,
    name: name.trim().slice(0, 30) || 'マイ設計図',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    size,
    anchor,
    blocks: chosen.map((b) =>
      normalizeBlock({
        ...b,
        x: b.x - anchor.x,
        y: b.y - anchor.y,
        z: b.z - anchor.z,
        terrain: false,
        ...(shapeOf(b) === 'door' ? { open: false } : {}),
      }),
    ),
  };
}
const quaternion = (r: BlockRotation) =>
  new Quaternion().setFromEuler(
    new Euler((r.x * Math.PI) / 2, (r.y * Math.PI) / 2, (r.z * Math.PI) / 2),
  );
// World yaw is composed before local XYZ Euler rotation; adding Euler.y alone
// would turn upside-down stairs around their local axis instead.
export function composeRotation(
  r: BlockRotation,
  turns: number,
): BlockRotation {
  if (turns % 4 === 0) return { ...r };
  const q = new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), (-turns * Math.PI) / 2)
    .multiply(quaternion(r));
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 4; y++)
      for (let z = 0; z < 4; z++) {
        const candidate = {
          x: x as QuarterTurn,
          y: y as QuarterTurn,
          z: z as QuarterTurn,
        };
        if (Math.abs(q.dot(quaternion(candidate))) > 0.999999) return candidate;
      }
  throw Error('回転を計算できません');
}
export function placeBlueprint(
  plan: CustomBlueprint,
  origin: Point,
  turns: number,
): Block[] {
  const rotations = new Map<string, BlockRotation>();
  return plan.blocks.map((b) => {
    let x = b.x,
      z = b.z;
    for (let i = 0; i < turns % 4; i++) [x, z] = [-z, x];
    const r = b.rotation ?? ZERO,
      id = JSON.stringify(r);
    if (!rotations.has(id)) rotations.set(id, composeRotation(r, turns));
    return {
      ...b,
      x: origin.x + x,
      y: origin.y + b.y,
      z: origin.z + z,
      rotation: rotations.get(id)!,
      terrain: false,
    };
  });
}
export function validateBlueprint(value: unknown): CustomBlueprint {
  const p = value as CustomBlueprint;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.id !== 'string' ||
    typeof p.name !== 'string' ||
    p.name.length > 30 ||
    !Number.isFinite(p.createdAt) ||
    !Number.isFinite(p.updatedAt) ||
    !Array.isArray(p.blocks) ||
    !p.blocks.length
  )
    throw Error('設計図を読み込めません');
  const occupied = new Set<string>();
  for (const b of p.blocks) {
    if (!b || !validBlock(b, true)) throw Error('設計図を読み込めません');
    for (const c of cells(b)) {
      if (![c.x, c.y, c.z].every(Number.isSafeInteger) || occupied.has(key(c)))
        throw Error('設計図を読み込めません');
      occupied.add(key(c));
    }
  }
  return { ...p, size: bounds(p.blocks).size };
}
