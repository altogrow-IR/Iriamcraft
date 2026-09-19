import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  initialWorld,
  parseWorld,
  place,
  remove,
  key,
  type World,
} from '../lib/world.ts';
import {
  normalizeBlock,
  rotateBlock,
  SHAPES,
  type Block,
  type BlockShape,
} from '../lib/block-types.ts';
import { difference, applyHistory, blocksInRange } from '../lib/history.ts';
import { simulateWater } from '../lib/water.ts';
import { ChunkRenderer } from '../components/game/chunkRenderer.ts';
const block = (x = 0, y = 0, z = 0, shape: BlockShape = 'cube'): Block =>
  normalizeBlock({ x, y, z, material: 'wood', shape });
const world = (blocks: Block[]): World => ({ ...initialWorld(), blocks });
const ordered = (w: World) => ({
  ...w,
  blocks: [...w.blocks].sort((a, b) => key(a).localeCompare(key(b))),
});
void test('v1 migrates every original material as cube and zero rotation', () => {
  const old = {
    ...initialWorld(),
    version: 1,
    blocks: [
      { x: 1, y: 0, z: 2, material: 'water' },
      { x: 0, y: 0, z: 0, material: 'glass' },
    ],
  };
  const result = parseWorld(JSON.stringify(old));
  assert.equal(result.version, 2);
  for (const b of result.blocks) {
    assert.equal(b.shape, 'cube');
    assert.deepEqual(b.rotation, { x: 0, y: 0, z: 0 });
  }
  assert.deepEqual(parseWorld(JSON.stringify(result)), result);
});
void test('v2 validates shape, rotation, open state, and door occupancy', () => {
  const good = world([block(0, 0, 0, 'door')]);
  for (const patch of [
    { shape: 'bad' },
    { rotation: { x: 4, y: 0, z: 0 } },
    { rotation: null },
    { rotation: { x: 1, y: 0, z: 0 } },
    { open: 'yes' },
  ])
    assert.throws(() =>
      parseWorld(
        JSON.stringify({ ...good, blocks: [{ ...good.blocks[0], ...patch }] }),
      ),
    );
  assert.ok(place(good, [block(0, 1, 0)]).error);
  assert.ok(
    place(world([block(0, 0, 0), block(0, 2, 0)]), [block(0, 1, 0, 'door')])
      .error,
  );
  assert.equal(remove(good, { x: 0, y: 1, z: 0 }).blocks.length, 0);
  assert.deepEqual(parseWorld(JSON.stringify(good)), good);
});
void test('rotation returns to start after four turns, respects axes, and history restores it', () => {
  for (const shape of SHAPES) {
    const b = block(0, 0, 0, shape);
    for (const axis of ['x', 'y'] as const)
      for (const direction of [-1, 1]) {
        let rotated = b;
        for (let i = 0; i < 4; i++)
          rotated = rotateBlock(rotated, axis, direction);
        assert.deepEqual(rotated, b);
        assert.deepEqual(
          rotateBlock(rotateBlock(b, axis, direction), axis, -direction),
          b,
        );
      }
    if (
      [
        'door',
        'fence',
        'glassPane',
        'gridWindow',
        'cube',
        'lamp',
        'waterSource',
      ].includes(shape)
    )
      assert.equal(rotateBlock(b, 'x', 1), b);
    const before = world([b]),
      after = world([rotateBlock(b, 'y', 1)]),
      command = difference(before, after);
    assert.deepEqual(applyHistory(after, command, true), before);
    assert.deepEqual(applyHistory(before, command), after);
  }
});
void test('range deletion including upper door cell is one reversible command', () => {
  const before = world([
    block(0, 0, 0, 'door'),
    block(1, 0, 0),
    block(2, 0, 0),
    block(0, 5, 0),
  ]);
  for (const [a, b] of [
    [
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    [
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 5, z: 0 },
    ],
    [
      { x: -5, y: -5, z: -5 },
      { x: 5, y: 9, z: 5 },
    ],
  ]) {
    const removed = new Set(blocksInRange(before, a, b));
    const after = {
      ...before,
      blocks: before.blocks.filter((p) => !removed.has(p)),
    };
    const cmd = difference(before, after);
    assert.deepEqual(ordered(applyHistory(after, cmd, true)), ordered(before));
    assert.deepEqual(ordered(applyHistory(before, cmd)), ordered(after));
  }
});
void test('water falls, spreads with decreasing level, respects obstacles and disappears without sources', () => {
  const floor = Array.from({ length: 225 }, (_, i) =>
    block((i % 15) - 7, 0, Math.floor(i / 15) - 7),
  );
  const source = {
    ...block(0, 4, 0, 'waterSource'),
    material: 'water' as const,
  };
  const water = simulateWater([...floor, source]),
    map = new Map(water.map((c) => [key(c), c]));
  assert.equal(map.get('0,3,0')?.level, 7);
  assert.equal(map.get('0,1,0')?.level, 7);
  assert.equal(map.get('1,1,0')?.level, 6);
  assert.equal(map.get('6,1,0')?.level, 1);
  assert.ok(!map.has('7,1,0'));
  const changed = simulateWater([...floor, source, block(1, 1, 0)]);
  assert.ok(!changed.some((c) => key(c) === '1,1,0'));
  assert.equal(simulateWater(floor).length, 0);
  const closed = simulateWater([...floor, source, block(0, 3, 0)]);
  assert.ok(closed.some((c) => c.y === 4 && c.x === 1));
});
void test('all geometries support raycast and chunk updates leave distant meshes intact', () => {
  const renderer = new ChunkRenderer();
  const blocks = SHAPES.map((s, i) => block(i * 3, 0, 0, s));
  blocks.push(block(100, 0, 0));
  renderer.setBlocks(blocks);
  renderer.group.updateMatrixWorld(true);
  for (let i = 0; i < SHAPES.length; i++) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(
        i * 3,
        ['slab', 'stairs'].includes(SHAPES[i]) ? -0.2 : 0,
        5,
      ),
      new THREE.Vector3(0, 0, -1),
    );
    assert.equal(renderer.pick(ray)?.block.shape, SHAPES[i]);
  }
  const distant = renderer.group.children.find((m) =>
    (m.userData.blocks as Block[]).some((b) => b.x === 100),
  );
  renderer.setBlocks([...blocks, block(0, 1, 0)]);
  assert.ok(renderer.group.children.includes(distant!));
  assert.ok(renderer.lastRebuilt < 3);
  renderer.dispose();
});
void test('50k rendering groups are bounded by chunks and history only holds changed blocks', () => {
  for (const count of [10000, 20000, 50000]) {
    const bs = Array.from({ length: count }, (_, i) =>
      block(i % 100, Math.floor(i / 10000), Math.floor(i / 100) % 100),
    );
    const renderer = new ChunkRenderer();
    const start = performance.now();
    renderer.setBlocks(bs);
    const a = world(bs),
      b = { ...a, blocks: [...bs, block(0, 10, 0)] };
    const cmd = difference(a, b);
    renderer.setBlocks(b.blocks);
    assert.equal(cmd.added.length, 1);
    assert.equal(cmd.removed.length, 0);
    assert.equal(cmd.updated.length, 0);
    assert.ok(renderer.lastRebuilt <= 4);
    console.log(
      `${count} blocks: ${Math.round(performance.now() - start)}ms CPU, ${renderer.group.children.length} mesh groups`,
    );
    renderer.dispose();
  }
});

void test('all building shapes place atomically and roundtrip their orientation', () => {
  for (const shape of SHAPES) {
    const b = rotateBlock(block(0, 1, 0, shape), 'y', 1);
    const result = place(world([block()]), [b]);
    assert.equal(result.error, undefined);
    assert.deepEqual(parseWorld(JSON.stringify(result.world)), result.world);
  }
  const a = world([block(0, 0, 0, 'door')]),
    b = { ...a, blocks: [{ ...a.blocks[0], open: true }] },
    cmd = difference(a, b);
  assert.equal(cmd.updated.length, 1);
  assert.deepEqual(applyHistory(b, cmd, true), a);
});

void test('color variants share instance batches and fences update across chunk boundaries', () => {
  const renderer = new ChunkRenderer();
  const bs = [
    block(0, 0, 0),
    { ...block(1, 0, 0), material: 'pink' as const },
    block(15, 0, 0, 'fence'),
  ];
  renderer.setBlocks(bs);
  assert.equal(renderer.group.children.length, 2);
  const old = renderer.group.children.find((m) =>
    (m.userData.blocks as Block[]).some((b) => b.shape === 'fence'),
  );
  renderer.setBlocks([...bs, block(16, 0, 0, 'fence')]);
  assert.ok(!renderer.group.children.includes(old!));
  assert.equal(renderer.lastRebuilt, 2);
  renderer.dispose();
});
