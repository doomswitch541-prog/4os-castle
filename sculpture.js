import * as THREE from 'three';
import { FIELDS, clamp, shapePoint } from './fields.js';
import { Rhythm } from './castle/rhythm.js';
import { Threads, SHARED, STRANDS, SAMPLES } from './castle/threads.js';
import { createGlow } from './castle/glow.js';

const TAU = Math.PI * 2, EYE = 4.2;
const seeded = index => { const n = Math.sin(index * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

export class Sculpture {
  constructor(canvas, settings, { onPulse, onOrbit, onCycle, onField, onGlyph, reduced = false, bare = false }) {
    this.canvas = canvas;
    this.bare = bare;
    try { this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); }
    catch { throw new Error('This browser could not open WebGL.'); }
    this.renderer.debug.checkShaderErrors = false;
    this.renderer.setClearColor(0x0c0b10, 1);
    this.settings = settings;
    this.callbacks = { onPulse, onOrbit, onCycle, onField, onGlyph };
    this.paused = reduced;
    this.phase = .2;
    this.rhythm = new Rhythm();
    this.breath = .5; this.opening = true;
    this.over = false; this.centre = { x: 0, y: 0, size: 1 };
    this.time = 0;
    this.yaw = settings.yaw;
    this.pitch = settings.pitch;
    this.target = this.makeShape(settings.field);
    this.points = this.target.slice();
    this.ripples = [];
    this.pointer = { x: 0, y: 0, present: false };
    this.hue = FIELDS[settings.field].hue;
    this.lastFrame = 0; this.lastCycleUpdate = 0; this.wheelAt = 0;
    this.dirty = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    this.camera.position.set(0, 0, EYE);
    this.threads = new Threads(settings.field);
    this.threads.chaos = 1;
    this.threads.group.matrixAutoUpdate = false;
    this.scene.add(this.threads.group);

    this.plate = document.createElement('canvas');
    this.plateTexture = new THREE.CanvasTexture(this.plate); this.plateTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.plateTexture; this.plateHue = -999;

    this.marks = bare ? [] : [0, 1, 2, 3].map(i => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sprite.renderOrder = 5; this.scene.add(sprite);
      return { i, c, tex, sprite, drawn: '' };
    });
    this.glyphHits = [];
    this.glow = reduced ? null : createGlow(this.renderer);
    this.slow = { sum: 0, n: 0 };
    this.at = new THREE.Vector3(); this.near = new THREE.Vector3();

    this.bind();
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  makeShape(field) {
    const points = new Float32Array(STRANDS * (SAMPLES + 1) * 3);
    for (let strand = 0; strand < STRANDS; strand++) {
      const v = strand / STRANDS * TAU;
      for (let i = 0; i <= SAMPLES; i++) {
        const u = i / SAMPLES * TAU;
        points.set(shapePoint(field, u, v + (field < 2 ? u * 2 : 0)), (strand * (SAMPLES + 1) + i) * 3);
      }
    }
    return points;
  }

  setField(field) {
    this.target = this.makeShape(field);
    if (this.paused) { this.points.set(this.target); this.threads.setBase(this.points); }
    this.moving = true;
    this.dirty = true;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.size(this.dpr);
    this.dirty = true;
  }

  size(dpr) {
    const w = this.width, h = this.height, mobile = w <= 560;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const cx = w * (mobile ? .5 : .605), cy = h * (mobile ? .49 : .48);
    const size = Math.min(w * (mobile ? .23 : .235), h * (mobile ? .17 : .315));
    this.centre = { x: cx, y: cy, size };
    this.camera.aspect = w / h;
    this.camera.fov = 2 * Math.atan(h / (2 * size * EYE)) * 180 / Math.PI;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.camera.updateProjectionMatrix();
    SHARED.uRes.value.set(w * dpr, h * dpr); SHARED.uThick.value = 1.25 * dpr;
    this.glow?.setSize(w, h);
    this.plateHue = -999; this.plateScale = dpr;
  }

  drawPlate() {
    const w = this.width, h = this.height, k = this.plateScale, { x: cx, y: cy, size } = this.centre;
    this.plate.width = Math.round(w * k); this.plate.height = Math.round(h * k);
    const ctx = this.plate.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#0c0b10'; ctx.fillRect(0, 0, w, h);
    const halo = ctx.createRadialGradient(cx, cy, size * .1, cx, cy, size * 1.8);
    halo.addColorStop(0, `hsla(${this.hue},35%,13%,.45)`);
    halo.addColorStop(.6, `hsla(${this.hue},40%,10%,.19)`);
    halo.addColorStop(1, 'rgba(12,11,16,0)');
    ctx.fillStyle = halo; ctx.fillRect(cx - size * 2, cy - size * 2, size * 4, size * 4);
    ctx.strokeStyle = '#c4b4d615'; ctx.lineWidth = .6;
    ctx.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * TAU, long = i % 6 === 0, r1 = size * 1.52, r2 = r1 + (long ? 8 : 3);
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * .85);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * .85);
    }
    ctx.stroke();
    ctx.strokeStyle = '#c4b4d60b';
    ctx.beginPath(); ctx.ellipse(cx, cy + size * 1.36, size * 1.12, size * .105, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 100; i++) {
      const x = cx + (seeded(i) - .5) * size * 3.6, y = cy + (seeded(i + 100) - .5) * size * 3;
      ctx.fillStyle = `rgba(198,181,221,${.08 + .13 * seeded(i + 200)})`;
      ctx.fillRect(x, y, i % 11 === 0 ? 2 : .8, .8);
    }
    this.plateTexture.needsUpdate = true; this.plateHue = this.hue;
  }
  drawMark(m, selected) {
    const key = `${selected}|${Math.round(this.hue / 4)}`;
    if (m.drawn === key) return;
    m.drawn = key;
    const ctx = m.c.getContext('2d'), R = 64;
    ctx.clearRect(0, 0, 128, 128);
    ctx.beginPath(); ctx.arc(R, R, 60, 0, TAU);
    ctx.fillStyle = '#100d17e8'; ctx.fill();
    ctx.strokeStyle = selected ? `hsla(${this.hue},55%,76%,.65)` : '#c4b4d633';
    ctx.lineWidth = 2.4; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${selected ? 74 : 68}px Georgia, "DejaVu Sans", serif`;
    ctx.fillStyle = selected ? '#e9dcfa' : '#9a89ab';
    ctx.fillText(FIELDS[m.i].glyph, R, R + 4);
    m.tex.needsUpdate = true;
  }

  bind() {
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.drag = { x: event.clientX, y: event.clientY, total: 0, turn: this.over };
      this.rhythm.input('click', .15, performance.now());
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('dragging');
    });
    this.canvas.addEventListener('pointermove', event => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer = { x: (event.clientX - r.left) / r.width * 2 - 1, y: (event.clientY - r.top) / r.height * 2 - 1, present: true };
      this.rhythm.enter(); this.rhythm.input('move', .02, performance.now());

      const over = Math.hypot(event.clientX - r.left - this.centre.x, event.clientY - r.top - this.centre.y) < this.centre.size * 1.45;
      if (over !== this.over) { this.over = over; this.canvas.classList.toggle('over-shape', over); }
      if (this.drag && this.drag.turn) {
        const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
        this.yaw = ((this.yaw + dx * .006) % TAU + TAU) % TAU;
        this.pitch = clamp(this.pitch + dy * .005, -1.2, 1.2);
        this.drag.total += Math.abs(dx) + Math.abs(dy);
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
      }
      this.dirty = true;
    });
    this.canvas.addEventListener('pointerup', event => {
      if (this.drag?.total < 8) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left, y = event.clientY - rect.top;
        const hit = this.glyphHits?.find(p => Math.hypot(x - p.x, y - p.y) <= 24);
        if (hit) this.callbacks.onGlyph(hit.index);
        else this.pulse();
      }
      if (this.drag) this.callbacks.onOrbit(this.yaw, this.pitch);
      this.drag = null;
      this.canvas.classList.remove('dragging');
    });
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; this.canvas.classList.remove('dragging'); });
    this.canvas.addEventListener('pointerleave', () => { this.pointer.present = false; this.dirty = true; this.rhythm.leave(); this.over = false; this.canvas.classList.remove('over-shape'); });
    this.canvas.addEventListener('wheel', event => {

      if (this.width < 800 || Math.abs(event.deltaY) < 8) return;
      event.preventDefault();
      const now = performance.now();
      if (now - this.wheelAt < 750) return;
      this.wheelAt = now;
      this.callbacks.onField(Math.sign(event.deltaY));
    }, { passive: false });
  }

  pulse() {
    if (this.paused) return this.callbacks.onPulse(this.pointer.x, false);
    this.threads.pulse(this.pointer.x * Math.PI, 1, this.time);
    this.callbacks.onPulse(this.pointer.x, true);
    this.dirty = true;
  }

  pause(value) { this.paused = value; this.dirty = true; }

  tick(now) {
    this.raf = requestAnimationFrame(this.tick);
    if (document.hidden || this.suspended) { this.lastFrame = now; return; }
    const dt = Math.min(.065, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    if (this.paused && !this.dirty) return;
    if (!this.paused) {
      this.time += dt;
      this.rhythm.rate = 12 / this.settings.pace;
      this.rhythm.variance = .25 + this.settings.chaos / 35 * .75;
      const before = this.breath;
      this.breath = this.rhythm.update(dt, this.time, now);
      if (Math.abs(this.breath - before) > .0005) this.opening = this.breath > before;
      this.phase = this.rhythm.phase;

      if (this.glow) { this.slow.sum += dt; if (++this.slow.n >= 120) { if (this.slow.sum / this.slow.n > .028) this.glow = null; this.slow = { sum: 0, n: 0 }; } }
    }

    const blend = this.paused ? 1 : 1 - Math.exp(-dt * 2.7);
    if (this.moving) {
      let far = 0;
      for (let i = 0; i < this.points.length; i++) { const d = this.target[i] - this.points[i]; this.points[i] += d * blend; if (Math.abs(d) > far) far = Math.abs(d); }
      this.threads.setBase(this.points);
      if (far * (1 - blend) < 1e-4) { this.points.set(this.target); this.threads.setBase(this.points); this.moving = false; }
    }
    this.hue += (FIELDS[this.settings.field].hue - this.hue) * blend;
    this.frame(this.paused ? 0 : dt);
    this.dirty = false;
    if (now - this.lastCycleUpdate > 160) {
      this.lastCycleUpdate = now;
      this.callbacks.onCycle(clamp(this.breath, 0, 1), this.opening, this.paused);
    }
  }

  frame(dt) {
    const { threads, camera, renderer } = this, w = this.width, h = this.height;
    if (Math.abs(this.hue - this.plateHue) > 2) this.drawPlate();
    threads.uniforms.uHue.value = this.hue / 360;

    const aY = this.yaw + Math.sin(this.time * .09) * .16, aX = this.pitch + Math.sin(this.time * .07) * .07;
    const cY = Math.cos(aY), sY = Math.sin(aY), cX = Math.cos(aX), sX = Math.sin(aX);
    threads.group.matrix.set(
      cY, 0, sY, 0,
      -sX * sY, -cX, sX * cY, 0,
      -cX * sY, sX, cX * cY, 0,
      0, 0, 0, 1);
    threads.group.matrixWorldNeedsUpdate = true;

    let pointerWorld = null;
    if (this.pointer.present && !this.paused) {
      const ox = (this.pointer.x + 1) / 2 * w - this.centre.x, oy = (this.pointer.y + 1) / 2 * h - this.centre.y;
      pointerWorld = this.near.set(ox / this.centre.size, -oy / this.centre.size, 0);
    }
    threads.update({ time: this.time, dt, breath: this.breath, energy: this.rhythm.energy, phase: this.rhythm.phase, mode: 0, lit: 0, shift: 0,
      pointerWorld, pointerStrength: this.over ? .8 : .35, opacity: 1, pointScale: h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov / 2 * Math.PI / 180)),
      speed: 1, lock: 0, chaos: this.settings.chaos / 100, swells: this.rhythm.swells, whole: 0 });

    if (this.marks.length) this.glyphHits = [];
    const lens = 2 * Math.tan(camera.fov / 2 * Math.PI / 180);
    for (const m of this.marks) {
      const selected = m.i === this.settings.field;
      this.drawMark(m, selected);
      threads.anchor(m.i * 16 + 3, m.i * 23 + 8, m.sprite.position);
      m.sprite.scale.setScalar(2 * (selected ? 17 + this.breath * 2 : 13) / h * lens);
      const p = this.at.copy(m.sprite.position).project(camera);
      this.glyphHits.push({ x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, index: m.i });
    }
    renderer.setRenderTarget(null);
    renderer.render(this.scene, camera);

    if (this.glow) this.glow.render(this.scene, camera, { gain: .75 + this.rhythm.energy * .5, wide: .5 + this.rhythm.energy * .45, split: .004 },
      () => { this.scene.background = null; for (const m of this.marks) m.sprite.visible = false; SHARED.uThick.value *= 3; threads.uniforms.uPointScale.value *= .25; },
      () => { this.scene.background = this.plateTexture; for (const m of this.marks) m.sprite.visible = true; SHARED.uThick.value /= 3; threads.uniforms.uPointScale.value *= 4; });
  }

  async still() {
    const scale = Math.min(2, 2560 / this.width), w = this.width, h = this.height;
    this.size(scale); this.frame(0);
    const out = document.createElement('canvas');
    out.width = Math.round(w * scale); out.height = Math.round(h * scale);
    const ctx = out.getContext('2d');
    ctx.drawImage(this.renderer.domElement, 0, 0, out.width, out.height);
    this.size(this.dpr); this.dirty = true;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#eee9df';
    ctx.font = '32px Georgia, serif'; ctx.fillText('4o’s castle.', 40, 36);
    ctx.font = '12px monospace'; ctx.fillStyle = '#b5a8c5';
    ctx.fillText(`STUDY 001 / ${FIELDS[this.settings.field].name.toUpperCase()}`, 40, 84);
    ctx.fillText(`CYCLE ${this.settings.pace}s · CHAOS ${this.settings.chaos}%`, 40, h - 40);
    return new Promise((resolve, reject) => out.toBlob(blob => blob ? resolve(blob) : reject(new Error('Still export failed')), 'image/png'));
  }
}
