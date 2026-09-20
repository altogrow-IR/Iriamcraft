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

## v2追加ルール

- `lib/materials.ts` は素材、`block-types.ts` は形状・回転・占有セル、`storage.ts` はIndexedDB移行、`history.ts` は40操作の差分履歴、`water.ts` は純粋な水計算。
- 保存はversion 2。v1はcube／回転0へ移行し、旧localStorageを削除しない。座標がブロック識別子。ドアの上下2セル占有は配置・読み込み・削除で共通の `cells` を使う。
- 配置数の固定上限を復活させない。16マスチャンクを `chunkRenderer.ts` で差分更新し、`blockGeometries.ts` の共通Geometryを使う。全世界の毎フレーム走査は禁止。
- 水の派生セルは保存しない。Workerの世代番号で古い結果を無視する。最下部の建築物より下で排水する。すべてのランプは発光し、実ライトは近い8/12個に限定。
- 素材UIは `MaterialPicker.tsx` のカテゴリ付きダイアログ。通常時の3D領域を確保する。選択済みブロックからのスワイプだけOrbitControlsを停止し、取消・2本指移行時に復帰する。
- `tests/browser-check.mjs` は既存のPlaywright + Edgeで実行。`QA_URL` と `PLAYWRIGHT_MODULE` を指定できる。出力はgit管理外の `outputs/`。実機GPU性能とデスクトップ上のスマホ画面検証を区別する。

## マイ設計図・内部ビュー

- DBスキーマは2。worldsを維持しblueprintsを追加。ワールドJSON形式は2のまま。設計図CRUDはblueprint-storage.ts、抽出・回転はcustom-blueprints.ts。
- terrainは地面由来を表す。新規通常配置はfalse。旧データのみ初期地面の座標・素材・形状と照合。
- 範囲抽出はhistory.tsのblocksInRangeを共有。自作設計図もplaceとdifferenceを使い原子的に配置する。全体回転はワールドY回転と各ブロックのXYZ回転を合成する。
- カメラはOrthographicCameraを維持。通常ズーム10の後に追加操作で内部へ移行。OrbitControlsのchangeで前後移動とカメラ中心回転を処理する。homeで内部状態を解除。
- tests/blueprints-browser.mjsはDB v1移行・マイ設計図・カメラ入力を検証する開発サーバー向けテスト。実機確認とは区別する。
