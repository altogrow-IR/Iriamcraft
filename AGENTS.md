# Iriamcraft 開発ルール

- 日本語UIの3D建築ゲーム。スマホ縦画面で「場所選択 → 大きなボタンで配置」を守る。
- スタックはReact・TypeScript・Vite・Three.js。`app/main.tsx` が入口。静的出力は `dist/`。
- `lib/world.ts`: 素材・設計図・保存形式・純粋な建築ルール。`components/game/engine.ts`: 描画・カメラ・ポインター操作。`components/game/Game.tsx`: ゲームUIと履歴。
- 素材無料・アカウント不要のローカルゲーム。IRIAM公式や実際の配信・オンライン接続を装わない。
- 保存互換性を守る。インポートは検証しUndo可能にする。破損時の無条件上書きを避ける。
- 描画資源・イベント・タイマーをdisposeする。端末DPRを上げすぎない。
- `npm test`, `npm run lint`, `npm run build` を通す。UI変更は390pxの縦画面とPC幅を確認。
- テンプレートの `components/ui/` を改変せず、既存Button・Dialogを組み合わせる。
- GitHub Pages用の `base: './'` を維持。Sites IDは `.openai/hosting.json` を再利用する。
