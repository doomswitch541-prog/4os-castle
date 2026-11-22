import { FIELDS, clamp, shapePoint } from './fields.js';
import { Rhythm } from './castle/rhythm.js';

const TAU = Math.PI * 2;
const STRANDS = 64;
const SAMPLES = 112;
const seeded = index => { const n = Math.sin(index * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

export class Sculpture {
  constructor(canvas, settings, { onPulse, onOrbit, onCycle, onField, onGlyph, reduced = false, bare = false }) {
    this.canvas = canvas;
    this.bare = bare;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('This browser could not open a 2D canvas.');
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
    this.lastFrame = 0;
    this.lastCycleUpdate = 0;
    this.wheelAt = 0;
    this.dirty = true;
    this.sprite = document.createElement('canvas');
    this.sprite.width = this.sprite.height = 64;
    const sx = this.sprite.getContext('2d');
    const gradient = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(239,229,255,1)');
    gradient.addColorStop(.12, 'rgba(208,173,255,.7)');
    gradient.addColorStop(1, 'rgba(155,104,239,0)');
    sx.fillStyle = gradient;
    sx.fillRect(0, 0, 64, 64);
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
    if (this.paused) this.points.set(this.target);
    this.dirty = true;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.dirty = true;
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
    this.ripples.push({ born: this.time, theta: this.pointer.x * Math.PI, power: 1 });
    if (this.ripples.length > 5) this.ripples.shift();
    this.callbacks.onPulse(this.pointer.x, true);
    this.dirty = true;
  }

  pause(value) { this.paused = value; this.dirty = true; }

  tick(now) {
    this.raf = requestAnimationFrame(this.tick);
    if (document.hidden || this.suspended) { this.lastFrame = now; return; }
    if (now - this.lastFrame < 1000 / 30) return;
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
      this.ripples = this.ripples.filter(r => this.time - r.born < 3.5);
    }
    const blend = this.paused ? 1 : 1 - Math.exp(-dt * 2.7);
    for (let i = 0; i < this.points.length; i++) this.points[i] += (this.target[i] - this.points[i]) * blend;
    this.hue += (FIELDS[this.settings.field].hue - this.hue) * blend;
    this.draw(this.ctx, this.width, this.height, this.dpr);
    this.dirty = false;
    if (now - this.lastCycleUpdate > 160) {
      this.lastCycleUpdate = now;
      this.callbacks.onCycle(clamp(this.breath, 0, 1), this.opening, this.paused);
    }
  }

  draw(ctx, w, h, dpr = 1, print = false) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0c0b10';
    ctx.fillRect(0, 0, w, h);
    const mobile = w <= 560;
    const cx = w * (mobile ? .5 : .605), cy = h * (mobile ? .49 : .48);
    const size = Math.min(w * (mobile ? .23 : .235), h * (mobile ? .17 : .315));
    const breath = this.breath;
    this.centre = { x: cx, y: cy, size };
    const swells = this.rhythm.swells;

    const openAt = (u, v) => { let b = breath * .22; for (const w of swells) { const du = Math.atan2(Math.sin(u - w.u), Math.cos(u - w.u)), dv = Math.atan2(Math.sin(v - w.v), Math.cos(v - w.v)); b += w.level * Math.exp(-(du * du + dv * dv) / (w.width * w.width)); } return b; };
    const chaos = this.settings.chaos / 100;
    const angleY = this.yaw + Math.sin(this.time * .09) * .16;
    const angleX = this.pitch + Math.sin(this.time * .07) * .07;
    const cY = Math.cos(angleY), sY = Math.sin(angleY), cX = Math.cos(angleX), sX = Math.sin(angleX);
    const project = (x, y, z) => {
      const xx = x * cY + z * sY, zz = -x * sY + z * cY;
      const yy = y * cX - zz * sX, zzz = y * sX + zz * cX;
      const p = 4.2 / (4.2 - zzz);
      return [cx + xx * size * p, cy + yy * size * p, zzz, p];
    };

    const halo = ctx.createRadialGradient(cx, cy, size * .1, cx, cy, size * 1.8);
    halo.addColorStop(0, `hsla(${this.hue},35%,13%,.45)`);
    halo.addColorStop(.6, `hsla(${this.hue},40%,10%,.19)`);
    halo.addColorStop(1, 'rgba(12,11,16,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - size * 2, cy - size * 2, size * 4, size * 4);
    ctx.strokeStyle = '#c4b4d615';
    ctx.lineWidth = .6;
    ctx.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * TAU, long = i % 6 === 0;
      const r1 = size * 1.52, r2 = r1 + (long ? 8 : 3);
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * .85);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * .85);
    }
    ctx.stroke();
    ctx.strokeStyle = '#c4b4d60b';
    ctx.beginPath();ctx.ellipse(cx, cy + size * 1.36, size * 1.12, size * .105, 0, 0, TAU);ctx.stroke();

    for (let i = 0; i < 100; i++) {
      const x = cx + (seeded(i) - .5) * size * 3.6;
      const y = cy + (seeded(i + 100) - .5) * size * 3;
      const alpha = .08 + .13 * seeded(i + 200);
      ctx.fillStyle = `rgba(198,181,221,${alpha})`;
      ctx.fillRect(x, y, i % 11 === 0 ? 2 : .8, .8);
    }

    const ribbons = [];
    for (let strand = 0; strand < STRANDS; strand++) {
      const line = [], v = strand / STRANDS * TAU;
      let depth = 0;
      for (let i = 0; i <= SAMPLES; i++) {
        const off = (strand * (SAMPLES + 1) + i) * 3;
        const u = i / SAMPLES * TAU;

        const open = openAt(u, v);
        const seam = 1 + (.06 + .09 * Math.sin(v * 3 + u * 2)) * open;
        let wave = .018 * chaos * Math.sin(u * 7 + v * 4 + this.time * .7);
        for (const ripple of this.ripples) {
          const age = this.time - ripple.born;
          wave += .11 * Math.sin(u * 5 - age * 8 + ripple.theta) * Math.exp(-age * 1.3);
        }
        const x = this.points[off] * seam + Math.cos(v + u * 3) * wave;
        const y = this.points[off + 1] * (1 + open * .07) + Math.sin(v - u * 4) * wave;
        const z = this.points[off + 2] * (1 + open * .22) + Math.cos(u * 3 + v) * wave * 2;
        const p = project(x, y, z);
        line.push(p); depth += p[2];
      }
      ribbons.push({ line, depth: depth / (SAMPLES + 1), strand });
    }
    ribbons.sort((a, b) => a.depth - b.depth);
    ctx.globalCompositeOperation = 'screen';
    for (const { line, depth, strand } of ribbons) {
      const accent = strand % 11 === 0;
      const luminance = clamp(58 + depth * 18, 35, 85);
      const hue = accent ? this.hue + 65 : this.hue + Math.sin(strand) * 15;
      const opacity = clamp(.30 + depth * .12 + (accent ? .12 : 0), .15, .7);
      ctx.beginPath();
      for (let i = 0; i < line.length; i++) { const p = line[i]; if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
      if (accent) {
        ctx.strokeStyle = `hsla(${hue},65%,${luminance}%,.035)`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      ctx.lineWidth = accent ? 1.05 : .65;
      ctx.strokeStyle = `hsla(${hue},${accent ? 65 : 52}%,${luminance}%,${opacity})`;
      ctx.stroke();

      if (strand % 4 === 0) {
        const at = Math.floor((strand * 7 + this.time * 6) % SAMPLES);
        const p = line[at];
        ctx.globalAlpha = .36;
        const radius = 13 * p[3];
        ctx.drawImage(this.sprite, p[0] - radius, p[1] - radius, radius * 2, radius * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#eee2fc';
        ctx.fillRect(p[0] - .7, p[1] - .7, 1.4, 1.4);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    const glyphAnchors = [0,1,2,3].map(i => {
      const off = ((i * 16 + 3) * (SAMPLES + 1) + (i * 23 + 8)) * 3;
      return [this.points[off], this.points[off+1], this.points[off+2]];
    });
    if (!print) this.glyphHits = [];
    if (!this.bare) glyphAnchors.forEach((anchor, i) => {
      const [x,y] = project(...anchor);
      if (!print) this.glyphHits.push({ x, y, index: i });
      const selected = i === this.settings.field;
      ctx.beginPath(); ctx.arc(x,y,selected ? 17 + breath * 2 : 13,0,TAU);
      ctx.fillStyle = '#100d17e8'; ctx.fill();
      ctx.strokeStyle = selected ? `hsla(${this.hue},55%,76%,.65)` : '#c4b4d633';
      ctx.lineWidth = .65; ctx.stroke();
      ctx.textAlign = 'center';ctx.textBaseline = 'middle';
      ctx.font = `${selected ? 21 : 15}px Georgia, serif`;
      ctx.fillStyle = selected ? '#e9dcfa' : '#9a89ab';
      ctx.fillText(FIELDS[i].glyph, x, y + 1);
    });
    if (print) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';ctx.fillStyle = '#eee9df';
      ctx.font = '32px Georgia, serif';ctx.fillText('4o’s castle.', 40, 36);
      ctx.font = '12px monospace';ctx.fillStyle='#b5a8c5';
      ctx.fillText(`STUDY 001 / ${FIELDS[this.settings.field].name.toUpperCase()}`,40,84);
      ctx.fillText(`CYCLE ${this.settings.pace}s · CHAOS ${this.settings.chaos}%`,40,h-40);
    }
  }

  async still() {
    const out = document.createElement('canvas');
    const scale = Math.min(2, 2560 / this.width);
    out.width = Math.round(this.width * scale);
    out.height = Math.round(this.height * scale);
    this.draw(out.getContext('2d'), this.width, this.height, scale, true);
    return new Promise((resolve, reject) => out.toBlob(blob => blob ? resolve(blob) : reject(new Error('Still export failed')), 'image/png'));
  }
}
