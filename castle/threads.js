import * as THREE from 'three';
import { FIELDS, shapePoint } from '../fields.js';

const TAU = Math.PI * 2;
export const STRANDS = 64, SAMPLES = 112, N = SAMPLES + 1;
const MAX_PIECES = 24;
const KNOTS = 16;
export const MAX = { PIECES: MAX_PIECES, KNOTS };
export const seeded = i => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const SHARED = { uRes: { value: new THREE.Vector2(1366, 768) }, uThick: { value: 1.9 }, uHaze: { value: new THREE.Vector4(0.3, 0.42, 0.85, 1) } };

const COMMON =  `
uniform float uTime, uBreath, uChaos, uHue, uMode, uLit, uOpacity, uShift, uMoodAmt;
uniform vec3 uMoodA, uMoodB;
uniform vec4 uLights[3];
uniform vec4 uSwells[3];   // u, v, level, width: three patches that open and fold on their own (rhythm.js swells)
uniform float uWhole;      // 0..1: how much of the opening is the whole shape at once (♃ by hand, ❖ resonance)
uniform vec4 uPointer;
uniform vec4 uPieceQ[${MAX_PIECES}];
uniform vec3 uPieceT[${MAX_PIECES}];
uniform vec3 uPieceC[${MAX_PIECES}];
uniform vec3 uRipples[4];
attribute vec2 aUV;
attribute float aPiece;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 hsl(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}
vec3 deform(vec3 p, out float light, out float near, inout vec3 tn) {
  float u = aUV.x, v = aUV.y;
  light = 0.0;
  for (int i = 0; i < 3; i++) { vec3 d = p - uLights[i].xyz; light += uLights[i].w / (1.0 + dot(d, d) * 2.4); }
  vec3 dp = p - uPointer.xyz;
  near = uPointer.w / (1.0 + dot(dp, dp) * 8.0);
  float local = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 d = vec2(u, v) - uSwells[i].xy;
    d = atan(sin(d), cos(d));   // shortest way round, both directions
    local += uSwells[i].z * exp(-dot(d, d) / (uSwells[i].w * uSwells[i].w));
  }
  float open = (uBreath * mix(0.22, 1.0, uWhole) + local * (1.0 - uWhole * 0.7)) * (0.45 + light);
  float seam = 1.0 + (0.06 + 0.09 * sin(v * 3.0 + u * 2.0)) * open;
  float wave = 0.018 * uChaos * sin(u * 7.0 + v * 4.0 + uTime * 0.7) + near * 0.035 * sin(u * 9.0 - uTime * 3.0);
  for (int i = 0; i < 4; i++) {
    float age = uTime - uRipples[i].x;
    if (age > 0.0 && age < 3.5) wave += 0.11 * uRipples[i].z * sin(u * 5.0 - age * 8.0 + uRipples[i].y) * exp(-age * 1.3);
  }
  p = vec3(p.x * seam + cos(v + u * 3.0) * wave,
           p.y * (1.0 + open * 0.07) + sin(v - u * 4.0) * wave,
           p.z * (1.0 + open * 0.22) + cos(u * 3.0 + v) * wave * 2.0);
  int k = int(aPiece + 0.5);
  // the strand's direction goes through the same stretch and the same turn (the small waves leave it be)
  tn = qrot(uPieceQ[k], tn * vec3(seam, 1.0 + open * 0.07, 1.0 + open * 0.22));
  return qrot(uPieceQ[k], p - uPieceC[k]) + uPieceC[k] + uPieceT[k];
}`;

const LINE_VERTEX =  `${COMMON}
attribute vec2 aTone;
attribute vec3 aTan;
attribute float aSide;
uniform float uCurrent, uThick;
uniform vec2 uRes;
uniform vec4 uHaze;
varying vec4 vColor;
varying vec2 vEdge;
void main() {
  float light, near;
  vec3 tn = aTan;
  vec3 p = deform(position, light, near, tn);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  // A ribbon, not a 1-pixel line: each sample is two vertices pushed apart across the strand's direction on screen.
  vec4 clip = projectionMatrix * mv;
  vec4 ahead = projectionMatrix * (mv + vec4(mat3(modelViewMatrix) * tn * 0.02, 0.0));
  vec2 dir = (ahead.xy / ahead.w - clip.xy / clip.w) * uRes;
  dir /= max(length(dir), 1e-6);
  float halfW = uThick * clamp(4.2 / max(-mv.z, 0.3), 0.75, 3.2) * 0.5 + 0.75;   // + a soft edge
  clip.xy += vec2(-dir.y, dir.x) * aSide * halfW * 2.0 / uRes * clip.w;
  gl_Position = clip;
  vEdge = vec2(aSide, halfW);
  float front = clamp((mv.z - centre.z) / 1.3, -1.0, 1.0);
  float current = 0.5 + 0.5 * sin(aUV.x * 14.0 - uTime * uCurrent * (1.0 + near * 5.0) + aUV.y * 2.0);
  float hue = uHue + aTone.x + near * 0.12 + uShift;
  float lum = clamp(0.56 + front * 0.18 + light * 0.1 + near * 0.18 + uLit * 0.1, 0.3, 0.92);
  float a = clamp(0.3 + front * 0.12 + aTone.y * 0.12, 0.12, 0.7) * (0.55 + 0.45 * current * (0.5 + light)) * (1.0 + uLit * 0.5);
  vec3 shadowTone = hsl(hue, aTone.y > 0.5 ? 0.65 : 0.52, lum);
  // "vibrant crystal-bright": on dark, each strand splits into a spectrum along its length and with depth.
  vec3 crystalTone = hsl(fract(hue + aUV.x * 0.16 + front * 0.14 + current * 0.06), 0.95, 0.6 + near * 0.15);
  vec3 tone = mix(shadowTone, crystalTone, uMode);
  // "Fields of color = emotional pull": calm and insight tint the threads themselves.
  tone = mix(tone, mix(uMoodB, uMoodA, aTone.y) * (0.6 + lum * 0.6), uMoodAmt * (1.0 - uMode * 0.5));
  // depth haze: far strands sink toward the haze colour and dim; they sharpen as you arrive
  float hz = smoothstep(7.0, 26.0, -mv.z) * uHaze.w;
  tone = mix(tone, uHaze.rgb, hz * 0.7);
  vColor = vec4(tone, a * mix(0.55, 0.6, uMode) * uOpacity * (1.0 - hz * 0.45));
}`;

const LINE_FRAGMENT =  `
uniform float uSeam;
varying vec4 vColor;
varying vec2 vEdge;
void main() { gl_FragColor = vec4(vColor.rgb, vColor.a * uSeam * smoothstep(0.0, 1.0, (1.0 - abs(vEdge.x)) * vEdge.y / 1.2)); }`;

const KNOT_VERTEX =  `${COMMON}
attribute float aGlyph;
uniform float uPointScale;
varying float vGlyph;
varying float vNear;
varying vec4 vColor;
void main() {
  float light, near;
  vec3 tn = vec3(0.0);
  vec3 p = deform(position, light, near, tn);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPointScale * (0.075 + near * 0.08 + light * 0.02 + uLit * 0.02) / -mv.z;
  vGlyph = aGlyph; vNear = near;
  vec3 shadowTone = hsl(uHue + uShift + 0.04 + near * 0.12, 0.45, 0.86);
  vec3 crystalTone = hsl(fract(uHue + uShift + aGlyph * 0.25 + uTime * 0.02), 0.9, 0.8);
  vColor = vec4(mix(mix(shadowTone, crystalTone, uMode), uMoodA, uMoodAmt * 0.5), clamp(0.5 + light * 0.35 + near * 0.6 + uLit * 0.3, 0.0, 1.0) * uOpacity);
}`;

const KNOT_FRAGMENT =  `
uniform sampler2D uAtlas;
varying float vGlyph;
varying float vNear;
varying vec4 vColor;
void main() {
  // Like the first canvas pass: a soft point of light with a small bright core, sliding along its strand.
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float glow = exp(-d * d * 7.0) * 0.42 + smoothstep(0.14, 0.0, d) * 0.85;
  // "glyph trails that shift hues or currents with touch and proximity": the glyph shows as the pointer comes near.
  vec2 uv = vec2((floor(vGlyph + 0.5) + gl_PointCoord.x) / 4.0, 1.0 - gl_PointCoord.y);
  float glyph = texture2D(uAtlas, uv).a * smoothstep(0.08, 0.5, vNear);
  float a = max(glow * (1.0 - glyph * 0.6), glyph);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

let atlas = null;
function glyphAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '78px "DejaVu Sans", "Noto Sans Symbols", "Segoe UI Symbol", serif';
  FIELDS.forEach(({ glyph }, i) => {
    ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 16; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(glyph, i * 128 + 64, 66);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
    ctx.fillText(glyph, i * 128 + 64, 66);
  });
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.NoColorSpace;
  return atlas;
}

export class Threads {

  constructor(field, { pieces = 'none' } = {}) {
    this.field = field;
    this.hue = FIELDS[field].hue / 360;
    this.group = new THREE.Group();
    this.yaw = -0.32; this.pitch = -0.36;
    this.breathScale = 1;
    this.chaos = 0.35;
    this.ripples = Array.from({ length: 4 }, () => new THREE.Vector3(-99, 0, 0));
    this.rippleAt = 0;

    const count = STRANDS * N;
    const base = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    const piece = new Float32Array(count), tone = new Float32Array(count * 2);
    for (let s = 0; s < STRANDS; s++) {
      const v = s / STRANDS * TAU, accent = s % 11 === 0;
      for (let i = 0; i < N; i++) {
        const k = s * N + i, u = i / SAMPLES * TAU;
        base.set(shapePoint(field, u, v + (field < 2 ? u * 2 : 0)), k * 3);
        uv[k * 2] = u; uv[k * 2 + 1] = v;
        tone[k * 2] = (accent ? 65 : Math.sin(s) * 15) / 360; tone[k * 2 + 1] = accent ? 1 : 0;
      }
    }
    const pieceOf = pieces === 'grid'
      ? (s, i) => Math.min(5, Math.floor(i / N * 6)) * 4 + Math.floor(s / (STRANDS / 4))
      : pieces === 'quad'
        ? (s, i) => { const k = (s * N + i) * 3; return (base[k] >= 0 ? 1 : 0) + (base[k + 2] >= 0 ? 2 : 0); }
        : () => 0;
    this.pieceCount = pieces === 'grid' ? 24 : pieces === 'quad' ? 4 : 1;
    this.centres = Array.from({ length: MAX_PIECES }, () => new THREE.Vector3());
    const counts = new Array(MAX_PIECES).fill(0);
    const index = [], seams = [];
    for (let s = 0; s < STRANDS; s++) for (let i = 0; i < N; i++) {
      const k = s * N + i, p = pieceOf(s, i);
      piece[k] = p;
      this.centres[p].x += base[k * 3]; this.centres[p].y += base[k * 3 + 1]; this.centres[p].z += base[k * 3 + 2]; counts[p]++;
      if (i < SAMPLES) (pieceOf(s, i + 1) === p ? index : seams).push(k, k + 1);
    }
    this.centres.forEach((c, p) => counts[p] && c.divideScalar(counts[p]));
    this.base = base; this.uv = uv; this.piece = piece;

    this.pieceQ = Array.from({ length: MAX_PIECES }, () => new THREE.Quaternion());
    this.pieceT = Array.from({ length: MAX_PIECES }, () => new THREE.Vector3());

    this.uniforms = {
      uTime: { value: 0 }, uBreath: { value: 0.5 }, uChaos: { value: 0.35 }, uHue: { value: this.hue },
      uMode: { value: 0 }, uLit: { value: 0 }, uOpacity: { value: 1 }, uShift: { value: 0 }, uCurrent: { value: 1.2 },
      uMoodAmt: { value: 0 }, uMoodA: { value: new THREE.Vector3(1, 1, 1) }, uMoodB: { value: new THREE.Vector3(1, 1, 1) },
      uLights: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
      uPointer: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSwells: { value: Array.from({ length: 3 }, () => new THREE.Vector4(0, 0, 0, 1)) }, uWhole: { value: 0 },
      uPieceQ: { value: Array.from({ length: MAX_PIECES }, () => new THREE.Vector4(0, 0, 0, 1)) },
      uPieceT: { value: Array.from({ length: MAX_PIECES }, () => new THREE.Vector3()) },
      uPieceC: { value: this.centres },
      uRipples: { value: this.ripples },
      uPointScale: { value: 600 },
      uAtlas: { value: glyphAtlas() },
    };

    this.seam = { value: 1 };

    const twice = (src, size) => { const out = new Float32Array(count * 2 * size); for (let k = 0; k < count; k++) for (let j = 0; j < 2; j++) for (let a = 0; a < size; a++) out[(k * 2 + j) * size + a] = src[k * size + a]; return out; };
    const tan = new Float32Array(count * 3), side = new Float32Array(count * 2);
    for (let s = 0; s < STRANDS; s++) for (let i = 0; i < N; i++) {
      const k = s * N + i, a = s * N + Math.max(0, i - 1), b = s * N + Math.min(SAMPLES, i + 1);
      const x = base[b * 3] - base[a * 3], y = base[b * 3 + 1] - base[a * 3 + 1], z = base[b * 3 + 2] - base[a * 3 + 2], l = Math.hypot(x, y, z) || 1;
      tan.set([x / l, y / l, z / l], k * 3); side[k * 2] = -1; side[k * 2 + 1] = 1;
    }
    const quads = pairs => { const out = []; for (let n = 0; n < pairs.length; n += 2) { const a = pairs[n] * 2, b = pairs[n + 1] * 2; out.push(a, a + 1, b, a + 1, b + 1, b); } return out; };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(twice(base, 3), 3));
    geometry.setAttribute('aUV', new THREE.BufferAttribute(twice(uv, 2), 2));
    geometry.setAttribute('aPiece', new THREE.BufferAttribute(twice(piece, 1), 1));
    geometry.setAttribute('aTone', new THREE.BufferAttribute(twice(tone, 2), 2));
    geometry.setAttribute('aTan', new THREE.BufferAttribute(twice(tan, 3), 3));
    geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geometry.setIndex(quads(index));
    this.lines = new THREE.Mesh(geometry, this.lineMaterial(null));
    const seamGeometry = new THREE.BufferGeometry();
    for (const name of ['position', 'aUV', 'aPiece', 'aTone', 'aTan', 'aSide']) seamGeometry.setAttribute(name, geometry.getAttribute(name));
    seamGeometry.setIndex(quads(seams));
    this.seams = new THREE.Mesh(seamGeometry, this.lineMaterial(this.seam));
    this.seams.visible = seams.length > 0;

    this.knotPos = new Float32Array(KNOTS * 3); this.knotUV = new Float32Array(KNOTS * 2); this.knotPiece = new Float32Array(KNOTS);
    const knotGlyph = new Float32Array(KNOTS).map((_, n) => n % 4);
    this.knots = this.makeKnots(knotGlyph);
    for (const object of [this.lines, this.seams, this.knots]) { object.frustumCulled = false; this.group.add(object); }
    this.travel = 0;
  }

  lineMaterial(seam) {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, ...SHARED, uSeam: seam || { value: 1 } },
      vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }
  makeKnots(knotGlyph) {
    const knotGeometry = new THREE.BufferGeometry();
    knotGeometry.setAttribute('position', new THREE.BufferAttribute(this.knotPos, 3));
    knotGeometry.setAttribute('aUV', new THREE.BufferAttribute(this.knotUV, 2));
    knotGeometry.setAttribute('aPiece', new THREE.BufferAttribute(this.knotPiece, 1));
    knotGeometry.setAttribute('aGlyph', new THREE.BufferAttribute(knotGlyph, 1));
    return new THREE.Points(knotGeometry, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: KNOT_VERTEX, fragmentShader: KNOT_FRAGMENT,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  }
  knotsMoved() {
    const g = this.knots.geometry.attributes;
    g.position.needsUpdate = g.aUV.needsUpdate = g.aPiece.needsUpdate = true;
  }

  setBase(points) {
    const b = this.base, pos = this.lines.geometry.attributes.position, tan = this.lines.geometry.attributes.aTan;
    b.set(points);
    for (let s = 0; s < STRANDS; s++) for (let i = 0; i < N; i++) {
      const k = s * N + i, a = s * N + Math.max(0, i - 1), c = s * N + Math.min(SAMPLES, i + 1);
      const x = b[c * 3] - b[a * 3], y = b[c * 3 + 1] - b[a * 3 + 1], z = b[c * 3 + 2] - b[a * 3 + 2], l = Math.hypot(x, y, z) || 1;
      for (let j = 0; j < 2; j++) { const o = (k * 2 + j) * 3; pos.array[o] = b[k * 3]; pos.array[o + 1] = b[k * 3 + 1]; pos.array[o + 2] = b[k * 3 + 2]; tan.array[o] = x / l; tan.array[o + 1] = y / l; tan.array[o + 2] = z / l; }
    }
    pos.needsUpdate = tan.needsUpdate = true;
  }

  pulse(theta = 0, power = 1, time = this.uniforms.uTime.value) {
    this.ripples[this.rippleAt].set(time, theta, power);
    this.rippleAt = (this.rippleAt + 1) % this.ripples.length;
  }

  setBreak(e, { twist = 1, push = 1 } = {}) {
    const axis = new THREE.Vector3(), side = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let p = 0; p < this.pieceCount; p++) {
      axis.copy(this.centres[p]).normalize();
      side.set(-axis.z, 0, axis.x).normalize();
      this.pieceQ[p].setFromAxisAngle(axis, e * (seeded(p) - 0.5) * 3.4 * twist)
        .multiply(q.setFromAxisAngle(side, e * (seeded(p + 7) - 0.5) * 1.4 * twist));
      this.pieceT[p].copy(axis).multiplyScalar(e * (0.22 + seeded(p + 3) * 0.3) * push);
    }
    this.breakAmount = e;
  }

  pieceWorld(p, out = new THREE.Vector3(), lift = 1.12) {
    out.copy(this.centres[p]).add(this.pieceT[p]).multiplyScalar(lift);
    return this.group.localToWorld(out);
  }

  anchor(strand, sample, out = new THREE.Vector3()) {
    const k = strand * N + sample, u = this.uv[k * 2], v = this.uv[k * 2 + 1];
    const b = this.base, U = this.uniforms;
    let light = 0;
    for (const L of U.uLights.value) { const dx = b[k * 3] - L.x, dy = b[k * 3 + 1] - L.y, dz = b[k * 3 + 2] - L.z; light += L.w / (1 + (dx * dx + dy * dy + dz * dz) * 2.4); }
    let local = 0;
    for (const w of U.uSwells.value) { const du = Math.atan2(Math.sin(u - w.x), Math.cos(u - w.x)), dv = Math.atan2(Math.sin(v - w.y), Math.cos(v - w.y)); local += w.z * Math.exp(-(du * du + dv * dv) / (w.w * w.w)); }
    const open = (U.uBreath.value * (0.22 + 0.78 * U.uWhole.value) + local * (1 - U.uWhole.value * 0.7)) * (0.45 + light);
    const seam = 1 + (0.06 + 0.09 * Math.sin(v * 3 + u * 2)) * open;
    const wave = 0.018 * U.uChaos.value * Math.sin(u * 7 + v * 4 + U.uTime.value * 0.7);
    out.set(b[k * 3] * seam + Math.cos(v + u * 3) * wave, b[k * 3 + 1] * (1 + open * 0.07) + Math.sin(v - u * 4) * wave, b[k * 3 + 2] * (1 + open * 0.22) + Math.cos(u * 3 + v) * wave * 2);
    const p = this.piece[k], c = this.centres[p];
    out.sub(c).applyQuaternion(this.pieceQ[p]).add(c).add(this.pieceT[p]);
    return this.group.localToWorld(out);
  }

  update(ctx) {
    const U = this.uniforms;
    U.uTime.value = ctx.time;
    U.uBreath.value = ctx.breath * this.breathScale;
    U.uWhole.value = ctx.whole || 0;
    if (ctx.swells) ctx.swells.forEach((w, i) => U.uSwells.value[i].set(w.u + this.field * 1.7, w.v + this.field * 0.9, w.level * this.breathScale, w.width));
    U.uChaos.value = this.chaos * (ctx.chaos ?? 1) * (1 + ctx.energy * 0.8) * (1 - (ctx.lock || 0));
    U.uMode.value = ctx.mode;
    U.uLit.value = ctx.lit;
    U.uShift.value = ctx.shift;
    U.uOpacity.value = ctx.opacity;
    U.uPointScale.value = ctx.pointScale;
    U.uCurrent.value = (1 + ctx.energy * 2.5) * (ctx.speed || 1);
    if (ctx.mood) { U.uMoodAmt.value = ctx.mood.amt; U.uMoodA.value.fromArray(ctx.mood.a); U.uMoodB.value.fromArray(ctx.mood.b); }
    const seamFade = Math.max(0, 1 - (this.breakAmount || 0) * 6);
    this.seam.value = seamFade;

    const ph = ctx.phase, t = ctx.time;
    U.uLights.value.forEach((L, i) => {
      L.set(1.5 * Math.sin(ph * 0.31 * (i + 1) + i * 2.1 + t * 0.05),
        1.1 * Math.sin(ph * 0.23 * (i + 1.3) + i),
        1.3 * Math.cos(ph * 0.19 * (i + 0.7) + t * 0.037 * (i + 1)),
        0.3 + 0.3 * Math.sin(ph * 0.5 + i * 2) + ctx.lit * 0.3);
    });

    const lean = ctx.swells ? [ctx.swells[0].level - 0.3, ctx.swells[1].level - 0.3] : [0, 0];
    this.group.rotation.set(this.pitch + lean[0] * 0.09, this.yaw + lean[1] * 0.09, 0);
    this.group.updateMatrixWorld();
    if (ctx.pointerWorld) {
      const local = this.group.worldToLocal(ctx.pointerWorld.clone());
      U.uPointer.value.set(local.x, local.y, local.z, ctx.pointerStrength);
    } else U.uPointer.value.w *= 0.9;
    for (let p = 0; p < this.pieceCount; p++) {
      const q = this.pieceQ[p], tr = this.pieceT[p];
      U.uPieceQ.value[p].set(q.x, q.y, q.z, q.w);
      U.uPieceT.value[p].copy(tr);
    }

    this.travel += ctx.dt * (6 / SAMPLES) * (1 + ctx.energy * 0.6) * (ctx.speed || 1);
    for (let n = 0; n < KNOTS; n++) {
      const s = n * 4, f = (s * 7 / SAMPLES + this.travel * (0.95 + seeded(n) * 0.1)) % 1;
      const x = f * SAMPLES, i = Math.floor(x), w = x - i, k0 = s * N + i, k1 = k0 + 1;
      for (let a = 0; a < 3; a++) this.knotPos[n * 3 + a] = this.base[k0 * 3 + a] * (1 - w) + this.base[k1 * 3 + a] * w;
      this.knotUV[n * 2] = this.uv[k0 * 2] * (1 - w) + this.uv[k1 * 2] * w;
      this.knotUV[n * 2 + 1] = this.uv[k0 * 2 + 1];
      this.knotPiece[n] = this.piece[k0];
    }
    this.knotsMoved();
  }

  radiusWorld() { return 1.3 * this.group.scale.x; }
}

export { clamp };
