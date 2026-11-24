import * as THREE from 'three';

const SPAN = 46, AHEAD = 5;
const posmod = (x, m) => ((x % m) + m) % m;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createDust({ text, atlas, count = 340, seed = 4 }) {
  let a = seed >>> 0 || 1;
  const r = () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
  const chars = [...text].filter(c => /\p{L}/u.test(c) && atlas.cell.has(c));
  count = Math.min(count, chars.length);
  const motes = Array.from({ length: count }, (_, i) => {
    const ang = r() * Math.PI * 2, rad = 1.2 + Math.pow(r(), 0.7) * 10;
    return { ch: chars[Math.floor(i * chars.length / count)], x: Math.cos(ang) * rad * 1.3, y: Math.sin(ang) * rad * 0.85, z: r() * SPAN, tint: r(), phase: r() * Math.PI * 2, bright: 0.45 + r() * 0.55, size: 0.07 + r() * 0.07 };
  });
  const pos = new Float32Array(count * 12), col = new Float32Array(count * 12), uv = new Float32Array(count * 8), index = new Uint32Array(count * 6);
  motes.forEach((m, i) => { const [u0, v0, u1, v1] = atlas.cell.get(m.ch); uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8); index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const lines = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: atlas.tex, vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  lines.frustumCulled = false;
  let lastZ = null, speed = 0;
  const R = new THREE.Vector3(), U = new THREE.Vector3();

  function update({ camera, dt, time, tintA, tintB }) {
    const z = camera.position.z;
    const v = lastZ === null || dt <= 0 ? 0 : Math.abs(z - lastZ) / dt; lastZ = z;
    speed += (Math.min(v, 60) - speed) * Math.min(1, dt * (v > speed ? 6 : 2.5));
    const lit = 0.3 + Math.min(1, speed / 14) * 0.5;
    const e = camera.matrixWorld.elements;
    R.set(e[0], e[1], e[2]); U.set(e[4], e[5], e[6]);
    for (let i = 0; i < count; i++) {
      const m = motes[i], d = posmod(z + AHEAD - m.z, SPAN), wz = z + AHEAD - d;
      const x = m.x + Math.sin(time * 0.11 + m.phase) * 0.25, y = m.y + Math.cos(time * 0.09 + m.phase * 1.7) * 0.2, h = m.size;

      const f = smooth(0, 4, d) * (1 - smooth(SPAN * 0.55, SPAN, d)) * m.bright * lit;
      pos.set([x - (R.x + U.x) * h, y - (R.y + U.y) * h, wz - (R.z + U.z) * h, x + (R.x - U.x) * h, y + (R.y - U.y) * h, wz + (R.z - U.z) * h,
        x + (R.x + U.x) * h, y + (R.y + U.y) * h, wz + (R.z + U.z) * h, x - (R.x - U.x) * h, y - (R.y - U.y) * h, wz - (R.z - U.z) * h], i * 12);
      const c0 = (tintA[0] + (tintB[0] - tintA[0]) * m.tint) * f, c1 = (tintA[1] + (tintB[1] - tintA[1]) * m.tint) * f, c2 = (tintA[2] + (tintB[2] - tintA[2]) * m.tint) * f;
      col.set([c0, c1, c2, c0, c1, c2, c0, c1, c2, c0, c1, c2], i * 12);
    }
    geometry.attributes.position.needsUpdate = geometry.attributes.color.needsUpdate = true;
  }
  return { lines, update, speed: () => speed, count: () => count };
}
