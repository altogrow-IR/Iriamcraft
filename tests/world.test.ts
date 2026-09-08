import { test } from 'node:test';
import assert from 'node:assert/strict';
// Node executes the TypeScript source directly for these pure rules.
import {
  initialWorld,
  parseWorld,
  place,
  remove,
  brushBlocks,
  blueprint,
  key,
  liveScore,
  expandGround,
  HORIZONTAL_LIMIT,
  LIMIT,
} from '../lib/world.ts';
void test('starter ground is approximately 2.5 times the previous area', () => {
  let oldArea = 0;
  for (let x = -10; x <= 10; x++)
    for (let z = -9; z <= 9; z++)
      if (x * x / 110 + z * z / 85 < 1) oldArea++;
  const area = initialWorld().blocks.filter((b) => b.y === 0).length;
  assert.ok(area / oldArea > 2.45 && area / oldArea < 2.55);
});
void test('connected floors extend in all horizontal directions beyond the old boundary', () => {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let w = initialWorld();
    for (let i = 17; i <= 150; i++) {
      // Start at the existing edge, including any missing cells before 17.
      if (i === 17) for (let n = 14; n < 17; n++) {
        const b = { x: n * dx, y: 0, z: n * dz, material: 'grass' as const };
        if (!w.blocks.some((p) => key(p) === key(b))) w = place(w, [b]).world;
      }
      const result = place(w, [{ x: i * dx, y: 0, z: i * dz, material: 'grass' }]);
      assert.equal(result.error, undefined);
      w = result.world;
    }
    assert.deepEqual(parseWorld(JSON.stringify(w)), w);
  }
});
void test('expanding an old save preserves buildings, progress and original data', () => {
  const starter = initialWorld();
  const old = { ...starter, blocks: starter.blocks.filter((b) => b.y > 0 || b.x * b.x / 110 + b.z * b.z / 85 < 1), placed: 23 };
  const expanded = expandGround(old);
  assert.equal(expanded.error, undefined);
  assert.equal(expanded.world.placed, 23);
  for (const b of old.blocks) assert.ok(expanded.world.blocks.includes(b));
  assert.ok(expanded.world.blocks.length > old.blocks.length);
  assert.ok(expandGround(expanded.world).error);
});
void test('extension still enforces GPU-safe coordinates and total block budget', () => {
  const starter = initialWorld();
  assert.ok(place(starter, [{ x: HORIZONTAL_LIMIT + 1, y: 0, z: 0, material: 'grass' }]).error);
  const full = { ...starter, blocks: Array.from({ length: LIMIT }, (_, x) => ({ x, y: 0, z: 0, material: 'grass' as const })) };
  assert.ok(place(full, [{ x: LIMIT, y: 0, z: 0, material: 'grass' }]).error);
  assert.equal(expandGround(full).world, full);
  assert.ok(expandGround(full).error);
});
void test('starter island roundtrips without losing any blocks', () => {
  const w = initialWorld();
  assert.deepEqual(parseWorld(JSON.stringify(w)), w);
  assert.equal(new Set(w.blocks.map(key)).size, w.blocks.length);
});
void test('placement, collision and removal preserve the original world', () => {
  const w = initialWorld();
  const p = { x: 0, y: 1, z: 4 };
  const result = place(w, brushBlocks(p, 'pink', 'single'));
  assert.equal(result.error, undefined);
  assert.equal(result.world.blocks.length, w.blocks.length + 1);
  assert.equal(result.world.placed, 1);
  assert.ok(place(result.world, brushBlocks(p, 'pink', 'single')).error);
  assert.equal(remove(result.world, p).blocks.length, w.blocks.length);
  assert.equal(w.placed, 0);
});
void test('3x3 brush is atomic when any block overlaps', () => {
  const w = initialWorld();
  const blocks = brushBlocks({ x: 0, y: 1, z: 4 }, 'wood', 'floor');
  assert.equal(blocks.length, 9);
  const conflict = place(w, blocks);
  assert.ok(conflict.error);
  assert.equal(conflict.world, w);
});
void test('blueprints rotate without duplicates and stay within the island rules', () => {
  const w = initialWorld();
  w.blocks = w.blocks.filter((b) => b.y === 0);
  const arch = blueprint('arch', { x: 9, y: 1, z: 0 }, 1);
  assert.equal(new Set(arch.map(key)).size, arch.length);
  assert.ok(arch.every((b) => b.x === 9));
  assert.equal(place(w, arch).error, undefined);
  assert.ok(place(w, blueprint('stage', { x: 14, y: 1, z: 14 })).error);
});
void test('floating blocks, duplicates and invalid materials are rejected', () => {
  const w = initialWorld();
  const b = { x: 0, y: 14, z: 4, material: 'pink' as const };
  assert.ok(place(w, [b]).error);
  assert.ok(place(w, [b, b]).error);
  assert.ok(place(w, [{ ...b, y: 1, material: 'invalid' as 'pink' }]).error);
  assert.ok(place(w, [{ ...b, y: 16 }]).error);
});
void test('corrupt, incompatible, oversized and duplicate saves fail intentionally', () => {
  const w = initialWorld();
  for (const value of [
    null,
    {},
    { ...w, version: 2 },
    { ...w, placed: -1 },
    { ...w, blocks: [null] },
    { ...w, blocks: [w.blocks[0], w.blocks[0]] },
    { ...w, blocks: Array(6001).fill(w.blocks[0]) },
    { ...w, blocks: [{ x: 0, y: 0, z: 0, material: 'invalid' }] },
  ])
    assert.throws(() => parseWorld(JSON.stringify(value)));
  assert.throws(() => parseWorld('not json'));
});
void test('more building increases live response within the visitor limit', () => {
  const w = initialWorld();
  assert.ok(liveScore({ ...w, placed: 100 }).stars > liveScore(w).stars);
  assert.ok(liveScore({ ...w, placed: 10000 }).visitors <= 24);
});

