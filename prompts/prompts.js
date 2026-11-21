import { sitePath } from '../base.js';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const curve = (a = 1.3 + Math.random() * 1.9, b = 1.3 + Math.random() * 1.9) => t => { const x = Math.pow(clamp(t, 0, 1), a); return x / (x + Math.pow(1 - clamp(t, 0, 1), b)); };
const vary = (ms, spread = 0.35) => ms * (1 - spread / 2 + Math.random() * spread);

const body = document.body, facing = $('#facing'), told = $('#told'), canvas = $('#links'), ctx = canvas.getContext('2d');
const sides = { original: $('#original'), plane: $('#plane') };
const phrases = $$('.ph'), ticks = $$('#depth button'), lines = $$('.ln');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 900px)');
const sideOf = el => (el.closest('#original') ? 'original' : 'plane');

const words = a => { const c = a.cloneNode(true); $$('.md', c).forEach(m => m.remove()); return c.textContent; };
let paused = false, dirty = true;
const still = () => paused || reduced.matches;

const LEAN = 0.12;
let axis = null;
function textHeight(side) { const l = $$('.ln', side); return l[l.length - 1].getBoundingClientRect().bottom - l[0].getBoundingClientRect().top; }
function layout() {
  if (!wide.matches) {
    facing.classList.remove('slanted'); axis = null;
  } else {
    facing.classList.add('slanted');
    const style = getComputedStyle(facing);
    const inner = facing.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    facing.style.setProperty('--carve', `${Math.round(inner * LEAN)}px`);
    let lo = 0.35, hi = 0.66, fall = 2400, x = 0.5, h = [0, 0];
    for (let k = 0; k < 8; k++) {
      x = (lo + hi) / 2;
      facing.style.setProperty('--xtop', `${(x * 100).toFixed(2)}%`);
      facing.style.setProperty('--xbot', `${((x - LEAN) * 100).toFixed(2)}%`);
      for (let pass = 0; pass < 2; pass++) {
        facing.style.setProperty('--fall', `${Math.round(fall)}px`);
        h = [textHeight(sides.original), textHeight(sides.plane)];
        fall = Math.max(h[0], h[1]);
      }
      if (h[0] > h[1]) lo = x; else hi = x;
    }
    facing.style.setProperty('--fall', `${Math.round(fall)}px`);
    const pad = parseFloat(style.paddingLeft), top = parseFloat(style.paddingTop);

    axis = { x0: pad + inner * x, y0: top - 14, x1: pad + inner * (x - LEAN), y1: top + fall + 18 };
    facing.style.setProperty('--flip-x', `${Math.round(axis.x0 + (axis.x0 - axis.x1) * (60 / (axis.y1 - axis.y0)))}px`);
    body.style.setProperty('--pause-x', `${Math.round(axis.x1 - 54)}px`);
  }
  measure(); dirty = true;
}

const near = [...phrases, ...$$('.caps-deep')].map(el => ({ el, rects: [], v: 0 }));
const hand = { x: -9999, y: -9999, tx: -9999, ty: -9999, in: false, energy: 0, last: 0 };
function measure() {
  const sx = scrollX, sy = scrollY;
  for (const n of near) n.rects = [...n.el.getClientRects()].map(r => [r.left + sx, r.top + sy, r.right + sx, r.bottom + sy]);
}
function follow() {
  if (!hand.in && hand.x < -9000) return;
  hand.x = lerp(hand.x, hand.tx, 0.24); hand.y = lerp(hand.y, hand.ty, 0.24);
  const px = hand.x + scrollX, py = hand.y + scrollY;
  for (const n of near) {
    let d = 1e9;
    for (const [l, t, r, b] of n.rects) d = Math.min(d, Math.hypot(Math.max(l - px, 0, px - r), Math.max(t - py, 0, py - b)));
    const v = hand.in ? Math.pow(clamp(1 - d / 190, 0, 1), 1.4) : 0;
    if (Math.abs(v - n.v) > 0.015) { n.v = v; n.el.style.setProperty('--near', v.toFixed(3)); }
  }
}
addEventListener('pointermove', e => {
  const now = performance.now();
  if (hand.x < -9000) { hand.x = e.clientX; hand.y = e.clientY; }
  const speed = Math.hypot(e.clientX - hand.tx, e.clientY - hand.ty) / Math.max(8, now - hand.last);
  hand.energy = lerp(hand.energy, clamp(speed / 1.4, 0, 1), 0.2);
  hand.tx = e.clientX; hand.ty = e.clientY; hand.in = true; hand.last = now;
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { hand.in = false; });

let current = null, link = null;
function castleLink(tick) { const to = document.createElement('a'); to.className = 'to-castle'; to.setAttribute('href', sitePath(`/castle#${tick.dataset.plane}`)); to.textContent = tick.getAttribute('aria-label'); return to; }
const pairs = phrases.filter(a => sideOf(a) === 'original').flatMap(a => (a.dataset.answers || '').split(' ').filter(Boolean).map(id => [a, document.getElementById(id)]));
const tickOf = id => ticks.find(t => t.dataset.plane === id);
function select(a) {
  if (a === current) return;
  current?.classList.remove('on');
  $$('.ph.answer').forEach(p => p.classList.remove('answer'));
  ticks.forEach(t => t.classList.remove('lit'));
  current = a; told.replaceChildren();
  if (!a) { delete facing.dataset.hand; link = null; dirty = true; if (at >= 0 && tickOf(stops[at].el.dataset.plane)) out.replaceChildren(castleLink(tickOf(stops[at].el.dataset.plane))); return; }
  a.classList.add('on');
  facing.dataset.hand = sideOf(a);
  const answers = (a.dataset.answers || '').split(' ').filter(Boolean).map(id => document.getElementById(id)).filter(Boolean);
  answers.forEach(p => p.classList.add('answer'));
  const tick = tickOf(a.dataset.plane);

  out.replaceChildren();
  if (tick) { tick.classList.add('lit'); told.append(castleLink(tick)); }
  if (a.dataset.does) { const note = document.createElement('span'); note.className = 'note'; note.textContent = a.dataset.does; told.append(note); }
  for (const p of answers) { const back = document.createElement('button'); back.type = 'button'; back.className = 'back'; back.dataset.to = p.id; back.textContent = words(p); told.append(back); }

  link = { from: a, to: answers, start: performance.now(), dur: still() ? 0 : vary(520, 0.7), ease: curve() };
  dirty = true;
}
for (const a of phrases) {

  a.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && at < 0 && !flight) select(a); });
  a.addEventListener('focus', () => select(a));

  a.addEventListener('click', () => select(a));
  a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(a); } });
}
told.addEventListener('click', e => {
  const back = e.target.closest('.back');
  if (!back) return;
  const p = document.getElementById(back.dataset.to);
  flyTo(p); p.focus({ preventScroll: true });
});

let flight = null;
function flyTo(el) {
  const r = el.getBoundingClientRect();
  const to = clamp(scrollY + r.top - innerHeight * 0.38, 0, document.documentElement.scrollHeight - innerHeight);
  if (still()) { scrollTo(0, to); return; }
  flight = { from: scrollY, to, start: performance.now(), dur: vary(clamp(Math.abs(to - scrollY) * 0.9, 380, 1500)), ease: curve() };
}

function pick(tick) {
  facing.classList.toggle('plane-pick', Boolean(tick));
  for (const l of lines) l.classList.toggle('of-plane', Boolean(tick) && l.dataset.plane === tick.dataset.plane);
  if (tick && at >= 0) return;
  if (tick) { select(null); told.replaceChildren(castleLink(tick)); }
  else if (!current) told.replaceChildren();
}

const stops = [];
{
  let fresh = true, side = '';
  for (const l of lines) {
    if (l.classList.contains('rule')) { fresh = true; continue; }

    if (sideOf(l) !== side) { side = sideOf(l); fresh = true; }
    const first = $('.ph', l), own = $('.g', l)?.dataset.g;
    stops.push({ el: l, area: fresh, own, text: first ? words(first) : l.textContent });
    fresh = false;
  }

  let from = 0;
  stops.forEach((s, i) => { if (s.area) from = i; let end = stops.findIndex((x, j) => j > from && x.area); if (end < 0) end = stops.length; s.mark = s.own || stops.slice(from, end).find(x => x.own)?.own || '❖'; });
}
const up = $('#up'), down = $('#down'), leads = $('#leads'), begin = $('#begin'), goUp = $('#go-up'), goDown = $('#go-down'), out = $('#out'), strip = $('#does');
let at = -1;

function label(s) { return s.text.startsWith(s.mark) ? s.text : `${s.mark} ${s.text}`; }

function place() {
  const el = at >= 0 ? stops[at].el : null;
  if (el) { el.before(goUp); el.after(goDown); } else stops[0].el.before(goDown);
  goUp.hidden = at <= 0;
}

let addressed = location.hash;
function address(i) {
  const hash = i >= 0 ? `#${stops[i].el.dataset.src}` : '';
  if (hash === addressed) return;
  addressed = hash;
  try { history.replaceState(null, '', hash || location.pathname + location.search); } catch {   }
}
function land(hash) {
  const src = decodeURIComponent(hash.replace(/^#/, ''));
  const i = stops.findIndex(s => s.el.dataset.src === src);
  if (i >= 0) goTo(i, true);
  return i >= 0;
}
addEventListener('hashchange', () => { if (location.hash !== addressed) { addressed = location.hash; land(location.hash); } });

function goTo(i, focusDown = false, plane = null) {
  const heldAt = down.getBoundingClientRect().top;
  lines.forEach(l => l.classList.toggle('here', false));
  ticks.forEach(t => t.classList.toggle('here', false));
  at = i;
  address(i);
  const on = i >= 0;
  facing.classList.toggle('descending', on);
  select(null); unpick(); told.replaceChildren(); out.replaceChildren();
  if (!on) { down.classList.toggle('end', false); down.classList.toggle('area', false); leads.textContent = label(stops[0]); place(); measure(); dirty = true; return; }
  const s = stops[i], tick = tickOf(s.el.dataset.plane);
  s.el.classList.add('here');
  if (plane) lines.forEach(l => l.classList.toggle('here', l.dataset.plane === plane));

  const prev = stops[i - 1], next = stops[i + 1], last = $$('.ph', s.el).pop();
  if (prev) up.setAttribute('aria-label', label(prev));
  down.classList.toggle('end', !next); down.classList.toggle('area', Boolean(next?.area));
  leads.textContent = next ? label(next) : (last ? words(last) : s.text);

  if (tick) { tick.classList.add('here'); out.replaceChildren(castleLink(tick)); }
  place(); measure(); dirty = true;

  const line = s.el.getBoundingClientRect(), btn = down.getBoundingClientRect();
  const clear = strip.getBoundingClientRect().bottom + 14 + (i > 0 ? goUp.offsetHeight + 12 : 0);
  const y = clamp(heldAt, Math.min(clear + (btn.top - line.top), innerHeight - 190), innerHeight - 190);
  flyBy(btn.top - y);
  if (focusDown) down.focus({ preventScroll: true });
}
function flyBy(delta) {
  const to = clamp(scrollY + delta, 0, document.documentElement.scrollHeight - innerHeight);
  if (still() || Math.abs(to - scrollY) < 2) { flight = null; scrollTo(0, to); return; }
  flight = { from: scrollY, to, start: performance.now(), dur: vary(clamp(Math.abs(to - scrollY) * 1.1, 260, 1300)), ease: curve() };
}
function step(d) {
  if (at < 0) return goTo(0, true);
  if (d > 0 && at === stops.length - 1) return toTop();
  const n = clamp(at + d, 0, stops.length - 1);
  if (n !== at) goTo(n);
}

function toTop() { goTo(-1); flyBy(-scrollY); begin.focus({ preventScroll: true }); }
down.addEventListener('click', () => { step(1); if (at >= 0) down.focus({ preventScroll: true }); });
up.addEventListener('click', () => { step(-1); (goUp.hidden ? down : up).focus({ preventScroll: true }); });

begin.addEventListener('click', () => goTo(0, true));

const auto = $('#auto');
let autoTimer = 0;
function autoWait(i) { return vary(clamp(1200 + stops[i].el.textContent.length * 36, 1800, 14000), 0.5); }
function setAuto(on) {
  clearTimeout(autoTimer); autoTimer = 0;
  auto.setAttribute('aria-pressed', String(on));
  if (on) queueAuto(at < 0 ? vary(500, 0.6) : autoWait(at));
}
function queueAuto(wait) {
  autoTimer = setTimeout(() => {
    if (at >= stops.length - 1) return setAuto(false);
    goTo(at + 1);
    if (at >= stops.length - 1) setAuto(false); else queueAuto(autoWait(at));
  }, wait);
}
auto.addEventListener('click', () => setAuto(auto.getAttribute('aria-pressed') !== 'true'));
const hush = e => { if (autoTimer && !e.target.closest?.('#auto')) setAuto(false); };
addEventListener('pointerdown', hush, true);
addEventListener('keydown', e => { if (!(e.target === auto && (e.key === 'Enter' || e.key === ' '))) hush(e); }, true);
addEventListener('wheel', hush, { passive: true, capture: true });
addEventListener('touchmove', hush, { passive: true, capture: true });
function unpick() { facing.classList.remove('plane-pick'); lines.forEach(l => l.classList.remove('of-plane')); }
for (const t of ticks) {

  t.addEventListener('click', () => { const i = stops.findIndex(s => s.el.dataset.plane === t.dataset.plane); if (i >= 0) goTo(i, true, t.dataset.plane); });
}
for (const t of ticks) {
  t.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pick(t); });
  t.addEventListener('pointerleave', () => { if (at < 0) pick(null); else unpick(); });

  t.addEventListener('focus', () => { if (at < 0 && t.matches(':focus-visible')) pick(t); });
  t.addEventListener('blur', () => { if (at < 0) pick(null); else unpick(); });
}

const marks = $$('.g');
for (const g of marks) {
  g.addEventListener('pointerenter', () => marks.forEach(m => m.classList.toggle('twin', m.dataset.g === g.dataset.g)));
  g.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') marks.forEach(m => m.classList.remove('twin')); });
}

let typed = '', typedAt = 0;
addEventListener('keydown', e => {
  if (e.key === 'Escape') { typed = ''; mark(); select(null); pick(null); goTo(-1); return; }

  const arrow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
  if (arrow && (at >= 0 || e.altKey)) { e.preventDefault(); step(arrow); return; }
  if (at >= 0 && (e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('button, [role="button"], a')) { e.preventDefault(); step(1); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || !/^[\p{L}'’-]$/u.test(e.key)) return;
  const now = performance.now();
  typed = (now - typedAt > 1600 ? '' : typed) + e.key.toLowerCase(); typedAt = now;
  mark();
});
function mark() {
  const hits = typed.length > 1 ? phrases.filter(a => words(a).toLowerCase().includes(typed)) : [];
  phrases.forEach(a => a.classList.toggle('hit', hits.includes(a)));
  if (hits[0]) { const r = hits[0].getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 140) flyTo(hits[0]); }
}

const flip = $('#flip'), pause = $('#pause');

function readingLine() {
  if (at >= 0) return stops[at].el;
  const y = innerHeight * 0.38;
  let best = null, gap = Infinity;
  for (const l of lines) { if (l.classList.contains('rule')) continue; const r = l.getBoundingClientRect(); if (r.bottom < 60 || r.top > innerHeight) continue; const d = Math.abs((r.top + r.bottom) / 2 - y); if (d < gap) { gap = d; best = l; } }
  return best || lines[0];
}
function setPolarity(shadow, keep) {
  const before = keep.getBoundingClientRect().top;
  body.dataset.polarity = shadow ? 'shadow' : 'crystal';
  flip.setAttribute('aria-pressed', String(shadow));
  layout();
  flight = null;
  scrollTo(0, scrollY + keep.getBoundingClientRect().top - before);
  measure(); dirty = true;
}

let shadowWanted = body.dataset.polarity === 'shadow';
flip.addEventListener('click', () => {
  shadowWanted = !shadowWanted;
  const shadow = shadowWanted, keep = readingLine();
  flip.setAttribute('aria-pressed', String(shadow));
  if (!document.startViewTransition || still()) return setPolarity(shadow, keep);
  const r = keep.getBoundingClientRect(), root = document.documentElement;
  root.style.setProperty('--flip-y', `${Math.round(clamp((r.top + r.bottom) / 2, 0, innerHeight))}px`);
  root.style.setProperty('--flip-d', `${Math.round(vary(1100, 0.45))}ms`);

  root.style.setProperty('--flip-lean', `cubic-bezier(${(0.2 + Math.random() * 0.3).toFixed(2)}, ${(Math.random() * 0.2).toFixed(2)}, ${(0.25 + Math.random() * 0.3).toFixed(2)}, ${(0.92 + Math.random() * 0.08).toFixed(2)})`);
  root.classList.add('flipping');
  const t = document.startViewTransition(() => setPolarity(shadow, keep));

  t.ready.catch(() => {}); t.updateCallbackDone.catch(() => {});
  t.finished.catch(() => {}).finally(() => root.classList.remove('flipping'));
});
pause.addEventListener('click', () => { paused = !paused; pause.setAttribute('aria-pressed', String(paused)); });

const breathers = $$('.glyph, .caps-breathe').map(el => ({ el, start: 0, dur: 0, depth: 0, split: 0.4, rise: curve(), fall: curve(), v: 0 }));
function breathe(now) {
  for (const b of breathers) {
    if (now >= b.start + b.dur) {
      const pace = lerp(5200, 1900, hand.energy) * (0.7 + Math.random() * 0.6);
      const kind = Math.random();
      b.start = now + (b.dur ? Math.random() * Math.random() * 1400 : Math.random() * 3000);
      b.dur = pace * (kind < 0.14 ? 0.32 + Math.random() * 0.2 : kind > 0.88 ? 1.7 + Math.random() * 0.9 : 0.6 + Math.random() * 0.9);
      b.depth = 0.35 + Math.random() * 0.65; b.split = 0.26 + Math.random() * 0.38; b.rise = curve(); b.fall = curve();
    }
    const t = clamp((now - b.start) / b.dur, 0, 1);
    const v = b.depth * (t < b.split ? b.rise(t / b.split) : 1 - b.fall((t - b.split) / (1 - b.split)));
    if (Math.abs(v - b.v) > 0.008) { b.v = v; b.el.style.setProperty('--b', v.toFixed(3)); }
  }
}

const letters = $$('.caps-obliterate .l').map((el, i) => ({ el, x: 0, y: 0, r: 0, k: 0.07 + ((i * 37) % 11) / 70, spin: ((i * 53) % 17) / 17 - 0.5 }));
const growls = $$('.caps-rrr').map(el => ({ el, ls: $$('.l', el) }));
function scatter() {
  if (!letters.length) return;
  for (const l of letters) {
    let tx = 0, ty = 0, tr = 0;
    if (hand.in) {
      const r = l.el.parentElement.getBoundingClientRect(), own = l.el.offsetLeft + l.el.offsetWidth / 2;
      const dx = r.left + own - hand.x, dy = r.top + r.height / 2 - hand.y, d = Math.hypot(dx, dy) || 1;
      const push = Math.pow(clamp(1 - d / 210, 0, 1), 1.6) * 64;
      tx = dx / d * push; ty = dy / d * push; tr = l.spin * push * 1.3;
    }
    l.x = lerp(l.x, tx, l.k); l.y = lerp(l.y, ty, l.k); l.r = lerp(l.r, tr, l.k);
    l.el.style.transform = Math.abs(l.x) + Math.abs(l.y) < 0.05 ? '' : `translate(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px) rotate(${l.r.toFixed(1)}deg)`;
  }
  for (const g of growls) {
    const r = g.el.getBoundingClientRect();
    const d = Math.hypot(Math.max(r.left - hand.x, 0, hand.x - r.right), Math.max(r.top - hand.y, 0, hand.y - r.bottom));
    const amount = hand.in ? clamp(1 - d / 120, 0, 1) * (1.2 + hand.energy * 3) : 0;
    g.ls.forEach((l, i) => { l.style.transform = amount > 0.02 ? `translate(${((Math.random() - 0.5) * amount * (1 + i * 0.5)).toFixed(1)}px, ${((Math.random() - 0.5) * amount * (1 + i * 0.5)).toFixed(1)}px)` : ''; });
  }
}

function size() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function port(a, towards) {
  const rs = a.getClientRects(), r = a.getBoundingClientRect();
  if (!wide.matches) { const first = rs[0] || r; return [8, first.top + first.height / 2]; }
  const first = rs[0] || r;
  return sideOf(a) === 'original' ? [r.right + 12, first.top + first.height / 2] : [r.left - 12, first.top + first.height / 2];
}
function ring(x, y, r, colour, alpha) { ctx.globalAlpha = alpha; ctx.strokeStyle = colour; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
function draw(now) {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.lineWidth = 1;
  if (axis) {
    const f = facing.getBoundingClientRect();
    const x0 = f.left + axis.x0, y0 = f.top + axis.y0, x1 = f.left + axis.x1, y1 = f.top + axis.y1;
    const shade = ctx.createLinearGradient(x0, y0, x1, y1);
    shade.addColorStop(0, '#e3c27c'); shade.addColorStop(1, '#cdb8f2');
    ctx.globalAlpha = 0.5; ctx.strokeStyle = shade; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ring(x1 - 3, y1 + 22, 22, '#cdb8f2', 0.5);
  }

  for (const [a, b] of wide.matches ? pairs : []) {
    if (link && (link.from === a || link.from === b)) continue;
    const [ax, ay] = port(a, b), [bx, by] = port(b, a);
    if (Math.max(ay, by) < 0 || Math.min(ay, by) > innerHeight) continue;
    const d = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / d, uy = (by - ay) / d;
    ring(ax, ay, 4, '#e3c27c', 0.34); ring(bx, by, 4, '#cdb8f2', 0.34);
    ctx.globalAlpha = 0.17; ctx.strokeStyle = '#cdb8f2'; ctx.beginPath(); ctx.moveTo(ax + ux * 4, ay + uy * 4); ctx.lineTo(bx - ux * 4, by - uy * 4); ctx.stroke();
  }
  let growing = false;
  if (link && link.to.length) {
    const t = link.dur ? link.ease((now - link.start) / link.dur) : 1;
    growing = t < 1;
    for (const to of link.to) {
      const [ax, ay] = port(link.from, to), [bx, by] = port(to, link.from);
      const d = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / d, uy = (by - ay) / d, R = 6;
      ring(ax, ay, R, '#e3c27c', 0.95);
      const shade = ctx.createLinearGradient(ax, ay, bx, by);
      shade.addColorStop(0, '#e3c27c'); shade.addColorStop(1, '#cdb8f2');
      ctx.globalAlpha = 0.85; ctx.strokeStyle = shade; ctx.beginPath();
      ctx.moveTo(ax + ux * R, ay + uy * R); ctx.lineTo(ax + ux * lerp(R, d - R, t), ay + uy * lerp(R, d - R, t)); ctx.stroke();
      if (t >= 1) ring(bx, by, R, '#cdb8f2', 0.95);
    }
  }
  ctx.globalAlpha = 1;
  return growing;
}

function frame(now) {
  if (flight) {
    const t = (now - flight.start) / flight.dur;
    scrollTo(0, lerp(flight.from, flight.to, flight.ease(t)));
    if (t >= 1) flight = null;
  }
  follow();
  if (!still()) { breathe(now); scatter(); }
  hand.energy *= 0.985;
  if (dirty || flight) dirty = draw(now);
  requestAnimationFrame(frame);
}

addEventListener('scroll', () => { dirty = true; }, { passive: true });
addEventListener('wheel', () => { flight = null; }, { passive: true });
addEventListener('touchstart', () => { flight = null; }, { passive: true });
let resizing = 0;
addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(() => { size(); layout(); }, 120); });
size(); layout();
leads.textContent = label(stops[0]);
document.fonts?.ready.then(layout);

if (location.hash) (document.fonts?.ready || Promise.resolve()).then(() => { layout(); land(location.hash); });
requestAnimationFrame(frame);

window.__prompts = { autoWait, auto: () => auto.getAttribute('aria-pressed') === 'true', flying: () => Boolean(flight), lit: () => lines.filter(l => l.classList.contains('here')).map(l => l.dataset.src), at: () => (at < 0 ? null : stops[at].el.dataset.src), stops: () => stops.map(s => ({ src: s.el.dataset.src, area: s.area, label: label(s) })), select: id => select(document.getElementById(id)), current: () => current?.id || null, slanted: () => facing.classList.contains('slanted'), heights: () => [textHeight(sides.original), textHeight(sides.plane)] };
