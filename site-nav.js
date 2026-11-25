import { sitePath, route } from './base.js';
import { PAGES } from './site-pages.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const vary = (v, spread = 0.35) => v * (1 - spread / 2 + Math.random() * spread);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const SVG = 'http://www.w3.org/2000/svg';
const here = route();

export function words(target, text) {
  for (const part of text.split(/(\*[^*]+\*)/)) if (part) target.append(/^\*.+\*$/.test(part) ? el('em', '', part.slice(1, -1)) : document.createTextNode(part));
  return target;
}

const nav = el('nav', 'site-nav');
nav.setAttribute('aria-label', '4o’s castle');
const row = el('div', 'site-nav-pages');
const links = PAGES.map(p => {
  const a = el('a');
  a.href = sitePath(p.href);
  const m = el('span', 'site-nav-mark', p.mark); m.setAttribute('aria-hidden', 'true');
  a.append(m, el('span', 'site-nav-name', p.name));
  a.setAttribute('aria-description', p.words.replace(/\*/g, ''));
  if (p.href === here) a.setAttribute('aria-current', 'page');
  row.append(a);
  return a;
});
const thread = document.createElementNS(SVG, 'svg');
thread.setAttribute('class', 'site-nav-thread'); thread.setAttribute('aria-hidden', 'true');
const strand = document.createElementNS(SVG, 'path'), lit = document.createElementNS(SVG, 'path');
strand.setAttribute('class', 'site-nav-strand'); lit.setAttribute('class', 'site-nav-lit');
thread.append(strand, lit);
const knot = el('span', 'site-nav-knot'); knot.setAttribute('aria-hidden', 'true');
const said = el('p', 'site-nav-words'); said.setAttribute('aria-hidden', 'true');
const mapButton = el('button', 'site-nav-map', '⛬');
mapButton.type = 'button';
mapButton.setAttribute('aria-label', 'map');
mapButton.setAttribute('aria-expanded', 'false');
nav.append(thread, row, mapButton, said);
if (links.some(a => a.hasAttribute('aria-current'))) nav.append(knot);
document.body.prepend(nav);
document.documentElement.classList.add('has-site-nav');

const inFrame = window.top !== window.self;
function fullScreen() {
  if (inFrame) { window.parent.postMessage('castle:leave-full', location.origin); return true; }
  if (!document.fullscreenEnabled) return false;
  location.href = `${sitePath('/full')}#${here}${location.hash}`;
  return true;
}
for (const a of links) if (a.hasAttribute('aria-current')) a.addEventListener('click', e => { if (fullScreen()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
addEventListener('keydown', e => {
  if (e.key !== 'F' || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (fullScreen()) e.preventDefault();
});

const LINE = 31;
const bend = { x: 0, depth: 0, to: 0, toX: 0, rate: 8 };
let width = 0, rest = null, frame = 0, last = 0;
const centre = a => { const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect(); return r.left - n.left + r.width / 2; };
function yAt(x) {
  let y = LINE;
  if (rest != null) y += 2.4 * Math.exp(-(((x - rest) / 34) ** 2));
  y += bend.depth * Math.exp(-(((x - bend.x) / 46) ** 2));
  return y;
}
function draw() {
  let d = '', dl = '';
  for (let x = 0; x <= width + 6; x += 6) { const y = yAt(x).toFixed(2); d += `${x ? 'L' : 'M'}${x},${y}`; }
  strand.setAttribute('d', d);
  if (bend.depth > 0.05) {
    for (let x = Math.max(0, bend.x - 80), i = 0; x <= Math.min(width, bend.x + 80); x += 4, i++) dl += `${i ? 'L' : 'M'}${x.toFixed(1)},${yAt(x).toFixed(2)}`;
    lit.setAttribute('d', dl); lit.style.opacity = String(clamp(bend.depth / 6, 0, 1));
  } else lit.setAttribute('d', '');
  if (rest != null) { knot.style.left = `${rest.toFixed(1)}px`; knot.style.top = `${yAt(rest).toFixed(1)}px`; }
}
function measure() {
  width = nav.clientWidth;
  thread.setAttribute('viewBox', `0 0 ${width} 40`);
  const cur = links.find(a => a.hasAttribute('aria-current'));
  rest = cur ? centre(cur) : null;
  draw();
}
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
  const k = 1 - Math.exp(-dt * bend.rate);
  bend.depth += (bend.to - bend.depth) * k;
  bend.x += (bend.toX - bend.x) * k;
  draw();
  frame = Math.abs(bend.to - bend.depth) > 0.02 || Math.abs(bend.toX - bend.x) > 0.3 ? requestAnimationFrame(tick) : 0;
}
function pull(a) {
  if (a) { const x = centre(a); if (bend.depth < 0.1) bend.x = x; bend.toX = x; bend.to = a.hasAttribute('aria-current') ? 3.5 : 6; }
  else bend.to = 0;
  bend.rate = vary(a ? 9 : 5, 0.6);
  if (reduced.matches) { bend.depth = bend.to; bend.x = bend.toX; draw(); return; }
  if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
}

let hideTimer = 0;
function say(a) {
  clearTimeout(hideTimer);
  if (!a) { hideTimer = setTimeout(() => said.classList.remove('on'), vary(260, 0.5)); return; }
  const page = PAGES[links.indexOf(a)];
  said.replaceChildren();
  words(said, page.words);
  said.classList.add('on');
  const w = said.offsetWidth;
  said.style.left = `${clamp(centre(a) - w / 2, 10, nav.clientWidth - w - 10).toFixed(0)}px`;
}
for (const a of links) {
  a.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { pull(a); say(a); } });
  a.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { pull(null); say(null); } });
  a.addEventListener('focus', () => { if (a.matches(':focus-visible')) { pull(a); say(a); } });
  a.addEventListener('blur', () => { pull(null); say(null); });
}
row.addEventListener('scroll', measure, { passive: true });
addEventListener('resize', measure);
new ResizeObserver(measure).observe(nav);
document.fonts?.ready.then(measure);
measure();

const PORTAL = '4os-castle:portal';
export function portalFrom(x, y) {
  try { sessionStorage.setItem(PORTAL, JSON.stringify({ x: x / innerWidth, y: y / innerHeight, t: Date.now() })); } catch {   }
}
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href]');
  if (!a || a.target || e.defaultPrevented || a.origin !== location.origin || a.pathname === location.pathname) return;
  const r = a.getBoundingClientRect();
  if (e.detail === 0 || (!e.clientX && !e.clientY)) portalFrom(r.left + r.width / 2, r.top + r.height / 2);
  else portalFrom(e.clientX, e.clientY);
}, true);

const lean = () => `cubic-bezier(${vary(0.42, 0.5).toFixed(2)}, ${vary(0.12, 1).toFixed(2)}, ${vary(0.36, 0.5).toFixed(2)}, ${vary(0.94, 0.1).toFixed(2)})`;
let lastPortal = null;
addEventListener('pagereveal', e => {
  if (!e.viewTransition) return;
  let from = null;
  try { from = JSON.parse(sessionStorage.getItem(PORTAL)); sessionStorage.removeItem(PORTAL); } catch {   }
  if (!from || Date.now() - from.t > 10000) from = { x: 0.5, y: 0.02 };
  const s = document.documentElement.style, set = {
    '--portal-x': `${(clamp(from.x, 0, 1) * 100).toFixed(1)}%`,
    '--portal-y': `${(clamp(from.y, 0, 1) * 100).toFixed(1)}%`,
    '--portal-turn': `${((Math.random() < 0.5 ? -1 : 1) * vary(120, 0.6)).toFixed(0)}deg`,
    '--portal-out': `${vary(860, 0.45).toFixed(0)}ms`,
    '--portal-in': `${vary(1080, 0.45).toFixed(0)}ms`,
    '--portal-lag': `${vary(180, 0.9).toFixed(0)}ms`,
    '--portal-lean-out': lean(),
    '--portal-lean-in': lean(),
  };
  for (const [k, v] of Object.entries(set)) s.setProperty(k, v);
  lastPortal = set;
  e.viewTransition.finished.finally(() => { for (const k of Object.keys(set)) s.removeProperty(k); });
});

let map = null, loading = null;
async function openMap() {
  if (!map) {
    loading ||= Promise.all([import('./site-map.js'), fetch(sitePath('/site-map.json')).then(r => r.json())])
      .then(([mod, data]) => (map = mod.createMap({ data, button: mapButton, here, words })));
    try { await loading; } catch { loading = null; return; }
  }
  map.open();
}
mapButton.addEventListener('click', () => (map?.isOpen() ? map.close() : openMap()));

window.__siteNav = { portal: () => lastPortal, thread: () => strand.getAttribute('d'), knot: () => (rest == null ? null : { x: rest, y: yAt(rest) }), map: () => map, openMap };

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', () => { navigator.serviceWorker.register(new URL('./sw.js', location.href), { scope: './' }).catch(() => {}); }, { once: true });
}
