import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  key,
  onIsland,
  inBounds,
  ISLAND_RADIUS_X,
  ISLAND_RADIUS_Z,
  islandDistance,
  HORIZONTAL_LIMIT,
  VERTICAL_LIMIT,
  type Block,
  type Point,
} from '@/lib/world';

import { ChunkRenderer } from './chunkRenderer';
import {
  geometryFor,
  blockMatrix,
  disposeBlockGeometries,
} from './blockGeometries';
import { shapeOf } from '@/lib/block-types';
import { NEIGHBORS, type WaterCell } from '@/lib/water';

export class IslandEngine {
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.OrthographicCamera(
    -20,
    20,
    15,
    -15,
    0.01,
    HORIZONTAL_LIMIT * 4,
  );
  private controls: OrbitControls;
  onInteriorChange?: (active: boolean) => void;
  private interior = false;
  private zoomIntent = 0;
  private handlingZoom = false;
  private readonly normalMaxZoom = 10;
  private interiorPosition = new THREE.Vector3();
  private interiorTarget = new THREE.Vector3();
  private chunks = new ChunkRenderer();
  private selected?: Block;
  onRotationPreview?: () => void;
  private rotationPreview = false;
  onRotate?: (point: Point, axis: 'x' | 'y', direction: number) => void;
  private rotating?: { block: Block; pointer: number };
  private ground = new Set<string>();
  private lamps: Block[] = [];
  private lights: THREE.PointLight[] = [];
  private lightTime = 0;
  private waterWorker = new Worker(
    new URL('../../lib/water.worker.ts', import.meta.url),
    { type: 'module' },
  );
  private waterRevision = 0;
  private waterPending = false;
  private waterInfluence = new Set<string>();
  private waterColumns = new Set<string>();
  private waterMeshes: THREE.InstancedMesh[] = [];
  private waterGeometry = new THREE.BoxGeometry(0.98, 1, 0.98);
  private waterMaterial = new THREE.MeshStandardMaterial({
    color: '#75cfe9',
    transparent: true,
    opacity: 0.62,
    roughness: 0.25,
    depthWrite: false,
  });
  private ghostGroup = new THREE.Group();
  private rangeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: '#ef5574',
      transparent: true,
      opacity: 0.23,
      depthWrite: false,
    }),
  );
  private selectionMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 1.04, 1.04),
    new THREE.MeshBasicMaterial({ color: '#ffcc72', wireframe: true }),
  );
  private foundation?: THREE.InstancedMesh;
  private blocks: Block[] = [];
  private resizeObserver: ResizeObserver;
  private ray = new THREE.Raycaster();
  private frame = 0;
  private live = false;
  private night = false;
  private visitors: THREE.Group[] = [];
  private sparks: THREE.Points;
  private burst: THREE.Points;
  private burstTime = -10;
  private sun: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  private down = { x: 0, y: 0 };
  private pointers = new Set<number>();
  private gesture = false;
  private select: (point: Point, face: Point) => void;
  private cleanup: (() => void)[] = [];
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(
    private host: HTMLDivElement,
    select: (point: Point, face: Point) => void,
  ) {
    this.select = select;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      '3Dの浮島。タップで場所を選択、ドラッグで回転、2本指で移動・拡大',
    );
    this.renderer.domElement.setAttribute('role', 'img');
    this.camera.position.set(24, 24, 30);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.3, 0);
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI - 0.25;
    this.controls.minZoom = 0.55;
    this.controls.maxZoom = 20;
    const change = () => {
      if (this.handlingZoom) return;
      this.handlingZoom = true;
      if (this.interior) {
        // OrbitControls supplies rotation and pan. Keep rotation centred on the
        // eye while preserving its target translation from two-finger/right drag.
        const forward = this.camera.getWorldDirection(new THREE.Vector3());
        const pan = this.controls.target.clone().sub(this.interiorTarget);
        this.camera.position.copy(this.interiorPosition).add(pan);
        this.controls.target
          .copy(this.camera.position)
          .addScaledVector(forward, 0.1);
        const travel = Math.log(this.camera.zoom / this.normalMaxZoom) * 24;
        this.camera.position.addScaledVector(forward, travel);
        this.controls.target.addScaledVector(forward, travel);
        this.camera.zoom = this.normalMaxZoom;
      } else if (this.camera.zoom > this.normalMaxZoom) {
        this.zoomIntent += Math.log(this.camera.zoom / this.normalMaxZoom);
        this.camera.zoom = this.normalMaxZoom;
        if (this.zoomIntent >= 0.12) {
          this.interior = true;
          const forward = this.camera.getWorldDirection(new THREE.Vector3());
          this.controls.target
            .copy(this.camera.position)
            .addScaledVector(forward, 0.1);
          this.onInteriorChange?.(true);
        }
      } else if (this.camera.zoom < this.normalMaxZoom) this.zoomIntent = 0;
      this.interiorPosition.copy(this.camera.position);
      this.interiorTarget.copy(this.controls.target);
      this.camera.updateProjectionMatrix();
      this.handlingZoom = false;
    };
    this.controls.addEventListener('change', change);
    this.cleanup.push(() =>
      this.controls.removeEventListener('change', change),
    );
    this.controls.maxTargetRadius = Math.hypot(
      HORIZONTAL_LIMIT,
      HORIZONTAL_LIMIT,
      VERTICAL_LIMIT,
    );
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.ambient = new THREE.HemisphereLight(0xe8faff, 0x8e7cb1, 2.3);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff3e4, 3.2);
    this.sun.position.set(-12, 26, 15);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, {
      left: -22,
      right: 22,
      top: 22,
      bottom: -22,
      near: 1,
      far: 80,
    });
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun);
    this.scene.add(
      this.chunks.group,
      this.ghostGroup,
      this.rangeMesh,
      this.selectionMesh,
    );
    this.rangeMesh.visible = false;
    this.selectionMesh.visible = false;
    for (
      let i = 0;
      i < (matchMedia('(max-width: 700px)').matches ? 8 : 12);
      i++
    ) {
      const light = new THREE.PointLight('#ffcf85', 0, 8, 2);
      this.lights.push(light);
      this.scene.add(light);
    }
    this.waterWorker.onmessage = (
      event: MessageEvent<{ revision: number; cells: WaterCell[] }>,
    ) => {
      if (event.data.revision !== this.waterRevision) return;
      this.waterPending = false;
      this.waterMeshes.forEach((m) => {
        this.scene.remove(m);
        m.dispose();
      });
      this.waterMeshes = [];
      this.waterInfluence.clear();
      this.waterColumns.clear();
      const groups = new Map<string, WaterCell[]>();
      for (const c of event.data.cells) {
        this.waterInfluence.add(key(c));
        this.waterColumns.add(`${c.x},${c.z}`);
        for (const [x, y, z] of NEIGHBORS)
          this.waterInfluence.add(key({ x: c.x + x, y: c.y + y, z: c.z + z }));
        if (
          shapeOf(
            this.chunks.blocks.get(key(c)) ?? { ...c, material: 'water' },
          ) === 'waterSource'
        )
          continue;
        const ck = `${Math.floor(c.x / 16)},${Math.floor(c.y / 16)},${Math.floor(c.z / 16)}`;
        if (!groups.has(ck)) groups.set(ck, []);
        groups.get(ck)!.push(c);
      }
      for (const cs of groups.values()) {
        const mesh = new THREE.InstancedMesh(
            this.waterGeometry,
            this.waterMaterial,
            cs.length,
          ),
          matrix = new THREE.Matrix4();
        cs.forEach((c, i) => {
          const h = c.falling ? 0.96 : c.level / 8;
          matrix.makeScale(1, h, 1).setPosition(c.x, c.y - 0.5 + h / 2, c.z);
          mesh.setMatrixAt(i, matrix);
        });
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
        this.waterMeshes.push(mesh);
      }
    };
    this.addFoundation();
    this.addWorldDetails();
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(180);
    for (let i = 0; i < 60; i++) {
      positions[i * 3] = Math.sin(i * 23) * 12;
      positions[i * 3 + 1] = 1 + (i % 11);
      positions[i * 3 + 2] = Math.cos(i * 17) * 10;
    }
    particleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    this.sparks = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0xfff2c0,
        size: 0.09,
        transparent: true,
        opacity: 0.7,
      }),
    );
    this.scene.add(this.sparks);
    const burstGeometry = new THREE.BufferGeometry();
    burstGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(90), 3),
    );
    this.burst = new THREE.Points(
      burstGeometry,
      new THREE.PointsMaterial({
        color: 0xffce69,
        size: 0.16,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.scene.add(this.burst);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    let firstPointer: PointerEvent | undefined,
      replaying = false;
    const down = (e: PointerEvent) => {
      if (replaying) return;
      this.pointers.add(e.pointerId);
      if (this.pointers.size > 1) {
        this.gesture = true;
        const wasRotating = !!this.rotating;
        this.rotating = undefined;
        this.controls.enabled = true;
        if (wasRotating && firstPointer) {
          replaying = true;
          this.renderer.domElement.dispatchEvent(
            new PointerEvent('pointerdown', {
              pointerId: firstPointer.pointerId,
              pointerType: firstPointer.pointerType,
              clientX: firstPointer.clientX,
              clientY: firstPointer.clientY,
              button: 0,
              buttons: 1,
              bubbles: true,
            }),
          );
          replaying = false;
        }
        return;
      }
      firstPointer = e;
      this.rotationPreview = false;
      this.gesture = false;
      this.down = { x: e.clientX, y: e.clientY };
      const hit = this.pick(e);
      if (
        e.button === 0 &&
        this.selected &&
        hit &&
        key(hit.block) === key(this.selected) &&
        !this.live
      ) {
        this.rotating = { block: hit.block, pointer: e.pointerId };
        this.controls.enabled = false;
        this.renderer.domElement.setPointerCapture(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      if (
        this.rotating &&
        !this.rotationPreview &&
        Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 28
      ) {
        this.rotationPreview = true;
        this.onRotationPreview?.();
      }
    };
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      const dx = e.clientX - this.down.x,
        dy = e.clientY - this.down.y,
        rotating = this.rotating;
      this.rotating = undefined;
      this.controls.enabled = true;
      if (this.gesture) return;
      if (
        rotating &&
        rotating.pointer === e.pointerId &&
        Math.hypot(dx, dy) > 28
      ) {
        this.onRotate?.(
          rotating.block,
          Math.abs(dx) > Math.abs(dy) ? 'y' : 'x',
          (Math.abs(dx) > Math.abs(dy) ? dx : dy) > 0 ? 1 : -1,
        );
        return;
      }
      if (Math.hypot(dx, dy) > 8) return;
      const hit = this.pick(e);
      if (hit) {
        this.select(hit.point, hit.face);
      } else {
        const p = this.ray.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5),
          new THREE.Vector3(),
        );
        if (p && inBounds({ x: Math.round(p.x), y: 0, z: Math.round(p.z) }))
          this.select(
            { x: Math.round(p.x), y: -1, z: Math.round(p.z) },
            { x: 0, y: 1, z: 0 },
          );
      }
    };
    const cancel = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.gesture = true;
      this.rotating = undefined;
      this.controls.enabled = true;
    };
    // Capture phase runs before OrbitControls handles the same pointerdown.
    this.renderer.domElement.addEventListener('pointerdown', down, true);
    this.renderer.domElement.addEventListener('pointerup', up, true);
    this.renderer.domElement.addEventListener('pointermove', move, true);
    this.renderer.domElement.addEventListener('pointercancel', cancel, true);
    this.renderer.domElement.addEventListener('lostpointercapture', cancel);
    this.cleanup.push(() => {
      this.renderer.domElement.removeEventListener('pointerdown', down, true);
      this.renderer.domElement.removeEventListener('pointerup', up, true);
      this.renderer.domElement.removeEventListener('pointermove', move, true);
      this.renderer.domElement.removeEventListener(
        'pointercancel',
        cancel,
        true,
      );
      this.renderer.domElement.removeEventListener(
        'lostpointercapture',
        cancel,
      );
    });
    const contextLost = (e: Event) => {
      e.preventDefault();
      host.dispatchEvent(
        new CustomEvent('island-error', {
          detail: '3D表示が中断されました。ページを再読み込みしてください。',
        }),
      );
    };
    this.renderer.domElement.addEventListener('webglcontextlost', contextLost);
    this.cleanup.push(() =>
      this.renderer.domElement.removeEventListener(
        'webglcontextlost',
        contextLost,
      ),
    );
    this.animate();
  }
  private addFoundation() {
    const parts: { x: number; y: number; z: number; color: string }[] = [];
    for (let x = -ISLAND_RADIUS_X; x <= ISLAND_RADIUS_X; x++)
      for (let z = -ISLAND_RADIUS_Z; z <= ISLAND_RADIUS_Z; z++)
        if (onIsland(x, z)) {
          const depth =
            1 +
            Math.floor((1 - islandDistance(x, z)) * 4) +
            (Math.abs(x * 7 + z * 11) % 3 === 0 ? 1 : 0);
          for (let y = -1; y >= -depth; y--)
            parts.push({
              x,
              y,
              z,
              color: y === -1 ? '#b9b2c3' : y === -2 ? '#a09eb8' : '#8d90ad',
            });
        }
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.99, 0.99, 0.99),
      new THREE.MeshStandardMaterial({ roughness: 1 }),
      parts.length,
    );
    const matrix = new THREE.Matrix4();
    parts.forEach((p, i) => {
      matrix.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(
        i,
        new THREE.Color(p.color).multiplyScalar(1 + (i % 5) * 0.016),
      );
    });
    this.foundation = mesh;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // Distant voxel islands make the editable island feel part of a larger sky world.
    for (const [x, y, z, s] of [
      [-24, -6, -14, 0.22],
      [24, -7, -18, 0.28],
      [-23, -5, 13, 0.14],
    ]) {
      const g = new THREE.Group();
      for (let a = -3; a <= 3; a++)
        for (let b = -3; b <= 3; b++)
          if (a * a + b * b < 12) {
            this.cube(g, a, 0, b, 1, 1, 1, '#98c7ba');
            this.cube(g, a, -1, b, 1, 1, 1, '#a6aec6');
          }
      this.cube(g, 0, 1, 0, 0.7, 3, 0.7, '#bcaaab');
      this.cube(g, 0, 3, 0, 3, 2, 3, '#dfb5d1');
      g.position.set(x, y, z);
      g.scale.setScalar(s * 2);
      this.scene.add(g);
    }
  }
  private cube(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private addWorldDetails() {
    for (let i = 0; i < 24; i++) {
      const visitor = new THREE.Group();
      const shirt = ['#8bcfd1', '#e9a6c9', '#b1a1d5', '#efd094'][i % 4];
      this.cube(visitor, 0, 0.77, 0, 0.38, 0.42, 0.24, shirt);
      this.cube(visitor, 0, 1.15, 0, 0.36, 0.36, 0.34, '#f5d6c3');
      this.cube(
        visitor,
        0,
        1.34,
        -0.02,
        0.39,
        0.12,
        0.37,
        ['#5d4d63', '#d7b189', '#6b7984'][i % 3],
      );
      this.cube(visitor, -0.095, 0.4, 0, 0.12, 0.32, 0.15, '#596780');
      this.cube(visitor, 0.095, 0.4, 0, 0.12, 0.32, 0.15, '#596780');
      this.cube(visitor, -0.08, 1.15, 0.18, 0.04, 0.045, 0.015, '#434551');
      this.cube(visitor, 0.08, 1.15, 0.18, 0.04, 0.045, 0.015, '#434551');
      visitor.visible = i < 4;
      visitor.position.set((i % 3) * 1.4 - 1, 0.5, 2 + (i % 4));
      this.scene.add(visitor);
      this.visitors.push(visitor);
    }
  }
  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    return this.chunks.pick(this.ray);
  }
  setSelected(b?: Block) {
    this.selected = b;
    this.selectionMesh.visible = !!b && !this.live;
    if (b) {
      this.selectionMesh.position.set(
        b.x,
        b.y + (shapeOf(b) === 'door' ? 0.5 : 0),
        b.z,
      );
      this.selectionMesh.scale.set(1, shapeOf(b) === 'door' ? 2 : 1, 1);
    }
  }
  setRange(a?: Point, b?: Point) {
    this.rangeMesh.visible = !!a && !!b;
    if (a && b) {
      this.rangeMesh.position.set(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        (a.z + b.z) / 2,
      );
      this.rangeMesh.scale.set(
        Math.abs(a.x - b.x) + 1.04,
        Math.abs(a.y - b.y) + 1.04,
        Math.abs(a.z - b.z) + 1.04,
      );
    }
  }
  setBlocks(blocks: Block[]) {
    if (blocks === this.blocks) return;
    const old = this.chunks.blocks,
      next = new Map(blocks.map((b) => [key(b), b]));
    let waterChanged = this.waterRevision === 0;
    const affects = (b: Block) =>
      shapeOf(b) === 'waterSource' ||
      this.waterInfluence.has(key(b)) ||
      this.waterColumns.has(`${b.x},${b.z}`);
    for (const [k, b] of old)
      if (next.get(k) !== b && affects(b)) waterChanged = true;
    for (const [k, b] of next)
      if (old.get(k) !== b && affects(b)) waterChanged = true;
    // While a simulation is pending, conservatively replace it with the newest world.
    if (this.waterPending && blocks.some((b) => shapeOf(b) === 'waterSource'))
      waterChanged = true;
    this.blocks = blocks;
    this.chunks.setBlocks(blocks);
    this.ground = new Set(
      blocks.filter((b) => b.y === 0).map((b) => `${b.x},${b.z}`),
    );
    this.lamps = blocks.filter((b) => shapeOf(b) === 'lamp');
    this.lightTime = 0;
    if (waterChanged) {
      this.waterPending = true;
      this.waterRevision++;
      this.waterWorker.postMessage({ revision: this.waterRevision, blocks });
    }
  }
  setGhost(blocks: Point[], valid = true, erase = false) {
    if (this.foundation) this.foundation.visible = true;
    for (const obj of this.ghostGroup.children) {
      if (obj instanceof THREE.InstancedMesh) {
        obj.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }
    this.ghostGroup.clear();
    const groups = new Map<string, Block[]>();
    for (const p of blocks) {
      const block = { material: 'white' as const, ...p } as Block;
      const id = shapeOf(block) + ':' + !!block.open;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push(block);
    }
    for (const bs of groups.values()) {
      const mesh = new THREE.InstancedMesh(
        geometryFor(bs[0]),
        new THREE.MeshBasicMaterial({
          color: erase || !valid ? '#ff4965' : '#0ec2b3',
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
        bs.length,
      );
      bs.forEach((block, i) => mesh.setMatrixAt(i, blockMatrix(block)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.renderOrder = 2;
      this.ghostGroup.add(mesh);
    }
  }

  setLive(live: boolean, count = 8) {
    this.live = live;
    this.visitors.forEach((v, i) => (v.visible = i < (live ? count : 4)));
  }
  setNight(night: boolean) {
    this.night = night;
    this.ambient.intensity = night ? 0.4 : 2.3;
    this.sun.intensity = night ? 0.35 : 3.2;
    this.sun.color.set(night ? '#babaff' : '#fff3e4');
  }
  rotate(direction = 1) {
    const relative = this.camera.position.clone().sub(this.controls.target);
    relative.applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      (direction * Math.PI) / 4,
    );
    this.camera.position.copy(this.controls.target).add(relative);
    this.controls.update();
  }
  zoom(delta: number) {
    this.camera.zoom = THREE.MathUtils.clamp(
      this.camera.zoom * Math.exp(delta),
      0.55,
      20,
    );
    this.camera.updateProjectionMatrix();
    this.controls.dispatchEvent({ type: 'change' });
  }
  focus(p: Point) {
    if (this.interior) this.home();
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (p.y < 0) offset.y = -Math.abs(offset.y);
    this.controls.target.set(p.x, p.y, p.z);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }
  home() {
    this.interior = false;
    this.zoomIntent = 0;
    this.onInteriorChange?.(false);
    this.controls.target.set(0, 1.3, 0);
    this.camera.position.set(24, 24, 30);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  top() {
    if (this.interior) this.home();
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0.01, 40, 0.01);
    this.controls.update();
  }
  celebrate(p: Point) {
    this.burst.position.set(p.x, p.y, p.z);
    this.burstTime = performance.now() / 1000;
  }
  screenshot() {
    this.scene.background = new THREE.Color(this.night ? '#344d70' : '#e9f4fc');
    this.renderer.render(this.scene, this.camera);
    const image = this.renderer.domElement.toDataURL('image/png');
    this.scene.background = null;
    return image;
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    const aspect = w / h,
      view = Math.max(36, 43 / aspect);
    this.camera.left = (-view * aspect) / 2;
    this.camera.right = (view * aspect) / 2;
    this.camera.top = view / 2;
    this.camera.bottom = -view / 2;
    if (w > 900) this.camera.setViewOffset(w, h, -w * 0.065, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  private animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    if (document.hidden) return;
    const t = performance.now() / 1000;
    this.controls.update();
    if (t - this.lightTime > 0.3) {
      this.lightTime = t;
      const nearest = this.lamps
        .map((b) => ({
          b,
          d: this.camera.position.distanceToSquared(
            new THREE.Vector3(b.x, b.y, b.z),
          ),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.lights.length);
      this.lights.forEach((l, i) => {
        const b = nearest[i]?.b;
        l.intensity = b ? (this.night ? 16 : 7) : 0;
        if (b) l.position.set(b.x, b.y + 0.6, b.z);
      });
    }
    if (!this.reduced)
      this.waterMaterial.opacity = 0.62 + Math.sin(t * 1.7) * 0.035;
    if (!this.reduced) {
      this.sparks.rotation.y = t * 0.025;
      const age = t - this.burstTime;
      if (age < 0.8) {
        const points = this.burst.geometry.getAttribute('position');
        for (let i = 0; i < 30; i++)
          points.setXYZ(
            i,
            Math.sin(i * 15) * age * 2.2,
            Math.cos(i * 7) * age * 2 + age * 2 - age * age * 3,
            Math.cos(i * 11) * age * 2.2,
          );
        points.needsUpdate = true;
        (this.burst.material as THREE.PointsMaterial).opacity = 1 - age / 0.8;
      } else (this.burst.material as THREE.PointsMaterial).opacity = 0;
      this.visitors.forEach((v, i) => {
        if (!v.visible) return;
        const x = this.live
          ? 2 + ((i % 6) - 2.5) * 0.7
          : Math.sin(t * 0.16 + i * 1.5) * (i % 2 ? 1.1 : 6);
        const z = this.live
          ? 0.2 + Math.floor(i / 6) * 0.65
          : 2.5 + Math.cos(t * 0.16 + i) * 0.65;
        const ground = this.ground.has(`${Math.round(x)},${Math.round(z)}`);
        v.visible = ground;
        v.position.set(
          x,
          0.5 +
            (this.live
              ? Math.abs(Math.sin(t * 4 + i)) * 0.18
              : Math.abs(Math.sin(t * 4 + i)) * 0.035),
          z,
        );
        v.rotation.y = this.live ? Math.PI : Math.sin(t * 0.16 + i) * 0.5;
      });
    }
    (this.sparks.material as THREE.PointsMaterial).size = this.live
      ? 0.15
      : this.night
        ? 0.12
        : 0.07;
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.waterWorker.terminate();
    this.chunks.dispose();
    this.waterMeshes.forEach((m) => m.dispose());
    this.waterGeometry.dispose();
    this.waterMaterial.dispose();
    disposeBlockGeometries();
    this.cleanup.forEach((fn) => fn());
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        geometries.add(obj.geometry);
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(
          (m) => materials.add(m),
        );
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
