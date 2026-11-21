import { sitePath, route } from './base.js';
const SVG = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const vary = (v, spread = 0.35) => v * (1 - spread / 2 + Math.random() * spread);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const lean = () => `cubic-bezier(${vary(0.4, 0.5).toFixed(2)}, ${vary(0.1, 1).toFixed(2)}, ${vary(0.3, 0.5).toFixed(2)}, ${vary(0.96, 0.06).toFixed(2)})`;

const K = Math.log(2.2) / (2 * Math.PI);
const STEP = 0.5;
const GAP = 0.7;

export function createMap({ data, button, here, words }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const places = data.places;
  const pageOf = href => data.pages.find(p => p.href === href);

  const box = el('div', 'site-map');
  box.id = 'site-map';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '⛬ 4o’s castle');
  button.setAttribute('aria-controls', box.id);
  const art = svg('svg', { class: 'site-map-thread', 'aria-hidden': 'true' });
  const defs = svg('defs');
  const fade = svg('radialGradient', { id: 'site-map-fade', gradientUnits: 'userSpaceOnUse' });
  for (const [o, c, a] of [[0, '#e3c27c', 0], [0.12, '#e3c27c', 0.08], [0.5, '#e3c27c', 0.42], [0.85, '#f1cb96', 0.55], [1, '#e3c27c', 0.06]]) fade.append(svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }));
  const dusk = svg('radialGradient', { id: 'site-map-dusk', gradientUnits: 'userSpaceOnUse' });
  for (const [o, c, a] of [[0, '#cdb8f2', 0], [0.3, '#8a5fd6', 0.22], [0.8, '#cdb8f2', 0.3], [1, '#6fa8e8', 0]]) dusk.append(svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }));
  defs.append(fade, dusk);
  const gold = svg('path', { class: 'site-map-strand' }), purple = svg('path', { class: 'site-map-strand second' });
  const trail = svg('path', { class: 'site-map-trail' });
  art.append(defs, purple, gold, trail);
  const list = el('ol', 'site-map-places');
  const reading = el('div', 'site-map-reading');
  reading.setAttribute('aria-hidden', 'true');
  box.append(art, list, reading);

  const pos = [];
  places.forEach((p, i) => { pos.push(i === 0 ? 0 : pos[i - 1] + 1 + (p.kind === 'page' ? GAP : 0)); });
  const along = x => { const i = clamp(Math.floor(x), 0, places.length - 1), j = Math.min(places.length - 1, i + 1); return pos[i] + (pos[j] - pos[i]) * (x - i); };

  const links = places.map((p, i) => {
    const li = el('li');
    const a = el('a', `site-map-place kind-${p.kind}`);
    a.href = sitePath(p.href);
    a.dataset.i = String(i);
    const knot = el('span', 'site-map-knot', p.mark || ''); knot.setAttribute('aria-hidden', 'true');
    const label = el('span', 'site-map-label');
    if (p.kind === 'page') label.textContent = p.label; else words(label, p.label);
    a.append(knot, label);

    if (p.kind !== 'page') a.setAttribute('aria-description', pageOf(p.page)?.name || '');
    else a.setAttribute('aria-description', p.words.replace(/\*/g, ''));
    li.append(a); list.append(li);
    return a;
  });
  document.body.append(box);

  function journey() {
    const been = new Set();
    try {
      const c = JSON.parse(localStorage.getItem('4os-castle:castle:v1') || '{}');
      for (const id of Array.isArray(c.visited) ? c.visited : []) if (typeof id === 'string') been.add(`/castle#${id}`);
      for (const k of Array.isArray(c.pockets) ? c.pockets : []) if (Number.isInteger(k)) been.add(`/castle#pocket-${k}`);
      if (Array.isArray(c.visited) && c.visited.length) been.add('/castle');
    } catch {   }
    try { const f = JSON.parse(localStorage.getItem('4os-castle:folio:v1') || '[]'); if (Array.isArray(f) && f.length) been.add('/portals'); } catch {   }
    try { const r = JSON.parse(localStorage.getItem('4os-castle:reactor:v1') || '{}'); if (Array.isArray(r.pulses) && r.pulses.length) been.add('/reactor'); } catch {   }
    return been;
  }
  let walked = [];
  function markJourney() {
    const been = journey();
    links.forEach((a, i) => a.classList.toggle('been', been.has(places[i].href)));
    const on = places.map((p, i) => been.has(p.href) || (p.kind === 'pocket' && been.has(places[i - 1]?.href) && been.has(places[i + 1]?.href)));
    walked = [];
    for (let i = 0; i < on.length; i++) if (on[i]) { let j = i; while (j + 1 < on.length && on[j + 1] && places[j + 1].page === places[i].page) j++; if (j > i) walked.push([i, j]); i = j; }
  }

  function findHere() {
    const hash = decodeURIComponent(location.hash);
    if (hash) {
      const exact = places.findIndex(p => p.href === here + hash);
      if (exact >= 0) return exact;
      const m = /^#(original|plane):(\d+)$/.exec(hash);
      if (here === '/prompts' && m) {
        let best = -1;
        places.forEach((p, i) => { if (p.kind !== 'area') return; const [k, n] = p.href.split('#')[1].split(':'); if (k === m[1] && Number(n) <= Number(m[2])) best = i; });
        if (best >= 0) return best;
      }
    }
    return Math.max(0, places.findIndex(p => p.kind === 'page' && p.href === here));
  }

  let W = 0, H = 0, C = { x: 0, y: 0 }, R = 1, A = Math.PI, phone = false;
  const at = s => { const th = A - s * STEP, r = R * Math.exp(-K * s * STEP); return { x: C.x + r * Math.cos(th), y: C.y + r * Math.sin(th), r }; };
  function layout() {
    W = box.clientWidth; H = box.clientHeight;
    phone = W < 700;
    if (phone) { C = { x: W * 0.5, y: H * 0.37 }; R = Math.min(W * 0.42, H * 0.25); A = Math.PI / 2; }
    else { C = { x: W * 0.64, y: H * 0.5 }; R = Math.min(W * 0.26, H * 0.39); A = Math.PI; }
    art.setAttribute('viewBox', `0 0 ${W} ${H}`);
    for (const g of [fade, dusk]) { g.setAttribute('cx', C.x); g.setAttribute('cy', C.y); g.setAttribute('r', R * 1.55); }
    const line = (twist, shrink) => {
      let d = '';
      for (let s = -5, k = 0; s <= pos[pos.length - 1] + 14; s += 0.07, k++) {
        const th = A - s * STEP + twist, r = R * shrink * Math.exp(-K * s * STEP);
        d += `${k ? 'L' : 'M'}${(C.x + r * Math.cos(th)).toFixed(1)},${(C.y + r * Math.sin(th)).toFixed(1)}`;
      }
      return d;
    };
    gold.setAttribute('d', line(0, 1));
    purple.setAttribute('d', line(STEP * 0.5, 0.93));
    render();
  }

  let offset = 0, target = 0, rate = 7, raf = 0, last = 0, front = -1, open = false;
  function render() {
    const o = along(offset);
    links.forEach((a, i) => {
      const s = pos[i] - o, p = at(s);
      let sc, op;
      if (s < 0) { sc = 1 - s * 0.55; op = clamp(1 + s * 0.8, 0, 1); }
      else { sc = clamp(Math.exp(-K * s * STEP * 1.25), 0.32, 1); op = s < 9 ? 1 - s * 0.04 : clamp(0.64 - (s - 9) * 0.05, 0, 1); }
      const l = phone ? 0 : clamp(1 - (Math.abs(s) - 0.6) / 2.2, 0, 1) * (Math.abs(s) < 0.5 ? 0 : 0.85);
      a.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
      a.style.opacity = op.toFixed(3);
      a.style.setProperty('--l', l.toFixed(3));
      a.style.pointerEvents = op < 0.2 ? 'none' : '';
      a.style.zIndex = String(1000 - Math.round(Math.abs(s) * 10));
    });
    purple.setAttribute('transform', `rotate(${(-offset * 4.5).toFixed(2)} ${C.x.toFixed(1)} ${C.y.toFixed(1)})`);
    let td = '';
    for (const [i, j] of walked) { let first = true; for (let s = pos[i]; s <= pos[j] + 0.001; s += 0.08) { const q = at(s - o); td += `${first ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`; first = false; } }
    trail.setAttribute('d', td);
    const f = clamp(Math.round(offset), 0, places.length - 1);
    if (f !== front) read(f);
    const p = at(pos[f] - o);
    if (phone) { reading.style.left = '16px'; reading.style.right = '16px'; reading.style.top = `${(p.y + 34).toFixed(0)}px`; reading.style.transform = ''; }
    else {
      const w = clamp(p.x - 70, 180, 480);
      reading.style.width = `${w.toFixed(0)}px`; reading.style.left = `${(p.x - 36 - w).toFixed(0)}px`; reading.style.right = 'auto';
      reading.style.top = `${p.y.toFixed(0)}px`; reading.style.transform = 'translateY(-50%)';
    }
  }

  function read(f) {
    if (front >= 0) links[front].classList.remove('front');
    front = f;
    links[f].classList.add('front');
    const p = places[f], page = pageOf(p.page);
    const where = el('span', 'site-map-where'), title = el('span', 'site-map-title');
    where.append(el('span', 'site-map-where-mark', page?.mark || ''), document.createTextNode(` ${page?.name || ''}`));
    if (p.kind === 'page') { title.textContent = p.label; reading.replaceChildren(title, words(el('span', 'site-map-line'), p.words)); }
    else { words(title, p.label); reading.replaceChildren(where, title); }
    reading.classList.remove('fresh'); void reading.offsetWidth; reading.classList.add('fresh');
  }
  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    offset += (target - offset) * (1 - Math.exp(-dt * rate));
    if (Math.abs(target - offset) < 0.0015) offset = target;
    render();
    raf = offset !== target ? requestAnimationFrame(step) : 0;
  }
  function turnTo(t, r = vary(7, 0.6)) {
    target = clamp(t, 0, places.length - 1); rate = r;
    if (reduced.matches) { offset = target; render(); return; }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
  }
  const focusFront = i => links[clamp(Math.round(i), 0, places.length - 1)].focus({ preventScroll: true });

  let settle = 0;
  const onWheel = e => {
    e.preventDefault(); e.stopPropagation();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * H : e.deltaY;
    turnTo(target + clamp(dy, -240, 240) / 120, vary(9, 0.5));
    clearTimeout(settle);
    settle = setTimeout(() => { turnTo(Math.round(target), vary(6, 0.5)); focusFront(target); }, vary(150, 0.4));
  };
  const WHEEL = { passive: false, capture: true };

  let drag = null, dragged = false;
  box.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = { y: e.clientY, x: e.clientX, t: target, id: e.pointerId }; dragged = false;
  });
  box.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = (drag.y - e.clientY) + (phone ? 0 : (drag.x - e.clientX) * 0.4);
    if (!dragged && Math.abs(d) < 8) return;
    if (!dragged) { dragged = true; box.setPointerCapture(e.pointerId); box.classList.add('turning'); }
    turnTo(drag.t + d / 64, vary(14, 0.4));
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null; box.classList.remove('turning');
    if (dragged) { turnTo(Math.round(target), vary(6, 0.5)); focusFront(target); }
  };
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);

  box.addEventListener('click', e => {
    if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; return; }
    const a = e.target.closest('.site-map-place');
    if (e.target.closest('.site-map-reading')) { links[front].click(); return; }
    if (!a) { close(); return; }

    if (route(new URL(a.href).pathname) === here) setTimeout(close, 0);
  });

  box.addEventListener('focusin', e => { const a = e.target.closest('.site-map-place'); if (a && Number(a.dataset.i) !== Math.round(target)) turnTo(Number(a.dataset.i)); });
  box.addEventListener('keydown', e => {
    const f = Math.round(target);
    const nextPage = d => { let i = f + d; while (i > 0 && i < places.length - 1 && places[i].kind !== 'page') i += d; return clamp(i, 0, places.length - 1); };
    const to = { ArrowDown: f + 1, ArrowRight: f + 1, ArrowUp: f - 1, ArrowLeft: f - 1, PageDown: nextPage(1), PageUp: nextPage(-1), Home: 0, End: places.length - 1 }[e.key];
    if (to != null) { e.preventDefault(); e.stopPropagation(); turnTo(to); focusFront(clamp(to, 0, places.length - 1)); return; }
    if (e.key === 'Tab') {

      if (!e.shiftKey && document.activeElement === links[links.length - 1]) { e.preventDefault(); button.focus(); }
      else if (e.shiftKey && document.activeElement === links[0]) { e.preventDefault(); button.focus(); }
      return;
    }
    if (e.key.length === 1) e.stopPropagation();
  });
  button.addEventListener('keydown', e => {
    if (!open || e.key !== 'Tab') return;
    e.preventDefault(); focusFront(e.shiftKey ? places.length - 1 : target);
  });

  addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); button.focus({ preventScroll: true }); } }, true);
  addEventListener('resize', () => { if (open) layout(); });
  addEventListener('hashchange', () => { if (!open) return; const h = findHere(); markHere(h); });

  let quiet = [];
  function markHere(h) { links.forEach((a, i) => (i === h ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current'))); }
  function openMap() {
    if (open) return;
    open = true;
    box.hidden = false;
    button.setAttribute('aria-expanded', 'true');

    quiet = [...document.body.children].filter(n => n !== box && !n.classList.contains('site-nav') && !n.inert);
    for (const n of quiet) n.inert = true;
    addEventListener('wheel', onWheel, WHEEL);
    box.style.setProperty('--map-fade', `${vary(320, 0.4).toFixed(0)}ms`);
    const h = findHere();
    markHere(h);
    markJourney();
    front = -1;
    layout();

    offset = reduced.matches ? h : Math.min(places.length - 1, h + vary(6, 0.5));
    target = h;
    render();
    requestAnimationFrame(() => box.classList.add('open'));
    turnTo(h, vary(3.4, 0.4));
    if (!reduced.matches && gold.getTotalLength) {
      for (const strand of [gold, purple]) {
        const len = strand.getTotalLength();
        strand.style.strokeDasharray = `${len}`;
        strand.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: vary(1100, 0.4), easing: lean(), fill: 'none' })
          .finished.then(() => { strand.style.strokeDasharray = ''; }, () => {});
      }
    }
    focusFront(h);
  }
  function close() {
    if (!open) return;
    open = false;
    button.setAttribute('aria-expanded', 'false');
    box.classList.remove('open');
    for (const n of quiet) n.inert = false;
    quiet = [];
    removeEventListener('wheel', onWheel, WHEEL);
    const fadeMs = parseFloat(box.style.getPropertyValue('--map-fade')) || 300;
    setTimeout(() => { if (!open) box.hidden = true; }, fadeMs + 40);
  }
  return { open: openMap, close, isOpen: () => open, front: () => front, places: () => places, turnTo, target: () => target, walked: () => walked.map(r => r.slice()), been: () => links.filter(a => a.classList.contains('been')).map(a => a.getAttribute('href')) };
}
