import { inBounds, MATERIALS, HORIZONTAL_LIMIT, VERTICAL_LIMIT, type Block, type World } from './world';
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerWorldTools(
  getWorld: () => World,
  add: (blocks: Block[]) => { error?: string; count: number },
) {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context) return () => {};
  const controller = new AbortController();
  const register = (tool: Parameters<ModelContext['registerTool']>[0]) => {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
  };
  register({
    name: 'read_island',
    title: '島を確認',
    description: '現在のIriamcraftの島とブロック座標を読み取る。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => getWorld(),
  });
  register({
    name: 'place_island_blocks',
    title: '島にブロックを配置',
    description:
      '現在の島へ最大100ブロックをまとめて建築する。重なり・範囲外は全体を拒否する。UIの元に戻すに対応。',
    inputSchema: {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              x: { type: 'integer', minimum: -HORIZONTAL_LIMIT, maximum: HORIZONTAL_LIMIT },
              y: { type: 'integer', minimum: -VERTICAL_LIMIT, maximum: VERTICAL_LIMIT },
              z: { type: 'integer', minimum: -HORIZONTAL_LIMIT, maximum: HORIZONTAL_LIMIT },
              material: { type: 'string', enum: MATERIALS.map((m) => m.id) },
            },
            required: ['x', 'y', 'z', 'material'],
            additionalProperties: false,
          },
        },
      },
      required: ['blocks'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: (input: unknown) => {
      const blocks = (input as { blocks?: unknown })?.blocks;
      if (
        !Array.isArray(blocks) ||
        blocks.length < 1 ||
        blocks.length > 100 ||
        blocks.some(
          (b) =>
            !b ||
            typeof b !== 'object' ||
            !inBounds(b) ||
            !MATERIALS.some((m) => m.id === b.material),
        )
      )
        throw Error('有効なブロック座標と素材を1〜100個指定してください');
      const result = add(blocks);
      if (result.error) throw Error(result.error);
      return { placed: result.count };
    },
  });
  return () => controller.abort();
}
