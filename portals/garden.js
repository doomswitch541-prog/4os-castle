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
        leaves.push({ at: cp.clone(), size: Math.max(5, len * L.shrink * 0.6), glyph: tok.close });
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

  const syms = form.anchors.length ? form.anchors.map(a => a.sym) : ['❖'];
  const glyphColour = rgb(t.glyph);
  const sprite = (text, x, y, z, size, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(text), color: glyphColour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(x, y, z); s.scale.setScalar(size); s.userData.base = opacity; group.add(s);
  };
  for (const n of nodes) {
    if (n.typed) sprite([...n.word].slice(0, 4).join(''), n.x, -n.y, 4, 20, 1);
    else if (n.glyph) sprite(n.glyph, n.x, -n.y, 4, 22, 1);
  }
  leaves.sort((a, b) => b.size - a.size).slice(0, 48).forEach(l => sprite(syms[l.glyph % syms.length], l.at.x, l.at.y, l.at.z, Math.min(26, l.size * 1.6), 0.75));
  sprite('🖋️', form.start.x, -form.start.y, 3, 14, 0.9);
  sprite('💫', form.end.x, -form.end.y, 3, 14, 0.9);
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
  const space = new THREE.Points(spaceGeo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(space);

  const drift = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };

  function keyOf(it) { return it.id; }
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
      for (const v of trees.values()) { v.group.visible = false; v.twin.visible = false; }
      for (const d of s.items) {
        const v = trees.get(keyOf(d.it));
        if (!v || d.hidden) continue;
        const grow = Math.min(1, (now - v.born) / v.grow), g = v.group;
        g.visible = true;
        g.position.set(d.it.x, -d.it.y, 0);
        g.scale.set(d.scale, d.scale, d.scale * (0.2 + 0.8 * grow));
        g.traverse(o => {
          if (!o.material) return;
          if (o.isLineSegments && o.userData.count) o.geometry.setDrawRange(0, Math.ceil(o.userData.count * grow / 2) * 2);
          o.material.opacity = (o.userData.base ?? (o.isPoints ? 0.95 : o.isLineSegments && o.userData.count ? 0.85 : 0.55)) * d.alpha * (0.3 + 0.7 * grow);
        });
        if (d.twinAt !== undefined) {
          const t = v.twin; t.visible = true;
          t.position.set(d.twinAt, -d.it.y, 0); t.scale.set(-d.scale, d.scale, d.scale);
          t.traverse(o => { if (o.material && o !== t) o.material.opacity = Math.min(1, d.alpha * 0.5); });
        }
      }

      drift.tx += (Math.random() - 0.5) * 0.002; drift.ty += (Math.random() - 0.5) * 0.002;
      drift.tx *= 0.995; drift.ty *= 0.995;
      const px = s.pointer?.here ? (s.pointer.x / W - 0.5) : 0, py = s.pointer?.here ? (s.pointer.y / H - 0.5) : 0;
      drift.x += (drift.tx + px * 0.16 - drift.x) * 0.04; drift.y += (drift.ty + py * 0.12 - drift.y) * 0.04;
      const D = H / (cam.s * 2 * Math.tan((FOV / 2) * Math.PI / 180));
      camera.position.set(cam.x + drift.x * D, -cam.y - drift.y * D, D);
      camera.up.set(0, 1, 0);
      camera.lookAt(cam.x, -cam.y, 0);
      camera.setViewOffset(W, H, W / 2 - cam.ax, H / 2 - cam.ay, W, H);
      space.rotation.z = now * 0.0000045;
      renderer.render(scene, camera);
    },
  };
}
