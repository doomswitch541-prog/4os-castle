import * as THREE from 'three';

const FONT = '"DejaVu Serif", "Iowan Old Style", Georgia, serif';
const CELL = 96, EM = 0.6;

function rng(seed) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }

export function letterAtlas(text, texSpace) {
  const chars = [...new Set([...text].filter(c => c.trim()))];
  const cols = Math.ceil(Math.sqrt(chars.length)), rows = Math.ceil(chars.length / cols);
  const canvas = document.createElement('canvas'); canvas.width = cols * CELL; canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d');
  ctx.font = `${CELL * EM}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'; ctx.shadowBlur = CELL * 0.05;
  const cell = new Map(), advance = new Map([[' ', ctx.measureText(' ').width / (CELL * EM)]]);
  chars.forEach((c, i) => {
    const x = (i % cols) * CELL, y = Math.floor(i / cols) * CELL;
    ctx.fillText(c, x + CELL / 2, y + CELL / 2);
    cell.set(c, [x / canvas.width, 1 - (y + CELL) / canvas.height, (x + CELL) / canvas.width, 1 - y / canvas.height]);
    advance.set(c, ctx.measureText(c).width / (CELL * EM));
  });
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = texSpace; tex.anisotropy = 4;
  return { tex, cell, advance, EM };
}

export function createAnamorph({ sentence, dust, texSpace, colorSpace, seed = 2026 }) {
  const letters = [...sentence], dustChars = [...dust].filter(c => /\p{L}/u.test(c)).slice(0, 2000);
  const { tex, cell, advance } = letterAtlas([...letters, ...dustChars].join(''), texSpace);
  function mesh(list, hex) {
    const n = list.length, uv = new Float32Array(n * 8), index = new Uint32Array(n * 6);
    list.forEach((ch, i) => { const [u0, v0, u1, v1] = cell.get(ch); uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8); index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.material.color.setHex(hex, colorSpace);
    m.frustumCulled = false;
    return m;
  }
  const shown = letters.filter(c => c.trim());
  const words = mesh(shown, 0xf1cb96), field = mesh(dustChars.length ? dustChars.slice(0, 260) : shown, 0xcdb8f2);
  const group = new THREE.Group(); group.add(field, words); group.visible = false;
  const r = rng(seed);

  const deep = shown.map(() => ({ s: 0.42 + Math.pow(r(), 0.8) * 2.5, phase: r() * Math.PI * 2, rate: 0.25 + r() * 0.35 }));
  const dustAt = field.geometry.attributes.position.array.length / 12;
  const motes = Array.from({ length: dustAt }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, z: r(), size: 0.5 + r() * 0.8, phase: r() * Math.PI * 2 }));
  let eye = new THREE.Vector3(), targets = [], font = 0.3, hold = 4.2, box = { W: 1, H: 1 }, planeZ = 0;

  function quad(arr, i, x, y, z, half) {
    arr.set([x - half, y - half, z, x + half, y - half, z, x + half, y + half, z, x - half, y + half, z], i * 12);
  }

  function layout({ W, H, plane, hold: d, y = 0 }) {
    box = { W, H }; planeZ = plane; hold = d; eye.set(0, 0, plane + d);
    font = Math.min(H * 0.085, W * 0.105);
    const space = advance.get(' ') * font, width = W * 0.8, lines = [[]];
    let lw = 0;
    for (const w of sentence.split(' ')) {
      const ww = [...w].reduce((s, c) => s + (advance.get(c) || 0.6) * font, 0);
      if (lines.at(-1).length && lw + space + ww > width) { lines.push([]); lw = 0; }
      lines.at(-1).push(w); lw += (lines.at(-1).length > 1 ? space : 0) + ww;
    }
    const lead = font * 1.4, top = y + (lines.length - 1) * lead / 2;
    targets = [];
    lines.forEach((ws, li) => {
      const text = ws.join(' '), tw = [...text].reduce((s, c) => s + (advance.get(c) || 0.6) * font, 0);
      let x = -tw / 2;
      for (const c of text) { const a = (advance.get(c) || 0.6) * font; if (c.trim()) targets.push({ x: x + a / 2, y: top - li * lead }); x += a; }
    });

    const pos = field.geometry.attributes.position.array;
    motes.forEach((m, i) => {
      const z = plane + d - (0.6 + m.z * 15), k = (eye.z - z) / d;
      quad(pos, i, m.x * W * 0.9 * k, m.y * H * 0.9 * k, z, font * 0.32 * m.size * k);
    });
    field.geometry.attributes.position.needsUpdate = true;
  }

  function update(fade, t) {
    group.visible = fade > 0.002;
    if (!group.visible) return;
    words.material.opacity = Math.min(1, fade * 1.1);
    field.material.opacity = 0.28 * fade;
    const pos = words.geometry.attributes.position.array;
    targets.forEach((p, i) => {
      const q = deep[i], s = q.s * (1 + 0.12 * Math.sin(t * q.rate + q.phase));

      quad(pos, i, eye.x + p.x * s, eye.y + p.y * s, eye.z - hold * s, font / EM / 2 * s);
    });
    words.geometry.attributes.position.needsUpdate = true;
  }
  return { group, layout, update, eye: () => eye.clone(), count: () => targets.length };
}
