import type { MaterialId } from './materials.ts';
import { MATERIALS } from './materials.ts';
export type QuarterTurn = 0 | 1 | 2 | 3;
export type BlockRotation = { x: QuarterTurn; y: QuarterTurn; z: QuarterTurn };
export const SHAPES = [
  'cube',
  'slab',
  'stairs',
  'fence',
  'door',
  'glassPane',
  'gridWindow',
  'roofSlope',
  'roofRidge',
  'lamp',
  'waterSource',
] as const;
export type BlockShape = (typeof SHAPES)[number];
// Coordinates are stable identity: the game does not move existing blocks.
// Optional fields preserve the existing placement API; saved v2 blocks are normalized.
export type Block = {
  x: number;
  y: number;
  z: number;
  material: MaterialId;
  shape?: BlockShape;
  rotation?: BlockRotation;
  open?: boolean;
  terrain?: boolean;
};
export type Point = Pick<Block, 'x' | 'y' | 'z'>;
export const ZERO: BlockRotation = { x: 0, y: 0, z: 0 };
export const shapeOf = (b: Block) => b.shape ?? 'cube';
export function normalizeBlock(b: Block): Block {
  return {
    x: b.x,
    y: b.y,
    z: b.z,
    material: b.material,
    ...(b.terrain !== undefined ? { terrain: b.terrain } : {}),
    shape: shapeOf(b),
    rotation: { ...(b.rotation ?? ZERO) },
    ...(shapeOf(b) === 'door' ? { open: b.open ?? false } : {}),
  };
}
export function validBlock(b: Block, strict = false) {
  if (b.rotation === null || b.shape === null) return false;
  const shape = shapeOf(b),
    r = b.rotation ?? ZERO;
  return (
    (b.terrain === undefined || typeof b.terrain === 'boolean') &&
    MATERIALS.some((m) => m.id === b.material) &&
    SHAPES.includes(shape) &&
    (!strict || (b.shape !== undefined && b.rotation !== undefined)) &&
    r !== null &&
    ['x', 'y', 'z'].every(
      (a) =>
        Number.isInteger(r[a as keyof BlockRotation]) &&
        r[a as keyof BlockRotation] >= 0 &&
        r[a as keyof BlockRotation] <= 3,
    ) &&
    (b.open === undefined ||
      (shape === 'door' && typeof b.open === 'boolean')) &&
    (!['fence', 'door', 'glassPane', 'gridWindow'].includes(shape) ||
      (r.x === 0 && r.z === 0))
  );
}
export const cells = (b: Block): Point[] =>
  shapeOf(b) === 'door' ? [b, { x: b.x, y: b.y + 1, z: b.z }] : [b];
export function rotateBlock(
  b: Block,
  axis: 'x' | 'y',
  direction: number,
): Block {
  const shape = shapeOf(b);
  if (
    ['cube', 'waterSource', 'lamp'].includes(shape) ||
    (axis === 'x' &&
      !['slab', 'stairs', 'roofSlope', 'roofRidge'].includes(shape))
  )
    return b;
  const rotation = { ...(b.rotation ?? ZERO) };
  rotation[axis] = ((rotation[axis] + direction + 4) % 4) as QuarterTurn;
  return { ...b, rotation };
}
export const SHAPE_NAMES: Record<BlockShape, string> = {
  cube: 'ブロック',
  slab: 'ハーフ',
  stairs: '階段',
  fence: '柵',
  door: 'ドア',
  glassPane: '板ガラス',
  gridWindow: '格子窓',
  roofSlope: '傾斜屋根',
  roofRidge: '屋根の棟',
  lamp: 'ランプ',
  waterSource: '水源',
};
