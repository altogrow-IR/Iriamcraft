import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(`${process.env.PLAYWRIGHT_MODULE}/index.mjs`).href
    : 'playwright'
);
const url = process.env.QA_URL || 'http://localhost:5188/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
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
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.setDefaultTimeout(15000);
const fixture = {
  version: 2,
  name: 'DB1の島',
  placed: 99,
  shows: 5,
  blocks: [
    ...Array.from({ length: 81 }, (_, i) => ({
      x: (i % 9) - 4,
      y: 0,
      z: Math.floor(i / 9) - 4,
      material: 'white',
      shape: 'cube',
      rotation: { x: 0, y: 0, z: 0 },
    })),
    {
      x: 0,
      y: 1,
      z: 0,
      material: 'pink',
      shape: 'stairs',
      rotation: { x: 1, y: 2, z: 0 },
    },
  ],
};
try {
  await page.route('**/seed', (route) =>
    route.fulfill({ contentType: 'text/html', body: 'seed' }),
  );
  await page.goto(new URL('seed', url).href);
  await page.evaluate(async (fixture) => {
    const db = await new Promise((resolve, reject) => {
      const q = indexedDB.open('iriamcraft', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('worlds');
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('worlds', 'readwrite');
      tx.objectStore('worlds').put(fixture, 'current');
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  }, fixture);
  await page.goto(url);
  await page.waitForFunction(
    () => window.__tools?.read_island.execute().name === 'DB1の島',
  );
  assert.deepEqual(
    await page.evaluate(() => window.__tools.read_island.execute()),
    fixture,
  );
  assert.deepEqual(
    await page.evaluate(async () => {
      const db = await new Promise((r) => {
        const q = indexedDB.open('iriamcraft');
        q.onsuccess = () => r(q.result);
      });
      const value = { version: db.version, stores: [...db.objectStoreNames] };
      db.close();
      return value;
    }),
    { version: 2, stores: ['blueprints', 'worlds'] },
  );
  console.log('PASS real IndexedDB v1 -> v2, exact world retention');
  await page.getByRole('button', { name: '調整', exact: true }).click();
  await page.getByRole('button', { name: '中央表示の説明を閉じる' }).click();
  await page.getByRole('button', { name: '範囲選択', exact: true }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const rect = await page.locator('canvas').boundingBox();
  const aspect = rect.width / rect.height,
    view = Math.max(36, 43 / aspect);
  const camera = new THREE.OrthographicCamera(
    (-view * aspect) / 2,
    (view * aspect) / 2,
    view / 2,
    -view / 2,
    0.01,
    32768,
  );
  camera.position.set(24, 24, 30);
  camera.lookAt(0, 1.3, 0);
  camera.updateMatrixWorld();
  const pt = new THREE.Vector3(0, 1, 0).project(camera),
    x = rect.x + ((pt.x + 1) / 2) * rect.width,
    y = rect.y + ((1 - pt.y) / 2) * rect.height;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await page
    .getByRole('button', { name: '設計図として保存', exact: true })
    .click();
  await page.getByLabel('名前', { exact: true }).fill('階段のおうち');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.getByRole('button', { name: /^設計図/ }).click();
  await page.getByRole('article').filter({ hasText: '階段のおうち' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /^設計図/ }).click();
  const card = page.getByRole('article').filter({ hasText: '階段のおうち' });
  await card.getByText('管理', { exact: true }).click();
  await card.getByRole('button', { name: '名前を変更' }).click();
  await page.getByLabel('名前', { exact: true }).fill('回転する階段');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page
    .getByRole('article')
    .filter({ hasText: '回転する階段' })
    .getByRole('button', { name: '配置', exact: true })
    .click();
  const before = await page.evaluate(
    () => window.__tools.read_island.execute().blocks.length,
  );
  await page.getByRole('button', { name: 'まとめて建てる' }).click();
  assert.equal(
    await page.evaluate(
      () => window.__tools.read_island.execute().blocks.length,
    ),
    before + 1,
  );
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => window.__tools.read_island.execute().blocks.length,
    ),
    before,
  );
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => window.__tools.read_island.execute().blocks.length,
    ),
    before + 1,
  );
  console.log('PASS range save, reload, rename, placement, Undo/Redo');
  fs.mkdirSync('outputs', { recursive: true });
  await page.screenshot({ path: 'outputs/blueprints-mobile.png' });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole('button', { name: 'ブロック', exact: true }).click();
  for (let i = 0; i < 14; i++)
    await page.getByRole('button', { name: '拡大', exact: true }).click();
  await page.getByText('👁 内部ビュー', { exact: true }).waitFor();
  await page.getByRole('button', { name: '🏠 外観に戻る' }).click();
  await page
    .getByText('👁 内部ビュー', { exact: true })
    .waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^設計図/ }).click();
  await page.screenshot({ path: 'outputs/blueprints-desktop.png' });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const renamed = page.getByRole('article').filter({ hasText: '回転する階段' });
  await renamed.getByText('管理', { exact: true }).click();
  await renamed.getByRole('button', { name: '削除', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '削除', exact: true })
    .click();
  await renamed.waitFor({ state: 'hidden' });
  await page.reload();
  await page.getByRole('button', { name: /^設計図/ }).click();
  await page.getByText('まだ設計図がありません', { exact: false }).waitFor();
  console.log(
    'PASS deletion persisted, mobile/desktop layout, camera interior and home UI',
  );
  const storageChecks = await page.evaluate(async () => {
    const { createBlueprint } = await import('/lib/custom-blueprints.ts');
    const storage = await import('/lib/blueprint-storage.ts');
    const { saveWorld, loadWorld } = await import('/lib/storage.ts');
    const before = await loadWorld();
    const plan = createBlueprint(Array.from({length:3482}, (_,i)=>({x:i%60,y:1+Math.floor(i/60),z:0,material:'wood'})), '大きな建物');
    await storage.saveBlueprint(plan);
    const count = (await storage.loadBlueprints())[0].blocks.length;
    // Restored below; invocation uses apply to retain the original receiver.
    // oxlint-disable-next-line typescript/unbound-method
    const put = IDBObjectStore.prototype.put;
    let rejected = false;
    IDBObjectStore.prototype.put = function(...args) { if(this.name==='blueprints') throw new DOMException('quota','QuotaExceededError'); return put.apply(this,args); };
    try { await storage.saveBlueprint({...plan,id:'quota-test'}); } catch { rejected = true; }
    try { await saveWorld(before); } finally { IDBObjectStore.prototype.put = put; }
    const same = JSON.stringify(before)===JSON.stringify(await loadWorld());
    await storage.deleteBlueprint(plan.id);
    return {count,rejected,same};
  });
  assert.deepEqual(storageChecks,{count:3482,rejected:true,same:true});
  console.log('PASS 3482-block persistence and quota failure isolated from world save');
  // Exercise the real engine, including wheel and CDP touch input, with observable camera coordinates.
  await page.evaluate(async () => {
    const { IslandEngine } = await import('/components/game/engine.ts');
    const host = document.createElement('div');
    host.id = 'camera-qa';
    Object.assign(host.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
    });
    document.body.append(host);
    window.qaEngine = new IslandEngine(host, () => {});
    // A closed room with roof, window, source water and a lamp along the camera path.
    const blocks=[];
    for(let x=-4;x<=4;x++)for(let y=0;y<=7;y++)for(let z=-4;z<=4;z++)
      if(Math.abs(x)===4 || Math.abs(z)===4 || y===0 || y===7)
        blocks.push({x,y,z,material:z===4 && y>1 && y<5?'glass':'white'});
    blocks.push({x:0,y:3,z:0,material:'water',shape:'waterSource'},{x:2,y:1,z:2,material:'light',shape:'lamp'});
    window.qaEngine.setBlocks(blocks);
  });
  const state = () =>
    page.evaluate(() => {
      const e = window.qaEngine;
      return {
        interior: e.interior,
        zoom: e.camera.zoom,
        position: e.camera.position.toArray(),
        target: e.controls.target.toArray(),
        near: e.camera.near,
      };
    });
  await page.mouse.move(700, 400);
  for (let i = 0; i < 55; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(250);
  let a = await state();
  assert.equal(a.interior, true);
  assert.equal(a.zoom, 10);
  assert.equal(a.near, 0.01);
  for (let i = 0; i < 35; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(250);
  let b = await state();
  assert.ok(
    new THREE.Vector3(...a.position).distanceTo(
      new THREE.Vector3(...b.position),
    ) > 20,
  );
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(200);
  const back = await state();
  assert.ok(
    new THREE.Vector3(...back.position).distanceTo(
      new THREE.Vector3(...a.position),
    ) <
      new THREE.Vector3(...b.position).distanceTo(
        new THREE.Vector3(...a.position),
      ),
  );
  a = await state();
  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.mouse.move(800, 430, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  b = await state();
  assert.ok(
    new THREE.Vector3(...a.position).distanceTo(
      new THREE.Vector3(...b.position),
    ) < 0.001,
  );
  assert.notDeepEqual(a.target, b.target);
  const cdp = await context.newCDPSession(page);
  await page.evaluate(() => window.qaEngine.home());
  for (let k = 0; k < 12; k++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: 600, y: 400, id: 1 },
        { x: 800, y: 400, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 530, y: 400, id: 1 },
        { x: 870, y: 400, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  }
  await page.waitForTimeout(300);
  assert.equal((await state()).interior, true);
  const pinch = async (from,to) => {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:from});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:to});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(400);
  };
  const fingers=[{x:600,y:400,id:1},{x:800,y:400,id:2}];
  a=await state();
  await pinch(fingers,[{x:620,y:420,id:1},{x:820,y:420,id:2}]);
  b=await state();assert.notDeepEqual(a.position,b.position);assert.equal(b.zoom,10);
  a=b;
  await pinch(fingers,[{x:630,y:400,id:1},{x:770,y:400,id:2}]);
  b=await state();assert.notDeepEqual(a.position,b.position);
  assert.equal(await page.evaluate(()=>visualViewport.scale),1);
  // Enter the room through the glass wall, then inspect through water toward the roof.
  await page.evaluate(()=>{
    const e=window.qaEngine;
    e.camera.position.set(0,3,6);e.controls.target.set(0,3,5.9);
    e.interiorPosition.copy(e.camera.position);e.interiorTarget.copy(e.controls.target);e.controls.update();
  });
  for(let i=0;i<4;i++)await page.mouse.wheel(0,-100);
  await page.waitForTimeout(400);
  b=await state();assert.ok(b.position[2]<4 && b.position[2]>-4);
  await page.screenshot({path:'outputs/interior-room.png'});
  await page.evaluate(() => {
    window.qaEngine.dispose();
    document.querySelector('#camera-qa').remove();
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS wheel advance/retreat, eye-centred rotation, pinch transition, no console errors',
  );
} finally {
  await browser.close();
}
