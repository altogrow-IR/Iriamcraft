import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Quaternion, Vector3 } from 'three';
import {
  createBlueprint,
  placeBlueprint,
  isTerrain,
} from '../lib/custom-blueprints.ts';
import {
  SHAPES,
  normalizeBlock,
  type Block,
  type QuarterTurn,
} from '../lib/block-types.ts';
import { initialWorld, place, parseWorld, type World } from '../lib/world.ts';
import { difference, applyHistory, blocksInRange } from '../lib/history.ts';
const block = (x: number, y = 1, z = 0): Block =>
  normalizeBlock({ x, y, z, material: 'wood' });
void test('single and large blueprints are relative, centred and unlimited; placement is one command', () => {
  for (const count of [1, 100, 1001, 3482]) {
    const bs = Array.from({ length: count }, (_, i) =>
      block(i % 60, 1 + Math.floor(i / 60), 0),
    );
    const p = createBlueprint(bs, 'おうち');
    assert.equal(p.blocks.length, count);
    assert.equal(Math.min(...p.blocks.map((b) => b.y)), 0);
    const w: World = {
      version: 2,
      name: 'test',
      placed: 0,
      shows: 0,
      blocks: [block(0, 0)],
    };
    const result = place(
      w,
      placeBlueprint(p, { x: p.anchor.x, y: 1, z: 0 }, 0),
    );
    assert.equal(result.error, undefined);
    const command = difference(w, result.world);
    assert.deepEqual(applyHistory(result.world, command, true), w);
    assert.deepEqual(applyHistory(w, command), result.world);
    assert.ok(
      place(result.world, placeBlueprint(p, { x: p.anchor.x, y: 1, z: 0 }, 0))
        .error,
    );
  }
});
void test('all shapes, colours, source water, and rotations survive; door closes and upper cell selects it', () => {
  const bs = SHAPES.map((shape, i) =>
    normalizeBlock({
      ...block(i * 3),
      shape,
      material:
        shape === 'waterSource'
          ? 'water'
          : shape === 'glassPane'
            ? 'glass'
            : 'pink',
      rotation: { x: 0, y: 3, z: 0 },
      ...(shape === 'door' ? { open: true } : {}),
    }),
  );
  const p = createBlueprint(bs, '全部');
  assert.deepEqual(
    p.blocks.map((b) => b.shape),
    SHAPES,
  );
  assert.equal(p.blocks.find((b) => b.shape === 'door')?.open, false);
  const door = bs.find((b) => b.shape === 'door')!;
  const w: World = {
    version: 2,
    name: 'test',
    placed: 0,
    shows: 0,
    blocks: bs,
  };
  assert.equal(
    blocksInRange(w, { ...door, y: 2 }, { ...door, y: 2 }).length,
    1,
  );
  for (let r = 0; r < 4; r++)
    assert.equal(
      placeBlueprint(p, { x: 0, y: 0, z: 0 }, r).length,
      SHAPES.length,
    );
});
void test('world yaw correctly composes every local quarter turn including tilted stairs', () => {
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 4; y++)
      for (let z = 0; z < 4; z++)
        for (let turn = 0; turn < 4; turn++) {
          const b = normalizeBlock({
            ...block(0),
            shape: 'stairs',
            rotation: {
              x: x as QuarterTurn,
              y: y as QuarterTurn,
              z: z as QuarterTurn,
            },
          });
          const p = createBlueprint([b], 'stairs');
          const r = placeBlueprint(p, { x: 0, y: 0, z: 0 }, turn)[0].rotation!;
          const actual = new Quaternion().setFromEuler(
            new Euler(
              (r.x * Math.PI) / 2,
              (r.y * Math.PI) / 2,
              (r.z * Math.PI) / 2,
            ),
          );
          const expected = new Quaternion()
            .setFromAxisAngle(new Vector3(0, 1, 0), (-turn * Math.PI) / 2)
            .multiply(
              new Quaternion().setFromEuler(
                new Euler(
                  (x * Math.PI) / 2,
                  (y * Math.PI) / 2,
                  (z * Math.PI) / 2,
                ),
              ),
            );
          assert.ok(Math.abs(actual.dot(expected)) > 0.99999);
        }
});
void test('terrain excludes initial ground but keeps constructed floors at zero and floating buildings', () => {
  const w = initialWorld(),
    ground = w.blocks.find((b) => b.terrain)!;
  assert.ok(isTerrain(ground));
  assert.ok(isTerrain({ ...ground, terrain: undefined }));
  const building = { ...block(ground.x, 0, ground.z), terrain: false };
  const replacement = { ...ground, terrain: false };
  assert.equal(createBlueprint([ground, building], 'floor').blocks.length, 1);
  assert.equal(createBlueprint([replacement], 'grass floor').blocks.length, 1);
  assert.equal(createBlueprint([ground], 'ground', true).blocks.length, 1);
  assert.equal(createBlueprint([block(0, 42)], 'sky').blocks[0].y, 0);
  assert.equal(
    parseWorld(JSON.stringify({ ...w, blocks: [replacement] })).blocks[0]
      .terrain,
    false,
  );
});
