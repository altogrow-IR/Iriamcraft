import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  shapeOf,
  ZERO,
  type Block,
  type BlockShape,
} from '../../lib/block-types.ts';
const cache = new Map<string, THREE.BufferGeometry>();
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function roof(ridge: boolean) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.49, -0.49);
  shape.lineTo(0.49, -0.49);
  shape.lineTo(ridge ? 0 : 0.49, 0.49);
  if (ridge) shape.lineTo(-0.49, -0.49);
  else shape.lineTo(-0.49, -0.49);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.98,
    bevelEnabled: false,
    steps: 1,
  }).translate(0, 0, -0.49);
}
export function blockGeometry(
  shape: BlockShape,
  connections = 0,
  open = false,
): THREE.BufferGeometry {
  const id = `${shape}:${connections}:${open}`;
  const cached = cache.get(id);
  if (cached) return cached;
  let parts: THREE.BufferGeometry[];
  switch (shape) {
    case 'slab':
      parts = [box(0.98, 0.5, 0.98, 0, -0.25)];
      break;
    case 'stairs':
      parts = [
        box(0.98, 0.5, 0.98, 0, -0.25),
        box(0.98, 0.5, 0.5, 0, 0.25, -0.25),
      ];
      break;
    case 'fence':
      parts = [box(0.22, 0.98, 0.22)];
      for (let i = 0; i < 4; i++)
        if (connections & (1 << i))
          for (const y of [-0.12, 0.25])
            parts.push(
              i < 2
                ? box(0.5, 0.12, 0.12, i === 0 ? 0.25 : -0.25, y)
                : box(0.12, 0.12, 0.5, 0, y, i === 2 ? 0.25 : -0.25),
            );
      if (!connections)
        for (const y of [-0.12, 0.25]) parts.push(box(0.98, 0.12, 0.12, 0, y));
      break;
    case 'door':
      parts = [
        box(0.88, 1.94, 0.12, 0, 0.49),
        box(0.1, 0.1, 0.17, 0.3, 0.45, 0.1),
      ];
      break;
    case 'glassPane':
      parts = [box(0.98, 0.98, 0.1)];
      break;
    case 'gridWindow':
      parts = [
        box(0.98, 0.1, 0.15, 0, 0.44),
        box(0.98, 0.1, 0.15, 0, -0.44),
        box(0.1, 0.98, 0.15, -0.44),
        box(0.1, 0.98, 0.15, 0.44),
        box(0.98, 0.055, 0.12),
        box(0.055, 0.98, 0.12),
      ];
      break;
    case 'roofSlope':
      parts = [roof(false)];
      break;
    case 'roofRidge':
      parts = [roof(true)];
      break;
    case 'lamp':
      parts = [
        box(0.62, 0.66, 0.62, 0, 0.05),
        box(0.78, 0.12, 0.78, 0, 0.43),
        box(0.3, 0.2, 0.3, 0, -0.38),
      ];
      break;
    case 'waterSource':
      parts = [box(0.98, 0.88, 0.98, 0, -0.05)];
      break;
    default:
      parts = [box(0.98, 0.98, 0.98)];
  }
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const geometry = mergeGeometries(flat);
  flat.forEach((p, i) => {
    if (p !== parts[i]) p.dispose();
  });
  parts.forEach((p) => p.dispose());
  if (shape === 'door' && open)
    geometry
      .translate(0.44, 0, 0)
      .rotateY(Math.PI / 2)
      .translate(-0.44, 0, 0);
  cache.set(id, geometry);
  return geometry;
}
export function blockMatrix(b: Block) {
  const r = b.rotation ?? ZERO;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(b.x, b.y, b.z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (r.x * Math.PI) / 2,
        (r.y * Math.PI) / 2,
        (r.z * Math.PI) / 2,
      ),
    ),
    new THREE.Vector3(1, 1, 1),
  );
}
export function geometryFor(b: Block, connections = 0) {
  return blockGeometry(shapeOf(b), connections, b.open);
}
export function disposeBlockGeometries() {
  cache.forEach((g) => g.dispose());
  cache.clear();
}
