import { normalizeBlock } from '../lib/block-types.ts';
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
  VERTICAL_LIMIT,
} from '../lib/world.ts';
void test('starter ground is approximately 2.5 times the previous area', () => {
  let oldArea = 0;
  for (let x = -10; x <= 10; x++)
    for (let z = -9; z <= 9; z++)
      if ((x * x) / 110 + (z * z) / 85 < 1) oldArea++;
  const area = initialWorld().blocks.filter((b) => b.y === 0).length;
  assert.ok(area / oldArea > 2.45 && area / oldArea < 2.55);
});
void test('connected columns extend above 15 and below -1 with save and removal support', () => {
  for (const direction of [-1, 1]) {
    let w = {
      ...initialWorld(),
      blocks: [normalizeBlock({ x: 0, y: 0, z: 0, material: 'grass' })],
    };
    for (let n = 1; n <= 160; n++) {
      const result = place(w, [
        { x: 0, y: n * direction, z: 0, material: 'grass' },
      ]);
      assert.equal(result.error, undefined);
      w = result.world as typeof w;
    }
    assert.deepEqual(parseWorld(JSON.stringify(w)), w);
    assert.equal(
      remove(w, { x: 0, y: 160 * direction, z: 0 }).blocks.length,
      160,
    );
  }
});
void test('vertical boundaries allow connected placement and reject crossing blueprints atomically', () => {
  for (const direction of [-1, 1]) {
    const y = direction * VERTICAL_LIMIT;
    const w = {
      ...initialWorld(),
      blocks: [
        normalizeBlock({ x: 0, y: y - direction, z: 0, material: 'wood' }),
      ],
    };
    const result = place(w, [{ x: 0, y, z: 0, material: 'wood' }]);
    assert.equal(result.error, undefined);
    assert.deepEqual(parseWorld(JSON.stringify(result.world)), result.world);
    assert.ok(
      place(result.world, [{ x: 0, y: y + direction, z: 0, material: 'wood' }])
        .error,
    );
    assert.throws(() =>
      parseWorld(
        JSON.stringify({
          ...w,
          blocks: [{ x: 0, y: y + direction, z: 0, material: 'wood' }],
        }),
      ),
    );
    const invalid = place(
      w,
      blueprint('tree', { x: 0, y: direction > 0 ? y - 2 : y - 1, z: 0 }),
    );
    assert.ok(invalid.error);
    assert.equal(invalid.world, w);
  }
});
void test('connected floors extend in all horizontal directions beyond the old boundary', () => {
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    let w = initialWorld();
    for (let i = 17; i <= 150; i++) {
      // Start at the existing edge, including any missing cells before 17.
      if (i === 17)
        for (let n = 14; n < 17; n++) {
          const b = { x: n * dx, y: 0, z: n * dz, material: 'grass' as const };
          if (!w.blocks.some((p) => key(p) === key(b))) w = place(w, [b]).world;
        }
      const result = place(w, [
        { x: i * dx, y: 0, z: i * dz, material: 'grass' },
      ]);
      assert.equal(result.error, undefined);
      w = result.world;
    }
    assert.deepEqual(parseWorld(JSON.stringify(w)), w);
  }
});
void test('expanding an old save preserves buildings, progress and original data', () => {
  const starter = initialWorld();
  const old = {
    ...starter,
    blocks: starter.blocks.filter(
      (b) => b.y > 0 || (b.x * b.x) / 110 + (b.z * b.z) / 85 < 1,
    ),
    placed: 23,
  };
  const expanded = expandGround(old);
  assert.equal(expanded.error, undefined);
  assert.equal(expanded.world.placed, 23);
  for (const b of old.blocks) assert.ok(expanded.world.blocks.includes(b));
  assert.ok(expanded.world.blocks.length > old.blocks.length);
  assert.ok(expandGround(expanded.world).error);
});
void test('coordinates remain GPU safe without a fixed block count limit', () => {
  const starter = initialWorld();
  assert.ok(
    place(starter, [{ x: HORIZONTAL_LIMIT + 1, y: 0, z: 0, material: 'grass' }])
      .error,
  );
  for (const count of [10000, 20000, 50000]) {
    const blocks = Array.from({ length: count }, (_, i) =>
      normalizeBlock({
        x: i % 250,
        y: 0,
        z: Math.floor(i / 250),
        material: 'grass',
      }),
    );
    const world = { ...starter, blocks };
    const result = place(world, [{ x: 0, y: 1, z: 0, material: 'white' }]);
    assert.equal(result.error, undefined);
    assert.equal(result.world.blocks.length, count + 1);
    assert.equal(
      parseWorld(JSON.stringify(result.world)).blocks.length,
      count + 1,
    );
  }
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

void test('ground blocks can be removed and replaced at height zero', () => {
  const world = initialWorld();
  const point = { x: 0, y: 0, z: 0 };
  const withoutFloor = remove(world, point);

  assert.equal(
    withoutFloor.blocks.some((block) => key(block) === key(point)),
    false,
  );

  const replaced = place(withoutFloor, [{ ...point, material: 'pink' }]);
  assert.equal(replaced.error, undefined);
  assert.equal(
    replaced.world.blocks.find((block) => key(block) === key(point))?.material,
    'pink',
  );
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
    { ...w, version: 3 },
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
