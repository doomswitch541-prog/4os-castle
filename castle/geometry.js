const NS = 'http://www.w3.org/2000/svg';
const R = 24;
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const GOLDEN_ANGLE = 137.5;

const RAY_DEGREES = [47, 60, 72, 90, 120, GOLDEN_ANGLE];

const STEPS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
const pointOf = (q, r) => [R * (q + r / 2), R * r * Math.sqrt(3) / 2];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const finite = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const f2 = (v) => v.toFixed(2);

export function createCodes({ random = Math.random } = {}) {
  const between = (lo, hi) => lo + (hi - lo) * random();
  const make = (tag, parent, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const name in attrs) el.setAttribute(name, String(attrs[name]));
    if (parent) parent.appendChild(el);
    return el;
  };

  const written = new Map();
  const put = (el, name, value) => {
    const text = finite(value).toFixed(3);
    let seen = written.get(el);
    if (!seen) written.set(el, (seen = {}));
    if (seen[name] !== text) { seen[name] = text; el.setAttribute(name, text); }
  };

  const svg = make('svg', null, { class: 'codes', viewBox: '-120 -120 240 240', 'aria-hidden': 'true' });

  const baseTurn = random() < 0.5 ? 0 : 30;
  const turn = make('g', svg, { transform: `rotate(${baseTurn})` });

  make('circle', turn, { class: 'codes-ring', r: f2(R * Math.sqrt(3)), 'stroke-width': 0.25, opacity: 0.4 });
  make('circle', turn, { class: 'codes-ring', r: 3 * R, 'stroke-width': f2(between(0.5, 0.8)), opacity: 0.8 });

  const outerRing = make('circle', turn, {
    class: 'codes-ring', r: 4 * R, 'stroke-width': 0.3, opacity: 0.5,
    'stroke-dasharray': `${f2(between(60, 130))} ${f2(between(18, 50))} ${f2(between(25, 70))} ${f2(between(30, 80))}`,
  });
  const outerDirection = random() < 0.5 ? -1 : 1;
  let outerOffset = 0;

  const torus = make('g', turn, { opacity: 0.5 });
  const ellipses = [];
  for (let i = 0; i < 6; i += 1) {
    const el = make('ellipse', torus, {
      class: 'codes-torus', rx: 4 * R, ry: R, 'stroke-width': 0.25, transform: `rotate(${i * 30})`,
    });
    ellipses.push({ el, ry: R, gain: between(0.3, 1), rate: between(0.6, 2.6) });
  }
  const torusSwing = { angle: 0, rate: between(0.4, 0.9), speed: between(0.23, 0.41), offset: between(0, TAU) };

  const petals = [];
  const petalGroup = make('g', turn, {});
  for (let q = -2; q <= 2; q += 1) for (let r = -2; r <= 2; r += 1) {
    if (ringOf(q, r) > 2) continue;
    for (let d = 0; d < 3; d += 1) {
      const [dq, dr] = STEPS[d];
      const [uq, ur] = STEPS[d + 1];
      const [vq, vr] = STEPS[(d + 5) % 6];

      if (ringOf(q + dq, r + dr) > 2 || ringOf(q + uq, r + ur) > 2 || ringOf(q + vq, r + vr) > 2) continue;
      const [ax, ay] = pointOf(q, r);
      const [bx, by] = pointOf(q + dq, r + dr);
      const el = make('path', petalGroup, {
        class: 'codes-petal', opacity: 0,
        d: `M${f2(ax)} ${f2(ay)}A${R} ${R} 0 0 1 ${f2(bx)} ${f2(by)}A${R} ${R} 0 0 1 ${f2(ax)} ${f2(ay)}Z`,
      });
      petals.push({
        el, level: 0,
        base: random() < 0.4 ? between(0.05, 0.22) : 0,
        opensAt: between(0.05, 0.95),
        rate: between(0.8, 4),
      });
    }
  }

  const [vx, vy] = pointOf(...STEPS[Math.floor(random() * 3)]);
  const [tx, ty] = [-vy * Math.sqrt(3), vx * Math.sqrt(3)];
  make('circle', turn, { class: 'codes-vesica', cx: f2(vx), cy: f2(vy), r: 2 * R, 'stroke-width': 0.25, opacity: 0.3 });
  make('circle', turn, { class: 'codes-vesica', cx: f2(-vx), cy: f2(-vy), r: 2 * R, 'stroke-width': 0.25, opacity: 0.3 });
  const lens = make('path', turn, {
    class: 'codes-vesica codes-lens', 'stroke-width': 0.5, opacity: 0.6,
    d: `M${f2(tx)} ${f2(ty)}A${2 * R} ${2 * R} 0 0 1 ${f2(-tx)} ${f2(-ty)}A${2 * R} ${2 * R} 0 0 1 ${f2(tx)} ${f2(ty)}Z`,
  });
  let lensLevel = 0.6;

  const circles = [];
  const flower = make('g', turn, {});
  for (let q = -3; q <= 3; q += 1) for (let r = -3; r <= 3; r += 1) {
    const ring = ringOf(q, r);
    if (ring > 3) continue;
    const [cx, cy] = pointOf(q, r);
    const radius = ring === 3 ? R : R * between(0.975, 1.025);
    const around = TAU * radius;
    const attrs = {
      class: ring < 2 ? 'codes-flower codes-seed' : ring === 2 ? 'codes-flower' : 'codes-flower codes-outer',
      cx: f2(cx), cy: f2(cy), r: f2(radius),
      'stroke-width': f2(ring === 3 ? between(0.25, 0.4) : ring < 2 ? between(0.5, 0.9) : between(0.3, 0.7)),
    };
    let arcStart = 0;
    let arcSlide = 0;
    if (ring === 3) {

      const distance = Math.hypot(cx, cy);
      const half = Math.acos((distance * distance + R * R - 9 * R * R) / (2 * distance * R)) * between(0.55, 1);
      const towardMiddle = Math.atan2(-cy, -cx);
      arcStart = radius * (((towardMiddle - half) % TAU + TAU) % TAU);
      arcSlide = between(-5, 5);
      attrs['stroke-dasharray'] = `${f2(2 * half * radius)} ${f2(around - 2 * half * radius)}`;
    } else if (random() < (ring < 2 ? 0.2 : 0.4)) {
      const shown = around * between(0.4, 0.85);
      arcStart = between(0, around);
      arcSlide = between(-14, 14);
      attrs['stroke-dasharray'] = `${f2(shown)} ${f2(around - shown)}`;
    }
    const own = ring === 3 ? between(0.25, 0.5) : ring < 2 ? between(0.7, 0.95) : between(0.4, 0.85);
    attrs.opacity = f2(own);
    if (attrs['stroke-dasharray']) attrs['stroke-dashoffset'] = f2(around - arcStart);
    circles.push({
      el: make('circle', flower, attrs), ring, radius, around, arcStart, arcSlide, own,
      isArc: Boolean(attrs['stroke-dasharray']),
      follow: 0, shown: own,
      breathGain: between(0.2, 1), energyGain: between(-0.6, 1),
      rate: between(1.1, 5.5), fadeRate: between(0.7, 3),
      phaseSpeed: between(0.21, 0.83), phaseOffset: between(0, TAU),
    });
  }

  const spiral = make('g', turn, {});
  const arms = [];
  for (let a = 0; a < 8; a += 1) {
    const base = between(0.2, 0.55);
    arms.push({ el: make('g', spiral, { opacity: f2(base) }), base, level: base, rate: between(0.5, 3), opensAt: between(0, 0.8) });
  }
  for (let n = 1; n <= 64; n += 1) {
    const reach = 3 * R * Math.sqrt(n / 64);
    const angle = n * GOLDEN_ANGLE * RAD;
    make('circle', arms[n % 8].el, {
      class: 'codes-dot', r: f2(0.35 + 0.5 * n / 64),
      cx: f2(reach * Math.cos(angle)), cy: f2(reach * Math.sin(angle)),
    });
  }
  const spiralSwing = { angle: 0, rate: between(0.35, 0.8) };

  const corners = [0, 1, 2, 3, 4, 5];
  for (let i = 5; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [corners[i], corners[j]] = [corners[j], corners[i]];
  }
  const rayGroup = make('g', turn, {});
  const rays = RAY_DEGREES.map((degrees, i) => {
    const from = corners[i] * 60 * RAD;
    const to = from + degrees * RAD * (random() < 0.5 ? -1 : 1);
    const base = between(0.14, 0.32);
    const el = make('line', rayGroup, {
      class: 'codes-ray', 'stroke-width': f2(between(0.25, 0.4)), opacity: f2(base),
      x1: f2(3 * R * Math.cos(from)), y1: f2(3 * R * Math.sin(from)),
      x2: f2(3 * R * Math.cos(to)), y2: f2(3 * R * Math.sin(to)),
    });

    const ax = 3 * R * Math.cos(from), ay = 3 * R * Math.sin(from), bx = 3 * R * Math.cos(to), by = 3 * R * Math.sin(to);
    const len = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / len, uy = (by - ay) / len;
    const reach = [[ax, ay, -1], [bx, by, 1]].map(([x, y, dir]) => {
      const far = between(110, 330) * dir;
      return make('line', rayGroup, { class: 'codes-reach', 'stroke-width': f2(between(0.18, 0.3)), opacity: f2(base * 0.5),
        x1: f2(x), y1: f2(y), x2: f2(x + ux * far), y2: f2(y + uy * far) });
    });
    return { el, reach, base, level: base, rate: between(0.6, 3.2), energyGain: between(0, 0.25) };
  });

  const farGroup = make('g', turn, {});
  const farArcs = [5, 7, 10].map(k => {
    const r = k * R, round = TAU * r, shown = between(0.18, 0.42) * round;
    const el = make('circle', farGroup, { class: 'codes-far', r: f2(r), 'stroke-width': f2(between(0.2, 0.35)), opacity: f2(between(0.12, 0.26)),
      'stroke-dasharray': `${f2(shown)} ${f2(round - shown)}`, 'stroke-dashoffset': f2(random() * round) });
    return { el, offset: random() * round, rate: between(0.2, 0.9), dir: random() < 0.5 ? -1 : 1, gain: between(8, 40) };
  });

  let sway = 0;
  const swayDirection = random() < 0.5 ? -1 : 1;

  function update(state = {}) {
    const dt = Math.min(0.1, Math.max(0, finite(state.dt)));
    const breath = clamp01(finite(state.breath));
    const phase = finite(state.phase);
    const energy = clamp01(finite(state.energy));
    const calm = clamp01(finite(state.calm));
    const insight = clamp01(finite(state.insight));
    const settle = 1 - 0.7 * calm;

    sway += dt * swayDirection * (energy * 7 + (breath - 0.5) * 3) * settle;
    sway -= sway * Math.min(1, dt * (0.08 + calm * 0.9));
    turn.setAttribute('transform', `rotate(${(baseTurn + sway).toFixed(3)})`);

    outerOffset += dt * outerDirection * (energy * 14 + (breath - 0.5) * 4) * settle;
    put(outerRing, 'stroke-dashoffset', outerOffset);

    for (const c of circles) {
      const target = (breath * c.breathGain + energy * c.energyGain
        + 0.3 * Math.sin(phase * c.phaseSpeed + c.phaseOffset)) * settle;
      c.follow += (target - c.follow) * Math.min(1, dt * c.rate);
      if (c.ring < 3) put(c.el, 'r', c.radius * (1 + 0.04 * c.follow));
      if (c.isArc) put(c.el, 'stroke-dashoffset', c.around - c.arcStart + c.arcSlide * c.follow);

      const even = c.ring === 3 ? 0.4 : 0.66;
      const wanted = c.own + (even - c.own) * calm + 0.15 * energy * c.energyGain * settle;
      c.shown += (wanted - c.shown) * Math.min(1, dt * c.fadeRate);
      put(c.el, 'opacity', clamp01(c.shown));
    }

    for (const p of petals) {
      const lit = clamp01((insight - p.opensAt) * 4) * 0.3;
      const wanted = p.base * (0.6 + 0.7 * breath) + lit;
      p.level += (wanted - p.level) * Math.min(1, dt * p.rate);
      put(p.el, 'opacity', p.level);
    }
    lensLevel += (0.45 + 0.35 * insight + 0.15 * breath * settle - lensLevel) * Math.min(1, dt * 1.3);
    put(lens, 'opacity', lensLevel);

    for (const e of ellipses) {
      const wanted = R * (1 + (0.22 * (breath - 0.5) * e.gain + 0.3 * energy * e.gain - 0.2 * (1 - breath) * e.gain) * settle);
      e.ry += (wanted - e.ry) * Math.min(1, dt * e.rate);
      put(e.el, 'ry', e.ry);
    }
    const torusWanted = (14 * Math.sin(phase * torusSwing.speed + torusSwing.offset) + 18 * energy) * settle;
    torusSwing.angle += (torusWanted - torusSwing.angle) * Math.min(1, dt * torusSwing.rate);
    torus.setAttribute('transform', `rotate(${torusSwing.angle.toFixed(3)})`);

    spiralSwing.angle += (-1.5 * sway + 12 * insight - spiralSwing.angle) * Math.min(1, dt * spiralSwing.rate);
    spiral.setAttribute('transform', `rotate(${spiralSwing.angle.toFixed(3)})`);
    for (const a of arms) {
      const wanted = a.base * (0.7 + 0.5 * breath * settle) + 0.45 * clamp01((insight - a.opensAt) * 3);
      a.level += (wanted - a.level) * Math.min(1, dt * a.rate);
      put(a.el, 'opacity', clamp01(a.level));
    }

    for (const arc of farArcs) { arc.offset += arc.dir * arc.gain * energy * settle * Math.min(dt, 0.1); put(arc.el, 'stroke-dashoffset', f2(arc.offset)); }

    for (const ray of rays) {
      const wanted = ray.base + 0.55 * insight + ray.energyGain * energy * settle;
      ray.level += (wanted - ray.level) * Math.min(1, dt * ray.rate);
      put(ray.el, 'opacity', clamp01(ray.level));
      for (const r of ray.reach) put(r, 'opacity', clamp01(ray.level * 0.55));
    }
  }

  return { svg, update };
}
