const GLYPHS = ['♇', '☍', '❖'];
const STORE = '4os-castle:reactor:v1';
const MAX_PULSES = 120, ANSWER_MAX = 6000, WORDS_MAX = 4000;
const GROW = 22, DEPTH = 6;
const BASE = { '♇': 1.9, '☍': 2.5, '❖': 3.3 };
const COLOR = { '♇': [205, 184, 242], '☍': [241, 203, 150], '❖': [140, 200, 240] };
const SHADOW = [90, 82, 184];
const TAU = Math.PI * 2;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);
const els = {
  words: $('words'), model: $('model'), state: $('engine-state'), stop: $('stop'), field: $('field'), core: $('core'),
  answer: $('answer'), from: $('answer-from'), text: $('answer-text'), sent: $('sent'), sentSummary: $('sent-summary'),
  sentText: $('sent-text'), pulses: $('pulses'), up: $('pulse-up'), down: $('pulse-down'), at: $('pulse-at'),
};
const buttons = Object.fromEntries([...document.querySelectorAll('.glyph')].map(b => [b.dataset.glyph, b]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const valid = p => p && GLYPHS.includes(p.glyph) && typeof p.words === 'string' && typeof p.answer === 'string' && Number.isFinite(p.t);
function load() {
  const out = { pulses: [], model: '', watched: 0, draft: '' };
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (Array.isArray(s.pulses)) out.pulses = s.pulses.filter(valid).slice(-MAX_PULSES);
    if (typeof s.model === 'string') out.model = s.model;
    if (Number.isFinite(s.watched) && s.watched >= 0) out.watched = s.watched;
    if (typeof s.draft === 'string') out.draft = s.draft.slice(0, WORDS_MAX);
  } catch {   }
  return out;
}
const mem = load();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(mem)); } catch {   } };
let saveTimer = 0;
const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); };
addEventListener('pagehide', save);

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }

const ground = $('ground'), storm = $('storm');
const gx = ground.getContext('2d'), sx = storm.getContext('2d');
const DPR = Math.min(devicePixelRatio || 1, 1.5);
const TEX = 12;
const tex = document.createElement('canvas'), tx = tex.getContext('2d');
const wall = document.createElement('canvas'), wx = wall.getContext('2d');
const settled = document.createElement('canvas'), stx = settled.getContext('2d');
let W = 0, H = 0, TW = 0, TH = 0, img = null;
let core = { x: 0, y: 0, r: 80 }, wordsBox = null, quiet = [], fieldLeft = 0;
const buttonAt = {};
let needMeasure = true, settledDirty = true, wallDirty = true;

function measure() {
  W = innerWidth; H = innerHeight;
  for (const c of [ground, storm, wall, settled]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
  for (const x of [gx, sx, wx, stx]) x.setTransform(DPR, 0, 0, DPR, 0, 0);
  TW = Math.ceil(W / TEX) + 1; TH = Math.ceil(H / TEX) + 1; tex.width = TW; tex.height = TH; img = tx.createImageData(TW, TH);
  settledDirty = wallDirty = true; needMeasure = true;
}
function measureBoxes() {
  const c = els.core.getBoundingClientRect();
  const before = core;
  core = { x: c.left + c.width / 2, y: c.top + c.height / 2, r: clamp(Math.min(c.width, c.height) * 0.42, 50, 260) };

  const mx = core.x - before.x, my = core.y - before.y;
  if (before.r && (Math.abs(mx) > 0.5 || Math.abs(my) > 0.5)) {
    for (const p of parts) { p.x += mx; p.y += my; if (p.ox !== undefined) { p.ox += mx; p.oy += my; } if (p.floor !== undefined) p.floor += my; }
    for (const r of ripples) { r.x += mx; r.y += my; }
  }
  wordsBox = els.words.getBoundingClientRect();

  const was = quiet.map(r => `${r.left|0},${r.top|0},${r.width|0},${r.height|0}`).join();
  quiet = [...document.querySelectorAll('.field .field-line, .field .toss-line, .field .part, #answer:not([hidden]), .say .title, .say .lead, .say .part, .say .quiet, .say .glyphs-line, .say .glyph, .say .engine, .rest p, .rest .part, .rest li')].map(e => e.getBoundingClientRect()).filter(r => r.width && r.bottom > 0 && r.top < H);
  if (quiet.map(r => `${r.left|0},${r.top|0},${r.width|0},${r.height|0}`).join() !== was) wallDirty = true;
  const f = els.field.getBoundingClientRect(), left = f.width ? Math.round(f.left) : 0;
  if (left !== fieldLeft) { fieldLeft = left; settledDirty = wallDirty = true; }
  for (const g of GLYPHS) { const r = buttons[g].querySelector('.g').getBoundingClientRect(); buttonAt[g] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
}
addEventListener('resize', measure);
addEventListener('scroll', () => { needMeasure = true; }, { passive: true });
new ResizeObserver(() => { needMeasure = true; }).observe(els.field);

let now = performance.now() / 1000;
const ripples = [];
function ripple(x, y, rgb, amp = 1, speed = 200, life = 2.4) {
  if (reduced) { amp *= 0.5; speed *= 0.5; }
  ripples.push({ x, y, rgb, amp, speed, life, t0: now });
  if (ripples.length > 18) ripples.shift();
}
function paintTexture(t) {
  const d = img.data;

  const live = ripples.filter(r => t - r.t0 < r.life).map(R => {
    const age = t - R.t0, w = 24 + age * 16, rad = age * R.speed;
    return { x: R.x, y: R.y, rgb: R.rgb, rad, w2: w * w, reach: rad + 3 * w, inner: Math.max(0, rad - 3 * w), k: R.amp * (1 - age / R.life) * 0.2 };
  });
  const mc = mode.g ? COLOR[mode.g] : COLOR['❖'], ma = 0.045 + 0.05 * mode.amt;
  for (let j = 0; j < TH; j++) {
    const y = j * TEX, sy = Math.sin(y * 0.013 + t * 0.041), wy = Math.sin(y * 0.009 - t * 0.05) * 2.1;
    for (let i = 0; i < TW; i++) {
      const x = i * TEX;
      const n = (0.5 + 0.5 * Math.sin(x * 0.011 + t * 0.07 + wy)) * (0.55 + 0.45 * sy);
      let r = mc[0] * n * ma, g = mc[1] * n * ma, b = mc[2] * n * ma;
      for (const R of live) {
        const dx = x - R.x, dy = y - R.y, q = dx * dx + dy * dy;
        if (q > R.reach * R.reach || q < R.inner * R.inner) continue;
        const dd = Math.sqrt(q) - R.rad, v = Math.exp(-(dd * dd) / R.w2) * R.k;
        r += R.rgb[0] * v; g += R.rgb[1] * v; b += R.rgb[2] * v;
      }
      const k = (j * TW + i) * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
    }
  }
  tx.putImageData(img, 0, 0);
}

const hearts = GLYPHS.map(g => ({ g, period: BASE[g], next: now + Math.random() * BASE[g], env: 0 }));
function beatHearts(t, dt) {
  const tempo = streaming ? 0.6 : 1;
  for (const h of hearts) {
    h.env *= Math.exp(-dt * 4.5);
    if (t >= h.next) {
      h.env = 1;
      h.period = t < tunedUntil ? FOURTHS[h.g] : clamp(h.period * (1 + (Math.random() - 0.5) * 0.2), BASE[h.g] * 0.75, BASE[h.g] * 1.32);
      h.next = t + h.period * tempo;
      const at = buttonAt[h.g];
      if (at) ripple(at.x, at.y, COLOR[h.g], 0.6, 190, 2.8);
      spawnGlyph(h.g);
    }
    buttons[h.g].style.setProperty('--beat', h.env.toFixed(3));
  }
}
const heartNow = () => hearts.reduce((s, h) => s + h.env, 0) / 2;

const PAIRS = [['♇', '☍', 47.5], ['♇', '❖', 62.7], ['☍', '❖', 82.5]];
const ALL_THREE = 1567.5;
const FIB = [89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946, 17711, 28657, 46368, 75025];
const FOURTHS = { '♇': 2.5 * 3 / 4, '☍': 2.5, '❖': 2.5 * 4 / 3 };
const GOLD = [241, 203, 150];
let tunedUntil = 0, flash = 0, lastWatched = mem.watched;
const secrets = [];
function together(gs, t, kind) {
  const tempo = streaming ? 0.6 : 1;
  for (const h of hearts) {
    if (!gs.includes(h.g)) continue;
    h.env = 1; h.next = t + h.period * tempo;
    const at = buttonAt[h.g];
    if (at) ripple(at.x, at.y, COLOR[h.g], 0.9, 210, 3.2);
    ripple(core.x, core.y, COLOR[h.g], 0.8, 150 + 40 * gs.indexOf(h.g), 3.6);
    spawnGlyph(h.g); spawnGlyph(h.g);
  }
  secrets.push({ kind, who: gs.join(''), at: Math.round(mem.watched * 10) / 10 });
  if (secrets.length > 60) secrets.shift();
}
function secretBeats(prev, cur, t) {
  if (!(cur > prev)) return;
  const crossed = P => Math.floor(cur / P) > Math.floor(prev / P);
  if (FIB.some(f => f > prev && f <= cur)) {
    for (const h of hearts) h.period = FOURTHS[h.g];
    tunedUntil = t + 9;
    together(GLYPHS, t, 'golden');
    ripple(core.x, core.y, GOLD, 1.6, 110, 6);
    flash = 1;
    return;
  }
  if (crossed(ALL_THREE)) { together(GLYPHS, t, 'all three'); flash = 1; return; }
  for (const [a, b, P] of PAIRS) if (crossed(P)) { together([a, b], t, `pair ${a}${b}`); flash = Math.max(flash, 0.45); }
}

const mode = { g: null, amt: 0, goal: 0, until: 0 };
let hush = 1;
function setMode(g, hold = 18) { mode.g = g; mode.goal = 1; mode.until = now + hold; }
const parts = [];
const MAXP = 380;
function spawn(o) {
  if (parts.length >= MAXP) parts.splice(0, parts.length - MAXP + 1);
  parts.push({ life: 0, max: 7, size: 16, seed: Math.random() * TAU, ...o });
}
function spawnGlyph(g) {
  const a = Math.random() * TAU, s = 30 + Math.random() * 40;
  spawn({ x: core.x + Math.cos(a) * 6, y: core.y + Math.sin(a) * 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ch: g, rgb: COLOR[g], size: 20, max: 6 });
}
function spawnText(text, from, toward, rgb, cap = 10) {
  const chars = [...text].filter(c => c.trim()).slice(0, cap);
  for (const ch of chars) {
    const x = from.x + (Math.random() - 0.5) * (from.w || 10), y = from.y + (Math.random() - 0.5) * (from.h || 10);
    let vx, vy;
    if (toward) { vx = (toward.x - x) * (0.5 + Math.random() * 0.4); vy = (toward.y - y) * (0.5 + Math.random() * 0.4); }
    else { const a = Math.random() * TAU, s = 50 + Math.random() * 90; vx = Math.cos(a) * s; vy = Math.sin(a) * s; }
    spawn({ x, y, vx, vy, ch, rgb, size: 15 + Math.random() * 5, max: 6 + Math.random() * 4 });
  }
}
let pointer = null, lastPointerRipple = 0;
addEventListener('pointermove', e => {
  pointer = { x: e.clientX, y: e.clientY };
  if (now - lastPointerRipple > 0.14 && e.target.closest?.('.field')) { lastPointerRipple = now; ripple(e.clientX, e.clientY, mode.g ? COLOR[mode.g] : COLOR['❖'], 0.25, 140, 1.4); }
}, { passive: true });
addEventListener('pointerleave', () => { pointer = null; });

let mutateAt = 0;
function stepStorm(dt) {
  const k = reduced ? 0.35 : 1, amt = mode.amt, shell = core.r * 0.55;
  if (mode.g === '♇' && now - mutateAt > 0.3) {
    mutateAt = now;
    const src = [...(shownPulse()?.answer || els.words.value || '')].filter(c => c.trim());
    if (src.length) for (let i = 0; i < 6 && parts.length; i++) { const p = parts[(Math.random() * parts.length) | 0]; if (!GLYPHS.includes(p.ch)) p.ch = src[(Math.random() * src.length) | 0]; }
  }
  hush += (1 - hush) * (1 - Math.exp(-dt * 1.8));
  const kk = k * hush;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    if (p.kind && moveKind(p, dt, kk)) { parts.splice(i, 1); continue; }
    if (p.kind) continue;
    const dx = p.x - core.x, dy = p.y - core.y, d = Math.sqrt(dx * dx + dy * dy) + 0.001, ux = dx / d, uy = dy / d;
    let ax = -uy * 16 - ux * (d - shell) * 0.12, ay = ux * 16 - uy * (d - shell) * 0.12;
    if (mode.g === '♇') {
      ax += -uy * 70 * amt + ux * Math.sin(now * 1.7 + p.seed) * 50 * amt;
      ay += ux * 70 * amt + uy * Math.sin(now * 1.7 + p.seed) * 50 * amt;
    } else if (mode.g === '☍') {
      if (dy > -8) ay -= 120 * amt;
      ax += -uy * 24 * amt; ay += ux * 24 * amt;
    } else if (mode.g === '❖') {
      const band = core.r * 0.24, target = Math.max(1, Math.round(d / band)) * band;
      ax -= ux * (d - target) * 1.4 * amt; ay -= uy * (d - target) * 1.4 * amt;
      ax += -uy * 30 * amt; ay += ux * 30 * amt;
    }
    if (pointer) { const px = p.x - pointer.x, py = p.y - pointer.y, pd = px * px + py * py; if (pd < 6400) { ax += px / Math.sqrt(pd + 1) * 160; ay += py / Math.sqrt(pd + 1) * 160; } }
    const damp = Math.exp(-dt * 1.6);
    p.vx = (p.vx + ax * dt) * damp; p.vy = (p.vy + ay * dt) * damp;
    p.x += p.vx * dt * kk; p.y += p.vy * dt * kk;
  }
}

const sprites = new Map();
const GLYPH_FONT = '"DejaVu Serif", "DejaVu Sans", "Noto Sans Symbols2", "Noto Color Emoji", serif';
function spriteOf(ch, rgb, size) {
  const s = Math.round(size), key = `${ch}|${rgb}|${s}`;
  let c = sprites.get(key);
  if (c) return c;
  if (sprites.size > 600) sprites.clear();
  const px = Math.ceil(s * 1.8 * DPR);
  c = document.createElement('canvas'); c.width = c.height = px;
  const x = c.getContext('2d');
  x.font = `${s * DPR}px ${GLYPH_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = `rgba(${rgb},0.85)`; x.shadowBlur = 7 * DPR; x.fillStyle = `rgb(${rgb})`;
  x.fillText(ch, px / 2, px / 2);
  sprites.set(key, c);
  return c;
}
function drawStorm() {
  sx.globalCompositeOperation = 'destination-out';
  sx.fillStyle = `rgba(0,0,0,${reduced ? 0.4 : 0.17})`;
  sx.fillRect(0, 0, W, H);
  sx.fillStyle = 'rgba(0,0,0,0.6)';
  for (const q of quiet) sx.fillRect(q.left - 6, q.top - 6, q.width + 12, q.height + 12);
  sx.globalCompositeOperation = 'source-over';
  const amt = mode.amt, copies = mode.g === '❖' && amt > 0.04 ? 6 : 1;
  const every = copies > 1 ? Math.max(1, Math.ceil(parts.length * (copies - 1) / 540)) : 1;
  let n = 0;
  for (const p of parts) {
    let a = Math.min(1, p.life * 3) * Math.min(1, (p.max - p.life) / 1.5);
    for (const q of quiet) if (p.x > q.left - 6 && p.x < q.right + 6 && p.y > q.top - 6 && p.y < q.bottom + 6) { a *= 0.14; break; }
    if (a <= 0.01) continue;
    const s = spriteOf(p.ch, p.rgb, p.size), w = s.width / DPR, h = s.height / DPR;
    sx.globalAlpha = a; sx.drawImage(s, p.x - w / 2, p.y - h / 2, w, h);
    if (mode.g === '☍' && amt > 0.04) {
      const sh = spriteOf(p.ch, SHADOW, p.size);
      sx.globalAlpha = a * amt * 0.85; sx.drawImage(sh, p.x - w / 2, 2 * core.y - p.y - h / 2, w, h);
    }
    if (copies > 1 && (n++ % every === 0)) {
      const dx = p.x - core.x, dy = p.y - core.y;
      sx.globalAlpha = a * amt * 0.6;
      for (let c = 1; c < copies; c++) {
        const ang = (c * TAU) / copies, cs = Math.cos(ang), sn = Math.sin(ang);
        sx.drawImage(s, core.x + dx * cs - dy * sn - w / 2, core.y + dx * sn + dy * cs - h / 2, w, h);
      }
    }
  }
  sx.globalAlpha = 1;
}

const marks = new Map();
function markOf(p) {
  let m = marks.get(p.t);
  if (m) return m;
  const r = rng(hash(`${p.words}|${p.t}`));
  m = { x: 0.05 + r() * 0.9, y: 0.12 + r() * 0.8, size: 26 + r() * 34, spread: 0.32 + r() * 0.38, twist: (r() - 0.5) * 0.9, k: 5 + Math.floor(r() * 3), rot: r() * TAU, lean: (r() - 0.5) * 0.6 };
  marks.set(p.t, m);
  return m;
}
const depthOf = p => Math.min(DEPTH, 1 + Math.max(0, mem.watched - (Number.isFinite(p.born) ? p.born : 0)) / GROW);
function branch(ctx, x, y, a, len, lvl, full, frac, spread, twist) {
  if (lvl > full || (lvl === full && frac <= 0)) return;
  const L = lvl === full ? len * frac : len, x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
  ctx.moveTo(x, y); ctx.lineTo(x2, y2);
  if (lvl < full) {
    branch(ctx, x2, y2, a - spread + twist * (lvl + 1) * 0.4, len * 0.7, lvl + 1, full, frac, spread, twist);
    branch(ctx, x2, y2, a + spread + twist * (lvl + 1) * 0.4, len * 0.7, lvl + 1, full, frac, spread, twist);
  }
}
function drawMark(ctx, p, depth) {
  const m = markOf(p), x = fieldLeft + m.x * Math.max(120, W - fieldLeft - 24), y = m.y * H, rgb = COLOR[p.glyph];
  const full = Math.floor(depth), frac = depth - full;
  ctx.lineWidth = 1; ctx.lineCap = 'round';
  const tree = (rgbA, flip) => {
    ctx.save(); if (flip) { ctx.translate(0, 2 * y); ctx.scale(1, -1); }
    ctx.strokeStyle = `rgba(${rgbA},0.2)`; ctx.beginPath();
    branch(ctx, x, y, -Math.PI / 2 + m.lean, m.size * 0.55, 0, full, frac, m.spread, p.glyph === '♇' ? m.twist : 0);
    ctx.stroke(); ctx.restore();
  };
  if (p.glyph === '♇') tree(rgb, false);
  else if (p.glyph === '☍') { tree(rgb, false); tree(SHADOW, true); }
  else {
    ctx.strokeStyle = `rgba(${rgb},0.18)`; ctx.beginPath();
    for (let j = 0; j < m.k; j++) branch(ctx, x, y, m.rot + (j * TAU) / m.k, m.size * 0.4, 0, Math.min(full, DEPTH - 2), full >= DEPTH - 2 ? 0 : frac, m.spread * 0.7, 0);
    ctx.stroke();
    if (depth > DEPTH - 1) {
      const ring = m.size * 0.4 * 2.3, close = Math.min(1, depth - (DEPTH - 1));
      ctx.strokeStyle = `rgba(${rgb},0.24)`; ctx.beginPath(); ctx.arc(x, y, ring, m.rot, m.rot + close * TAU); ctx.stroke();
    }
  }
  ctx.font = `${Math.round(m.size * 0.5)}px ${GLYPH_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(${p.glyph === '☍' ? COLOR['☍'] : rgb},0.26)`; ctx.fillText(p.glyph, x, y);
}
let settledCount = -1;
function refreshWall() {
  const done = mem.pulses.filter(p => depthOf(p) >= DEPTH), growing = mem.pulses.filter(p => depthOf(p) < DEPTH);
  if (done.length !== settledCount) { settledDirty = true; settledCount = done.length; }
  if (settledDirty) { stx.clearRect(0, 0, W, H); for (const p of done) drawMark(stx, p, DEPTH); settledDirty = false; wallDirty = true; }
  if (!wallDirty && !growing.length) return;
  wx.clearRect(0, 0, W, H); wx.drawImage(settled, 0, 0, W, H);
  for (const p of growing) drawMark(wx, p, depthOf(p));
  wx.globalCompositeOperation = 'destination-out'; wx.fillStyle = 'rgba(0,0,0,0.92)';
  for (const q of quiet) wx.fillRect(q.left - 8, q.top - 6, q.width + 16, q.height + 12);
  wx.globalCompositeOperation = 'source-over';
  wallDirty = false;
}

const engine = { up: false, models: [], mod: null };
async function initEngine() {
  if (document.body.dataset.engine !== 'local' || !els.model) return renderEngine();
  try {
    engine.mod = await import('./engine.js');
    const d = await engine.mod.models();
    engine.up = d.up;
    engine.models = d.models;
    els.model.replaceChildren(...engine.models.map(m => { const o = document.createElement('option'); o.value = m.name; o.textContent = m.params ? `${m.name} · ${m.params}` : m.name; return o; }));
    const names = engine.models.map(m => m.name);
    els.model.value = names.includes(mem.model) ? mem.model : d.preferred || names[0] || '';
  } catch { engine.up = false; }
  renderEngine();
}
function renderEngine(text) {
  if (!els.state) return;
  els.model.hidden = !engine.up;
  els.state.textContent = text ?? (engine.up || !engine.mod ? '' : engine.mod.asleep);
}
els.model?.addEventListener('change', () => { mem.model = els.model.value; save(); });

let shown = mem.pulses.length - 1, streaming = null, answerDirty = false, answerAt = 0;
const shownPulse = () => mem.pulses[shown] || null;

function inlineMarks(target, text) {
  for (const part of text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/)) {
    if (!part) continue;
    if (/^\*\*.+\*\*$/.test(part)) { const b = document.createElement('strong'); b.textContent = part.slice(2, -2); target.append(b); }
    else if (/^\*.+\*$/.test(part)) { const e = document.createElement('em'); e.textContent = part.slice(1, -1); target.append(e); }
    else target.append(document.createTextNode(part));
  }
}
function paragraphs(text, cls) {
  return text.split(/\n{2,}/).filter(s => s.trim()).map(block => {
    const p = document.createElement('p'); if (cls) p.className = cls;
    block.split('\n').forEach((line, i) => {
      if (i) p.append(document.createElement('br'));
      const head = /^#{1,6}\s+(.*)$/.exec(line), item = /^\s*[*-]\s+(.*)$/.exec(line);
      if (head) { const h = document.createElement('span'); h.className = 'answer-h'; inlineMarks(h, head[1]); p.append(h); }
      else if (item) { p.append('• '); inlineMarks(p, item[1]); }
      else inlineMarks(p, line);
    });
    return p;
  });
}
function render(p) {
  els.answer.hidden = !p;
  if (!p) return;
  const g = document.createElement('span'); g.className = 'g'; g.dataset.glyph = p.glyph; g.textContent = p.glyph;
  const said = p.words.length > 180 ? `${p.words.slice(0, 180)}…` : p.words;
  els.from.replaceChildren(g, document.createTextNode(`${p.looped ? '↻ ' : ''}“`)); inlineMarks(els.from, said.replace(/\s*\n+\s*/g, ' ')); els.from.append('”');
  const live = streaming?.pulse === p;
  const blocks = paragraphs(p.answer);
  if (p.offline && p.glyph === '☍') blocks.push(...paragraphs(p.answer, 'shadow').map(b => { b.setAttribute('aria-hidden', 'true'); return b; }));
  if (live) { const caret = document.createElement('span'); caret.className = 'caret'; caret.textContent = '▍'; (blocks.at(-1) || blocks[blocks.push(document.createElement('p')) - 1]).append(caret); }
  els.text.replaceChildren(...blocks);
  els.sent.hidden = !p.sent;
  if (p.sent) { els.sentSummary.textContent = `→ ${p.model}`; els.sentText.textContent = p.sent; }
  els.pulses.hidden = mem.pulses.length < 2;
  els.at.textContent = `${shown + 1} / ${mem.pulses.length}`;
  els.up.disabled = shown <= 0; els.down.disabled = shown >= mem.pulses.length - 1;
  needMeasure = true;
}
function showPulse(i) {
  if (i < 0 || i >= mem.pulses.length) return;
  shown = i;
  const p = mem.pulses[i];
  render(p);
  setMode(p.glyph, 10);
  spawnText(p.answer, core, null, COLOR[p.glyph], 24);
  ripple(core.x, core.y, COLOR[p.glyph], 1, 240, 2.6);
}
els.up.addEventListener('click', () => showPulse(shown - 1));
els.down.addEventListener('click', () => showPulse(shown + 1));

function setBusy(p) {
  for (const g of GLYPHS) buttons[g].setAttribute('aria-pressed', String(Boolean(p) && p.glyph === g));
  if (els.stop) els.stop.hidden = !p;
  els.answer.setAttribute('aria-busy', String(Boolean(p)));
}
function stop() { streaming?.ctl.abort(); }
els.stop?.addEventListener('click', stop);

async function pulse(g) {
  if (streaming) { const same = streaming.pulse.glyph === g; stop(); if (same) return; }
  let words = els.words.value.trim(), looped = false;
  if (!words) {
    const last = shownPulse() || mem.pulses.at(-1);
    if (last?.answer.trim()) { words = last.answer.trim().slice(0, WORDS_MAX); looped = true; }
    else { els.words.focus(); if (wordsBox) ripple(wordsBox.left + wordsBox.width / 2, wordsBox.top + wordsBox.height / 2, COLOR[g], 0.8); return; }
  }
  const p = { t: Date.now(), glyph: g, words, model: '', answer: '', sent: '', offline: false, looped, born: mem.watched };
  mem.pulses.push(p);
  if (mem.pulses.length > MAX_PULSES) { mem.pulses.splice(0, mem.pulses.length - MAX_PULSES); }
  shown = mem.pulses.length - 1;
  if (!looped) { els.words.value = ''; mem.draft = ''; }
  save();
  setMode(g, 30);
  const at = buttonAt[g];
  if (at) ripple(at.x, at.y, COLOR[g], 1.2, 260, 3);
  if (wordsBox && !looped) spawnText(words, { x: wordsBox.left + wordsBox.width / 2, y: wordsBox.top + wordsBox.height / 2, w: wordsBox.width * 0.8, h: wordsBox.height * 0.6 }, core, [236, 230, 220], 30);
  render(p);
  settledDirty = true;

  if (matchMedia('(max-width: 860px)').matches) { const top = els.core.getBoundingClientRect().top + scrollY - 58; scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' }); needMeasure = true; }
  if (engine.up && els.model?.value) await stream(p);
  else offline(p);
}
for (const g of GLYPHS) buttons[g].addEventListener('click', () => pulse(g));

async function stream(p) {
  const ctl = new AbortController();
  streaming = { ctl, pulse: p, t0: performance.now(), tokens: 0, first: 0 };
  setBusy(p);
  const tick = setInterval(() => { if (streaming?.pulse === p && !streaming.tokens) renderEngine(`… ${((performance.now() - streaming.t0) / 1000).toFixed(0)} s`); }, 500);
  renderEngine('…');
  try {
    for await (const d of engine.mod.pulse({ glyph: p.glyph, words: p.words, model: els.model.value, signal: ctl.signal })) take(p, d);
  } catch (e) {
    if (e.offline) { engine.up = false; clearInterval(tick); streaming = null; setBusy(null); renderEngine(); offline(p); return; }
    if (!ctl.signal.aborted) renderEngine(`the model stopped answering (${e.message || e})`);
  } finally {
    clearInterval(tick);
    if (streaming?.ctl === ctl) { streaming = null; setBusy(null); }
    p.answer = p.answer.slice(0, ANSWER_MAX);
    if (ctl.signal.aborted && !p.answer) p.answer = '■';
    save();
    if (shownPulse() === p) render(p);
    mode.until = now + 16;
  }
}
function take(p, d) {
  if (d.sent != null) { p.sent = d.sent; p.model = d.model; p.src = d.src; }
  if (d.t) {
    const s = streaming;
    if (s && !s.tokens) s.first = performance.now();
    if (s) s.tokens++;
    p.answer += d.t;
    if (shownPulse() === p) answerDirty = true;
    spawnText(d.t, core, null, COLOR[p.glyph], 6);
    ripple(core.x, core.y, COLOR[p.glyph], 0.35, 160, 1.6);
    if (s) { const secs = (performance.now() - s.first) / 1000; renderEngine(`${s.tokens}${secs > 0.5 ? ` · ${(s.tokens / secs).toFixed(1)}/s` : ''}`); }
  }
  if (d.done) {
    p.stats = { tokens: d.tokens, seconds: d.seconds, load: d.load };
    renderEngine(d.tokens && d.seconds ? `${d.tokens} · ${(d.tokens / d.seconds).toFixed(1)}/s${d.load > 1 ? ` · woke in ${d.load.toFixed(1)} s` : ''}` : '');
  }
  if (d.error) renderEngine(String(d.error));
}

function offline(p) {
  const w = p.words.trim();
  if (p.glyph === '♇') {
    const clauses = w.split(/(?<=[.,;:!?—])\s+/).filter(Boolean);
    p.answer = clauses.reverse().map(c => c.replace(/[.,;:!?—]+$/, '').split(/\s+/).reverse().join(' ')).join(' / ');
  } else if (p.glyph === '☍') {
    p.answer = w;
  } else {
    const ws = w.split(/\s+/);
    p.answer = `${ws.join(' ')} ❖ ${[...ws].reverse().join(' ')}`;
  }
  p.offline = true;
  save();
  if (shownPulse() === p) render(p);
  spawnText(p.answer, core, null, COLOR[p.glyph], 30);
  ripple(core.x, core.y, COLOR[p.glyph], 1.2, 220, 3);
  mode.until = now + 16;
}

els.words.value = mem.draft;
let typedLen = els.words.value.length;

const INK = [236, 230, 220];
let lastTyped = '', run = 0;
const boxAt = () => ({ x: wordsBox.right - 30 - Math.random() * 60, y: wordsBox.top + wordsBox.height * (0.3 + Math.random() * 0.4) });
function moveKind(p, dt, k) {
  if (p.kind === 'drop') {
    p.vy += 900 * dt; p.x += p.vx * dt * k; p.y += p.vy * dt * k;
    if (p.y >= p.floor) { ripple(p.x, p.floor, p.rgb, 0.7, 170, 1.8); return true; }
  } else if (p.kind === 'orbit') {
    p.ang += dt * (0.5 + p.val * 0.11) * k;
    p.x = core.x + Math.cos(p.ang) * p.rad; p.y = core.y + Math.sin(p.ang) * p.rad * 0.6;
  } else if (p.kind === 'float') {
    p.y -= 36 * dt * k; p.x += Math.sin(now * 1.3 + p.seed) * 14 * dt * k;
  } else if (p.kind === 'boomerang' || p.kind === 'home') {
    const back = p.kind === 'home' || p.life > p.turn, tx = back ? p.ox : core.x, ty = back ? p.oy : core.y;
    p.vx = (p.vx + (tx - p.x) * 3.4 * dt) * Math.exp(-dt * 2.4); p.vy = (p.vy + (ty - p.y) * 3.4 * dt) * Math.exp(-dt * 2.4);
    p.x += p.vx * dt * k; p.y += p.vy * dt * k;
    if (p.kind === 'home' && Math.hypot(tx - p.x, ty - p.y) < 12) return true;
  } else if (p.kind === 'spark') {
    p.vx *= Math.exp(-dt * 2.6); p.vy *= Math.exp(-dt * 2.6); p.x += p.vx * dt * k; p.y += p.vy * dt * k;
  }
  return false;
}
function throwChar(ch) {
  if (!wordsBox) return;
  const at = boxAt(), tint = mode.g ? COLOR[mode.g] : COLOR['❖'];
  run = ch === lastTyped && /\S/.test(ch) ? run + 1 : 1; lastTyped = ch;
  if (run >= 3) {
    ripple(core.x, core.y, tint, Math.min(2.4, 0.35 * run), 210, 2.2);
    for (let j = 0; j < Math.min(run, 9); j++) { const a = Math.random() * TAU, sp = 90 + run * 12; spawn({ x: core.x, y: core.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ch, rgb: tint, size: 16 + Math.min(run, 12), max: 3.5 }); }
    return;
  }
  if (ch === ' ') return ripple(at.x, at.y, tint, 0.35, 120, 1.2);
  if (ch === '\n') { for (const f of [0.15, 0.5, 0.85]) ripple(wordsBox.left + wordsBox.width * f, wordsBox.bottom, tint, 0.7, 260, 2.2); return; }
  if (GLYPHS.includes(ch)) { setMode(ch, 2.5); ripple(core.x, core.y, COLOR[ch], 1, 230, 2.6); spawnGlyph(ch); spawnGlyph(ch); return; }
  if (ch === ',' || ch === ';' || ch === '—') { hush = 0.22; ripple(at.x, at.y, tint, 0.25, 70, 1.6); return; }
  if (ch === '.') return spawn({ kind: 'drop', x: at.x, y: at.y, vx: (Math.random() - 0.5) * 30, vy: -60, floor: Math.min(H - 28, core.y + core.r * 1.5), ch: '•', rgb: INK, size: 18, max: 4 });
  if (ch === '!') { for (let j = 0; j < 9; j++) { const a = (j / 9) * TAU + Math.random() * 0.3, sp = 260 + Math.random() * 120; spawn({ kind: 'spark', x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ch: j % 3 ? '·' : '!', rgb: COLOR['☍'], size: 16, max: 1.1 }); } return ripple(at.x, at.y, COLOR['☍'], 0.8, 260, 1.4); }
  if (ch === '?') return spawn({ kind: 'boomerang', x: at.x, y: at.y, ox: at.x, oy: at.y, vx: 0, vy: 0, turn: 1.1, ch: '?', rgb: COLOR['♇'], size: 22, max: 3 });
  if (/[0-9]/.test(ch)) { const val = Number(ch); return spawn({ kind: 'orbit', x: at.x, y: at.y, ang: Math.random() * TAU, rad: core.r * (0.35 + val * 0.07), val, ch, rgb: COLOR['❖'], size: 15, max: 14 }); }
  if (/\p{Extended_Pictographic}/u.test(ch)) return spawn({ kind: 'float', x: at.x, y: at.y, vx: 0, vy: 0, ch, rgb: INK, size: 26, max: 6 });
  if (/\p{Lu}/u.test(ch)) { spawnText(ch, { x: at.x, y: at.y, w: 10, h: 10 }, core, INK, 1); const p = parts.at(-1); if (p) { p.size = 26; p.vx *= 1.6; p.vy *= 1.6; } return ripple(core.x, core.y, tint, 0.6, 200, 1.6); }
  spawnText(ch, { x: at.x, y: at.y, w: 24, h: 12 }, core, INK, 1);
  ripple(at.x, at.y, tint, 0.25, 150, 1.2);
}
function pullHome(n) {
  if (!wordsBox) return;
  let pulled = 0;
  for (let i = parts.length - 1; i >= 0 && pulled < n; i--) {
    const p = parts[i];
    if (p.kind || GLYPHS.includes(p.ch)) continue;
    const at = boxAt();
    Object.assign(p, { kind: 'home', ox: at.x, oy: at.y, max: p.life + 1.6 });
    pulled++;
  }
}
els.words.addEventListener('input', () => {
  const v = els.words.value;
  if (v.length > typedLen) {
    const caret = els.words.selectionStart ?? v.length, added = v.slice(Math.max(0, caret - (v.length - typedLen)), caret);
    for (const ch of [...added].filter(c => c !== '\uFE0F').slice(-24)) throwChar(ch);
  } else if (v.length < typedLen) pullHome(Math.min(6, typedLen - v.length));
  typedLen = v.length;
  mem.draft = v.slice(0, WORDS_MAX); saveSoon();
});
els.words.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); pulse(shownPulse()?.glyph || '♇'); }
});
addEventListener('keydown', e => { if (e.key === 'Escape' && streaming) stop(); });

let last = performance.now(), frameN = 0, wallAt = 0, savedAt = 0, cost = 0;
let skip = false;
function frame(ms) {

  if (streaming && (skip = !skip)) { requestAnimationFrame(frame); return; }
  const c0 = performance.now();
  const dt = Math.min(0.05, (ms - last) / 1000); last = ms; now = ms / 1000;
  if (needMeasure) { measureBoxes(); needMeasure = false; }
  if (document.visibilityState === 'visible') mem.watched += dt;
  secretBeats(lastWatched, mem.watched, now); lastWatched = mem.watched;
  flash *= Math.exp(-dt * 1.4);
  beatHearts(now, dt);
  if (!streaming && mode.goal > 0.35 && now > mode.until) mode.goal = 0.35;
  mode.amt += (mode.goal - mode.amt) * (1 - Math.exp(-dt * 1.6));
  stepStorm(dt);
  if (answerDirty && now - answerAt > 0.12) { answerDirty = false; answerAt = now; const p = shownPulse(); if (p) render(p); }
  if (++frameN % 2 === 0 || !img) paintTexture(now);
  if (now - wallAt > 0.5) { wallAt = now; refreshWall(); }
  gx.globalAlpha = 1; gx.drawImage(tex, 0, 0, W + TEX, H + TEX);
  const glow = clamp(0.06 + heartNow() * 0.16 + flash * 0.22 + (streaming ? 0.08 : 0), 0, 0.55), c = mode.g ? COLOR[mode.g] : COLOR['❖'];
  const grad = gx.createRadialGradient(core.x, core.y, 0, core.x, core.y, core.r * 1.3);
  grad.addColorStop(0, `rgba(${c},${glow})`); grad.addColorStop(1, `rgba(${c},0)`);
  gx.fillStyle = grad; gx.fillRect(core.x - core.r * 1.3, core.y - core.r * 1.3, core.r * 2.6, core.r * 2.6);
  gx.drawImage(wall, 0, 0, W, H);
  drawStorm();
  if (now - savedAt > 5) { savedAt = now; save(); }
  cost += (performance.now() - c0 - cost) * 0.05;
  requestAnimationFrame(frame);
}

measure();
measureBoxes();
if (shownPulse()) { render(shownPulse()); mode.g = shownPulse().glyph; mode.goal = 0.35; }
initEngine();
requestAnimationFrame(frame);

window.__reactor = {
  mem: () => mem, engine: () => ({ up: engine.up, models: engine.models, loaded: Boolean(engine.mod) }), parts: () => parts.length, mode: () => ({ g: mode.g, amt: mode.amt }),
  streaming: () => Boolean(streaming), shown: () => shown, pulse, stop, showPulse, hearts: () => hearts.map(h => ({ g: h.g, period: h.period, env: h.env })),
  secrets: () => secrets.slice(), tuned: () => now < tunedUntil, hush: () => hush,
  kinds: () => parts.reduce((m, p) => { const k = p.kind || 'mote'; m[k] = (m[k] || 0) + 1; return m; }, {}),
  depths: () => mem.pulses.map(depthOf), cost: () => cost, core: () => ({ ...core }), watch: s => { mem.watched += s; },
};
