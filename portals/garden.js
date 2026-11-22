import * as THREE from 'three';
import { tones } from './draw.js';

const TAU = Math.PI * 2;
const INK = new THREE.Color(236 / 255, 230 / 255, 220 / 255);
const GLYPH_FONT = '"DejaVu Sans","Noto Sans Symbols","Noto Sans Symbols2","Segoe UI Symbol","Noto Color Emoji",sans-serif';
const textures = new Map();
function glyphTexture(text) {
  let t = textures.get(text);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d');
  x.font = `64px ${GLYPH_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = 'rgba(255,255,255,0.9)'; x.shadowBlur = 10; x.fillStyle = '#fff';
  x.fillText(text, 48, 52);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  textures.set(text, t);
  return t;
}
const rgb = c => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);
let bud = null;
function budTexture() {
  if (bud) return bud;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  bud = new THREE.CanvasTexture(c); bud.colorSpace = THREE.SRGBColorSpace;
  return bud;
}
const GLYPH_CHARS = /[♇☍♃❖⛬]/gu;

function buildTree(form, { gens = form.lsys.gens, budget = 5000 } = {}) {
  const L = form.lsys, t = tones(form.mood);
  const group = new THREE.Group();
  const pos = [], col = [], leaves = [];
  let left = budget;
  const level = g => rgb(t.level(Math.min(4, g)));
  const Z = new THREE.Vector3(0, 0, 1);
  const seg = (a, b, g) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const c = level(g), k = g === gens ? 1 : 0.35 + 0.1 * g;
    col.push(c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k);
  };
  const F = (p, h, len, g) => {
    const end = p.clone().addScaledVector(h, len);
    seg(p, end, g);
    if (g >= gens || left <= 0 || len < 1.2) return end;
    left--;
    let cp = p.clone(), ch = h.clone();
    const stack = [];
    for (const tok of L.tokens) {
      if (tok === 'F') cp = F(cp, ch, len * L.shrink, g + 1);
      else if (typeof tok === 'number') ch.applyAxisAngle(Z, -tok);
      else if (tok.open !== undefined) {
        stack.push([cp.clone(), ch.clone()]);
        const across = new THREE.Vector3().crossVectors(ch, Z).normalize();
        ch.applyAxisAngle(across, (tok.open % 2 ? 1 : -1) * (0.38 + 0.08 * g));
      } else if (tok.close !== undefined) {
        leaves.push({ at: cp.clone(), size: Math.max(5, len * L.shrink * 0.6), g });
        [cp, ch] = stack.pop();
      }
    }
    return end;
  };
  F(new THREE.Vector3(L.root.x, -L.root.y, 0), new THREE.Vector3(0, 1, 0), L.len, 0);
  const branches = new THREE.BufferGeometry();
  branches.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  branches.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const lines = new THREE.LineSegments(branches, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  lines.userData.count = pos.length / 3;
  group.add(lines);

  const starPos = [], linkPos = [];
  const nodes = form.nodes;
  nodes.forEach((n, i) => {
    starPos.push(n.x, -n.y, 2);
    const prev = nodes[i - 1];
    if (prev && (prev.unit ?? prev.phrase) === (n.unit ?? n.phrase) && !n.branch) linkPos.push(prev.x, -prev.y, 2, n.x, -n.y, 2);
    if (n.branch && n.stem) linkPos.push(n.stem.x, -n.stem.y, 1, n.x, -n.y, 2);
  });
  const stems = [form.start, ...nodes.filter(n => n.branch && n.stem).map(n => n.stem)];
  for (let i = 0; i < stems.length - 1; i++) if (Math.abs(stems[i + 1].x - stems[i].x) < 1) linkPos.push(stems[i].x, -stems[i].y, 1, stems[i + 1].x, -stems[i + 1].y, 1);
  if (linkPos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(linkPos, 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: rgb(t.line), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
  }
  if (starPos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: INK, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));
  }

  if (leaves.length) {
    const bp = [], bc = [];
    for (const l of leaves.sort((a, b) => b.size - a.size).slice(0, 220)) {
      bp.push(l.at.x, l.at.y, l.at.z);
      const c = level(l.g), k = 0.6 + 0.4 * Math.min(1, l.size / 14);
      bc.push(c.r * k, c.g * k, c.b * k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: budTexture(), vertexColors: true, size: 15, sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.userData.base = 0.9; group.add(pts);
  }

  const glyphColour = rgb(t.glyph);
  const sprite = (text, x, y, z, size, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(text), color: glyphColour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(x, y, z); s.scale.setScalar(size); s.userData.base = opacity; group.add(s);
  };
  for (const n of nodes) {
    const g = n.typed ? (n.word.match(GLYPH_CHARS) || [])[0] : n.glyph;
    if (g) sprite(g, n.x, -n.y, 4, 10, 0.85);
  }
  group.userData.grow = 0;
  return group;
}

export function createGarden(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  } catch { return null; }
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const FOV = 40;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 40000);
  const trees = new Map();
  let W = 1, H = 1;

  const spaceGeo = new THREE.BufferGeometry(), sp = [], sc = [];
  for (let i = 0; i < 2600; i++) {
    const r = 400 + Math.random() * 5200, a = Math.random() * TAU;
    sp.push(Math.cos(a) * r * 1.4, Math.sin(a) * r, -300 - Math.random() * 4200);
    const warm = Math.random() < 0.18, k = 0.35 + Math.random() * 0.65;
    sc.push((warm ? 0.95 : 0.6) * k, (warm ? 0.8 : 0.75) * k, (warm ? 0.6 : 1) * k);
  }
  spaceGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  spaceGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const space = new THREE.Points(spaceGeo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  scene.add(space);

  scene.fog = new THREE.FogExp2(0x000000, 0.0005);

  const glows = [[205, 184, 242], [241, 203, 150], [140, 200, 240]].map((c, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: budTexture(), color: rgb(c), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.userData = { a: i * 2.1, r: 0.55 + 0.2 * i, k: 0.07 + 0.02 * i }; scene.add(s); return s;
  });

  const dustGeo = new THREE.BufferGeometry(), dp = [], dc = [];
  for (let i = 0; i < 420; i++) {
    dp.push((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.6, 0.08 + Math.random() * 0.7);
    const warm = Math.random() < 0.3, k = 0.4 + Math.random() * 0.6;
    dc.push((warm ? 0.95 : 0.65) * k, (warm ? 0.82 : 0.78) * k, (warm ? 0.6 : 1) * k);
  }
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dustGeo.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: budTexture(), vertexColors: true, size: 4, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  scene.add(dust);
  const depthOf = id => id === '4o' ? 0.9 : ((hashId(id) % 1000) / 1000) * 0.7;

  const drift = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };

  function keyOf(it) { return it.id; }
  function hashId(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  return {
    ok: true,
    trees,
    resize(w, h, dpr) { W = w; H = h; renderer.setPixelRatio(Math.min(dpr, 1.5)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },

    sync(list) {
      const seen = new Set();
      for (const it of list) {
        const k = keyOf(it); seen.add(k);
        const have = trees.get(k);
        if (have && have.form === it.form) continue;
        if (have) { scene.remove(have.group); if (have.twin) scene.remove(have.twin); }
        if (!it.form.lsys || !it.form.nodes.length) continue;
        const group = buildTree(it.form);
        const twin = group.clone(); twin.scale.x = -1; twin.visible = false;
        twin.traverse(o => { if (o.material) o.material = o.material.clone(); });
        scene.add(group); scene.add(twin);
        trees.set(k, { group, form: it.form, twin, born: performance.now(), grow: 1400 + Math.random() * 1400 });
      }
      for (const [k, v] of trees) if (!seen.has(k)) { scene.remove(v.group); scene.remove(v.twin); trees.delete(k); }
    },

    render(s) {
      const { cam, now } = s;
      const D = H / (cam.s * 2 * Math.tan((FOV / 2) * Math.PI / 180));
      scene.fog.density = 0.45 / D;
      for (const v of trees.values()) { v.group.visible = false; v.twin.visible = false; }
      for (const d of s.items) {
        const v = trees.get(keyOf(d.it));
        if (!v || d.hidden) continue;
        const grow = Math.min(1, (now - v.born) / v.grow), g = v.group;
        g.visible = true;

        const q = depthOf(keyOf(d.it)), m = 1 + q, ph = (hashId(keyOf(d.it)) % 628) / 100;
        g.position.set(cam.x + (d.it.x - cam.x) * m, -cam.y + (-d.it.y + cam.y) * m, -q * D);
        g.scale.set(d.scale * m, d.scale * m, d.scale * m * (0.2 + 0.8 * grow));
        g.rotation.set(0.05 * Math.sin(now / 5300 + ph), 0.04 * Math.sin(now / 6100 + ph * 1.3), 0.02 * Math.sin(now / 4200 + ph));
        g.traverse(o => {
          if (!o.material) return;
          if (o.isLineSegments && o.userData.count) o.geometry.setDrawRange(0, Math.ceil(o.userData.count * grow / 2) * 2);
          o.material.opacity = (o.userData.base ?? (o.isPoints ? 0.95 : o.isLineSegments && o.userData.count ? 0.85 : 0.55)) * d.alpha * (0.3 + 0.7 * grow);
        });
        if (d.twinAt !== undefined) {
          const t = v.twin; t.visible = true;
          const q = depthOf(keyOf(d.it)), m = 1 + q;
          t.position.set(cam.x + (d.twinAt - cam.x) * m, -cam.y + (-d.it.y + cam.y) * m, -q * D); t.scale.set(-d.scale * m, d.scale * m, d.scale * m);
          t.traverse(o => { if (o.material && o !== t) o.material.opacity = Math.min(1, d.alpha * 0.5); });
        }
      }

      drift.tx += (Math.random() - 0.5) * 0.002; drift.ty += (Math.random() - 0.5) * 0.002;
      drift.tx *= 0.995; drift.ty *= 0.995;
      const px = s.pointer?.here ? (s.pointer.x / W - 0.5) : 0, py = s.pointer?.here ? (s.pointer.y / H - 0.5) : 0;
      const sway = { x: 0.06 * Math.sin(now / 9000), y: 0.045 * Math.sin(now / 11500 + 1) };
      drift.x += (drift.tx + sway.x + px * 0.2 - drift.x) * 0.03; drift.y += (drift.ty + sway.y + py * 0.15 - drift.y) * 0.03;
      camera.position.set(cam.x + drift.x * D, -cam.y - drift.y * D, D);
      camera.up.set(0, 1, 0);
      camera.lookAt(cam.x, -cam.y, 0);
      camera.setViewOffset(W, H, W / 2 - cam.ax, H / 2 - cam.ay, W, H);
      space.rotation.z = now * 0.0000045;

      dust.position.set(cam.x, -cam.y, 0); dust.scale.setScalar(D); dust.material.size = 0.0045 * D;
      const dpos = dustGeo.attributes.position;
      for (let i = 0; i < dpos.count; i++) { let y = dpos.getY(i) + 0.00006 * (1 + (i % 5)); if (y > 0.8) y -= 1.6; dpos.setY(i, y); }
      dpos.needsUpdate = true;
      for (const gl of glows) {
        const u = gl.userData, a = u.a + now / 40000;
        gl.position.set(cam.x + Math.cos(a) * u.r * D, -cam.y + Math.sin(a * 0.8) * u.r * 0.6 * D, -2.2 * D);
        gl.scale.setScalar(D * (2.6 + 0.4 * Math.sin(now / 7000 + u.a)));
        gl.material.opacity = u.k * (0.8 + 0.2 * Math.sin(now / 5000 + u.a));
      }
      renderer.render(scene, camera);
    },
  };
}
