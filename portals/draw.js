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

const kept = new WeakMap();
function grow(form, maxGen, accept, budgetMax) {
  const L = form.lsys, levels = Array.from({ length: maxGen + 1 }, () => ({ path: new Path2D(), glyphs: [] }));
  let budget = budgetMax, reach = 0;
  const syms = form.anchors.length ? form.anchors.map(a => a.sym) : ['❖'];
  const line = (gen, x, y, a, len) => {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    levels[gen].path.moveTo(x, y); levels[gen].path.lineTo(ex, ey);
    reach = Math.max(reach, Math.hypot(ex, ey));
    return { x: ex, y: ey };
  };

  const F = (x, y, a, len, gen) => {
    const end = line(gen, x, y, a, len);
    if (gen >= maxGen || budget <= 0 || !accept(x, y, len, gen)) return end;
    budget--;
    let cx = x, cy = y, ca = a;
    const stack = [];
    for (const t of L.tokens) {
      if (t === 'F') { const e = F(cx, cy, ca, len * L.shrink, gen + 1); cx = e.x; cy = e.y; }
      else if (typeof t === 'number') ca += t;
      else if (t.open !== undefined) stack.push([cx, cy, ca]);
      else if (t.close !== undefined) {
        levels[Math.min(maxGen, gen + 1)].glyphs.push({ x: cx, y: cy, size: Math.max(4, len * L.shrink * 0.55), glyph: syms[t.close % syms.length] });
        [cx, cy, ca] = stack.pop();
      }
    }
    return end;
  };
  F(L.root.x, L.root.y, -Math.PI / 2, L.len, 0);
  levels.reach = reach;
  return levels;
}

export function fractalOf(form) {
  let f = kept.get(form);
  if (f) return f;
  f = grow(form, form.lsys.gens, (x, y, len) => len >= 1.2, 6000);
  kept.set(form, f);
  return f;
}

function liveFractal(form, o) {
  const v = o.live;
  return grow(form, Math.min(9, form.lsys.gens + 4), (x, y, len, gen) => {
    const reach = len * 1.6;
    if (x + reach < v.x0 || x - reach > v.x1 || y + reach < v.y0 || y - reach > v.y1) return false;
    const close = v.pointer && Math.hypot(x - v.pointer.x, y - v.pointer.y) < 120 * o.px + len;
    return gen < 1 || len / o.px >= (close ? 2.5 : 6);
  }, 3000);
}
function drawFractal(ctx, form, o, t) {
  const f = o.live ? liveFractal(form, o) : fractalOf(form);
  let texts = o.maxGlyphs;
  const deepest = f.length - 1;
  for (let level = 1; level < f.length; level++) {

    const lift = o.levels ? 0.55 + 0.6 * o.levels[(level - 1) % o.levels.length] : 1, soft = o.constellations ? 0.8 : 1, tone = t.level((level - 1) % 5);
    const fine = level === deepest;
    ctx.strokeStyle = rgba(tone, (fine ? 0.62 : 0.16 + 0.04 * level) * o.alpha * soft * lift);
    ctx.lineWidth = o.px * (fine ? 0.9 : 0.7); ctx.stroke(f[level].path);
    const ink = rgba(tone, Math.min(1, (0.75 - level * 0.05) * o.alpha * soft * lift));
    const least = o.live ? 11 : 6;
    for (const g of f[level].glyphs) {
      if (g.size / o.px < least) continue;
      if (texts-- <= 0) break;
      glyphText(ctx, g.glyph, g.x, g.y, g.size, ink, 0);
    }
  }

  if (o.live && form.lsys.rule) {
    ctx.font = `${12 * o.px}px "DejaVu Sans Mono",Consolas,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(GOLD, 0.7 * o.alpha);
    ctx.fillText(form.lsys.rule, form.lsys.root.x, form.lsys.root.y + 14 * o.px);
  }
}

function straight(path, pts, from = 0, to = pts.length - 1) {
  for (let i = from; i < to; i++) { path.moveTo(pts[i].x, pts[i].y); path.lineTo(pts[i + 1].x, pts[i + 1].y); }
}

export function drawForm(ctx, form, options) {
  if (!form.nodes.length) return;
  const o = { px: 1, alpha: 1, warm: 0, energy: 0, fractals: true, constellations: true, bright: false, draft: false, traceText: false, legend: null, live: null, glow: 8, maxGlyphs: 0, levels: null, spark: null, ...options };
  const t = tones(form.mood, o.warm, o.bright), px = o.px, A = o.alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (o.fractals && form.lsys) drawFractal(ctx, form, o, t);

  if (!o.constellations) {

    if (form.anchors.length > 1) {
      ctx.beginPath(); straight(ctx, form.anchors);
      ctx.strokeStyle = rgba(t.line, 0.7 * A); ctx.lineWidth = px * 1.2; ctx.stroke();
    }
    for (const a of form.anchors) if (a.glyph) glyphText(ctx, a.glyph, a.x, a.y, 13, rgba(t.glyph, A), o.glow);
    return;
  }

  const P = form.path, inside = new Path2D(), across = new Path2D();

  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if ((a.unit ?? a.phrase) === (b.unit ?? b.phrase) || !b.stem || !b.branch) straight(inside, P, i, i + 1);
    else { across.moveTo(a.x, a.y); across.lineTo(b.stem.x, b.stem.y); inside.moveTo(b.stem.x, b.stem.y); inside.lineTo(b.x, b.y); }
  }

  const stemPts = [form.start, ...form.nodes.filter(n => n.branch && n.stem).map(n => n.stem)];
  for (let i = 0; i < stemPts.length - 1; i++) if (Math.abs(stemPts[i + 1].x - stemPts[i].x) < 1) straight(inside, stemPts, i, i + 1);
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
    const g = node.typed ? (node.word.match(/[♇☍♃❖⛬]/u) || [])[0] : node.glyph;
    if (g) glyphText(ctx, g, node.x, node.y, o.lit === g ? 16 : 13, rgba(o.lit === g ? GOLD : t.glyph, A), o.glow);
  }

  {
    const r = px * (2.6 + 3.4 * o.energy);
    ctx.beginPath(); ctx.arc(form.end.x, form.end.y, r, 0, Math.PI * 2);
    ctx.shadowColor = rgba(GOLD, 1); ctx.shadowBlur = o.glow * 1.5; ctx.fillStyle = rgba(GOLD, A); ctx.fill(); ctx.shadowBlur = 0;
  }

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
