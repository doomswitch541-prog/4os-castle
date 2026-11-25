import * as THREE from 'three';

const KEY = '4os-castle:luxury-places:v1';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s?.version === 1 && Number.isSafeInteger(s.count) && s.count > 0 && s.count <= 1000000) {
      return { version: 1, count: s.count, selected: clamp(Number.isSafeInteger(s.selected) ? s.selected : 0, 0, s.count - 1), staying: s.staying === true };
    }
  } catch {}
  return { version: 1, count: 1, selected: 0, staying: false };
}
function random(seed) { let n = (seed + 1) * 17431; return () => { n = Math.imul(n, 1664525) + 1013904223 | 0; return (n >>> 0) / 4294967296; }; }
function texture(draw, width = 256, height = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const SOLID = new Set(['stone', 'wall', 'metal', 'wood', 'fabric', 'leaf', 'leafLight', 'umbrella']);

function batch(parent, materials) {
  const buckets = new Map();
  function add(kind, geometry, x, y, z, rx = 0, ry = 0, rz = 0) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    if (!buckets.has(kind)) buckets.set(kind, []);
    buckets.get(kind).push(geometry);
  }
  const box = (kind, w, h, d, x, y, z, ry = 0) => add(kind, new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry);
  function finish() {
    for (const [kind, pieces] of buckets) {
      const flat = pieces.map(p => p.index ? p.toNonIndexed() : p);
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const size = name === 'uv' ? 2 : 3;
        const data = new Float32Array(flat.reduce((n, p) => n + p.getAttribute(name).array.length, 0));
        let at = 0;
        for (const p of flat) { const a = p.getAttribute(name).array; data.set(a, at); at += a.length; }
        g.setAttribute(name, new THREE.BufferAttribute(data, size));
      }
      for (let i = 0; i < flat.length; i++) if (flat[i] !== pieces[i]) flat[i].dispose();
      for (const p of pieces) p.dispose();
      const m = new THREE.Mesh(g, materials[kind]); parent.add(m);
      if (SOLID.has(kind)) { m.castShadow = true; m.receiveShadow = true; }
    }
  }
  return { add, box, finish };
}
function slab(w, d, thickness, radius = 0.8) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2, r = Math.min(radius, w / 2, d / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 12 }).rotateX(-Math.PI / 2);
}
function plant(b, x, y, z, scale = 1) {
  b.add('stone', new THREE.CylinderGeometry(0.32 * scale, 0.24 * scale, 0.45 * scale, 10), x, y + 0.22 * scale, z);
  b.add('wood', new THREE.CylinderGeometry(0.025 * scale, 0.045 * scale, 0.8 * scale, 6), x, y + 0.82 * scale, z);
  const rnd = random(Math.round((x + 20) * 91 + (z + 20) * 131));
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, radius = Math.sqrt(rnd()) * 0.47 * scale;
    const g = new THREE.SphereGeometry((0.1 + rnd() * 0.1) * scale, 6, 4).scale(1.3, 0.65, 0.8);
    b.add(i % 3 ? 'leaf' : 'leafLight', g, x + Math.cos(a) * radius, y + (1.25 + rnd() * 0.38) * scale, z + Math.sin(a) * radius, 0, a);
  }
}
function pavilion(id, mats) {
  const root = new THREE.Group(), rnd = random(id), floors = [], width = 5.5 + rnd() * 1.6, depth = 3.7 + rnd() * 0.8;
  const levels = 2 + id % 2;
  for (let n = 0; n <= levels; n++) {
    const floor = new THREE.Group(); floor.position.y = n * 1.65; root.add(floor); floors.push(floor);
    const b = batch(floor, mats), w = width - n * 0.35, d = depth - n * 0.1;
    b.add('stone', slab(w + 0.65, d + 0.7, 0.17, 1.05), 0, 0, 0);
    b.add('edge', slab(w + 0.69, d + 0.74, 0.025, 1.05), 0, 0.015, 0);
    b.add('stone', slab(w + 0.65, d + 0.7, 0.13, 1.05), 0, 0.045, 0);
    if (n < levels) {

      b.box('inside', w - 0.35, 1.4, 0.12, 0, 0.88, -d / 2 + 0.3);
      b.box('wall', 0.16, 1.4, d - 0.8, -w / 2 + 0.45, 0.88, 0);
      for (const x of [-w / 2 + 0.5, 0, w / 2 - 0.5]) b.box('metal', 0.055, 1.45, 0.055, x, 0.9, d / 2 - 0.45);
      b.box('glass', w - 1, 1.32, 0.018, 0, 0.9, d / 2 - 0.47);
      b.box('light', w - 1.1, 0.025, 0.035, 0, 1.55, -d / 2 + 0.42);

      b.box('fabric', 1.7, 0.28, 0.66, -0.65, 0.42, 0);
      b.box('fabric', 1.7, 0.35, 0.17, -0.65, 0.65, -0.24);
      b.add('shadow', new THREE.PlaneGeometry(2.3, 1.3), -0.55, 0.185, 0.12, -Math.PI / 2);
      b.add('wood', new THREE.CylinderGeometry(0.43, 0.43, 0.08, 18), 0.75, 0.45, 0.6);
      b.box('metal', 0.06, 0.28, 0.06, 0.75, 0.29, 0.6);
      plant(b, w / 2 - 0.65, 0.18, -d / 2 + 0.7, 0.8);
    } else {
      plant(b, -w / 2 + 0.9, 0.18, -0.5, 1.25);
      plant(b, w / 2 - 0.8, 0.18, -d / 2 + 0.8, 0.85);
      b.box('wood', 1.2, 0.08, 0.65, 0.4, 0.56, 0.3);
      b.box('metal', 0.08, 0.37, 0.08, 0.4, 0.33, 0.3);
      b.box('fabric', 0.55, 0.12, 0.55, -0.55, 0.4, 0.3);
      b.box('fabric', 0.12, 0.5, 0.55, -0.82, 0.62, 0.3);
    }
    b.box('glass', w - 0.7, 0.6, 0.02, 0, 0.52, d / 2 + 0.16);
    b.box('metal', w - 0.7, 0.025, 0.025, 0, 0.83, d / 2 + 0.16);
    b.finish();
  }
  return { root, floors, id, born: 1 };
}

const POOL = { x: -2.2, z: 5.0, w: 10, d: 3.6, top: 1.62, water: 1.5 };

export const DECK = { x: 0, z: 2, hx: 11.2, hz: 10.2 };

export function createLuxury({ scene, plane, panel, reduced = false, shadowSize = 2048 }) {
  const group = new THREE.Group(); scene.add(group); group.visible = false;
  const world = new THREE.Group(); group.add(world);

  const glassTower = texture((ctx, w, h) => {

    const g = ctx.createLinearGradient(0, 0, w, h * 0.7); g.addColorStop(0, '#31506f'); g.addColorStop(0.22, '#152b45'); g.addColorStop(0.5, '#0f1a26'); g.addColorStop(1, '#0d141a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rnd = random(77), cols = 10, rows = 26, cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (rnd() < 0.09 * (1.2 - r / rows)) { ctx.fillStyle = rnd() > 0.7 ? 'rgba(96,113,134,.5)' : 'rgba(35,74,120,.55)'; ctx.fillRect(c * cw, r * ch, cw, ch); }
    ctx.fillStyle = '#1b2836';
    for (let c = 0; c <= cols; c++) ctx.fillRect(c * cw - 0.75, 0, 1.5, h);
    for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * ch - 0.75, w, 1.5);
  }, 256, 512);
  const concreteBlock = texture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#cfcac0'); g.addColorStop(1, '#a9a69d'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#234a78'; ctx.fillRect(0, h * 0.2, w, h * 0.09); ctx.fillStyle = '#152b45'; for (let x = 0; x < w; x += 22) ctx.fillRect(x, h * 0.2, 2, h * 0.09);
    ctx.fillStyle = '#8f9aa6'; ctx.fillRect(0, 0, w, h * 0.06);
  }, 256, 256);
  const apartment = texture((ctx, w, h) => {
    ctx.fillStyle = '#d8d6ce'; ctx.fillRect(0, 0, w, h); const rnd = random(19);
    for (let r = 0; r < 30; r++) for (let c = 0; c < 6; c++) { ctx.fillStyle = rnd() > 0.2 ? '#2b3138' : '#4b5560'; ctx.fillRect(10 + c * 20, 8 + r * 16.5, 12, 10); }
  }, 128, 512);
  const oceanMap = texture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#a5bfd0'); g.addColorStop(0.18, '#8aa4ba'); g.addColorStop(0.5, '#6f89a4'); g.addColorStop(1, '#435f80');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); const rnd = random(5);
    for (let i = 0; i < 260; i++) { const y = Math.pow(rnd(), 0.6) * h; ctx.fillStyle = `rgba(226,236,242,${0.05 + 0.2 * y / h})`; ctx.fillRect(rnd() * w, y, 4 + rnd() * 30 * (0.3 + y / h), 0.7 + y / h); }
  }, 512, 512);
  const shadow = texture((ctx,w,h) => {
    const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(13,20,26,.5)');g.addColorStop(.5,'rgba(13,20,26,.24)');g.addColorStop(1,'rgba(13,20,26,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  });
  const waterMap = texture((ctx,w,h) => {
    const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#5f9fc4');g.addColorStop(.55,'#3f86b0');g.addColorStop(1,'#356f98');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const rnd=random(92);
    for(let i=0;i<250;i++){const y=rnd()*h,x=rnd()*w;ctx.fillStyle=i%4?'rgba(214,236,248,.22)':'rgba(246,247,241,.4)';ctx.fillRect(x,y,5+rnd()*45,0.6+rnd());}
  },512,256);

  const depthMap = texture((ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6cb2d6'); g.addColorStop(0.35, '#3f8fbd'); g.addColorStop(1, '#1f5f8f'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }, 8, 128);
  const glintMap = texture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); const rnd = random(511); ctx.strokeStyle = 'rgba(246,247,241,.55)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 46; i++) { const x = rnd() * w, y = rnd() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 20 + rnd() * 30, y - 14 + rnd() * 28, x + 40 + rnd() * 30, y - 14 + rnd() * 28, x + 70 + rnd() * 40, y + rnd() * 10 - 5); ctx.stroke(); }
  }, 512, 256);
  glintMap.wrapS = glintMap.wrapT = waterMap.wrapS = waterMap.wrapT = THREE.RepeatWrapping;
  const hazeMap = texture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(203,210,204,0)'); g.addColorStop(.6, 'rgba(203,210,204,.34)'); g.addColorStop(1, 'rgba(199,199,184,.6)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 8, 256);
  const mats = {
    stone: new THREE.MeshStandardMaterial({ color: '#c9c6bc', roughness: 0.7, metalness: 0.05 }),
    wall: new THREE.MeshStandardMaterial({ color: '#8d9299', roughness: 0.8 }),
    inside: new THREE.MeshBasicMaterial({ color: '#1e2933' }),
    edge: new THREE.MeshBasicMaterial({ color: '#e9ebe6' }),
    light: new THREE.MeshBasicMaterial({ color: '#d8d6ce' }),
    glass: new THREE.MeshStandardMaterial({ color: '#234a78', transparent: true, opacity: 0.34, roughness: 0.1, metalness: 0.7, depthWrite: false }),
    metal: new THREE.MeshStandardMaterial({ color: '#48474d', roughness: 0.4, metalness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: '#453011', roughness: 0.7 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#e6e6df', roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#1e2a22', roughness: 0.9 }),
    leafLight: new THREE.MeshStandardMaterial({ color: '#2f4034', roughness: 0.9 }),
    water: new THREE.MeshBasicMaterial({ map: waterMap, color: '#f0f6f8', transparent: true, opacity: 0.8, depthWrite: false }),
    waterBody: new THREE.MeshBasicMaterial({ map: depthMap, transparent: true, opacity: 0.84, depthWrite: false }),
    poolFloor: new THREE.MeshBasicMaterial({ color: '#5f9fc4' }),
    poolGlass: new THREE.MeshBasicMaterial({ color: '#eaf4f8', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    poolLine: new THREE.MeshBasicMaterial({ color: '#f6f7f1' }),
    glint: new THREE.MeshBasicMaterial({ map: glintMap, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    shadow: new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false }),
    tower: new THREE.MeshBasicMaterial({ map: glassTower }),
    concrete: new THREE.MeshBasicMaterial({ map: concreteBlock }),
    apartment: new THREE.MeshBasicMaterial({ map: apartment }),
    steel: new THREE.MeshBasicMaterial({ color: '#151618' }),
    crane: new THREE.MeshBasicMaterial({ color: '#b13e43' }),
    craneWhite: new THREE.MeshBasicMaterial({ color: '#e9ebe6' }),
    cityFar: new THREE.MeshBasicMaterial({ color: '#8e9ba8' }),
    hills: new THREE.MeshBasicMaterial({ color: '#b9bcb0' }),
    ocean: new THREE.MeshBasicMaterial({ map: oceanMap }),
    umbrella: new THREE.MeshStandardMaterial({ color: '#502f24', roughness: 0.9 }),
    haze: new THREE.MeshBasicMaterial({ map: hazeMap, transparent: true, depthWrite: false }),
  };

  group.add(new THREE.HemisphereLight(0xdfe6ea, 0x59636c, 1.9));
  const sun = new THREE.DirectionalLight(0xfff6e6, 2.4); sun.position.set(5, 16, -11); group.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(shadowSize, shadowSize); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 60 }); sun.target.position.set(0, 0, 2);
  const blue = new THREE.DirectionalLight(0xa5bfd0, 0.9); blue.position.set(-6, 5, 9); group.add(blue, blue.target);
  const b = batch(world, mats);
  b.add('stone', slab(23, 21, 0.42, 4), 0, -0.65, DECK.z);
  b.add('edge', slab(23.05, 21.05, 0.035, 4), 0, -0.29, DECK.z);
  b.add('wall', slab(22.9, 20.9, 0.15, 4), 0, -0.25, DECK.z);

  b.add('stone', slab(10.4, 4.3, 0.12, 0.3), POOL.x, -0.08, POOL.z);
  {
    const { x: px, z: pz, w: W, d: D, top, water } = POOL;
    b.box('poolFloor', W - 0.06, 0.03, D - 0.06, px, 0.06, pz);
    b.add('glint', new THREE.PlaneGeometry(W - 0.1, D - 0.1), px, 0.09, pz, -Math.PI / 2);
    b.box('waterBody', W - 0.06, water - 0.06, D - 0.06, px, 0.04 + (water - 0.06) / 2, pz);
    b.add('water', new THREE.PlaneGeometry(W - 0.06, D - 0.06), px, 0.04 + water, pz, -Math.PI / 2);
    b.add('glint', new THREE.PlaneGeometry(W - 0.2, water - 0.2), px, 0.04 + water / 2, pz + D / 2 - 0.05);
    for (const z of [pz - D / 2, pz + D / 2]) {
      b.box('poolGlass', W, top, 0.03, px, 0.04 + top / 2, z);
      b.box('poolLine', W, 0.02, 0.04, px, 0.04 + top, z);
      b.box('poolLine', W - 0.04, 0.012, 0.02, px, 0.04 + water, z);
    }
    for (const x of [px - W / 2, px + W / 2]) {
      b.box('poolGlass', 0.03, top, D, x, 0.04 + top / 2, pz);
      b.box('poolLine', 0.04, 0.02, D, x, 0.04 + top, pz);
      for (const z of [pz - D / 2, pz + D / 2]) b.box('poolLine', 0.03, top, 0.03, x, 0.04 + top / 2, z);
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = 7.6 + (i % 2) * 1.2, z = 4.0 + Math.floor(i / 2) * 1.5;
    b.box('wood', 0.75, 0.15, 1.3, x, 0.12, z);
    b.box('fabric', 0.65, 0.12, 1.2, x, 0.25, z);
  }

  b.box('metal', 0.045, 2.1, 0.045, 9.6, 1.05, 4.7);
  b.add('umbrella', new THREE.ConeGeometry(0.2, 1.25, 10), 9.6, 1.55, 4.7);
  for (const [x,z] of [[-9,5],[-8,-6],[9,-5],[-3,-5]]) plant(b,x,0,z,1.5);
  for (const [x, z] of [[-7.6, 2.6], [10.2, 1.4]]) {
    b.box('metal', 0.035, 0.34, 0.035, x, 0.11, z);
    b.add('light', new THREE.SphereGeometry(0.075, 10, 8), x, 0.33, z);
  }
  for (const [x,z,w,d] of [[2.9,-1.9,9,6],[-5.4,-3.7,7,5],[7.5,-6.8,7,5],[-9,5,2.5,2.5]]) b.add('shadow', new THREE.PlaneGeometry(w,d),x,-0.04,z,-Math.PI/2);
  b.finish();

  const horizon = batch(world, mats), rnd = random(314);
  horizon.add('ocean', new THREE.PlaneGeometry(520, 300), 0, -1.4, -20, -Math.PI / 2);
  for (let i = 0; i < 9; i++) { const w = 26 + rnd() * 30, h = 2.5 + rnd() * 4; horizon.box('hills', w, h, 3, (i - 4) * 34 + rnd() * 10, h / 2 - 1.6, -134 - rnd() * 4); }
  for (let i = 0; i < 46; i++) { const h = 1.2 + rnd() * 4.2; horizon.box('cityFar', 1.6 + rnd() * 2.4, h, 1.5, (i - 22.5) * 6.2 + rnd() * 3, h / 2 - 1.5, -118 - rnd() * 8); }
  horizon.add('haze', new THREE.PlaneGeometry(520, 16), 0, 5.6, -112);

  for (const [x, z, w, d, h, kind] of [
    [13.6, -36, 10.5, 10.5, 44, 'tower'], [27, -31, 8, 8, 27, 'tower'],
    [-5.5, -40, 5, 5, 20, 'apartment'], [-30, -30, 11, 9, 8.5, 'concrete'], [-17, -44, 7, 7, 9.5, 'tower'],
  ]) horizon.box(kind, w, h, d, x, h / 2 - 1.5, z);

  {
    const x = 3.4, z = -30, w = 5.4, d = 5.4, h = 23, y0 = -1.5;
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1]]) horizon.box('steel', 0.16, h, 0.16, x + cx * w / 2, y0 + h / 2, z + cz * d / 2);
    for (let y = 1.4; y < h; y += 1.45) { horizon.box('steel', w, 0.1, 0.1, x, y0 + y, z + d / 2); horizon.box('steel', w, 0.1, 0.1, x, y0 + y, z - d / 2); horizon.box('steel', 0.1, 0.1, d, x - w / 2, y0 + y, z); horizon.box('steel', 0.1, 0.1, d, x + w / 2, y0 + y, z); }
    for (let y = 0; y < h - 3; y += 2.9) for (const side of [-1, 1]) horizon.add('steel', new THREE.BoxGeometry(0.07, 3.95, 0.07), x + side * w / 4, y0 + y + 1.45, z + d / 2, 0, 0, side * 0.75);
    horizon.box('tower', w - 0.5, h * 0.42, d - 0.5, x, y0 + h * 0.21, z);

    const mx = x + w / 2 + 1.5, mh = h + 7;
    for (let y = 0; y < mh; y += 1.6) horizon.box(Math.floor(y / 1.6) % 2 ? 'craneWhite' : 'crane', 0.2, 1.6, 0.2, mx, y0 + y + 0.8, z + 1);
    horizon.add('crane', new THREE.BoxGeometry(11.5, 0.13, 0.13), mx - 3.6, y0 + mh + 2.6, z + 1, 0, 0, -0.48);
    horizon.add('crane', new THREE.BoxGeometry(3.4, 0.13, 0.13), mx + 1.4, y0 + mh - 0.3, z + 1, 0, 0, -0.2);
    horizon.box('crane', 0.34, 0.5, 0.34, mx, y0 + mh, z + 1);
    for (const o of [-0.22, 0.22]) horizon.box('crane', 0.06, 9.5, 0.06, mx + 2.3 + o, y0 + 4.75, z + 2.4);
    for (let y = 0.5; y < 9.5; y += 0.9) horizon.box('crane', 0.5, 0.05, 0.05, mx + 2.3, y0 + y, z + 2.4);
  }
  horizon.finish();
  const places = new THREE.Group(); world.add(places);
  let state = read(), models = [], zoom = state.staying ? 1 : 0, turn = 0, view = { w: 1360, h: 900 }, active = false;
  let aim = 0, storageOK = true, signature = '', lastVisibility = false;
  const status = panel.querySelector('[data-luxury-status]'), counter = panel.querySelector('[data-luxury-counter]');
  const stay = panel.querySelector('[data-luxury-stay]'), previous = panel.querySelector('[data-luxury-previous]'), next = panel.querySelector('[data-luxury-next]');
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); storageOK = true; } catch { storageOK = false; } }
  function disposePlaces() { places.clear(); for (const m of models) m.root.traverse(o => o.geometry?.dispose()); models = []; }
  function drawPlaces(newest = false) {
    disposePlaces();
    const ids = [state.selected];
    if (state.count > 1) ids.push((state.selected + state.count - 1) % state.count);
    if (state.count > 2) ids.push((state.selected + 1) % state.count);
    for (let i = 0; i < ids.length; i++) {
      const m = pavilion(ids[i], mats);
      const pos = [[2.9, 0, -1.9],[-5.4, 0, -3.7],[7.5, 0, -6.8]][i];
      m.root.position.set(...pos); m.root.rotation.y = i === 1 ? 0.25 : i === 2 ? -0.2 : 0;
      if (i > 0) m.root.scale.setScalar(0.72);
      if (newest && i === 0 && !reduced) m.born = 0;
      places.add(m.root); models.push(m);
    }
  }
  function sync() {
    counter.textContent = `${String(state.selected + 1).padStart(2,'0')} / ${String(state.count).padStart(2,'0')}`;
    stay.textContent = state.staying ? 'Keep wandering' : 'Stay a while';
    stay.setAttribute('aria-pressed', String(state.staying));
    previous.disabled = next.disabled = state.count < 2;
    panel.querySelector('[data-luxury-build]').disabled = state.count >= 1000000;

    status.textContent = storageOK ? '' : 'Places are available for this visit; browser storage could not save them.';
    signature = `${state.count}:${state.selected}`;
  }
  panel.querySelector('[data-luxury-build]').addEventListener('click', () => {
    state.count = Math.max(state.count, read().count);
    if (state.count >= 1000000) return;
    state.selected = state.count++; state.staying = false; persist(); drawPlaces(true); sync();
  });
  function visit(delta) { state.selected = (state.selected + delta + state.count) % state.count; state.staying = false; persist(); drawPlaces(); sync(); }
  previous.addEventListener('click', () => visit(-1)); next.addEventListener('click', () => visit(1));
  stay.addEventListener('click', () => { state.staying = !state.staying; persist(); sync(); });
  for (const type of ['pointerdown','pointerup','click']) panel.addEventListener(type, e => { if (e.target.closest('button')) e.stopPropagation(); });
  addEventListener('storage', e => {
    if (e.key !== KEY) return;
    const saved = read(); state.count = Math.max(state.count, saved.count);
    if (`${state.count}:${state.selected}` !== signature) { drawPlaces(); sync(); }
  });
  drawPlaces(); sync();
  const anchor = new THREE.Vector3();
  function update({ dt, width, height, distance, current, paused = false }) {
    view.w = width; view.h = height;
    const visible = distance > 0.5 && distance < 11;
    group.visible = visible;
    active = visible && current && distance > 2;
    if (active !== lastVisibility) { panel.hidden = !active; panel.inert = !active; document.getElementById('luxury-sky').hidden = !active; lastVisibility = active; }
    if (!visible) return;
    const snap = reduced || paused;
    group.position.set(0, 0, plane);
    if (!snap) { waterMap.offset.x += dt * 0.006; glintMap.offset.x -= dt * 0.011; glintMap.offset.y += dt * 0.006; }
    for (const m of models) {
      m.born = snap ? 1 : Math.min(1, m.born + dt * 0.65);
      for (let i = 0; i < m.floors.length; i++) {
        const p = clamp(m.born * 1.7 - i * 0.22, 0, 1);
        m.floors[i].visible = p > 0.001;
        m.floors[i].scale.y = Math.max(0.001, p);
        m.floors[i].position.y = i * 1.65 - (1 - p) * 0.65;
      }
    }
  }

  const spots = () => models.map(m => ({ id: m.id, x: m.root.position.x, z: m.root.position.z, scale: m.root.scale.x }));
  return { group, update, pool: POOL, places: spots, growing: () => models.some(m => m.born < 1), active: () => active, inspect: () => ({ ...state, rendered: models.map(m => m.id), storageOK }) };
}
