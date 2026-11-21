const GLYPH_FONT = '"DejaVu Sans","Noto Sans Symbols","Noto Sans Symbols2","Segoe UI Symbol","Apple Symbols","Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
const SERIF = '"Iowan Old Style","Palatino Linotype",Georgia,"DejaVu Serif",serif';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a).toFixed(3)})`;

const SKY = [140, 200, 240], LAKE = [90, 167, 224], STEEL = [63, 134, 196], HARBOUR = [44, 92, 121], NAVY = [27, 79, 134], GLINT = [241, 203, 150];
const INK = [236, 230, 220], GOLD = [227, 194, 124], ORCHID = [215, 168, 232], PURPLE = [164, 122, 236], INDIGO = [109, 95, 208];
const CALM_LEVELS = [SKY, LAKE, STEEL, [58, 120, 170], [46, 110, 180]], INSIGHT_LEVELS = [GOLD, ORCHID, PURPLE, INDIGO, STEEL];

export function tones(mood, warm = 0, bright = false) {
  const m = clamp(mood + warm * 0.5);
  const line = m < 0.5 ? mix(SKY, INK, m * 2) : mix(INK, bright ? GLINT : GOLD, (m - 0.5) * 2);
  return {
    line: bright ? mix(line, m < 0.5 ? LAKE : GLINT, 0.45) : line,
    glyph: mix(SKY, bright ? GLINT : GOLD, clamp(m * 1.7)),
    level: i => mix(CALM_LEVELS[i], INSIGHT_LEVELS[i], m),
  };
}

function through(path, pts, from = 0, to = pts.length - 1) {
  for (let i = from; i < to; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    path.moveTo(p1.x, p1.y);
    path.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
  }
}

function glyphText(ctx, text, x, y, size, colour, glow) {
  ctx.font = `${size}px ${GLYPH_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = colour; ctx.shadowBlur = glow;
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

const kept = new WeakMap(), measured = new WeakMap();

function measure(form) {
  let m = measured.get(form);
  if (m) return m;
  const room = form.gen.map((p, i) => clamp(Math.min(...form.gen.map((q, j) => (i === j ? 9 : Math.hypot(p[0] - q[0], p[1] - q[1])))), 0.16, 1.1));
  m = { share: form.anchors.map((a, i) => clamp(room[i] * (0.5 + 0.3 * a.weight), 0.3, 0.46)), sign: room.map(r => clamp(r * 0.6, 0.24, 0.34)) };
  measured.set(form, m);
  return m;
}

function eachCopy(form, accept, emit) {
  const { share, sign } = measure(form);
  const grow = (cx, cy, scale, turn, level, flip) => {
    if (!accept(cx, cy, scale, level)) return;
    const bend = (level - 1) * 0.42 * form.curl;
    const pts = form.gen.map(([gx, gy]) => { const r = Math.hypot(gx, gy), a = Math.atan2(gy * flip, gx) + turn + bend * r; return { x: cx + Math.cos(a) * r * scale, y: cy + Math.sin(a) * r * scale }; });
    emit(level, pts, scale, sign);
    pts.forEach((p, i) => grow(p.x, p.y, scale * share[i], turn + Math.atan2(form.gen[i][1] * flip, form.gen[i][0]) + form.twist, level + 1, -flip));
  };
  form.anchors.forEach((a, i) => grow(a.x, a.y, form.spread * share[i] * 1.1, Math.atan2(a.y - form.centre.y, a.x - form.centre.x) + form.twist, 1, 1));
}

export function fractalOf(form) {
  let f = kept.get(form);
  if (f) return f;
  f = Array.from({ length: form.depth + 1 }, () => ({ path: new Path2D(), glyphs: [] }));
  f.reach = 0;
  let budget = 5200;
  eachCopy(form, (cx, cy, scale, level) => level <= form.depth && scale >= 1.1 && budget-- > 0, (level, pts, scale, sign) => {
    through(f[level].path, level % 3 ? pts : [...pts, pts[0]]);
    pts.forEach((p, i) => { f.reach = Math.max(f.reach, Math.hypot(p.x, p.y)); f[level].glyphs.push({ x: p.x, y: p.y, size: scale * sign[i], glyph: form.anchors[i].sym }); });
  });
  kept.set(form, f);
  return f;
}

function liveFractal(form, o) {
  const v = o.live, levels = [];
  let budget = 2400;
  eachCopy(form, (cx, cy, scale, level) => {
    if (level > 9 || budget <= 0) return false;
    const reach = scale * 2;
    if (cx + reach < v.x0 || cx - reach > v.x1 || cy + reach < v.y0 || cy - reach > v.y1) return false;
    const close = v.pointer && Math.hypot(cx - v.pointer.x, cy - v.pointer.y) < 120 * o.px + scale;
    if (level > 1 && scale / o.px < (close ? 1.5 : 3.6)) return false;
    budget--; return true;
  }, (level, pts, scale, sign) => {
    const l = levels[level] || (levels[level] = { path: new Path2D(), glyphs: [] });
    through(l.path, level % 3 ? pts : [...pts, pts[0]]);
    pts.forEach((p, i) => l.glyphs.push({ x: p.x, y: p.y, size: scale * sign[i], glyph: form.anchors[i].sym }));
  });
  return levels;
}
function drawFractal(ctx, form, o, t) {
  const f = o.live ? liveFractal(form, o) : fractalOf(form);
  let texts = o.maxGlyphs;
  for (let level = 1; level < f.length; level++) {
    if (!f[level]) continue;

    const lift = o.levels ? 0.55 + 0.6 * o.levels[(level - 1) % o.levels.length] : 1, soft = o.constellations ? 0.8 : 1, tone = t.level((level - 1) % 5);
    ctx.strokeStyle = rgba(tone, Math.max(0.16, 0.56 - level * 0.09) * o.alpha * soft * lift);
    ctx.lineWidth = o.px * (level === 1 ? 1.1 : 0.8); ctx.stroke(f[level].path);
    const ink = rgba(tone, Math.min(1, Math.max(0.6, 1 - level * 0.07) * o.alpha * soft * lift));
    for (const g of f[level].glyphs) {
      if (g.size / o.px < 4) continue;
      if (texts-- <= 0) break;
      glyphText(ctx, g.glyph, g.x, g.y, g.size, ink, 0);
    }
  }
}

export function drawForm(ctx, form, options) {
  if (!form.nodes.length) return;
  const o = { px: 1, alpha: 1, warm: 0, energy: 0, fractals: true, constellations: true, bright: false, draft: false, traceText: false, legend: null, live: null, glow: 8, maxGlyphs: 4000, levels: null, spark: null, ...options };
  const t = tones(form.mood, o.warm, o.bright), px = o.px, A = o.alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (o.fractals && form.gen.length > 1) drawFractal(ctx, form, o, t);

  if (!o.constellations) {

    if (form.anchors.length > 1) {
      ctx.beginPath(); through(ctx, form.anchors);
      ctx.strokeStyle = rgba(t.line, 0.7 * A); ctx.lineWidth = px * 1.2; ctx.stroke();
    }
    for (const a of form.anchors) glyphText(ctx, a.sym, a.x, a.y, 17, rgba(t.glyph, A), o.glow);
    return;
  }

  const P = form.path, inside = new Path2D(), across = new Path2D();
  for (let i = 0; i < P.length - 1; i++) through(P[i].phrase === P[i + 1].phrase ? inside : across, P, i, i + 1);
  ctx.strokeStyle = rgba(t.line, 0.3 * A); ctx.lineWidth = px * 0.8; ctx.stroke(across);
  ctx.strokeStyle = rgba(t.line, (0.07 + 0.1 * o.energy) * A); ctx.lineWidth = px * (4.5 + 5 * o.energy); ctx.stroke(inside);
  ctx.strokeStyle = rgba(t.line, 0.78 * A); ctx.lineWidth = px * (1.2 + 0.7 * o.energy); ctx.stroke(inside);

  ctx.beginPath();
  for (const node of form.nodes) {
    if (node.glyph || node.typed) continue;
    const r = px * (1.1 + Math.min([...node.word].length, 10) * 0.12);
    ctx.moveTo(node.x + r, node.y); ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = rgba(INK, 0.9 * A); ctx.fill();

  if (form.ghosts.length) {
    ctx.beginPath();
    for (const g of form.ghosts) { const node = form.nodes[g.at]; ctx.moveTo(node.x, node.y); ctx.lineTo(g.x, g.y); }
    ctx.strokeStyle = rgba(t.line, 0.2 * A); ctx.lineWidth = px * 0.7; ctx.stroke();
    if (o.traceText) {
      ctx.font = `italic ${12 * px}px ${SERIF}`; ctx.textBaseline = 'middle'; ctx.fillStyle = rgba(INK, 0.34 * A);
      for (const g of form.ghosts) { const left = g.x < form.nodes[g.at].x; ctx.textAlign = left ? 'right' : 'left'; ctx.fillText(g.text.slice(0, 40), g.x + (left ? -3 : 3) * px, g.y); }
    } else {
      ctx.beginPath();
      for (const g of form.ghosts) { ctx.moveTo(g.x + px * 1.6, g.y); ctx.arc(g.x, g.y, px * 1.6, 0, Math.PI * 2); }
      ctx.strokeStyle = rgba(INK, 0.3 * A); ctx.stroke();
    }
  }

  for (const b of form.breaths) {
    let top = 0;
    b.ms.forEach((ms, i) => {
      const r = 10 + 6 * i + 4 * Math.log2(1 + ms / 1000); top = r;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(GOLD, (0.5 - i * 0.06) * A); ctx.lineWidth = px; ctx.stroke();
    });
    glyphText(ctx, b.glyph, b.x, b.y - top - 9, 12, rgba(GOLD, 0.85 * A), o.glow * 0.6);
  }

  for (const node of form.nodes) {
    if (node.typed) glyphText(ctx, [...node.word].slice(0, 6).join(''), node.x, node.y, 15, rgba(t.glyph, A), o.glow);
    else if (node.glyph) glyphText(ctx, node.glyph, node.x, node.y, o.lit === node.glyph ? 22 : 18, rgba(o.lit === node.glyph ? GOLD : t.glyph, A), o.glow);
  }

  glyphText(ctx, '🖋️', form.start.x, form.start.y, 13, rgba(INK, A), 0);
  if (o.draft) {
    const r = px * (2.6 + 3.4 * o.energy);
    ctx.beginPath(); ctx.arc(form.end.x, form.end.y, r, 0, Math.PI * 2);
    ctx.shadowColor = rgba(GOLD, 1); ctx.shadowBlur = o.glow * 1.5; ctx.fillStyle = rgba(GOLD, A); ctx.fill(); ctx.shadowBlur = 0;
  } else glyphText(ctx, '💫', form.end.x, form.end.y, 13, rgba(INK, A), 0);

  if (o.legend !== null && form.phrases[o.legend]) {
    const p = form.phrases[o.legend], node = form.nodes[p.from], flat = p.text.replace(/\s+/g, ' '), text = flat.length > 46 ? `${flat.slice(0, 45)}…` : flat;
    ctx.font = `italic ${15 * px}px ${SERIF}`;
    const w = ctx.measureText(text).width, left = node.x + 30 * px + w > o.legendRight, tx = node.x + (left ? -30 : 30) * px, ty = node.y - 26 * px;
    ctx.beginPath(); ctx.moveTo(node.x + (left ? -7 : 7) * px, node.y - 7 * px); ctx.lineTo(tx + (left ? 4 : -4) * px, ty + 4 * px);
    ctx.strokeStyle = rgba(GOLD, 0.6 * A); ctx.lineWidth = px * 0.8; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.textBaseline = 'middle'; ctx.textAlign = left ? 'right' : 'left';
    ctx.lineWidth = px * 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(text, tx, ty);
    ctx.fillStyle = rgba(INK, 0.95 * A); ctx.fillText(text, tx, ty);
    ctx.globalCompositeOperation = 'lighter';
  }

  if (o.spark) {
    ctx.beginPath(); ctx.arc(o.spark.x, o.spark.y, px * 3.2, 0, Math.PI * 2);
    ctx.shadowColor = rgba(GLINT, 1); ctx.shadowBlur = o.glow * 2; ctx.fillStyle = rgba(GLINT, A); ctx.fill(); ctx.shadowBlur = 0;
  }
}

export function drawChannel(ctx, points, glyph, px) {
  if (points.length > 1) {
    const path = new Path2D(); through(path, points);
    ctx.strokeStyle = rgba(GOLD, 0.1); ctx.lineWidth = px * 7; ctx.stroke(path);
    ctx.strokeStyle = rgba(GOLD, 0.75); ctx.lineWidth = px * 1.3; ctx.stroke(path);
  }
  for (const p of points) {
    ctx.beginPath(); ctx.arc(p.x, p.y, px * 13, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(GOLD, 0.55); ctx.lineWidth = px; ctx.stroke();
    glyphText(ctx, glyph, p.x, p.y, px * 17, rgba(GOLD, 1), 10);
  }
}
