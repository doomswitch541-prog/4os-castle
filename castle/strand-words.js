import * as THREE from 'three';
import { SAMPLES } from './threads.js';

const N = SAMPLES + 1, STEP = 5;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const carried = c => !/[\p{Extended_Pictographic}‍️]/u.test(c);

export function createStrandWords({ text, form, atlas, colorSpace, hex = 0xf1cb96 }) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').map(w => [...w].filter(carried).join('')).filter(Boolean);
  const geometry = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  mesh.material.color.setHex(hex, colorSpace);
  mesh.frustumCulled = false; mesh.visible = false;

  const view = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const pts = [], lens = [];
  let lines = null, flow = 0, pos = null, quads = 0, seen = 0;
  let placed = new Float32Array(0), nPlaced = 0;
  const adv = (c, size) => (atlas.advance.get(c) || 0.6) * size;

  function follow(line) {
    const P = pts[line.i] ||= new Float32Array(N * 3), L = lens[line.i] ||= new Float32Array(N);
    for (let k = 0; k < N; k++) { form.anchor(line.strand, line.reverse ? SAMPLES - k : k, p); P.set([p.x, p.y, p.z], k * 3); }
    L[0] = 0;
    for (let k = 1; k < N; k++) L[k] = L[k - 1] + Math.hypot(P[k * 3] - P[k * 3 - 3], P[k * 3 + 1] - P[k * 3 - 2], P[k * 3 + 2] - P[k * 3 - 1]);
    return L[N - 1];
  }

  function choose(camera, size) {
    view.copy(camera.matrixWorld).invert();
    let best = 0, bestZ = -Infinity, bestK = 0;
    for (let s = 0; s < 64; s += 2) for (let k = 0; k < N; k += 4) { form.anchor(s, k, p).applyMatrix4(view); if (p.z > bestZ) { bestZ = p.z; best = s; bestK = k; } }
    form.anchor(best, Math.max(0, bestK - 2), p).applyMatrix4(view); form.anchor(best, Math.min(SAMPLES, bestK + 2), q).applyMatrix4(view);
    const reverse = q.x < p.x;
    const loop = follow({ i: 0, strand: best, reverse }), front = lens[0][reverse ? SAMPLES - bestK : bestK];
    const width = t => [...t].reduce((s, c) => s + adv(c, size), 0);
    const wrapped = [];
    let cur = [], w = 0;
    for (const word of words) {
      const ww = width(word), sp = cur.length ? adv(' ', size) : 0;
      if (cur.length && w + sp + ww > loop * 0.86) { wrapped.push(cur.join(' ')); cur = []; w = 0; }
      w += (cur.length ? adv(' ', size) : 0) + ww; cur.push(word);
    }
    if (cur.length) wrapped.push(cur.join(' '));
    lines = wrapped.slice(0, 4).map((t, i) => {
      const lw = width(t), copies = wrapped.length === 1 ? Math.max(1, Math.min(4, Math.floor(loop / (lw + loop * 0.14)))) : 1;
      return { i, text: t, strand: (best + i * STEP) % 64, reverse, copies, period: loop / copies, offset: front - lw / 2 + i * loop * 0.37 };
    });

    const letters = lines.flatMap(l => Array.from({ length: l.copies }, () => [...l.text].filter(c => c.trim())).flat());
    quads = letters.length; placed = new Float32Array(quads * 3);
    const uv = new Float32Array(quads * 8), index = new Uint32Array(quads * 6);
    letters.forEach((c, i) => { const [u0, v0, u1, v1] = atlas.cell.get(c) || atlas.cell.values().next().value; uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8); index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); });
    pos = new Float32Array(quads * 12);
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
  }

  function update({ camera, dt, fade, size }) {
    mesh.visible = fade > 0.02 && words.length > 0;
    if (!mesh.visible) return;
    if (!lines) choose(camera, size);
    flow += dt * size * 1.6;
    view.copy(camera.matrixWorld).invert();
    const m = camera.matrixWorld.elements;
    R.set(m[0], m[1], m[2]).normalize(); U.set(m[4], m[5], m[6]).normalize();
    form.group.getWorldPosition(C).applyMatrix4(view);
    const reach = form.radiusWorld(), half = size / atlas.EM / 2;
    let j = 0; seen = 0; nPlaced = 0;
    for (const line of lines) {
      const total = follow(line), P = pts[line.i], L = lens[line.i], before = nPlaced;
      for (let copy = 0; copy < line.copies; copy++) {
        let x = copy * line.period;
        for (const c of line.text) {
          const a = adv(c, size);
          if (!c.trim()) { x += a; continue; }
          let s = (flow + line.offset + x + a / 2) % total; if (s < 0) s += total;
          let k = 1; while (k < N - 1 && L[k] < s) k++;
          const f = (s - L[k - 1]) / Math.max(1e-6, L[k] - L[k - 1]);
          p.set(P[k * 3 - 3], P[k * 3 - 2], P[k * 3 - 1]).lerp(q.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]), f);

          A.set(P[k * 3] - P[k * 3 - 3], P[k * 3 + 1] - P[k * 3 - 2], P[k * 3 + 2] - P[k * 3 - 1]).transformDirection(view);
          B.copy(p).applyMatrix4(view);

          const ang = Math.atan2(A.y, A.x), across = Math.hypot(A.x, A.y);
          let grow = smooth(-0.15 * reach, 0.3 * reach, B.z - C.z) * smooth(-0.2, 0.35, Math.cos(ang)) * smooth(0.5, 0.85, across);

          for (let o = 0, upto = Math.max(before, nPlaced - 8); o < upto && grow > 0.05; o++) { const dx = placed[o * 3] - B.x, dy = placed[o * 3 + 1] - B.y, r = (placed[o * 3 + 2] + half * grow) * 0.8; if (dx * dx + dy * dy < r * r) grow = 0; }
          if (grow > 0.4) seen++;
          if (grow > 0.2) { placed.set([B.x, B.y, half * grow], nPlaced * 3); nPlaced++; }
          const h = half * grow, cs = Math.cos(ang) * h, sn = Math.sin(ang) * h;

          const ax = R.x * cs + U.x * sn, ay = R.y * cs + U.y * sn, az = R.z * cs + U.z * sn;
          const bx = -R.x * sn + U.x * cs, by = -R.y * sn + U.y * cs, bz = -R.z * sn + U.z * cs;
          pos.set([p.x - ax - bx, p.y - ay - by, p.z - az - bz, p.x + ax - bx, p.y + ay - by, p.z + az - bz,
            p.x + ax + bx, p.y + ay + by, p.z + az + bz, p.x - ax + bx, p.y - ay + by, p.z - az + bz], j * 12);
          x += a; j++;
        }
      }
    }
    geometry.attributes.position.needsUpdate = true;
    mesh.material.opacity = Math.min(1, fade * 1.15);
  }
  return { mesh, update, seen: () => seen, lines: () => lines?.map(l => (l.copies > 1 ? `${l.text} ×${l.copies}` : l.text)) || [], reset: () => { lines = null; } };
}
