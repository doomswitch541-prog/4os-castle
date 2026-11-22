import { FOLIO_KEY, DRAFT_KEY, JOURNAL_DRAFT_KEY, blankPiece, cleanPiece, readFolio, parseImport, mergeFolio, hash } from './folio.js';
import { Recorder, cleanTrace, replay, CHANNEL_GLYPHS } from './portals/trace.js';
import { buildForm } from './portals/form.js';
import { drawForm, drawChannel, fractalOf } from './portals/draw.js';
import { accessRecord, writeAccess } from './portals/access.js';

const VIEW_KEY = '4os-castle:journal-view:v1';
const $ = id => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

const curve = (a = 1.3 + Math.random() * 1.9, b = 1.3 + Math.random() * 1.9) => t => { const x = Math.pow(clamp(t), a); return x / (x + Math.pow(1 - clamp(t), b)); };
const vary = (ms, spread = 0.4) => ms * (1 - spread / 2 + Math.random() * spread);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const body = document.body, main = $('journal'), canvas = $('field'), ctx = canvas.getContext('2d');
const words = $('words'), entryPanel = $('entry'), resonator = $('resonator');
let W = 0, H = 0, dpr = 1;
let entries = [], oldDraft = null, items = [], folioReadable = true;
let recorder = new Recorder(), draftForm = buildForm({ text: '' }), slot = null, draftTimer = 0;
let mode = 'field', openId = null, deleted = null;
const view = { fractals: true, constellations: true, bright: false };
const lit = new Set();
const cam = { x: 0, y: 0, s: 1, ax: 0, ay: 0 };
let target = { ...cam }, flight = null, spriteQ = 1, groundBox = { l: 0, t: 0, w: 100, h: 100 };
const fx = { energy: 0, blur: 0, warm: 0, calm: 0, insight: 0 };
const pointer = { x: 0, y: 0, here: false };
let drag = null, swallowClick = false;
let raf = 0, lastFrame = 0, lastDraw = 0, dirty = true;
const open = new Set();
const trail = [];
let flash = null;
let shift = null;
const levels = Array.from({ length: 5 }, () => null);
const spark = { i: 0, t: 0, rest: 0 };
const zoom = { k: 1, x: 0, y: 0 };
let ground = null;

let noticeTimer = 0;
function notice(message, hold = 9000) {
  $('notice').textContent = message;
  clearTimeout(noticeTimer);
  if (message && hold) noticeTimer = setTimeout(() => { $('notice').textContent = ''; }, vary(hold, 0.3));
}
const storageFailure = error => notice(`Could not save in this browser: ${error.message}`, 0);
const when = iso => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

function readSaved() {
  try { entries = readFolio(localStorage); folioReadable = true; }
  catch (error) { entries = []; folioReadable = false; notice(`Saved entries left as they are: ${error.message}`, 0); }

  oldDraft = null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const piece = cleanPiece(JSON.parse(raw));
      if (piece.text.trim() && !entries.some(e => e.piece.text === piece.text && e.piece.title === piece.title)) oldDraft = piece;
    }
  } catch { oldDraft = null; }
}
function readJournalDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(JOURNAL_DRAFT_KEY));
    if (!saved || typeof saved.text !== 'string' || !saved.text) return;
    const trace = cleanTrace(saved.trace, saved.text);
    recorder = trace ? new Recorder(trace) : new Recorder(null, saved.text);
    words.value = saved.text;
  } catch {   }
}
function saveJournalDraft() {
  clearTimeout(draftTimer);
  try {
    if (words.value) localStorage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify({ v: 1, text: words.value, trace: recorder.toJSON() }));
    else localStorage.removeItem(JOURNAL_DRAFT_KEY);
  } catch (error) { storageFailure(error); }
}
function commitFolio(update) {
  try {
    const latest = readFolio(localStorage), next = update(latest);
    localStorage.setItem(FOLIO_KEY, JSON.stringify(next));
    entries = next; folioReadable = true;
    return true;
  } catch (error) { storageFailure(error); return false; }
}

function newBreath(b = { pace: 4 + Math.random() * 8, pos: Math.random(), floor: 0 }) {
  b.pace = clamp(b.pace * Math.exp((Math.random() - 0.5) * 0.7), 3.2, 14);
  const roll = Math.random();
  b.len = roll < 0.13 ? 1.7 + Math.random() * 2 : roll < 0.24 ? 14 + Math.random() * 9 : b.pace * (0.6 + Math.random() * 0.9);
  b.share = 0.28 + Math.random() * 0.4; b.depth = 0.5 + Math.random() * 0.5;
  b.from = b.floor; b.floor = Math.random() * 0.2; b.v = b.v ?? 0.4;
  return b;
}
function stepBreath(b, dt) {
  b.pos += dt / b.len;
  if (b.pos >= 1) { b.pos -= 1; newBreath(b); }
  b.v = b.pos < b.share ? lerp(b.from, b.depth, (1 - Math.cos(Math.PI * b.pos / b.share)) / 2) : lerp(b.floor, b.depth, (1 + Math.cos(Math.PI * (b.pos - b.share) / (1 - b.share))) / 2);
}

function snippet(piece) { const t = (piece.title ? `${piece.title} · ` : '') + piece.text.trim().replace(/\s+/g, ' '); return t.length > 72 ? `${t.slice(0, 70)}…` : t; }

function sync(announce = false) {
  const before = new Map(items.map(it => [it.key, it]));
  const list = entries.map(e => ({ id: e.id, savedAt: e.savedAt, piece: e.piece, place: e.place || null, unsaved: false }));
  if (oldDraft) list.push({ id: 'manuscript-draft', savedAt: new Date().toISOString(), piece: oldDraft, place: null, unsaved: true });
  items = list.map(src => {
    const key = `${src.id}|${src.unsaved ? hash(src.piece.text + src.piece.title) : src.savedAt}`, old = before.get(key);
    if (old) { before.delete(key); return Object.assign(old, { place: src.place || (old.unsaved ? old.place : null) }); }
    const form = buildForm(src.piece);
    return { ...src, key, form, r: form.radius, x: 0, y: 0, near: 0, breath: newBreath(), sprite: null, mark: makeMark(src) };
  });
  for (const gone of before.values()) gone.mark.remove();

  const box = $('entries');
  if (items.some((it, i) => box.children[i] !== it.mark)) box.append(...items.map(it => it.mark));
  arrange();
  slot = null;
  if (openId && !items.some(it => it.id === openId)) closeEntry(false);
  $('export-folio').disabled = !entries.length;
  body.classList.toggle('first', !items.length && !words.value);
  refreshAccess(announce);
  retarget();
}

function arrange() {
  const order = [...items].sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
  let prev = null;
  for (const it of order) {
    if (it.place) { it.x = it.place.x; it.y = it.place.y; }
    else if (!prev) { it.x = 0; it.y = 0; }
    else {
      const angle = (hash(it.id) % 6283) / 1000, minutes = Math.max(0, (Date.parse(it.savedAt) - Date.parse(prev.savedAt)) / 60000);
      const far = (prev.r + it.r) * (0.72 + 0.24 * Math.log10(1 + minutes));
      it.x = prev.x + Math.cos(angle) * far; it.y = prev.y + Math.sin(angle) * far;
    }
    prev = it;
  }
  for (let pass = 0; pass < 40; pass++) for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
    const a = order[i], b = order[j], fa = a.place ? 0 : 1, fb = b.place ? 0 : 1;
    if (!fa && !fb) continue;
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    const need = (a.r + b.r) * 0.9;
    if (d >= need) continue;
    if (d < 0.01) { const angle = (hash(b.id) % 6283) / 1000; dx = Math.cos(angle); dy = Math.sin(angle); d = 1; }
    const push = (need - d) / (fa + fb);
    a.x -= dx / d * push * fa; a.y -= dy / d * push * fa; b.x += dx / d * push * fb; b.y += dy / d * push * fb;
  }
}
function clearOf(x, y, r) {
  for (let pass = 0; pass < 40; pass++) for (const it of items) {
    let dx = x - it.x, dy = y - it.y, d = Math.hypot(dx, dy);
    const need = (it.r + r) * 0.92;
    if (d >= need) continue;
    if (d < 0.01) { dx = 1; dy = 0; d = 1; }
    x += dx / d * (need - d); y += dy / d * (need - d);
  }
  return { x, y };
}

function draftSlot() {
  if (slot) return slot;
  const last = [...items].filter(it => !it.unsaved).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0];
  let x = 0, y = 0;
  if (last) {
    const angle = (hash(recorder.t0) % 6283) / 1000, minutes = Math.max(0, (Date.now() - Date.parse(last.savedAt)) / 60000);
    const far = (last.r + 150) * (0.72 + 0.24 * Math.log10(1 + minutes));
    x = last.x + Math.cos(angle) * far; y = last.y + Math.sin(angle) * far;
  }
  slot = clearOf(x, y, 150);
  return slot;
}

function region() {
  const m = main.getBoundingClientRect(), say = $('say').getBoundingClientRect(), wide = W >= 900;

  let l = 16, t = 14, r = W - 16, b = H - 18;
  if (wide) l = say.right - m.left + 24; else t = say.bottom - m.top + 10;
  if (mode === 'open') { const p = entryPanel.getBoundingClientRect(); if (wide) r = p.left - m.left - 24; else b = p.top - m.top - 10; }
  return { l, t, w: Math.max(80, r - l), h: Math.max(80, b - t) };
}
function goal() {
  const g = region(), out = { x: 0, y: 0, s: 1, ax: g.l + g.w / 2, ay: g.t + g.h / 2, right: g.l + g.w };
  const open = mode === 'open' && items.find(it => it.id === openId);
  if (open) {
    const b = open.form.box, fit = Math.min(5, g.w / b.w, g.h / b.h);
    out.s = fit * zoom.k; out.x = zoom.k > 1.001 ? zoom.x : open.x + b.x; out.y = zoom.k > 1.001 ? zoom.y : open.y + b.y;
  }
  else if (mode === 'writing') { const at = draftSlot(), b = draftForm.box; out.x = at.x + b.x; out.y = at.y + b.y; out.s = Math.min(2.2, g.w / Math.max(b.w, 200), g.h / Math.max(b.h, 200)) * (view.fractals ? 0.84 : 1); }
  else if (items.length) {

    const core = it => it.r * 0.88;
    const x0 = Math.min(...items.map(it => it.x - core(it))), x1 = Math.max(...items.map(it => it.x + core(it)));
    const y0 = Math.min(...items.map(it => it.y - core(it))), y1 = Math.max(...items.map(it => it.y + core(it)));
    out.x = (x0 + x1) / 2; out.y = (y0 + y1) / 2; out.s = Math.min(2.4, g.w / (x1 - x0), g.h / (y1 - y0));
    spriteQ = clamp(2 ** (Math.round(Math.log2(out.s * dpr) * 2) / 2), 0.4, 2);
  }
  return out;
}

function retarget(fly = false, spiral = false) {
  target = goal();
  groundBox = body.classList.contains('first') || mode !== 'open' ? region() : groundBox;
  if (reduced.matches || !lastFrame) { Object.assign(cam, target); flight = null; }
  else if (fly) flight = { from: { ...cam }, start: performance.now(), dur: spiral ? vary(2300, 0.5) : vary(1050, 0.6), ease: curve(), wind: spiral ? (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 1.3) : 0 };
  body.classList.toggle('flying', Boolean(flight));
  dirty = true; wake();
}
function stepView(dt, now) {
  if (flight) {
    const t = clamp((now - flight.start) / flight.dur), e = flight.ease(t), f = flight.from, turn = -flight.wind * e;
    const ox = (f.x - target.x) * (1 - e), oy = (f.y - target.y) * (1 - e);
    cam.x = target.x + ox * Math.cos(turn) - oy * Math.sin(turn); cam.y = target.y + ox * Math.sin(turn) + oy * Math.cos(turn);
    cam.s = Math.exp(lerp(Math.log(f.s), Math.log(target.s), e));
    cam.ax = lerp(f.ax, target.ax, e); cam.ay = lerp(f.ay, target.ay, e);
    if (t >= 1) { flight = null; body.classList.remove('flying'); }
    return true;
  }
  let moving = false;
  for (const k of ['x', 'y', 's', 'ax', 'ay']) {
    const d = target[k] - cam[k];
    if (Math.abs(d) > (k === 's' ? 0.0005 : 0.05)) { cam[k] += d * Math.min(1, dt * 3.2); moving = true; } else cam[k] = target[k];
  }
  return moving;
}
const toScreen = (x, y) => ({ x: cam.ax + (x - cam.x) * cam.s, y: cam.ay + (y - cam.y) * cam.s });

function resize() {
  const box = main.getBoundingClientRect();
  W = box.width; H = box.height; dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  retarget();
}
function spriteOf(it, q = spriteQ) {
  const viewKey = `${view.fractals}${view.constellations}${view.bright}`;
  if (it.sprite && it.sprite.q === q && it.sprite.view === viewKey) return it.sprite;
  const R = Math.max(it.r, it.form.lsys ? fractalOf(it.form).reach : 0) + 14, size = Math.ceil(2 * R * q), c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.scale(q, q); x.translate(R, R); x.globalCompositeOperation = 'lighter';
  drawForm(x, it.form, { px: 1 / q, glow: 7 * q, ...view });
  it.sprite = { c, R, q, view: viewKey };
  return it.sprite;
}
function glyphPoints(glyph) {
  const pts = [];
  for (const it of [...items].sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt))) {
    for (const node of it.form.nodes) if (node.glyph === glyph || (node.typed && node.word.includes(glyph))) pts.push({ x: it.x + node.x, y: it.y + node.y });
    for (const b of it.form.breaths) if (b.glyph === glyph) pts.push({ x: it.x + b.x, y: it.y + b.y });
  }
  return pts;
}
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (ground && mode !== 'open') {

    const g = groundBox, b = ground.form.box, gs = Math.min(Math.max(g.w / b.w, g.h / b.h), Math.min(g.w / b.w, g.h / b.h) * 1.22), first = body.classList.contains('first');
    const s = spriteOf(ground, clamp(gs * dpr, 0.5, 2));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (first ? 0.34 + 0.3 * ground.breath.v : mode === 'writing' ? 0.07 : 0.13 + 0.06 * ground.breath.v);
    ctx.drawImage(s.c, g.l + g.w / 2 - (b.x + s.R) * gs, g.t + g.h / 2 - (b.y + s.R) * gs, 2 * s.R * gs, 2 * s.R * gs);
    ctx.globalAlpha = 1;
  }
  ctx.translate(cam.ax, cam.ay); ctx.scale(cam.s, cam.s); ctx.translate(-cam.x, -cam.y);
  ctx.globalCompositeOperation = 'lighter';
  const px = 1 / cam.s;

  const byTime = [...items].filter(it => !it.unsaved).sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
  if (byTime.length > 1 && mode !== 'open') {
    ctx.beginPath();
    for (let i = 0; i < byTime.length - 1; i++) {
      const a = byTime[i], b = byTime[i + 1], ax = a.x + a.form.end.x, ay = a.y + a.form.end.y, bx = b.x + b.form.start.x, by = b.y + b.form.start.y;
      const bow = ((hash(b.id) % 200) / 100 - 1) * 0.28;
      ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2 - (by - ay) * bow, (ay + by) / 2 + (bx - ax) * bow, bx, by);
    }
    ctx.strokeStyle = view.bright ? 'rgba(140,200,240,0.2)' : 'rgba(236,230,220,0.13)'; ctx.lineWidth = px * 0.8; ctx.stroke();
  }
  const amount = shiftAmount();
  for (const it of items) {
    const isOpen = mode === 'open' && it.id === openId;

    let alpha = 0.6 + 0.26 * it.breath.v + 0.5 * it.near;
    if (mode === 'open' && !isOpen) alpha *= 0.1;
    if (mode === 'writing') alpha *= 0.5;
    if (lit.size && ![...lit].some(g => it.form.glyphs[g])) alpha *= 0.45;
    if (it.unsaved) alpha *= 0.7;
    const k = 1 + 0.03 * it.breath.v + 0.05 * it.near, change = changeFor(amount, it.near, it.breath.v);

    if (lit.has('❖') && !isOpen && mode !== 'open') {
      const s = spriteOf(it);
      ctx.save(); ctx.translate(2 * target.x - it.x, it.y); ctx.scale(-1, 1); ctx.globalAlpha = Math.min(1, alpha * 0.55); ctx.drawImage(s.c, -s.R, -s.R, 2 * s.R, 2 * s.R); ctx.restore(); ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.translate(it.x, it.y);
    if (isOpen) {
      const at = sparkAt(it.form), wx = cam.x + (pointer.x - cam.ax) / cam.s - it.x, wy = cam.y + (pointer.y - cam.ay) / cam.s - it.y;
      const live = { x0: cam.x - cam.ax / cam.s - it.x, y0: cam.y - cam.ay / cam.s - it.y, x1: cam.x + (W - cam.ax) / cam.s - it.x, y1: cam.y + (H - cam.ay) / cam.s - it.y, pointer: pointer.here ? { x: wx, y: wy } : null };

      let legend = at ? it.form.nodes[spark.i].phrase : null;
      if (pointer.here) { let best = 70 / cam.s; it.form.phrases.forEach((p, i) => { const n = it.form.nodes[p.from], d = Math.hypot(n.x - wx, n.y - wy); if (d < best) { best = d; legend = i; } }); }
      stamp(change, hash(it.id), a => drawForm(ctx, it.form, { px, glow: 9 * dpr, alpha: a, live: a === 1 ? live : null, legend: a === 1 ? legend : null, legendRight: (target.right - cam.ax) / cam.s + cam.x - it.x, levels: reduced.matches ? null : levels.map(l => l.v), spark: a === 1 ? at : null, maxGlyphs: 700, ...view }));
    } else {
      const s = spriteOf(it);
      stamp(change, hash(it.id), a => { ctx.globalAlpha = Math.min(1, alpha * a); ctx.drawImage(s.c, -s.R * k, -s.R * k, 2 * s.R * k, 2 * s.R * k); ctx.globalAlpha = 1; });
    }
    ctx.restore();
  }
  for (const glyph of lit) drawChannel(ctx, glyphPoints(glyph), glyph, px);

  if (trail.length) {
    const now = performance.now();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = trail.length - 1; i >= 0; i--) {
      const t = trail[i], age = (now - t.born) / t.life;
      if (age >= 1) { trail.splice(i, 1); continue; }
      ctx.font = `${t.size * px * (1 + age * 0.5)}px "DejaVu Sans","Noto Sans Symbols",sans-serif`;
      ctx.fillStyle = `rgba(${Math.round(lerp(90, 241, t.close))},${Math.round(lerp(167, 203, t.close))},${Math.round(lerp(224, 150, t.close))},${((1 - age) ** 1.4 * 0.9).toFixed(3)})`;
      ctx.fillText(t.glyph, t.x + t.dx * age, t.y + t.dy * age);
    }
  }
  if (draftForm.nodes.length && mode !== 'open') {
    const at = draftSlot();
    ctx.save(); ctx.translate(at.x, at.y);

    if (fx.blur > 0.05 && 'filter' in ctx) ctx.filter = `blur(${(fx.blur * dpr).toFixed(2)}px)`;
    stamp(changeFor(amount, fx.energy, 0.35), 7, a => drawForm(ctx, draftForm, { px, glow: 9 * dpr, alpha: a, draft: true, traceText: a === 1, energy: fx.energy, warm: fx.warm, maxGlyphs: 260, ...view }));
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  placeMarks();
}
function placeMarks() {
  for (const it of items) {
    const p = toScreen(it.x, it.y), d = clamp(2 * it.r * cam.s * 0.8, 30, 3000);
    it.mark.style.width = it.mark.style.height = `${d.toFixed(1)}px`;
    it.mark.style.transform = `translate(${(p.x - d / 2).toFixed(1)}px,${(p.y - d / 2).toFixed(1)}px)`;
    it.mark.hidden = mode === 'open' && it.id === openId;
  }
  const open = mode === 'open' && items.find(it => it.id === openId);
  if (open) for (const node of $('nodes').children) {
    const p = toScreen(open.x + Number(node.dataset.x), open.y + Number(node.dataset.y));
    node.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
  }
  if (!resonator.hidden) {
    const at = draftSlot(), p = toScreen(at.x + draftForm.end.x, at.y + draftForm.end.y);
    resonator.style.transform = `translate(${clamp(p.x, 40, W - 40).toFixed(1)}px,${clamp(p.y, 40, H - 40).toFixed(1)}px)`;
  }
}

const MESSAGES = {
  '♇': 'watch it break apart, twist, and rebuild as they engage. 🔮',
  '☍': 'balancing dualities visually AND energetically. 🌗',
  '♃': 'the contraction/expansion cycle of existence (thanks, ♃)',
  '❖': 'creates a moment of harmonic resonance in the design itself.',
  '⛬': 'glowing threads/glyph trails that shift hues or currents with touch and proximity. 🔮⛬♇',
};
function triggerShift(glyph, flip = false) {
  if (glyph === '☍' && flip) setPolarity(!view.bright);
  if (reduced.matches) return;
  shift = { glyph, start: performance.now(), dur: vary(2400, 0.7), shape: 0.55 + Math.random() * 0.8 };
  wake();
}
function shiftAmount() {
  if (!shift) return 0;
  const t = (performance.now() - shift.start) / shift.dur;
  if (t >= 1) { shift = null; return 0; }
  return Math.sin(Math.PI * Math.pow(t, shift.shape));
}

function changeFor(amount, near, breath) {
  const is = g => (shift && shift.glyph === g ? amount : 0);
  return {
    split: Math.max(is('♇'), lit.has('♇') ? near : 0),
    swell: is('♃') * 0.24 + (lit.has('♃') ? (breath - 0.35) * 0.34 : 0),
    mirror: Math.max(is('❖'), lit.has('❖') ? 0.55 : 0),
    three: is('⛬'),
    lean: is('☍') * 0.12,
  };
}

function stamp(c, seed, paint) {
  const side = seed % 2 ? 1 : -1;
  ctx.save();
  if (c.swell) ctx.scale(1 + c.swell, 1 + c.swell);
  if (c.lean) ctx.rotate(side * c.lean);
  if (c.split > 0.004) {
    for (const half of [1, -1]) { ctx.save(); ctx.rotate(half * side * c.split * 0.9); ctx.translate(half * c.split * 34, half * side * c.split * 12); paint(half === 1 ? 1 : 0.35 + 0.6 * c.split); ctx.restore(); }
  } else paint(1);
  if (c.mirror > 0.004) { ctx.save(); ctx.scale(-1, 1); paint(0.999 * c.mirror); ctx.restore(); }
  if (c.three > 0.004) for (const third of [1, 2]) { ctx.save(); ctx.rotate(third * Math.PI * 2 / 3); paint(0.8 * c.three); ctx.restore(); }
  ctx.restore();
}

function setPolarity(bright) {
  view.bright = bright;
  body.dataset.polarity = bright ? 'crystal' : 'shadow';
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch {   }
  const b = document.querySelector('.channel[data-glyph="☍"]');
  if (open.has('☍')) { b.setAttribute('aria-pressed', String(bright)); if (bright) lit.add('☍'); else lit.delete('☍'); }
  notice(bright ? 'vibrant crystal-bright modes' : 'shadow tones', 4000);
  dirty = true; wake();
}

function sparkAt(form) {
  if (reduced.matches || form.nodes.length < 2 || spark.rest > 0) return null;
  const a = form.nodes[spark.i], b = form.nodes[spark.i + 1];
  if (!a || !b) return null;
  return { x: lerp(a.x, b.x, spark.t), y: lerp(a.y, b.y, spark.t) };
}
function stepSpark(form, dt) {
  if (spark.rest > 0) { spark.rest -= dt; return; }
  const next = form.nodes[spark.i + 1];
  if (!next) { spark.i = 0; spark.t = 0; spark.rest = 1.5 + Math.random() * 4; return; }
  spark.t += dt * 1000 / (clamp(next.pause, 90, 2600) * 0.55);
  if (spark.t >= 1) { spark.t = 0; spark.i++; }
}

function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  let moving = stepView(dt, now);
  const ambient = !reduced.matches && (items.length > 0 || Boolean(ground));
  const openForm = mode === 'open' && items.find(it => it.id === openId)?.form;
  if (!reduced.matches && ground) stepBreath(ground.breath, dt);
  if (ambient && openForm) { for (const l of levels) stepBreath(l, dt); stepSpark(openForm, dt); }
  if (shift || trail.length) moving = true;

  if (!reduced.matches) for (const c of channels) { stepBreath(c.breath, dt); const v = c.breath.v.toFixed(2); if (v !== c.shown) { c.shown = v; c.button.style.setProperty('--glow', v); } }
  if (flash) {
    const t = (now - flash.start) / flash.dur;
    body.style.setProperty('--flash', t >= 1 ? '0' : (Math.sin(Math.PI * Math.pow(t, flash.shape)) * 0.9).toFixed(3));
    if (t >= 1) flash = null; else moving = true;
  }
  for (const it of items) {
    if (ambient) stepBreath(it.breath, dt);
    const p = toScreen(it.x, it.y), want = pointer.here && !drag ? clamp(1.2 - Math.hypot(pointer.x - p.x, pointer.y - p.y) / Math.max(30, it.r * cam.s)) : 0;
    const next = reduced.matches ? want : it.near + (want - it.near) * Math.min(1, dt * 7);
    if (Math.abs(next - it.near) > 0.002) { it.near = next; moving = true; }
  }

  if (fx.energy > 0.004) { fx.energy *= Math.exp(-dt * 2.6); moving = true; } else fx.energy = 0;
  const wantBlur = resonator.hidden ? 0 : hold.on ? 1.8 * Math.exp(-(now - hold.start) / 1500) : hold.done ? 0 : 1.8;
  const wantWarm = hold.on ? 1 - Math.exp(-(now - hold.start) / 2600) : 0;
  if (Math.abs(wantBlur - fx.blur) > 0.01 || Math.abs(wantWarm - fx.warm) > 0.01) { fx.blur += (wantBlur - fx.blur) * Math.min(1, dt * 2.4); fx.warm += (wantWarm - fx.warm) * Math.min(1, dt * 1.6); moving = true; }
  if (hold.on) { stepHold(now); moving = true; } else if (hold.falling) moving = stepHold(now) || moving;
  moving = stepColour(dt) || moving;
  const energy = fx.energy.toFixed(2);
  if (energy !== fx.shown) { fx.shown = energy; body.style.setProperty('--energy', energy); }
  if (dirty || moving || (ambient && now - lastDraw > (openForm ? 30 : 40))) { draw(); lastDraw = now; dirty = false; }
  if (moving || ambient || !reduced.matches) wake();
}

function stepColour(dt) {
  const open = mode === 'open' && items.find(it => it.id === openId);
  let mood = 0.5, strength = 0.35;
  if (open) { mood = open.form.mood; strength = 1; }
  else if (mode === 'writing') { mood = clamp(draftForm.mood + fx.warm * 0.5); strength = 0.8; }
  else if (items.length) { mood = items.reduce((s, it) => s + it.form.mood, 0) / items.length; strength = 0.6; }
  const calm = (1 - mood) * strength, insight = mood * strength;
  if (Math.abs(calm - fx.calm) < 0.004 && Math.abs(insight - fx.insight) < 0.004) return false;
  const k = reduced.matches ? 1 : Math.min(1, dt * 1.1);
  fx.calm += (calm - fx.calm) * k; fx.insight += (insight - fx.insight) * k;
  body.style.setProperty('--calm', fx.calm.toFixed(3)); body.style.setProperty('--insight', fx.insight.toFixed(3));
  return true;
}

function makeMark(src) {
  const mark = document.createElement('button'), label = document.createElement('span');
  mark.type = 'button'; mark.className = 'entry-mark';
  label.textContent = snippet(src.piece);
  mark.append(label);
  const mine = () => items.find(it => it.mark === mark);

  mark.addEventListener('pointerdown', e => {
    if (e.button) return;
    const it = mine(); if (!it) return;
    drag = { it, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false };
    mark.setPointerCapture(e.pointerId);
  });
  mark.addEventListener('pointermove', e => {
    if (!drag || drag.it.mark !== mark) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true; mark.classList.add('dragging');
    drag.it.x = drag.ox + dx / cam.s; drag.it.y = drag.oy + dy / cam.s;
    drag.it.place = { x: drag.it.x, y: drag.it.y };
    dirty = true; wake();
  });
  const drop = () => {
    if (!drag || drag.it.mark !== mark) return;
    const it = drag.it, moved = drag.moved;
    drag = null; mark.classList.remove('dragging');
    if (moved) { swallowClick = true; setTimeout(() => { swallowClick = false; }, 0); keepPlace(it); }
  };
  mark.addEventListener('pointerup', drop); mark.addEventListener('pointercancel', drop);
  mark.addEventListener('click', () => { const it = mine(); if (it && !swallowClick) openEntry(it.id); });
  mark.addEventListener('keydown', e => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key], it = mine();
    if (!step || !e.shiftKey || !it) return;
    e.preventDefault();
    it.x += step[0] * 24 / cam.s; it.y += step[1] * 24 / cam.s; it.place = { x: it.x, y: it.y };
    keepPlace(it);
  });
  return mark;
}
function keepPlace(it) {
  const place = { x: Math.round(it.x), y: Math.round(it.y) };
  it.place = place;
  if (!it.unsaved) commitFolio(latest => latest.map(e => (e.id === it.id ? { ...e, place } : e)));
  if (mode === 'field') retarget(true); else { dirty = true; wake(); }
}

function openEntry(id) {
  const it = items.find(item => item.id === id);
  if (!it) return;
  hideResonator();
  mode = 'open'; openId = id; body.classList.add('open');
  zoom.k = 1; spark.i = 0; spark.t = 0; spark.rest = 2.4 + Math.random() * 1.5;
  $('entry-time').textContent = it.unsaved ? '' : when(it.savedAt);
  if (it.unsaved) $('entry-time').removeAttribute('datetime'); else $('entry-time').dateTime = it.savedAt;
  $('entry-title').textContent = it.piece.title; $('entry-title').hidden = !it.piece.title;
  $('entry-text').textContent = it.piece.text;

  const traces = $('entry-traces'), mark = document.createElement('span');
  mark.textContent = '♇'; traces.replaceChildren(mark);
  for (const g of it.form.ghosts) { const del = document.createElement('del'); del.textContent = g.text; traces.append(' ', del); }
  traces.hidden = !it.form.ghosts.length;
  $('entry-keep').hidden = !it.unsaved; $('entry-delete').hidden = it.unsaved;
  entryPanel.hidden = false;
  buildNodes(it);
  retarget(true, true);
  entryPanel.focus({ preventScroll: true });
}
function closeEntry(focusBack = true) {
  const it = items.find(item => item.id === openId);
  mode = words.value ? 'writing' : 'field'; openId = null; zoom.k = 1; body.classList.remove('open');
  entryPanel.hidden = true; $('nodes').replaceChildren(); $('phrase').hidden = true;
  retarget(true);
  if (focusBack && it) { it.mark.hidden = false; it.mark.focus({ preventScroll: true }); }
}

function buildNodes(it) {
  const box = $('nodes'); box.replaceChildren();
  it.form.phrases.forEach((p, i) => {
    const node = it.form.nodes[p.from], b = document.createElement('button');
    b.type = 'button'; b.className = 'node'; b.tabIndex = i ? -1 : 0;
    b.dataset.x = node.x; b.dataset.y = node.y;
    b.setAttribute('aria-label', p.text.length > 240 ? `${p.text.slice(0, 238)}…` : p.text);
    const show = () => { const s = $('phrase'); s.textContent = p.text; s.hidden = false; const at = toScreen(it.x + node.x, it.y + node.y); s.style.transform = `translate(${clamp(at.x + 18, 8, Math.max(8, W - 300)).toFixed(0)}px,${clamp(at.y + 16, 8, H - 60).toFixed(0)}px)`; };
    const hide = () => { if (document.activeElement !== b) $('phrase').hidden = true; };
    b.addEventListener('focus', show); b.addEventListener('pointerenter', show);
    b.addEventListener('blur', () => { $('phrase').hidden = true; }); b.addEventListener('pointerleave', hide);
    b.addEventListener('keydown', e => {
      const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? b.nextElementSibling : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? b.previousElementSibling : null;
      if (next && next.classList.contains('node')) { e.preventDefault(); next.focus(); }
    });
    box.append(b);
  });
  for (const g of it.form.ghosts) {
    const del = document.createElement('del'); del.className = 'trace'; del.textContent = g.text.length > 40 ? `${g.text.slice(0, 39)}…` : g.text;
    del.dataset.x = g.x; del.dataset.y = g.y; if (g.x < it.form.nodes[g.at].x) del.classList.add('left');
    box.append(del);
  }
}

const channels = [...document.querySelectorAll('.channel')].map(button => ({ button, glyph: button.dataset.glyph, breath: newBreath() }));
const CLOSED = 'hover over or type something specific to unlock a visual “shift”';
function refreshAccess(announce) {
  const record = accessRecord(items.filter(it => !it.unsaved).map(it => ({ savedAt: it.savedAt, form: it.form })));
  let fresh = [];
  try { if (folioReadable) fresh = writeAccess(localStorage, record); } catch (error) { storageFailure(error); }
  open.clear();
  for (const c of channels) {
    const isOpen = record.channels.includes(c.glyph);
    if (isOpen) open.add(c.glyph);
    c.button.dataset.open = String(isOpen);

    c.button.setAttribute('aria-describedby', isOpen ? 'say-access' : 'channel-closed');
    if (!isOpen && lit.delete(c.glyph)) c.button.setAttribute('aria-pressed', 'false');
  }
  if (view.bright && open.has('☍')) { lit.add('☍'); document.querySelector('.channel[data-glyph="☍"]').setAttribute('aria-pressed', 'true'); }
  $('say-access').classList.toggle('lit', open.size > 0);
  if (announce && fresh.length) opened(fresh);
  return fresh;
}

function opened(fresh) {
  notice(`ACCESS to resonance channels. ${fresh.join(' ')} ${MESSAGES[fresh[0]]}`, 12000);
  for (const c of channels) if (fresh.includes(c.glyph)) { c.button.classList.add('opening'); setTimeout(() => c.button.classList.remove('opening'), vary(5200, 0.4)); }
  if (!reduced.matches) flash = { start: performance.now(), dur: vary(3600, 0.5), shape: 0.4 + Math.random() * 0.5 };
  triggerShift(fresh[0]);
}

for (const c of channels) {
  const g = c.glyph, b = c.button;
  b.addEventListener('click', () => {
    if (!open.has(g)) {
      notice(`${g} ${CLOSED}`, 9000);
      triggerShift(g);
      $('say-log').classList.add('called'); setTimeout(() => $('say-log').classList.remove('called'), vary(4200, 0.4));
      return;
    }
    if (g === '☍') { setPolarity(!view.bright); triggerShift(g); notice(`${MESSAGES[g]} ${view.bright ? 'vibrant crystal-bright modes' : 'shadow tones'}`, 9000); return; }
    const on = !lit.has(g);
    if (on) lit.add(g); else lit.delete(g);
    b.setAttribute('aria-pressed', String(on));
    triggerShift(g);
    if (on) notice(MESSAGES[g], 9000);
    dirty = true; wake();
  });
  b.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch' && !shift) triggerShift(g); });
  b.addEventListener('focus', () => { if (!open.has(g)) notice(`${g} ${CLOSED}`, 7000); });
}

function fitWriter() {
  words.style.height = 'auto';
  words.style.height = `${Math.min(words.scrollHeight, Math.round(H * (W >= 900 ? 0.3 : 0.2)))}px`;
}
function draftChanged(fly = false) {
  draftForm = buildForm({ text: words.value, trace: recorder.text === words.value ? recorder.toJSON() : null });
  $('weave').disabled = !words.value.trim();
  body.classList.toggle('first', !items.length && !words.value);
  body.dataset.draftNodes = draftForm.nodes.length; body.dataset.draftPhrases = draftForm.phrases.length;
  fitWriter();
  if (mode === 'open' && words.value) closeEntry(false);
  const next = mode === 'open' ? 'open' : words.value ? 'writing' : 'field';
  const changed = next !== mode; mode = next;
  retarget(changed || fly);
}
words.addEventListener('input', () => {
  const change = recorder.input(words.value, performance.now());
  const typed = change && CHANNEL_GLYPHS.find(g => change.ins.includes(g));
  const had = { ...draftForm.glyphs };
  if (!words.value) { recorder = new Recorder(); slot = null; }
  fx.energy = Math.min(1, fx.energy + 0.24);
  draftChanged();

  const earned = typed || CHANNEL_GLYPHS.find(g => (draftForm.glyphs[g] || 0) > (had[g] || 0));
  if (earned && !shift) triggerShift(earned, typed === '☍' && open.has('☍'));
  armResonator();
  clearTimeout(draftTimer); draftTimer = setTimeout(saveJournalDraft, 300);
});

for (const key of document.querySelectorAll('.glyph-key')) key.addEventListener('click', () => {
  words.setRangeText(key.dataset.insert, words.selectionStart, words.selectionEnd, 'end');
  words.focus();
  words.dispatchEvent(new Event('input'));
});

function weave() {
  const text = words.value;
  if (!text.trim()) return;
  const piece = { ...blankPiece(), text };
  let trace = null;
  try { const record = recorder.toJSON(); if (replay(record) === text) trace = record; } catch { trace = null; }
  if (trace) piece.trace = trace;
  const form = buildForm(piece), at = draftSlot(), place = clearOf(at.x, at.y, form.radius);
  const entry = { id: newId(), savedAt: new Date().toISOString(), piece, place: { x: Math.round(place.x), y: Math.round(place.y) } };
  if (!commitFolio(latest => [entry, ...latest])) return;
  hideResonator(); clearTimeout(resTimer);
  words.value = ''; recorder = new Recorder(); slot = null; saveJournalDraft();
  draftForm = buildForm({ text: '' }); $('weave').disabled = true; fitWriter();
  mode = 'field';
  notice('“weave back” 💫', 4000);
  sync(true);
  retarget(true);
}
$('weave').addEventListener('click', weave);
$('say-weave').addEventListener('click', () => { if (words.value.trim()) weave(); else words.focus(); });
$('say-log').addEventListener('click', () => words.focus());
words.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); weave(); } });

function setView(key, other) {
  view[key] = !view[key];
  if (!view[key] && !view[other]) view[other] = true;
  $('say-fractals').setAttribute('aria-pressed', String(view.fractals)); $('say-constellations').setAttribute('aria-pressed', String(view.constellations));
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch {   }
  dirty = true; wake();
}
$('say-fractals').addEventListener('click', () => setView('fractals', 'constellations'));
$('say-constellations').addEventListener('click', () => setView('constellations', 'fractals'));

const hold = { on: false, start: 0, falling: false, fallStart: 0, fallFrom: 0, fallDur: 1, done: false, glyph: '❖' };
let resTimer = 0, resFrom = 0;
function armResonator() {
  clearTimeout(resTimer); hideResonator();
  if (!words.value.trim()) return;

  resTimer = setTimeout(showResonator, clamp(draftForm.medianSpeed * 16, 2600, 6500) * (0.85 + Math.random() * 0.5));
}
function showResonator() {
  if (document.activeElement !== words || mode !== 'writing' || !draftForm.nodes.length) return;

  const e = recorder.e, since = [];
  for (let i = resFrom * 4; i < e.length; i += 4) since.push({ gap: e[i], del: e[i + 2] });
  const lastGaps = since.slice(-12).map(x => x.gap), mean = lastGaps.reduce((s, v) => s + v, 0) / (lastGaps.length || 1);
  hold.glyph = since.some(x => x.del.trim()) ? '♇' : lastGaps.length >= 12 && mean < draftForm.medianSpeed * 1.1 ? '♃' : draftForm.longestPause < 2600 ? '☍' : '❖';
  resFrom = recorder.events;
  hold.done = false; hold.on = false; hold.falling = false;
  $('resonator-glyph').textContent = hold.glyph;
  resonator.style.setProperty('--breath', '0');
  resonator.hidden = false;
  dirty = true; wake();
}
function hideResonator() { if (resonator.hidden) return; if (hold.on) endHold(); resonator.hidden = true; hold.falling = false; dirty = true; wake(); }
function startHold() { if (hold.on || resonator.hidden) return; hold.on = true; hold.falling = false; hold.start = performance.now(); wake(); }
function endHold() {
  if (!hold.on) return;
  const now = performance.now(), ms = now - hold.start;
  hold.on = false; hold.falling = true; hold.fallStart = now; hold.fallFrom = 1 - Math.exp(-ms / 2400); hold.fallDur = clamp(ms * 0.85, 500, 9000);
  if (ms >= 400) {
    recorder.breath(hold.glyph, ms); hold.done = true;
    draftForm = buildForm({ text: words.value, trace: recorder.text === words.value ? recorder.toJSON() : null });
    saveJournalDraft();
  }
  dirty = true; wake();
}
function stepHold(now) {
  let v;
  if (hold.on) v = 1 - Math.exp(-(now - hold.start) / 2400);
  else { const t = clamp((now - hold.fallStart) / hold.fallDur); v = hold.fallFrom * (1 - t) ** 1.7; if (t >= 1) hold.falling = false; }
  resonator.style.setProperty('--breath', v.toFixed(3));
  return hold.on || hold.falling;
}
resonator.addEventListener('pointerdown', e => { e.preventDefault(); resonator.setPointerCapture(e.pointerId); startHold(); });
resonator.addEventListener('pointerup', endHold); resonator.addEventListener('pointercancel', endHold);
resonator.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); } else if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
resonator.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); endHold(); } });
resonator.addEventListener('blur', endHold);
words.addEventListener('focus', () => { if (words.value.trim() && resonator.hidden) armResonator(); });

$('entry-close').addEventListener('click', () => closeEntry());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && mode === 'open') closeEntry(); });
$('entry-delete').addEventListener('click', () => {
  const entry = entries.find(e => e.id === openId);
  if (!entry || !commitFolio(latest => latest.filter(e => e.id !== entry.id))) return;
  deleted = entry;
  closeEntry(false); sync();
  $('restore-entry').hidden = false; notice('delete', 0);
  $('restore-entry').focus({ preventScroll: true });
});
$('restore-entry').addEventListener('click', () => {
  if (!deleted || !commitFolio(latest => mergeFolio(latest, [deleted], newId))) return;
  deleted = null; $('restore-entry').hidden = true; notice('undo ↶', 3000);
  sync();
});

$('entry-keep').addEventListener('click', () => {
  const it = items.find(item => item.id === openId);
  if (!it || !it.unsaved) return;
  const entry = { id: newId(), savedAt: new Date().toISOString(), piece: it.piece, place: { x: Math.round(it.x), y: Math.round(it.y) } };
  if (!commitFolio(latest => [entry, ...latest])) return;
  closeEntry(false); readSaved();
  notice('“weave back” 💫', 4000);
  sync(true);
});
$('export-folio').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ format: '4os-castle-folio', version: 1, entries }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = '4os-castle-folio.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  notice('export ↓', 3000);
});
$('import-folio').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async () => {
  const file = $('import-file').files[0];
  if (!file) return;
  try {
    if (file.size > 6000000) throw new Error('Choose a folio smaller than 6 MB.');
    const incoming = parseImport(await file.text());
    let count = 0;
    if (commitFolio(latest => { const merged = mergeFolio(latest, incoming, newId); count = merged.length - latest.length; return merged; })) {
      readSaved(); sync(true);
      if (!$('notice').textContent.startsWith('ACCESS') || !count) notice(`import ↑ ${count}`, 6000);
    }
  } catch (error) { notice(`Could not import: ${error.message}`, 0); }
  finally { $('import-file').value = ''; }
});

main.addEventListener('pointermove', e => {
  const m = main.getBoundingClientRect(), x = e.clientX - m.left, y = e.clientY - m.top, moved = Math.hypot(x - pointer.x, y - pointer.y);
  pointer.x = x; pointer.y = y; pointer.here = e.pointerType !== 'touch';
  if (lit.has('⛬') && items.length && !reduced.matches && (pointer.gone = (pointer.gone || 0) + moved) > 26 && trail.length < 140) {
    pointer.gone = 0;
    const wx = cam.x + (x - cam.ax) / cam.s, wy = cam.y + (y - cam.ay) / cam.s;
    const nearest = items.reduce((a, b) => (Math.hypot(b.x - wx, b.y - wy) - b.r < Math.hypot(a.x - wx, a.y - wy) - a.r ? b : a));
    const anchors = nearest.form.anchors, far = Math.hypot(nearest.x - wx, nearest.y - wy) / Math.max(1, nearest.r);
    trail.push({ x: wx, y: wy, dx: (Math.random() - 0.5) * 30 / cam.s, dy: (Math.random() - 0.7) * 34 / cam.s, born: performance.now(), life: vary(2600, 1.1), size: 11 + Math.random() * 9, close: clamp(1.4 - far), glyph: anchors.length ? anchors[Math.floor(Math.random() * anchors.length)].sym : '⛬' });
  }
  wake();
});
main.addEventListener('pointerleave', () => { pointer.here = false; wake(); });

function zoomBy(factor, px, py) {
  const it = mode === 'open' && items.find(item => item.id === openId);
  if (!it) return;
  const base = target.s / zoom.k, k = clamp(zoom.k * factor, 1, 60), wx = target.x + (px - target.ax) / target.s, wy = target.y + (py - target.ay) / target.s;
  zoom.k = k; zoom.x = wx - (px - target.ax) / (base * k); zoom.y = wy - (py - target.ay) / (base * k);
  flight = null; body.classList.remove('flying');
  target = goal(); dirty = true; wake();
}
main.addEventListener('wheel', e => {
  if (mode !== 'open' || e.target.closest('.entry')) return;
  e.preventDefault();
  const m = main.getBoundingClientRect();
  zoomBy(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016)), e.clientX - m.left, e.clientY - m.top);
}, { passive: false });
document.addEventListener('keydown', e => {
  if (mode !== 'open' || e.target === words || e.ctrlKey || e.metaKey) return;
  if (e.key === '+' || e.key === '=') zoomBy(1.5, target.ax, target.ay);
  else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.5, target.ax, target.ay);
  else if (e.key === '0') zoomBy(0, target.ax, target.ay);
});
window.addEventListener('storage', e => { if (e.key === FOLIO_KEY) { readSaved(); sync(); } });
window.addEventListener('pagehide', saveJournalDraft);
window.addEventListener('resize', () => { resize(); fitWriter(); retarget(); });
document.addEventListener('visibilitychange', () => { lastFrame = 0; wake(); });
reduced.addEventListener('change', () => { dirty = true; wake(); });

try { const saved = JSON.parse(localStorage.getItem(VIEW_KEY)); if (saved) { view.bright = saved.bright === true; if ((saved.fractals === false) !== (saved.constellations === false)) { view.fractals = saved.fractals !== false; view.constellations = saved.constellations !== false; } } } catch {   }
$('say-fractals').setAttribute('aria-pressed', String(view.fractals)); $('say-constellations').setAttribute('aria-pressed', String(view.constellations));
for (let i = 0; i < levels.length; i++) levels[i] = newBreath();
if (view.bright) body.dataset.polarity = 'crystal';
{ const form = buildForm({ text: $('line').textContent }); ground = { id: '4o', form, r: form.radius, sprite: null, breath: newBreath() }; }
readSaved();
readJournalDraft();
resize();
sync();
if (words.value) { mode = 'writing'; draftChanged(); } else fitWriter();
retarget();
wake();

{
  const make = (cls, text) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; return b; };
  const actions = entryPanel.querySelector('.entry-actions');
  const prev = make('entry-step', '↑'), next = make('entry-step', '↓'), read = make('entry-step entry-read', '▶');
  actions.prepend(prev, next, read);
  const corner = document.createElement('div'); corner.className = 'entry-steps';
  const first = make('entry-step', '↓'), readAll = make('entry-step entry-read', '▶');
  first.setAttribute('aria-label', 'newest entry');
  corner.append(first, readAll);
  $('journal').append(corner);
  const indexOpen = () => items.findIndex(it => it.id === openId);
  const named = it => (it ? (it.piece.title || it.piece.text).slice(0, 80) : '');
  let timer = 0;
  const vary = (ms, spread = 0.5) => ms * (1 - spread / 2 + Math.random() * spread);
  function refresh() {
    const i = indexOpen(), open = mode === 'open' && i >= 0;
    corner.hidden = open || !items.length;
    prev.disabled = !open || i <= 0; next.disabled = !open || i >= items.length - 1;

    prev.setAttribute('aria-label', 'previous entry'); prev.setAttribute('aria-description', open && i > 0 ? named(items[i - 1]) : '');
    next.setAttribute('aria-label', 'next entry'); next.setAttribute('aria-description', open && i < items.length - 1 ? named(items[i + 1]) : '');
    for (const b of [read, readAll]) { b.textContent = timer ? 'Ⅱ' : '▶'; b.setAttribute('aria-pressed', String(Boolean(timer))); b.setAttribute('aria-label', timer ? 'stop' : 'read through'); }
  }
  const openAt = i => { if (items[i]) { openEntry(items[i].id); refresh(); } };
  prev.addEventListener('click', () => openAt(indexOpen() - 1));
  next.addEventListener('click', () => openAt(indexOpen() + 1));
  first.addEventListener('click', () => openAt(0));
  const stop = () => { clearTimeout(timer); timer = 0; refresh(); };
  const readFor = it => vary(Math.min(14000, Math.max(3200, 1400 + it.piece.text.length * 45)));
  function step() {
    const i = indexOpen();
    if (i >= items.length - 1) return stop();
    openAt(i + 1);
    timer = setTimeout(step, readFor(items[i + 1]));
    refresh();
  }
  for (const b of [read, readAll]) b.addEventListener('click', () => {
    if (timer) return stop();
    if (mode !== 'open' || indexOpen() < 0) openAt(0);
    timer = setTimeout(step, readFor(items[indexOpen()] || items[0]));
    refresh();
  });
  const own = e => e.target?.closest?.('.entry-read');
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, e => { if (timer && !own(e)) stop(); }, { capture: true, passive: true });
  for (const type of ['wheel', 'touchstart']) addEventListener(type, () => { if (timer) stop(); }, { capture: true, passive: true });

  new MutationObserver(refresh).observe(entryPanel, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(refresh).observe($('entries'), { childList: true });
  window.__portalSteps = { reading: () => Boolean(timer), open: () => indexOpen() };
  refresh();
}
