import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESIDENTS, pickLiveComment, type LiveComment } from '../lib/live-comments.ts';
import { initialWorld, type World } from '../lib/world.ts';

void test('ten unique residents each own five unique comments', () => {
  assert.equal(RESIDENTS.length, 10);
  assert.equal(new Set(RESIDENTS.map((r) => r.name)).size, 10);
  assert.equal(new Set(RESIDENTS.flatMap((r) => r.comments.map((c) => c.text))).size, 50);
  for (const resident of RESIDENTS) assert.equal(resident.comments.length, 5);
});
void test('every resident and all fifty comments can be selected', () => {
  const world = initialWorld();
  world.blocks.push({ x: 0, y: 16, z: 0, material: 'glass' }, { x: 0, y: -1, z: 0, material: 'light' });
  const seen = new Set<string>();
  for (const night of [true, false]) for (let r = 0; r < 10; r++) for (let c = 0; c < 100; c++) {
    let count = 0;
    const result = pickLiveComment(world, night, undefined, () => count++ === 0 ? (r + 0.1) / 10 : c / 100);
    assert.equal(result.name, RESIDENTS[r].name);
    seen.add(result.text);
  }
  assert.equal(seen.size, 50);
});
void test('no repeated speaker and no comments about absent scenery', () => {
  const world: World = { ...initialWorld(), blocks: [] };
  let previous: LiveComment | undefined;
  for (let i = 0; i < 1000; i++) {
    const result = pickLiveComment(world, false, previous);
    assert.notEqual(result.name, previous?.name);
    const entry = RESIDENTS.find((r) => r.name === result.name)!.comments.find((c) => c.text === result.text)!;
    assert.ok(['any', 'day'].includes(entry.topic));
    previous = result;
  }
});
