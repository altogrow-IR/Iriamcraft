import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  MATERIALS,
  LIMIT,
  onIsland,
  inBounds,
  ISLAND_RADIUS_X,
  ISLAND_RADIUS_Z,
  islandDistance,
  HORIZONTAL_LIMIT,
  type Block,
  type Point,
} from '@/lib/world';

export class IslandEngine {
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 250);
  private controls: OrbitControls;
  private voxels: THREE.InstancedMesh;
  private ghost: THREE.InstancedMesh;
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
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minZoom = 0.55;
    this.controls.maxZoom = 3;
    this.controls.maxTargetRadius = HORIZONTAL_LIMIT * Math.SQRT2;
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
    const geometry = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    this.voxels = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ roughness: 0.88 }),
      LIMIT,
    );
    this.voxels.count = 0;
    this.voxels.castShadow = true;
    this.voxels.receiveShadow = true;
    this.voxels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.voxels);
    this.ghost = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({
        color: 0x12b9b3,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
      }),
      200,
    );
    this.ghost.count = 0;
    this.ghost.renderOrder = 2;
    this.scene.add(this.ghost);
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
    const down = (e: PointerEvent) => {
      this.pointers.add(e.pointerId);
      if (this.pointers.size > 1) this.gesture = true;
      else {
        this.gesture = false;
        this.down = { x: e.clientX, y: e.clientY };
      }
    };
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (
        this.gesture ||
        Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8
      )
        return;
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        this.camera,
      );
      const hit = this.ray.intersectObject(this.voxels)[0];
      if (hit && hit.instanceId !== undefined && hit.face) {
        const p = this.blocks[hit.instanceId];
        const n = hit.face.normal;
        this.select(p, {
          x: Math.round(n.x),
          y: Math.round(n.y),
          z: Math.round(n.z),
        });
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
    };
    this.renderer.domElement.addEventListener('pointerdown', down);
    this.renderer.domElement.addEventListener('pointerup', up);
    this.renderer.domElement.addEventListener('pointercancel', cancel);
    const lost = () => {
      this.pointers.clear();
      this.gesture = true;
    };
    this.renderer.domElement.addEventListener('lostpointercapture', lost);
    this.cleanup.push(() => {
      this.renderer.domElement.removeEventListener('pointerdown', down);
      this.renderer.domElement.removeEventListener('pointerup', up);
      this.renderer.domElement.removeEventListener('pointercancel', cancel);
      this.renderer.domElement.removeEventListener('lostpointercapture', lost);
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
  setBlocks(blocks: Block[]) {
    this.blocks = blocks;
    this.voxels.count = blocks.length;
    const matrix = new THREE.Matrix4(),
      color = new THREE.Color();
    blocks.forEach((b, i) => {
      matrix.makeTranslation(b.x, b.y, b.z);
      this.voxels.setMatrixAt(i, matrix);
      color.set(MATERIALS.find((m) => m.id === b.material)!.color);
      color.multiplyScalar(1 + Math.sin(b.x * 23 + b.z * 13 + b.y * 7) * 0.035);
      this.voxels.setColorAt(i, color);
    });
    this.voxels.instanceMatrix.needsUpdate = true;
    if (this.voxels.instanceColor) this.voxels.instanceColor.needsUpdate = true;
    this.voxels.computeBoundingSphere();
  }
  setGhost(blocks: Point[], valid = true, erase = false) {
    this.ghost.count = Math.min(blocks.length, 200);
    const matrix = new THREE.Matrix4();
    blocks.slice(0, 200).forEach((p, i) => {
      matrix.makeTranslation(p.x, p.y, p.z);
      this.ghost.setMatrixAt(i, matrix);
    });
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(
      erase || !valid ? '#ff6c8b' : '#0ec2b3',
    );
    this.ghost.instanceMatrix.needsUpdate = true;
    this.ghost.computeBoundingSphere();
  }
  setLive(live: boolean, count = 8) {
    this.live = live;
    this.visitors.forEach((v, i) => (v.visible = i < (live ? count : 4)));
  }
  setNight(night: boolean) {
    this.night = night;
    this.ambient.intensity = night ? 1.4 : 2.3;
    this.sun.intensity = night ? 1 : 3.2;
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
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom + delta, 0.55, 3);
    this.camera.updateProjectionMatrix();
  }
  home() {
    this.controls.target.set(0, 1.3, 0);
    this.camera.position.set(24, 24, 30);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  top() {
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
        const ground = this.blocks.some(
          (b) => b.x === Math.round(x) && b.z === Math.round(z) && b.y === 0,
        );
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
