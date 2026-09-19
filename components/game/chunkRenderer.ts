import * as THREE from 'three';
import { key, type Block, type Point } from '../../lib/world.ts';
import { cells, shapeOf } from '../../lib/block-types.ts';
import { MATERIALS, isGlass } from '../../lib/materials.ts';
import { blockMatrix, geometryFor } from './blockGeometries.ts';
const COLORS = new Map(MATERIALS.map((m) => [m.id, new THREE.Color(m.color)]));
export const chunkKey = (p: Point) =>
  `${Math.floor(p.x / 16)},${Math.floor(p.y / 16)},${Math.floor(p.z / 16)}`;
export class ChunkRenderer {
  readonly group = new THREE.Group();
  readonly blocks = new Map<string, Block>();
  private chunks = new Map<string, Map<string, Block>>();
  private meshes = new Map<string, THREE.InstancedMesh[]>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  lastRebuilt = 0;
  private material(b: Block) {
    const glass = isGlass(b.material),
      water = shapeOf(b) === 'waterSource',
      lamp = shapeOf(b) === 'lamp';
    const id = `${glass}:${water}:${lamp}`;
    if (!this.materials.has(id))
      this.materials.set(
        id,
        new THREE.MeshStandardMaterial({
          color: '#ffffff',
          roughness: glass ? 0.2 : 0.85,
          transparent: glass || water,
          opacity: glass ? 0.42 : water ? 0.64 : 1,
          depthWrite: !glass && !water,
          emissive: lamp ? '#ffca6e' : '#000000',
          emissiveIntensity: lamp ? 1.6 : 0,
        }),
      );
    return this.materials.get(id)!;
  }
  setBlocks(blocks: Block[]) {
    const next = new Map(blocks.map((b) => [key(b), b])),
      dirty = new Set<string>();
    const mark = (b: Block) => {
      dirty.add(chunkKey(b));
      for (const [x, z] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const p = { ...b, x: b.x + x, z: b.z + z },
          neighbor = next.get(key(p)) ?? this.blocks.get(key(p));
        if (neighbor && shapeOf(neighbor) === 'fence') dirty.add(chunkKey(p));
      }
    };
    for (const [k, b] of this.blocks)
      if (next.get(k) !== b) {
        mark(b);
        this.chunks.get(chunkKey(b))?.delete(k);
        this.blocks.delete(k);
      }
    for (const [k, b] of next)
      if (this.blocks.get(k) !== b) {
        mark(b);
        this.blocks.set(k, b);
        const ck = chunkKey(b);
        if (!this.chunks.has(ck)) this.chunks.set(ck, new Map());
        this.chunks.get(ck)!.set(k, b);
      }
    this.lastRebuilt = 0;
    for (const ck of dirty) {
      const old = this.meshes.get(ck);
      old?.forEach((m) => {
        this.group.remove(m);
        m.dispose();
      });
      this.meshes.delete(ck);
      const entries = this.chunks.get(ck);
      if (!entries?.size) {
        this.chunks.delete(ck);
        continue;
      }
      this.lastRebuilt++;
      const buckets = new Map<
        string,
        { blocks: Block[]; connections: number }
      >();
      for (const b of entries.values()) {
        let connections = 0;
        if (shapeOf(b) === 'fence')
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].forEach(([x, z], i) => {
            const n = this.blocks.get(key({ ...b, x: b.x + x, z: b.z + z }));
            if (n && shapeOf(n) === 'fence') connections |= 1 << i;
          });
        const id = `${isGlass(b.material)}:${shapeOf(b)}:${connections}:${b.open ?? false}`;
        if (!buckets.has(id)) buckets.set(id, { blocks: [], connections });
        buckets.get(id)!.blocks.push(b);
      }
      const meshes: THREE.InstancedMesh[] = [];
      for (const bucket of buckets.values()) {
        const bs = bucket.blocks,
          mesh = new THREE.InstancedMesh(
            geometryFor(bs[0], bucket.connections),
            this.material(bs[0]),
            bs.length,
          );
        bs.forEach((b, i) => {
          mesh.setColorAt(i, COLORS.get(b.material)!);
          mesh.setMatrixAt(
            i,
            blockMatrix(
              shapeOf(b) === 'fence' && bucket.connections
                ? { ...b, rotation: { x: 0, y: 0, z: 0 } }
                : b,
            ),
          );
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.blocks = bs;
        mesh.castShadow = !isGlass(bs[0].material);
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
        this.group.add(mesh);
        meshes.push(mesh);
      }
      this.meshes.set(ck, meshes);
    }
  }
  pick(ray: THREE.Raycaster) {
    const hits = ray.intersectObjects(this.group.children, false);
    const hit = hits[0];
    if (!hit || hit.instanceId === undefined || !hit.face) return;
    const mesh = hit.object as THREE.InstancedMesh,
      b = (mesh.userData.blocks as Block[])[hit.instanceId];
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(hit.instanceId, matrix);
    const n = hit.face.normal.clone().transformDirection(matrix);
    const axis =
      Math.abs(n.x) > Math.abs(n.y)
        ? Math.abs(n.x) > Math.abs(n.z)
          ? 'x'
          : 'z'
        : Math.abs(n.y) > Math.abs(n.z)
          ? 'y'
          : 'z';
    const face = { x: 0, y: 0, z: 0 };
    face[axis] = Math.sign(n[axis]);
    const cell = cells(b).find((c) => Math.abs(hit.point.y - c.y) <= 0.51) ?? b;
    return { block: b, point: cell, face };
  }
  dispose() {
    this.meshes.forEach((ms) => ms.forEach((m) => m.dispose()));
    this.materials.forEach((m) => m.dispose());
    this.group.clear();
  }
}
