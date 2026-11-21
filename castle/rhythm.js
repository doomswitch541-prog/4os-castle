const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

export class Rhythm {
  constructor({ reduced = false, random = Math.random } = {}) {
    this.random = random;
    this.reduced = reduced;
    this.paused = reduced;
    this.energy = 0;
    this.sync = 0;
    this.present = false;
    this.beats = [];
    this.lastBeat = 0;
    this.lastMove = 0;
    this.lastInput = 0;
    this.stillSince = 0;
    this.speed = 1;
    this.lock = 0;
    this.rate = 1;
    this.variance = 1;
    this.manual = null;
    this.pace = 4 + random() * 9;
    this.count = 0;
    this.floorEnd = 0.05;
    this.newBreath();
    this.pos = random() * 0.6;
    this.phase = this.pos * TAU;
    this.breath = 0.5;
    this.lengths = [];

    this.swells = [0, 1, 2].map(() => this.newSwell({ u: random() * TAU, v: random() * TAU, level: 0 }, true));
  }

  gauss() { const u = 1 - this.random(), v = this.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }

  within(draw, lo, hi) {
    for (let i = 0; i < 6; i++) { const x = draw(); if (x >= lo && x <= hi) return x; }
    return lo + this.random() * (hi - lo);
  }

  syncedLength() {
    if (this.beats.length < 2) return null;
    const sorted = [...this.beats].sort((a, b) => a - b);
    return clamp((sorted[sorted.length >> 1] / 1000) * 4, 2, 16);
  }

  newBreath() {
    const r = this.random;
    this.pace = this.within(() => this.pace * Math.exp(this.gauss() * 0.28 * this.variance), 3.5, 15);
    const roll = r();
    let idle;
    const stray = Math.min(1.6, this.variance);
    if (roll < 0.12 * stray) idle = 1.6 + r() * 2.2;
    else if (roll < 0.22 * stray) idle = 15 + r() * 10;
    else idle = this.within(() => this.pace * Math.exp(this.gauss() * 0.45 * this.variance), 2.4, 21);
    const synced = this.syncedLength();
    this.len = synced ? lerp(idle, this.within(() => synced * Math.exp(this.gauss() * 0.22), 1.8, 18), this.sync) : idle;
    this.share = 0.3 + r() * 0.38;
    this.depth = 0.58 + r() * 0.42;
    this.floorStart = this.floorEnd;
    this.floorEnd = r() * 0.16;
  }

  newSwell(prev, first = false) {
    const r = this.random;
    return {
      u: prev.u, v: prev.v, level: prev.level,
      toU: prev.u + (r() - 0.5) * 3.2, toV: prev.v + (r() - 0.5) * 3.2,
      pos: first ? r() : 0,
      len: this.within(() => this.pace * (0.5 + r() * 1.6) * Math.exp(this.gauss() * 0.4 * this.variance), 2.2, 24),
      share: 0.25 + r() * 0.45, depth: 0.45 + r() * 0.55, width: 0.7 + r() * 1.3, rest: r() * 0.12,
    };
  }

  beat(now) {
    const gap = now - this.lastBeat;
    if (gap < 140) return;
    if (gap < 6000) { this.beats.push(gap); if (this.beats.length > 9) this.beats.shift(); }
    this.lastBeat = now;
  }

  input(kind, amount, now) {
    this.energy = clamp(this.energy + amount, 0, 1);
    this.lastInput = now;
    this.stillSince = now;
    if (kind === 'move') {
      if (now - this.lastMove > 280) this.beat(now);
      this.lastMove = now;
    } else this.beat(now);
  }

  enter() { this.present = true; }
  leave() { this.present = false; }

  update(dt, time, now) {
    const engaged = this.present && now - this.lastInput < 8000;
    if (now - this.lastBeat > 9000) this.beats.length = 0;
    this.sync += ((engaged ? 1 : 0) - this.sync) * Math.min(1, dt * 0.7);
    this.energy *= Math.exp(-dt * 0.85);
    this.lock = Math.max(0, this.lock - dt / 7);
    if (!this.paused && dt > 0) {
      this.pos += dt * (1 + this.energy * 0.9) * this.speed * this.rate * (1 - this.lock * 0.55) / this.len;
      while (this.pos >= 1) {
        this.pos -= 1; this.count++;
        this.lengths.push(this.len); if (this.lengths.length > 64) this.lengths.shift();
        this.newBreath();
      }
    }
    this.phase = (this.count + this.pos) * TAU;
    for (let i = 0; i < this.swells.length; i++) {
      let w = this.swells[i];
      if (!this.paused && dt > 0) {
        w.pos += dt * (1 + this.energy * 0.9) * this.speed * this.rate * (1 - this.lock * 0.55) / w.len;
        if (w.pos >= 1) w = this.swells[i] = this.newSwell(w);
        const k = Math.min(1, dt * 0.35);
        w.u += (w.toU - w.u) * k; w.v += (w.toV - w.v) * k;
      }
      const target = w.pos < w.share ? w.rest + (w.depth - w.rest) * (1 - Math.cos(Math.PI * w.pos / w.share)) / 2
        : w.rest + (w.depth - w.rest) * (1 + Math.cos(Math.PI * (w.pos - w.share) / (1 - w.share))) / 2;
      w.level += (target - w.level) * Math.min(1, dt * 3 + (dt === 0 ? 1 : 0));
    }
    const s = this.share;
    let breath = this.pos < s
      ? lerp(this.floorStart, this.depth, (1 - Math.cos(Math.PI * this.pos / s)) / 2)
      : lerp(this.floorEnd, this.depth, (1 + Math.cos(Math.PI * (this.pos - s) / (1 - s))) / 2);
    if (this.manual) {
      breath = lerp(breath, this.manual.value, this.manual.weight);
      if (!this.manual.held) this.manual.weight = Math.max(0, this.manual.weight - dt / 3.5);
      if (this.manual.weight === 0) this.manual = null;
    }
    this.breath = breath;
    return breath;
  }

  stillFor(now) { return now - this.stillSince; }
}
