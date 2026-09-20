// Run with PLAYWRIGHT_MODULE pointing at an installed Playwright package.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(`${process.env.PLAYWRIGHT_MODULE}/index.mjs`).href
    : 'playwright'
);
const URL = process.env.QA_URL || 'http://localhost:5188/';
const zero = { x: 0, y: 0, z: 0 };
const block = (x, y, z, shape = 'cube', material = 'wood') => ({
  x,
  y,
  z,
  material,
  shape,
  rotation: { ...zero },
  ...(shape === 'door' ? { open: false } : {}),
});
const fixture = {
  version: 2,
  name: 'パーツ検証の島',
  placed: 1,
  shows: 0,
  blocks: [
    ...Array.from({ length: 81 }, (_, i) =>
      block((i % 9) - 4, 0, Math.floor(i / 9) - 4, 'cube', 'white'),
    ),
    block(0, 1, 0, 'stairs'),
    block(3, 1, 0, 'door'),
    block(-3, 1, 0, 'lamp', 'light'),
    block(0, 3, -3, 'waterSource', 'water'),
  ],
};
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    document.modelContext = {
      registerTool(t) {
        window.__tools ??= {};
        window.__tools[t.name] = t;
      },
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const world = () => page.evaluate(() => window.__tools.read_island.execute());
  async function importWorld(w) {
    await page.getByRole('button', { name: '設定と保存' }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'world.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(w)),
    });
    await page.waitForFunction(
      (name) => window.__tools.read_island.execute().name === name,
      w.name,
    );
    await page.waitForTimeout(350);
  }
  async function saved() {
    await page.waitForFunction(() =>
      document.querySelector('.save-state')?.textContent?.includes('保存済み'),
    );
  }
  async function layout() {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      ),
      false,
    );
  }
  // Seed a real v1 value, then migrate through the application's normal startup.
  await page.goto(URL);
  await page.waitForFunction(() => window.__tools?.read_island);
  const old = {
    version: 1,
    name: '旧データ移行テスト',
    placed: 12,
    shows: 3,
    blocks: [{ x: 0, y: 0, z: 0, material: 'grass' }],
  };
  await page.evaluate(async (old) => {
    localStorage.setItem('iriamcraft-world-v1', JSON.stringify(old));
    const db = await new Promise((r, j) => {
      const q = indexedDB.open('iriamcraft');
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
    await new Promise((r, j) => {
      const tx = db.transaction('worlds', 'readwrite');
      tx.objectStore('worlds').delete('current');
      tx.oncomplete = r;
      tx.onerror = j;
    });
    db.close();
  }, old);
  await page.reload();
  await page.waitForFunction(
    () => window.__tools?.read_island?.execute().name === '旧データ移行テスト',
  );
  await saved();
  assert.equal((await world()).version, 2);
  assert.equal((await world()).blocks[0].shape, 'cube');
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('iriamcraft-world-v1')).version,
    ),
    1,
  );
  await page.reload();
  await page.waitForFunction(
    () => window.__tools?.read_island?.execute().name === '旧データ移行テスト',
  );
  console.log('PASS v1 migration, original retention, IndexedDB reload');
  await importWorld(fixture);
  await layout();
  // Zoom and center on the selected origin using the actual controls.
  await page.getByRole('button', { name: '調整', exact: true }).click();
  await page.getByRole('button', { name: '中央表示の説明を閉じる' }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  // Project known world cells with the same documented camera framing, without reaching into React.
  async function screen(x, y, z) {
    await page.waitForTimeout(350);
    const r = await page.locator('canvas').boundingBox();
    const aspect = r.width / r.height,
      view = Math.max(36, 43 / aspect),
      c = new THREE.OrthographicCamera(
        (-view * aspect) / 2,
        (view * aspect) / 2,
        view / 2,
        -view / 2,
        0.1,
        32768,
      );
    c.position.set(24, 24, 30);
    c.lookAt(0, 1.3, 0);
    c.updateMatrixWorld();
    const v = new THREE.Vector3(x, y, z).project(c);
    return {
      x: r.x + ((v.x + 1) / 2) * r.width,
      y: r.y + ((1 - v.y) / 2) * r.height,
    };
  }
  let pt = await screen(0, 1.2, 0);

  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(100);
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.mouse.move(pt.x + 60, pt.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  }
  assert.deepEqual(
    (await world()).blocks.find((b) => b.shape === 'stairs').rotation,
    zero,
  );

  // One touch swipe, then Undo / Redo.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: pt.x, y: pt.y, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: pt.x + 65, y: pt.y, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(180);
  assert.equal(
    (await world()).blocks.find((b) => b.shape === 'stairs').rotation.y,
    1,
  );
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.equal(
    (await world()).blocks.find((b) => b.shape === 'stairs').rotation.y,
    0,
  );
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  assert.equal(
    (await world()).blocks.find((b) => b.shape === 'stairs').rotation.y,
    1,
  );
  console.log('PASS mouse and touch swipe, four rotations, Undo/Redo');
  // A second finger cancels rotation and hands the full gesture to OrbitControls.
  const beforePinch = JSON.stringify((await world()).blocks);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: pt.x, y: pt.y, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: pt.x, y: pt.y, id: 1 },
      { x: pt.x + 40, y: pt.y + 40, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: pt.x - 25, y: pt.y - 25, id: 1 },
      { x: pt.x + 65, y: pt.y + 65, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  assert.equal(JSON.stringify((await world()).blocks), beforePinch);
  await page.getByRole('button', { name: '視点をリセット' }).click();
  await page.waitForTimeout(450);
  console.log(
    'PASS selected-block two-finger cancellation and camera recovery',
  );
  // Door state persists and occupies both cells.
  pt = await screen(3, 1.2, 0);
  await page.mouse.click(pt.x, pt.y);
  await page.getByRole('button', { name: '調整', exact: true }).click();
  await page.getByRole('button', { name: 'ドアを開く', exact: true }).click();
  assert.equal(
    (await world()).blocks.find((b) => b.shape === 'door').open,
    true,
  );
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await saved();
  await page.reload();
  await page.waitForFunction(
    () => window.__tools?.read_island?.execute().name === 'パーツ検証の島',
  );
  assert.equal(
    (await world()).blocks.find((b) => b.shape === 'door').open,
    true,
  );
  console.log('PASS door open state, reload');
  // Range delete same selected cell, restoring everything with one undo.
  await page.getByRole('button', { name: '調整', exact: true }).click();
  await page.getByRole('button', { name: '範囲選択', exact: true }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  pt = await screen(0, 1.2, 0);
  await page.mouse.click(pt.x, pt.y);
  await page.mouse.click(pt.x, pt.y);
  const before = (await world()).blocks.length;
  await page.getByRole('button', { name: '範囲を消す' }).click();
  assert.equal((await world()).blocks.length, before - 1);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.equal((await world()).blocks.length, before);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  assert.equal((await world()).blocks.length, before - 1);
  console.log('PASS range preview, delete, Undo/Redo');
  // JSON round trip through actual download and file input.
  await page.getByRole('button', { name: '設定と保存' }).click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: '島のバックアップを保存', exact: true })
    .click();
  const file = await download;
  const data = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  assert.equal(data.version, 2);
  assert.equal(data.blocks.length, before - 1);
  await page
    .getByRole('button', { name: 'Close', exact: true })
    .click()
    .catch(async () => page.keyboard.press('Escape'));
  await importWorld({ ...data, name: 'JSON復元確認' });
  console.log('PASS JSON export/import');
  // Palette all requested shapes and both seven-color glass sets.
  await page.getByRole('button', { name: '素材と形を選ぶ' }).click();
  await page.getByRole('button', { name: 'ガラス', exact: true }).click();
  assert.equal(await page.locator('.material-card').count(), 7);
  await page.getByRole('button', { name: '板ガラス', exact: true }).click();
  assert.equal(await page.locator('.material-card').count(), 7);
  await page.screenshot({ path: 'outputs/glass-mobile.png' });
  await page.keyboard.press('Escape');
  // Large imported worlds exercise GPU rendering, storage and interaction.
  const metrics = [];
  for (const count of [10000, 20000, 50000]) {
    const w = {
      ...fixture,
      name: `負荷検証${count}`,
      blocks: Array.from({ length: count }, (_, i) =>
        block(
          (i % 100) - 50,
          Math.floor(i / 10000),
          (Math.floor(i / 100) % 100) - 50,
          'cube',
          'white',
        ),
      ),
    };
    const start = Date.now();
    await importWorld(w);
    await saved();
    assert.equal((await world()).blocks.length, count);
    const frame = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let n = 0,
            last = performance.now();
          const times = [];
          function tick(t) {
            times.push(t - last);
            last = t;
            if (++n === 20) resolve(times.slice(1));
            else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }),
    );
    const mean = frame.reduce((a, b) => a + b, 0) / frame.length;
    metrics.push({
      count,
      loadMs: Date.now() - start,
      meanFrameMs: Math.round(mean),
      fps: Math.round(1000 / mean),
    });
    await page.evaluate(
      (y) =>
        window.__tools.place_island_blocks.execute({
          blocks: [{ x: 0, y, z: 0, material: 'pink' }],
        }),
      count / 10000,
    );
    assert.equal((await world()).blocks.length, count + 1);
    await layout();
  }
  fs.writeFileSync(
    'outputs/performance.json',
    JSON.stringify(metrics, null, 2),
  );
  console.log('render metrics', metrics);
  await page.reload();
  await page.waitForFunction(
    () => window.__tools?.read_island?.execute().blocks.length === 50001,
  );
  console.log('PASS 50k IndexedDB persistence');
  await importWorld(fixture);
  await page.getByRole('button', { name: /夜/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'outputs/night-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await layout();
  await page.screenshot({ path: 'outputs/desktop.png' });
  assert.deepEqual(errors, []);
  console.log('PASS mobile and desktop bounds; no console or page errors');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
