import { simulateWater } from './water.ts';
import type { Block } from './world.ts';
self.onmessage = (event: MessageEvent<{ revision: number; blocks: Block[] }>) =>
  self.postMessage({
    revision: event.data.revision,
    cells: simulateWater(event.data.blocks),
  });
