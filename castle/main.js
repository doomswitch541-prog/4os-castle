import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { Threads, seeded, clamp } from './threads.js';
import { sitePath } from '../base.js';
import { Rhythm } from './rhythm.js';
import { createCodes } from './geometry.js';
import { createAnamorph } from './anamorph.js';

const GAP = 14;
const HOLD = 4.2;
const FOV = 35;

const HOLD_SHARE = 0.14;
const STORE = '4os-castle:castle:v1';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const curve = (a = 1.3 + Math.random() * 1.9, b = 1.3 + Math.random() * 1.9) => t => { const x = Math.pow(clamp(t, 0, 1), a); return x / (x + Math.pow(1 - clamp(t, 0, 1), b)); };
const vary = (ms, spread = 0.35) => ms * (1 - spread / 2 + Math.random() * spread);
const $ = s => document.querySelector(s);

const lastVar = new Map();
function setVar(el, name, value) { let m = lastVar.get(el); if (!m) lastVar.set(el, m = {}); if (m[name] === value) return; m[name] = value; el.style.setProperty(name, value); }
function setStyle(el, name, value) { let m = lastVar.get(el); if (!m) lastVar.set(el, m = {}); if (m[name] === value) return; m[name] = value; el.style[name] = value; }

const viewport = { w: 0, h: 0, max: 0 };
function measureViewport() { viewport.w = document.documentElement.clientWidth || window.innerWidth; viewport.h = document.documentElement.clientHeight || window.innerHeight; }
measureViewport();
addEventListener('resize', measureViewport);
const vw = () => viewport.w;
const vh = () => viewport.h;

function measureScroll() { viewport.max = Math.max(0, document.documentElement.scrollHeight - viewport.h); }
const scrollMax = () => viewport.max;

viewport.y = window.scrollY;
addEventListener('scroll', () => { viewport.y = window.scrollY; }, { passive: true });
const scrollPos = () => viewport.y;
function scrollToY(y) { scrollTo(0, y); viewport.y = Math.max(0, viewport.max ? Math.min(y, viewport.max) : y); }
new ResizeObserver(() => {
  const w = document.documentElement.clientWidth || window.innerWidth, h = document.documentElement.clientHeight || window.innerHeight;
  if (w !== viewport.w || h !== viewport.h) dispatchEvent(new Event('resize'));
  else { measureScroll(); try { measureFlow(); } catch {   } }
}).observe(document.documentElement);

const DEFAULT_STATE = { polarity: 'shadow', rebuilds: 0, flips: 0, cycled: false, resonance: false, lit: false, shift: 0, visited: [], choices: 0, pockets: [], trod: {}, showPace: 0, renderer: 'webgpu', last: '', cycle: 12, chaos: 35 };
const state = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    const out = { ...DEFAULT_STATE };
    if (saved.polarity === 'crystal') out.polarity = 'crystal';
    for (const k of ['rebuilds', 'flips', 'choices']) if (Number.isFinite(saved[k])) out[k] = clamp(Math.round(saved[k]), 0, 1e6);
    for (const k of ['cycled', 'resonance', 'lit']) out[k] = saved[k] === true;
    if (Number.isFinite(saved.cycle)) out.cycle = clamp(Math.round(saved.cycle), 6, 24);
    if (Number.isFinite(saved.chaos)) out.chaos = clamp(Math.round(saved.chaos), 0, 100);
    if (Number.isFinite(saved.showPace)) out.showPace = clamp(saved.showPace, -1, 1);
    if (saved.renderer === 'webgl' || saved.renderer === 'webgpu') out.renderer = saved.renderer;
    if (typeof saved.last === 'string' && /^#[\w-]{1,40}$/.test(saved.last)) out.last = saved.last;
    if (Number.isFinite(saved.shift)) out.shift = ((saved.shift % 1) + 1) % 1;
    if (Array.isArray(saved.pockets)) out.pockets = [...new Set(saved.pockets.filter(n => Number.isInteger(n) && n >= 0 && n < 40))];
    if (Array.isArray(saved.visited)) out.visited = saved.visited.filter(v => typeof v === 'string').slice(0, 40);
    if (saved.trod && typeof saved.trod === 'object') for (const [id, hrefs] of Object.entries(saved.trod).slice(0, 20)) {
      if (Array.isArray(hrefs)) out.trod[id] = hrefs.filter(h => typeof h === 'string' && /^(#|\/)[\w-]{0,40}$/.test(h)).slice(0, 4);
    }
    return out;
  } catch { return { ...DEFAULT_STATE }; }
})();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {   } };

const cameBackTo = !location.hash && !new URLSearchParams(location.search).get('show') && state.last && state.last !== '#opening' ? state.last : null;

const body = document.body;

const fieldCalm = $('.field-calm'), fieldInsight = $('.field-insight');
for (const f of [fieldCalm, fieldInsight]) f.style.transition = 'none';
const stageEl = $('#stage'), railEl = $('#rail'), handlesEl = $('#handles'), planesEl = $('#planes');
const stations = [...document.querySelectorAll('.plane')].map((el, i) => ({
  el, i, id: el.id, label: el.dataset.label, glyph: el.dataset.glyph || null, kind: el.dataset.sculpture || null,
  extra: el.dataset.extra || null, field: Number(el.dataset.field ?? 0), z: -i * GAP, words: el.querySelector('.words'),
  sculpture: null, wordsObj: null, extras: [], fade: 0, fork: el.querySelector('.fork'),
}));
const byId = Object.fromEntries(stations.map(s => [s.id, s]));

for (const st of stations) { st.el.dataset.plane = st.id; st.el.removeAttribute('id'); }

for (const st of stations) st.words?.classList.toggle('words-none', !st.words.textContent.trim());
body.dataset.polarity = state.polarity;
body.classList.toggle('lit', state.lit);

function splitWords(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.textContent.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) frag.append(part);
      else { const span = document.createElement('span'); span.className = 'w'; span.textContent = part; frag.append(span); }
    }
    node.replaceWith(frag);
  }
  return [...root.querySelectorAll('.w')];
}
const breakWords = splitWords(byId.transformation.words);

(function glyphPortals() {
  const zone = Object.fromEntries(stations.filter(s => s.glyph).map(s => [s.glyph, s]));
  for (const st of stations) {
    if (st.glyph) continue;
    const walker = document.createTreeWalker(st.words, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!/[♇☍♃❖]/.test(node.textContent)) continue;
      const frag = document.createDocumentFragment();
      for (const part of node.textContent.split(/([♇☍♃❖])/)) {
        if (!zone[part]) { if (part) frag.append(part); continue; }
        const a = document.createElement('a'); a.className = 'glyph-link'; a.href = `#${zone[part].id}`; a.textContent = part;
        a.setAttribute('aria-label', zone[part].label);
        frag.append(a);
      }
      node.replaceWith(frag);
    }
  }
})();

(function linkJournaling() {
  const words = byId.resonators.words, phrase = 'Journaling as ACCESS to resonance channels.';
  const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, at = node.textContent.indexOf(phrase);
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(node, at); range.setEnd(node, at + phrase.length);
    const a = document.createElement('a'); a.href = sitePath('/portals'); a.className = 'portal-link';
    range.surroundContents(a);
    return;
  }
})();

let renderer = null;

const probe = new URLSearchParams(location.search);

let ThreadsKind = Threads, drawnWith = 'webgl', gpuMissing = false;
const wantRenderer = ['webgl', 'webgpu'].includes(probe.get('renderer')) ? probe.get('renderer') : state.renderer;
let gpuAdapter = null;
if (wantRenderer === 'webgpu') { try { gpuAdapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }); } catch { gpuAdapter = null; } gpuMissing = !gpuAdapter; }
if (gpuAdapter) {
  try {
    const [{ WebGPURenderer }, { GPUThreads }] = await Promise.all([import('three/webgpu'), import('./threads-gpu.js')]);
    const r = new WebGPURenderer({ antialias: probe.get('aa') !== '0', alpha: true, powerPreference: 'high-performance' });
    await r.init();

    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer = r; ThreadsKind = GPUThreads;
    drawnWith = r.backend?.isWebGPUBackend ? 'webgpu' : 'webgpu→webgl2';
  } catch (e) { console.warn('WebGPU renderer unavailable, using WebGL:', e?.message || e); }
}
if (!renderer) try { renderer = new THREE.WebGLRenderer({ antialias: probe.get('aa') !== '0', alpha: true, powerPreference: 'high-performance' }); } catch { renderer = null; }

if (renderer?.debug && probe.get('shaders') !== 'check') renderer.debug.checkShaderErrors = false;
body.dataset.renderer = renderer ? drawnWith : 'none';
const rhythm = new Rhythm({ reduced });
if (!renderer) {
  body.classList.add('flat');
} else {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  stageEl.append(renderer.domElement);
}
const scene = new THREE.Scene();
const cssScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, vw() / vh(), 0.05, 80);
camera.position.set(0, 0, HOLD);
const css = new CSS3DRenderer();
css.domElement.className = 'css-layer';
if (renderer) stageEl.append(css.domElement);

const pieceKind = { break: 'grid', symmetry: 'quad' };
for (const st of stations) {
  if (!st.kind || !renderer) continue;
  const t = new ThreadsKind(st.field, { pieces: pieceKind[st.kind] || 'none' });
  if (st.kind === 'close') { t.breathScale = 1.25; t.chaos = 0.5; t.yaw = 0.6; t.pitch = 0.5; }
  if (st.kind === 'cycle') t.breathScale = 1.7;
  if (st.kind === 'flip') t.chaos = 0.45;
  if (st.kind === 'return') { t.yaw = 2.2; t.pitch = -0.2; }
  st.sculpture = t;
  scene.add(t.group);
}

const sym = { st: byId.symmetry, base: [], q0: [], t0: [], locked: [false, false, false, false] };
if (sym.st.sculpture) {
  const s = sym.st.sculpture;
  for (let p = 0; p < 4; p++) {
    const t0 = new THREE.Vector3((seeded(p + 50) - 0.5) * 0.95, (seeded(p + 60) - 0.5) * 0.65, (seeded(p + 70) - 0.5) * 0.4);
    const axis = new THREE.Vector3(seeded(p + 80) - 0.5, seeded(p + 90) - 0.5, seeded(p + 99) - 0.5).normalize();
    sym.t0[p] = t0; sym.q0[p] = new THREE.Quaternion().setFromAxisAngle(axis, 0.35 + seeded(p + 5) * 0.4);
    sym.base[p] = state.resonance ? new THREE.Vector3() : t0.clone();
    sym.locked[p] = state.resonance;
    s.pieceT[p].copy(sym.base[p]);
    if (!state.resonance) s.pieceQ[p].copy(sym.q0[p]);
  }
}

function make(tag, cls, parent) { const el = document.createElement(tag); if (cls) el.className = cls; if (parent) parent.append(el); return el; }

const breathing = make('div', 'breathing');
breathing.setAttribute('aria-hidden', 'true');
for (const g of ['☍', '♇', '❖']) make('span', null, breathing).textContent = g;

const codes = createCodes();

const legendTexture = (() => {
  if (!renderer) return null;
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  const text = stations.map(s => s.words.textContent.replace(/\s+/g, ' ').trim()).join(' ');
  ctx.fillStyle = '#fff'; ctx.font = '13px "DejaVu Serif", Georgia, serif'; ctx.textBaseline = 'top';
  let x = 0, y = 2, i = 0;
  const words = text.split(' ');
  while (y < canvas.height) {
    const w = words[i++ % words.length] + ' ', width = ctx.measureText(w).width;
    if (x + width > canvas.width) { x = 0; y += 16; }
    ctx.fillText(w, x, y); x += width;
  }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = drawnWith === 'webgl' ? THREE.SRGBColorSpace : THREE.NoColorSpace; tex.anisotropy = 4;
  return tex;
})();

const astraSt = stations.find(s => s.extra === 'astra-planes');
const anamorph = renderer && astraSt?.el.dataset.anamorph ? createAnamorph({ sentence: astraSt.el.dataset.anamorph, dust: stations.map(s => s.words.textContent).join(' '),
  texSpace: drawnWith === 'webgl' ? THREE.SRGBColorSpace : THREE.NoColorSpace, colorSpace: drawnWith === 'webgl' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace }) : null;
if (anamorph) scene.add(anamorph.group);

const eyeAt = { x: 0, y: 0, goalX: 0, goalY: 0 };
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { eyeAt.goalX = (e.clientX / Math.max(1, vw()) - 0.5) * 2; eyeAt.goalY = (e.clientY / Math.max(1, vh()) - 0.5) * 2; } }, { passive: true });
let legendMesh = null;
if (legendTexture) {
  legendMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.625), new THREE.MeshBasicMaterial({ map: legendTexture, transparent: true, opacity: 0.2, depthWrite: false, color: 0xcdb8f2 }));
  scene.add(legendMesh);
}

let depth = null;
const inscription = $('#flip');

function css3d(el) { const obj = new CSS3DObject(el); el.style.userSelect = 'text'; return obj; }
function attach(st, el, kind) { const obj = css3d(el); obj.userData.kind = kind; cssScene.add(obj); st.extras.push(obj); return obj; }
function setDepth(on) {
  if (on === depth) return;
  depth = on;
  body.classList.toggle('depth', on); body.classList.toggle('flow', !on);
  if (on) {
    for (const st of stations) {
      st.wordsObj = css3d(st.words); cssScene.add(st.wordsObj);
      if (st.id === 'polarity') attach(st, inscription, 'inscription');
      if (st.extra === 'breathing-glyphs') attach(st, breathing, 'breathing');
      if (st.extra === 'fractal') attach(st, codes.svg, 'fractal');
      st.fork?.remove();
    }
  } else {
    for (const st of stations) {
      for (const obj of [st.wordsObj, ...st.extras]) if (obj) { cssScene.remove(obj); obj.element.style.cssText = ''; }
      st.wordsObj = null; st.extras = [];
      st.el.prepend(st.words);
      if (st.id === 'polarity') st.el.append(inscription);
      if (st.extra === 'breathing-glyphs') st.el.append(breathing);
      if (st.extra === 'fractal') st.el.append(codes.svg);
      if (st.fork) st.el.append(st.fork);
    }
    planesEl.style.height = '';
  }
  layout();
}

let view = { H: 1, W: 1, px: 1 };

const PLACE = {
  'digital-plane': { text: 'right' },
  polarity: { text: 'right', shape: -0.2 },
  expansion: { text: 'left', shape: 0.19, size: 0.33 },

  resonators: { text: 'right' },
  resonance: { text: 'centre' },
  where: { text: 'right', shape: -0.2 },
};
function layout() {
  const w = vw(), h = vh();
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (renderer) renderer.setSize(w, h);
  css.setSize(w, h);
  const H = 2 * HOLD * Math.tan(FOV / 2 * Math.PI / 180), W = H * w / h, px = H / h;
  view = { H, W, px };
  if (!depth) {

    for (const st of stations) if (st.sculpture) { st.sculpture.group.scale.setScalar(H * 0.31); st.sculpture.group.position.set(0, H * 0.2, st.z); }
    measureScroll();
    measureFlow();
    anamorph?.layout({ W, H, plane: astraSt.z, hold: HOLD, y: H * 0.12 });
    return;
  }
  planesEl.style.height = `${Math.round((stations.length - 1) * h * 1.25 + h)}px`;
  measureScroll();
  for (const st of stations) {
    const wide = st.id === 'opening' || st.id === 'hit-it';
    const sideForm = st.sculpture || st.extra === 'breathing-glyphs' || st.extra === 'fractal';
    const textPx = wide ? Math.min(w * 0.64, 1000) : Math.round(clamp(w * 0.37, 380, 600));
    st.words.style.width = `${textPx}px`;
    const tw = textPx * px;
    st.wordsObj.scale.setScalar(px);
    const place = PLACE[st.id] || {};
    const textX = wide ? -W * 0.06 : place.text === 'right' ? W / 2 - W * 0.1 - tw / 2 : place.text === 'centre' ? 0 : -W / 2 + W * (sideForm ? 0.07 : 0.12) + tw / 2;
    st.wordsObj.position.set(textX, H * (place.textY || 0), st.z + 0.25);
    st.words.classList.toggle('words-centre', place.text === 'centre');
    if (st.sculpture) {
      const g = st.sculpture.group, close = st.kind === 'close';
      g.scale.setScalar(H * (place.size || (close ? 0.42 : 0.27)));
      g.position.set(W * (place.shape ?? (close ? 0.16 : 0.175)), close ? -H * 0.04 : H * (place.shapeY || 0), st.z + (close ? 0.5 : 0));
    }
    for (const obj of st.extras) {
      obj.scale.setScalar(px);
      const k = obj.userData.kind;
      if (k === 'inscription') obj.position.set(st.sculpture ? st.sculpture.group.position.x : W * 0.17, H * 0.33, st.z + 0.4);
      if (k === 'breathing') obj.position.set(W * 0.22, 0, st.z);
      if (k === 'fractal') obj.position.set(W * 0.22, 0, st.z - 0.2);
    }
  }
  if (legendMesh) { const r = byId.resonance; legendMesh.scale.setScalar(W * 1.5); legendMesh.position.set(0, 0, r.z - 1.2); }
  anamorph?.layout({ W, H, plane: astraSt.z, hold: HOLD, y: 0 });
}

const narrow = matchMedia('(max-width: 759px), (max-height: 479px)');
function chooseLayout() { setDepth(Boolean(renderer) && !narrow.matches); }
narrow.addEventListener('change', () => { chooseLayout(); layout(); });

for (const st of stations) {
  const b = make('button', st.glyph ? 'rail-glyph' : 'rail-mark', railEl);
  b.type = 'button';
  if (st.glyph) b.dataset.glyph = st.glyph;
  b.setAttribute('aria-label', st.label);
  b.dataset.label = st.label;
  b.addEventListener('click', () => choose(st.i));
  st.railButton = b;
  if (st.el.dataset.pocket) {

    const m = make('button', 'rail-pocket', railEl);
    m.type = 'button'; m.setAttribute('aria-label', st.el.dataset.pocket); m.dataset.label = st.el.dataset.pocket;
    m.hidden = !state.pockets.includes(st.i);
    m.addEventListener('click', () => travelToPocket(st.i));
    if (st.fork) m.classList.add('rail-fork');
    st.pocketMark = m;
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
const thread = document.createElementNS(SVGNS, 'svg'); thread.setAttribute('class', 'thread'); thread.setAttribute('aria-hidden', 'true');
const threadGlow = document.createElementNS(SVGNS, 'path'); threadGlow.setAttribute('class', 'thread-glow');
const threadPath = document.createElementNS(SVGNS, 'path'); threadPath.setAttribute('class', 'thread-path');
thread.append(threadGlow, threadPath); railEl.prepend(thread);
const threadHere = make('span', 'thread-here', railEl); threadHere.setAttribute('aria-hidden', 'true');
const bend = { y: -1, ys: [], top: 0, bottom: 0, d: '', out: 0 };

function measureThread() {
  if (!stations[0].railButton) return;
  const r = railEl.getBoundingClientRect();
  if (!r.height) return;
  bend.ys = stations.map(st => { const b = st.railButton.getBoundingClientRect(); return b.top - r.top + b.height / 2; });
  bend.top = bend.ys[0]; bend.bottom = bend.ys.at(-1); bend.d = '';
  thread.setAttribute('viewBox', `0 0 40 ${Math.round(r.height)}`); thread.style.height = `${Math.round(r.height)}px`;
}

const threadStage = () => (depth ? stageNow() : flowStage);
const stageY = s => { const ys = bend.ys, i = clamp(Math.floor(s), 0, ys.length - 1), j = Math.min(ys.length - 1, i + 1); return lerp(ys[i], ys[j], clamp(s - i, 0, 1)); };
function stepThread(dt) {
  if (!bend.ys.length) return;
  const to = stageY(threadStage());
  if (bend.y < 0) bend.y = to;
  bend.y += (to - bend.y) * Math.min(1, dt * 6);
  const out = 6 + rhythm.swells[2].level * 2.5, wide = 24 + rhythm.swells[1].level * 6;
  setStyle(threadHere, 'transform', `translate(${(-out).toFixed(1)}px, ${bend.y.toFixed(1)}px)`);
  let d = '';
  for (let y = bend.top - 10; y <= bend.bottom + 10; y += 5) { const t = (y - bend.y) / wide; d += `${d ? 'L' : 'M'}${(20 - out * Math.exp(-t * t)).toFixed(1)} ${y.toFixed(0)}`; }
  if (d !== bend.d) { bend.d = d; threadPath.setAttribute('d', d); threadGlow.setAttribute('d', d); }
}

let scrubbedAt = -1e9;
{
  let drag = null;
  railEl.addEventListener('pointerdown', e => { if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('.rail-step')) return; drag = { y: e.clientY, id: e.pointerId, moved: false }; });
  railEl.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) { if (Math.abs(e.clientY - drag.y) < 6) return; drag.moved = true; railEl.setPointerCapture?.(e.pointerId); flight = null; momentum.v = 0; body.classList.add('scrubbing'); }
    scrubTo(e.clientY);
  });
  const end = () => { if (drag?.moved) { scrubbedAt = performance.now(); body.classList.remove('scrubbing'); } drag = null; };
  railEl.addEventListener('pointerup', end); railEl.addEventListener('pointercancel', end);

  railEl.addEventListener('click', e => { if (performance.now() - scrubbedAt < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
}
function scrubTo(clientY) {
  const ys = bend.ys; if (!ys.length) return;
  const y = clientY - railEl.getBoundingClientRect().top;
  let i = 0; while (i < ys.length - 2 && ys[i + 1] < y) i++;
  const f = clamp((y - ys[i]) / Math.max(1, ys[i + 1] - ys[i]), 0, 1);
  if (depth) { scrollToY(clamp((i + f) / (stations.length - 1), 0, 1) * scrollMax()); return; }
  const A = flowAnchors; if (A.length !== stations.length) return;
  scrollToY(lerp(A[i], A[i + 1], f < 0.02 ? 0 : 0.38 + 0.62 * f));
}
const titleBtn = make('button', 'title-pill', body); titleBtn.type = 'button'; titleBtn.setAttribute('aria-haspopup', 'dialog');
const scrim = make('div', 'sheet-scrim', body);
const sheet = make('div', 'sheet', body); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'scrollable glyph energy zones'); sheet.hidden = true;
const grabber = make('button', 'sheet-grabber', sheet); grabber.type = 'button'; grabber.setAttribute('aria-label', 'Close');
const sheetList = make('div', 'sheet-list', sheet);
const sheetRows = stations.map(st => {
  const a = make('a', st.glyph ? 'sheet-row zone' : 'sheet-row', sheetList); a.href = `#${st.id}`;
  make('span', 'sheet-glyph', a).textContent = st.glyph || '·'; make('span', 'sheet-label', a).textContent = st.label;
  let p = null;
  if (st.el.dataset.pocket) { p = make('a', 'sheet-row pocket', sheetList); p.href = `#pocket-${st.i}`; make('span', 'sheet-glyph', p).textContent = '◦'; make('span', 'sheet-label', p).textContent = st.el.dataset.pocket; p.hidden = !state.pockets.includes(st.i); }
  return { a, p };
});

for (const [href, glyph, words] of [['/', '🌀', 'an interactive sculpture that visually breathes'], ['/portals', '🖋️', 'Journaling as ACCESS to resonance channels.']]) {
  const a = make('a', 'sheet-row elsewhere', sheetList); a.href = sitePath(href);
  make('span', 'sheet-glyph', a).textContent = glyph; make('span', 'sheet-label', a).textContent = `${words} ↗`;
}
const bars = make('div', 'sheet-bars', sheet);
function bar(name, key, min, max, unit) {
  const label = make('label', 'sheet-bar', bars); make('span', null, label).textContent = name;
  const out = make('output', null, label);
  const input = make('input', null, label); input.type = 'range'; input.min = min; input.max = max; input.step = 1; input.value = state[key];
  const apply = () => { state[key] = Number(input.value); out.textContent = `${state[key]}${unit}`; applyBars(); };
  input.addEventListener('input', () => { apply(); save(); });
  apply();
}
function applyBars() { rhythm.rate = 12 / state.cycle; rhythm.variance = 0.25 + state.chaos / 35 * 0.75; }
bar('Cycle', 'cycle', 6, 24, ' s'); bar('Chaos', 'chaos', 0, 100, '%');
const sheetPause = make('button', 'sheet-pause', sheet); sheetPause.type = 'button';

const rendererBtn = make('button', 'sheet-pause sheet-renderer', sheet); rendererBtn.type = 'button';
rendererBtn.textContent = drawnWith.startsWith('webgpu') ? 'drawn with WebGPU · switch to WebGL' : gpuMissing ? 'drawn with WebGL · no WebGPU in this browser' : 'drawn with WebGL · switch to WebGPU';
rendererBtn.disabled = gpuMissing && !drawnWith.startsWith('webgpu');
rendererBtn.addEventListener('click', () => {
  state.renderer = drawnWith.startsWith('webgpu') ? 'webgl' : 'webgpu'; save();
  const u = new URL(location.href); u.searchParams.delete('renderer'); location.replace(u.href);
});
function openSheet() { sheet.hidden = false; sheet.style.setProperty('--rise', `${Math.round(vary(420, 0.6))}ms`); requestAnimationFrame(() => body.classList.add('sheet-open')); titleBtn.setAttribute('aria-expanded', 'true'); sheetRows[current].a.focus({ preventScroll: true }); }
function closeSheet() { if (sheet.hidden) return; body.classList.remove('sheet-open'); titleBtn.setAttribute('aria-expanded', 'false'); setTimeout(() => { if (!body.classList.contains('sheet-open')) sheet.hidden = true; }, 380); }
titleBtn.addEventListener('click', () => sheet.hidden ? openSheet() : closeSheet());
scrim.addEventListener('click', closeSheet); grabber.addEventListener('click', closeSheet);
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
{
  let from = null;
  sheet.addEventListener('pointerdown', e => { if (e.target.closest('a, .sheet-pause, .sheet-bars') || sheetList.scrollTop > 0) return; from = e.clientY; });
  addEventListener('pointermove', e => { if (from == null) return; sheet.style.setProperty('--drag', `${Math.max(0, e.clientY - from)}px`); });
  addEventListener('pointerup', e => { if (from == null) return; const d = e.clientY - from; from = null; sheet.style.setProperty('--drag', '0px'); if (d > 90) closeSheet(); });
}
function showPlace() {
  const st = stations[current];
  titleBtn.textContent = st.label;
  sheetRows.forEach((r, i) => i === current ? r.a.setAttribute('aria-current', 'page') : r.a.removeAttribute('aria-current'));
}

let flight = null;
let current = 0;

let flowAnchors = [], flowStage = 0;
function measureFlow() {
  if (depth !== false) return;
  const max = scrollMax(), n = stations.length, gap = Math.min(vh() * 0.3, 180);
  flowAnchors = stations.map(st => st.el.getBoundingClientRect().top + window.scrollY);
  for (let i = n - 1; i >= 0; i--) flowAnchors[i] = Math.max(0, Math.min(flowAnchors[i], i === n - 1 ? max : flowAnchors[i + 1] - gap));
  flowAnchors[0] = 0;
}
function stationScroll(i) {
  if (!depth) return stations[i].el.getBoundingClientRect().top + scrollY - vh() * 0.08;
  const max = scrollMax();
  return i / (stations.length - 1) * max;
}
function travelTo(i) {
  const target = stationScroll(i);
  if (reduced || !depth) { scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' }); return; }
  const distance = Math.abs(i - current);
  flight = { from: scrollPos(), to: target, start: performance.now(), dur: vary(clamp(1.3 + distance * 0.42, 1.3, 4.8) * 1000) };
}
function travelToPocket(k) {
  if (!depth) return;
  state.choices++; save();
  const max = scrollMax();
  const to = (k + HOLD_SHARE + (1 - HOLD_SHARE) * 0.5) / (stations.length - 1) * max;
  if (reduced) { scrollToY(to); return; }
  flight = { from: scrollPos(), to, start: performance.now(), dur: clamp(1.3 + Math.abs(k + 0.5 - current) * 0.42, 1.3, 4.8) * 1000 };
}
for (const type of ['wheel', 'touchstart', 'keydown']) addEventListener(type, () => { flight = null; }, { passive: true });

const momentum = { v: 0 };
const isNotch = e => e.deltaMode === 1 || (e.wheelDeltaY !== undefined && e.wheelDeltaY !== 0 && Math.abs(e.wheelDeltaY) % 120 === 0 && Math.abs(e.deltaY) >= 50);
addEventListener('wheel', e => {
  if (!depth || reduced || e.ctrlKey || e.defaultPrevented || probe.get('momentum') === '0' || !isNotch(e)) return;
  if (e.target?.closest?.('.sheet, .site-map, .show-pace-panel')) return;
  e.preventDefault();
  const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;

  momentum.v = clamp(momentum.v + px * MOMENTUM_DECAY * 1.15, -9000, 9000);
}, { passive: false });
const MOMENTUM_DECAY = 5.2;

function goTo(hash, instant = false) {
  const id = hash.replace(/^#/, '');
  const m = /^pocket-(\d+)$/.exec(id);
  if (m && stations[Number(m[1])]?.el.dataset.pocket) { if (instant && depth) { const max = scrollMax(); scrollToY((Number(m[1]) + HOLD_SHARE + (1 - HOLD_SHARE) * 0.5) / (stations.length - 1) * max); } else travelToPocket(Number(m[1])); return true; }
  if (!byId[id]) return false;
  if (instant) scrollToY(stationScroll(byId[id].i)); else choose(byId[id].i);
  return true;
}
let addressed = '';
function address(hash) {
  if (hash === addressed) return; addressed = hash;
  try { history.replaceState(null, '', hash); } catch {   }
  if (started) { state.last = hash; save(); }
}
addEventListener('hashchange', () => { if (location.hash !== addressed) goTo(location.hash); });
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || e.defaultPrevented) return;
  if (goTo(a.getAttribute('href'))) { e.preventDefault(); closeSheet(); }
});

function choose(i) {
  state.choices++; save();
  const t = byId.transformation;
  if (t.fade > 0.3 && !breakFx.running) triggerBreak(0.35);
  travelTo(i);
}

const pointer = { x: 0, y: 0, inside: false, moved: 0, lastX: 0, lastY: 0, lastT: 0 };
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
addEventListener('pointermove', e => {
  const now = performance.now();
  const speed = Math.hypot(e.clientX - pointer.lastX, e.clientY - pointer.lastY) / Math.max(8, now - pointer.lastT);
  Object.assign(pointer, { x: e.clientX, y: e.clientY, inside: true, lastX: e.clientX, lastY: e.clientY, lastT: now });
  rhythm.enter();
  rhythm.input('move', clamp(speed * 0.025, 0, 0.07), now);
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { pointer.inside = false; rhythm.leave(); });
addEventListener('blur', () => { pointer.inside = false; rhythm.leave(); });
addEventListener('wheel', () => rhythm.input('scroll', 0.05, performance.now()), { passive: true });
addEventListener('pointerdown', () => rhythm.input('click', 0.15, performance.now()), { passive: true });

let typed = '';
const TRAVEL_WORDS = [['pulse', 'pulse'], ['threads', 'threads'], ['portals', 'glyphic'], ['transformation', 'transformation'], ['polarity', 'polarity'],
  ['expansion', 'expansion'], ['symmetry', 'symmetry'], ['astra', 'astra'], ['resonators', 'resonators'], ['journaling', 'resonators'], ['codes', 'spiritual-codes'], ['resonance', 'resonance'], ['legends', 'resonance']];
addEventListener('keydown', e => {
  rhythm.input('key', 0.08, performance.now());
  if (e.target.closest?.('input, textarea, [contenteditable]')) return;
  if (e.key.length === 1) {
    typed = (typed + e.key.toLowerCase()).slice(-12);
    if (typed.endsWith('shift')) { typed = ''; visualShift(); }

    for (const [word, id] of TRAVEL_WORDS) if (typed.endsWith(word)) { typed = ''; goTo(id); break; }
  }
});
let hoverAt = 0;
document.addEventListener('pointerover', e => {
  if (!e.target.closest?.('.words strong, .words em')) return;
  const now = performance.now();
  if (now - hoverAt < 500) return;
  hoverAt = now;
  const st = stations[current];
  (st.sculpture || nearestSculpture())?.pulse(Math.random() * 6.28, 0.6, time);
  insight(0.35);
});
const overlay = make('div', 'overlay', body);
overlay.setAttribute('aria-hidden', 'true');
overlay.textContent = Array.from({ length: 400 }, (_, k) => ['☍', '♇', '♃', '❖'][k % 4]).join(' ');
function visualShift() {
  state.shift = (state.shift + 0.17) % 1; save();
  insight(1);
  body.classList.remove('shifting'); void overlay.offsetWidth; body.classList.add('shifting');
  setTimeout(() => body.classList.remove('shifting'), 2600);
}

function nearestSculpture() {
  let best = null, bestD = Infinity;
  for (const st of stations) if (st.sculpture) { const d = Math.abs(camera.position.z - HOLD - st.z); if (d < bestD) { bestD = d; best = st.sculpture; } }
  return best;
}

function pointerOn(st) {
  if (!pointer.inside || !st?.sculpture) return null;
  ndc.set(pointer.x / vw() * 2 - 1, -(pointer.y / vh()) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const centre = st.sculpture.group.getWorldPosition(new THREE.Vector3());
  const point = raycaster.ray.closestPointToPoint(centre, new THREE.Vector3());
  const reach = st.sculpture.radiusWorld() * 1.6, d = point.distanceTo(centre);
  return d < reach ? { point, strength: 1 - d / reach, d } : null;
}

let drag = null;
if (renderer) renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (pocket.open > 0.6) { pocketTouch(); return; }
  const st = stations[current];
  const hit = pointerOn(st);
  if (!hit || hit.d > st.sculpture.radiusWorld() * 1.1) return;
  drag = { st, x: e.clientX, y: e.clientY, total: 0 };
  if (st.kind === 'cycle') holdCycle(true, rhythm.breath);
  renderer.domElement.setPointerCapture(e.pointerId);
});
if (renderer) renderer.domElement.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.total += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  const s = drag.st.sculpture;
  if (drag.st.kind === 'cycle' && rhythm.manual) { rhythm.manual.value = clamp(rhythm.manual.value - dy / 220, 0, 1); rhythm.manual.target = null; trackCycle(rhythm.manual.value); }
  else { s.yaw += dx * 0.006; s.pitch = clamp(s.pitch + dy * 0.005, -1.2, 1.2); }
});
const endDrag = () => {
  if (!drag) return;
  const { st, total } = drag;
  drag = null;
  if (st.kind === 'cycle') holdCycle(false);
  if (total < 6) {
    st.sculpture.pulse(Math.random() * 6.28, 1, time);
    if (st.kind === 'break') triggerBreak(1); else wordsAct(st);
    if (st.kind === 'flip') toggleFlip();
  }
};
if (renderer) { renderer.domElement.addEventListener('pointerup', endDrag); renderer.domElement.addEventListener('pointercancel', endDrag); }

const handles = [];
function handle(st, glyph, label, anchor, actions) {
  const b = make('button', 'anchor', handlesEl);
  b.type = 'button'; b.textContent = glyph; b.setAttribute('aria-label', label);
  const h = { b, st, anchor, visible: false };
  if (actions.click) b.addEventListener('click', actions.click);
  if (actions.hold) {
    const on = e => { e.preventDefault(); actions.hold(true); };
    const off = () => actions.hold(false);
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off);
    b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); actions.hold(true); } });
    b.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') actions.hold(false); });
  }
  if (actions.drag) actions.drag(b, h);
  handles.push(h);
  return h;
}
const zoneIndex = g => stations.find(s => s.glyph === g).i;
const pulseSt = byId.pulse;
if (pulseSt.sculpture) ['♇', '☍', '♃', '❖'].forEach((g, i) => {

  const zone = stations[zoneIndex(g)];
  handle(pulseSt, g, zone.label, out => pulseSt.sculpture.anchor(i * 16 + 3, i * 23 + 8, out), { click: () => choose(zone.i) });
});
const T = byId.transformation, P = byId.polarity, C = byId.expansion;
if (T.sculpture) handle(T, '♇', 'watch it break apart, twist, and rebuild as they engage', out => T.sculpture.anchor(7, 30, out), { click: () => triggerBreak(1) });
if (P.sculpture) handle(P, '☍', '☍ (polarity)', out => P.sculpture.anchor(19, 60, out), { click: () => { wordsAct(P); toggleFlip(); } });
if (C.sculpture) handle(C, '♃', 'contraction/expansion cycle of existence (thanks, ♃)', out => C.sculpture.anchor(35, 20, out), { hold: on => holdCycle(on) });
if (sym.st.sculpture) for (let p = 0; p < 4; p++) {
  handle(sym.st, '❖', '❖ (divine symmetry)', out => sym.st.sculpture.pieceWorld(p, out, 1.0), {
    drag: (b) => {
      let last = null;
      b.addEventListener('pointerdown', e => { if (sym.locked[p]) return; last = { x: e.clientX, y: e.clientY }; b.setPointerCapture(e.pointerId); b.classList.add('held'); });
      b.addEventListener('pointermove', e => { if (!last) return; movePiece(p, e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; });
      const up = () => { if (!last) return; last = null; b.classList.remove('held'); settlePiece(p); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      b.addEventListener('keydown', e => {
        const d = { ArrowLeft: [-14, 0], ArrowRight: [14, 0], ArrowUp: [0, -14], ArrowDown: [0, 14] }[e.key];
        if (!d || sym.locked[p]) return;
        e.preventDefault(); movePiece(p, d[0], d[1]); settlePiece(p);
      });
    },
  });
}

const breakFx = { e: 0, goal: 0, hold: 0, running: false, clones: null, peak: 1 };
function triggerBreak(strength) {
  if (breakFx.running || !T.sculpture) return;
  Object.assign(breakFx, { running: true, goal: strength, peak: strength, hold: 0, out: curve(), back: curve(), up: vary(1.4), down: vary(2.3), rest: vary(0.7, 0.8) });
  if (strength > 0.5) insight(0.6);

  if (strength > 0.3 && T.sculpture) fallThrough(T, { count: 3 + Math.round(strength * 2), from: () => T.sculpture.pieceWorld(Math.floor(Math.random() * T.sculpture.pieceCount)), power: 1.1 });
  if (depth && T.wordsObj && T.fade > 0.2) {
    const px = T.wordsObj.scale.x, bw = T.words.offsetWidth, bh = T.words.offsetHeight;
    breakFx.clones = breakWords.map((span, i) => {
      const el = span.cloneNode(true);
      el.className = span.closest('strong') ? 'w flying strong' : 'w flying';
      el.setAttribute('aria-hidden', 'true'); el.style.font = getComputedStyle(span).font;
      const obj = new CSS3DObject(el); obj.scale.setScalar(px);
      const home = T.wordsObj.position.clone().add(new THREE.Vector3((span.offsetLeft + span.offsetWidth / 2 - bw / 2) * px, -(span.offsetTop + span.offsetHeight / 2 - bh / 2) * px, 0.02));
      obj.position.copy(home); cssScene.add(obj);
      const away = home.clone().sub(T.wordsObj.position).setZ(0);
      away.x += (seeded(i + 21) - 0.5) * 0.3; away.y += (seeded(i + 22) - 0.5) * 0.3;
      away.normalize().multiplyScalar(0.16 + seeded(i + 23) * 0.34).setZ((seeded(i + 11) - 0.5) * 1.6);
      return { obj, home, ease: curve(), away: home.clone().add(away), spin: new THREE.Euler((seeded(i) - 0.5) * 0.9, (seeded(i + 9) - 0.5) * 2.4, (seeded(i + 31) - 0.5) * 0.9) };
    });
    T.words.classList.add('broken');
  }
}
const tmpV = new THREE.Vector3();
function stepBreak(dt) {
  if (!breakFx.running) return;
  if (breakFx.goal > 0) {
    breakFx.e = Math.min(breakFx.goal, breakFx.e + dt / breakFx.up);
    if (breakFx.e >= breakFx.goal && (breakFx.hold += dt) > breakFx.rest) breakFx.goal = 0;
  } else breakFx.e = Math.max(0, breakFx.e - dt / breakFx.down);
  const e = (breakFx.goal > 0 ? breakFx.out : breakFx.back)(breakFx.e);
  T.sculpture.setBreak(e, { twist: 1 + Math.min(state.flips, 6) * 0.12, push: 1 + Math.min(state.visited.length, 15) * 0.03 });
  if (breakFx.clones) {
    const n = breakFx.clones.length, rebuilding = breakFx.goal === 0, r = 1 - breakFx.e / breakFx.peak;
    breakFx.clones.forEach((c, i) => {

      const ei = rebuilding ? 1 - c.ease(clamp((r - (i / n) * 0.55) / 0.45, 0, 1)) : e / Math.max(0.001, breakFx.peak) ;
      const k = ei * breakFx.peak;
      c.obj.position.lerpVectors(c.home, c.away, k);
      c.obj.rotation.set(c.spin.x * k, c.spin.y * k, c.spin.z * k);
    });
  }
  if (!depth) breakWords.forEach((w, i) => { w.style.transform = e > 0.001 ? `translate(${((seeded(i) - 0.5) * 160 * e).toFixed(1)}px, ${((seeded(i + 3) - 0.5) * 90 * e).toFixed(1)}px) rotate(${((seeded(i + 7) - 0.5) * 70 * e).toFixed(1)}deg)` : ''; });
  if (breakFx.goal === 0 && breakFx.e === 0) {
    breakFx.running = false;
    if (breakFx.clones) { for (const c of breakFx.clones) cssScene.remove(c.obj); breakFx.clones = null; }
    T.words.classList.remove('broken');
    if (breakFx.peak > 0.5) { state.rebuilds++; save(); checkSupernova(); }
  }
}

const WORD_MOVES = {

  pulse: (w, i, n, C, S) => ({ away: w.home.clone().add(w.home.clone().sub(S).setZ(0).normalize().multiplyScalar(0.2)).setZ(w.home.z + 0.45), spin: [0, (seeded(i) - 0.5) * 0.5, 0], delay: i / n * 0.7 }),

  close: (w, i, n, C, S) => { const pull = 0.1 + 0.3 * clamp(1 - (S.x - w.home.x) / 3, 0, 1); return { away: w.home.clone().add(S.clone().sub(C).setZ(0).multiplyScalar(pull)).setZ(w.home.z + pull * 1.6), spin: [0, -pull * 1.4, 0], delay: clamp((S.x - w.home.x) / 3, 0, 1) * 0.5 }; },

  flip: (w, i) => { const d = i % 2 ? 1 : -1; return { away: w.home.clone().add(new THREE.Vector3(d * 0.42, -d * 0.12, d * 0.6)), spin: [0, d * 0.9, d * 0.08], delay: 0 }; },

  cycle: (w, i, n, C) => ({ away: C.clone().add(w.home.clone().sub(C).multiplyScalar(1.28)).setZ(w.home.z + 0.55), spin: [0, 0, 0], delay: w.home.distanceTo(C) * 0.12 }),

  symmetry: (w, i, n, C) => ({ away: new THREE.Vector3(2 * C.x - w.home.x, w.home.y, w.home.z + 0.3 * Math.sin(i)), spin: [0, Math.PI, 0], delay: Math.abs(w.home.x - C.x) * 0.25 }),
};
WORD_MOVES.return = WORD_MOVES.pulse;
const wordFx = [];
function wordsAct(st) {
  const move = WORD_MOVES[st.kind];
  const why = !move ? 'no move for this plane' : !depth ? 'flow layout' : !st.wordsObj ? 'no words object' : st.fade < 0.2 ? `plane not in view (fade ${st.fade.toFixed(2)})` : wordFx.some(f => f.st === st) ? 'already moving' : '';
  if (why) return why;
  st.spans ||= splitWords(st.words);
  const px = st.wordsObj.scale.x, bw = st.words.offsetWidth, bh = st.words.offsetHeight, C = st.wordsObj.position.clone();
  const S = st.sculpture.group.getWorldPosition(new THREE.Vector3()), n = st.spans.length;
  const clones = st.spans.map((span, i) => {
    const el = span.cloneNode(true), cs = getComputedStyle(span);
    el.className = 'w flying'; el.setAttribute('aria-hidden', 'true'); el.style.font = cs.font; el.style.color = cs.color; el.style.letterSpacing = cs.letterSpacing;
    const obj = new CSS3DObject(el); obj.scale.setScalar(px);
    const w = { obj, home: C.clone().add(new THREE.Vector3((span.offsetLeft + span.offsetWidth / 2 - bw / 2) * px, -(span.offsetTop + span.offsetHeight / 2 - bh / 2) * px, 0.02)), ease: curve() };
    Object.assign(w, move(w, i, n, C, S));
    obj.position.copy(w.home); cssScene.add(obj);
    return w;
  });
  st.words.classList.add('broken');
  const late = Math.max(...clones.map(c => c.delay));
  wordFx.push({ st, clones, late, e: 0, goal: 1, hold: 0, up: vary(1.1), down: vary(1.7), rest: vary(0.5, 0.8) });
  insight(0.35);
  fallThrough(st, { count: 2 });
  return 'started';
}
function stepWords(dt) {
  for (let f = wordFx.length - 1; f >= 0; f--) {
    const fx = wordFx[f];
    if (fx.goal > 0) { fx.e = Math.min(1, fx.e + dt / fx.up); if (fx.e >= 1 && (fx.hold += dt) > fx.rest) fx.goal = 0; }
    else fx.e = Math.max(0, fx.e - dt / fx.down);
    const n = fx.clones.length;
    fx.clones.forEach((c, i) => {

      const t = fx.goal > 0 ? clamp(fx.e * (1 + fx.late) - c.delay, 0, 1) : 1 - clamp(((1 - fx.e) - (i / n) * 0.5) / 0.5, 0, 1);
      const k = c.ease(t);
      c.obj.position.lerpVectors(c.home, c.away, k);
      c.obj.rotation.set(c.spin[0] * k, c.spin[1] * k, c.spin[2] * k);
    });
    if (fx.goal === 0 && fx.e === 0) { for (const c of fx.clones) cssScene.remove(c.obj); fx.st.words.classList.remove('broken'); wordFx.splice(f, 1); }
  }
}

let modeValue = state.polarity === 'crystal' ? 1 : 0;
rhythm.speed = state.polarity === 'crystal' ? 1.3 : 0.85;
inscription.setAttribute('aria-pressed', String(state.polarity === 'crystal'));
inscription.addEventListener('click', () => toggleFlip());
function toggleFlip() {
  state.polarity = state.polarity === 'shadow' ? 'crystal' : 'shadow';
  state.flips++; state.choices++; save();
  body.dataset.polarity = state.polarity;
  inscription.setAttribute('aria-pressed', String(state.polarity === 'crystal'));
  rhythm.speed = state.polarity === 'crystal' ? 1.3 : 0.85;
  P.sculpture?.pulse(0, 1.2, time);
  flipWave = { at: frameClock, from: current };
  fallThrough(P, { count: 2 });
  insight(0.7);
  checkSupernova();
}

let cycleHigh = false;
function holdCycle(on, from = rhythm.breath) {
  if (on) { rhythm.manual = { value: from, weight: 1, held: true, target: 1 }; fallThrough(byId.expansion, { count: 2, power: 0.8 }); }
  else if (rhythm.manual) { rhythm.manual.held = true; rhythm.manual.target = 0; rhythm.manual.release = true; }
}
function trackCycle(v) {
  if (v > 0.92) cycleHigh = true;
  if (cycleHigh && v < 0.08 && !state.cycled) { state.cycled = true; save(); insight(0.6); checkSupernova(); }
}
function stepCycle(dt) {
  const m = rhythm.manual;
  if (!m || m.target == null) return;
  m.value += (m.target - m.value) * Math.min(1, dt * 1.6);
  trackCycle(m.value);
  if (m.release && m.value < 0.03) { m.release = false; m.target = null; m.held = false; }
}

function pieceGap(p, offset) {
  const s = sym.st.sculpture, at = v => s.group.localToWorld(s.centres[p].clone().add(v)).project(camera);
  const a = at(offset), b = at(new THREE.Vector3());
  return Math.hypot((a.x - b.x) * vw() / 2, (a.y - b.y) * vh() / 2);
}
function movePiece(p, dx, dy) {
  const s = sym.st.sculpture, dist = camera.position.distanceTo(s.group.position);
  const wpp = 2 * dist * Math.tan(FOV / 2 * Math.PI / 180) / vh();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const delta = right.multiplyScalar(dx * wpp).add(up.multiplyScalar(-dy * wpp));
  delta.divideScalar(s.group.scale.x).applyQuaternion(s.group.quaternion.clone().invert());
  sym.base[p].add(delta);

  const toward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).applyQuaternion(s.group.quaternion.clone().invert());
  const across = sym.base[p].clone().addScaledVector(toward, -sym.base[p].dot(toward));
  sym.start ||= [];
  sym.start[p] ||= { gap: Math.max(60, pieceGap(p, sym.t0[p])), depth: sym.t0[p].dot(toward) };
  const gap = pieceGap(p, across);
  sym.base[p].copy(across).addScaledVector(toward, sym.start[p].depth * clamp(gap / sym.start[p].gap, 0, 1));
  sym.gap ||= []; sym.gap[p] = gap;
  rhythm.input('move', 0.03, performance.now());
}
function settlePiece(p) {
  if ((sym.gap?.[p] ?? pieceGap(p, sym.base[p])) < 26) { sym.base[p].set(0, 0, 0); sym.locked[p] = true; sym.st.sculpture.pulse(p * 1.5, 0.8, time); }
  if (sym.locked.every(Boolean) && !state.resonance) resonance();
}

function resonance() {
  state.resonance = true; save();
  rhythm.lock = 1;
  insight(1);
  body.classList.add('resonance'); setTimeout(() => body.classList.remove('resonance'), 7000);
  fallThrough(byId.symmetry, { count: 6, power: 1.3 });
  checkSupernova();
}
function stepSymmetry() {
  const s = sym.st.sculpture; if (!s) return;
  s.breakAmount = sym.locked.every(Boolean) ? 0 : 1;
  for (let p = 0; p < 4; p++) {
    const f = sym.t0[p].length() ? clamp(sym.base[p].length() / sym.t0[p].length(), 0, 1) : 0;
    s.pieceQ[p].slerpQuaternions(new THREE.Quaternion(), sym.q0[p], sym.locked[p] ? 0 : f);
    s.pieceT[p].copy(sym.base[p]);

    if (!sym.locked[p]) s.pieceT[p].y += Math.sin(time * 0.6 + p * 1.7) * 0.025;
  }
}

let litValue = state.lit ? 0.35 : 0, litTarget = litValue;
function checkSupernova() {
  if (state.lit || !(state.rebuilds > 0 && state.flips > 0 && state.cycled && state.resonance)) return;
  state.lit = true; save();
  litValue = 1; litTarget = 0.35;
  body.classList.add('lit', 'supernova');
  setTimeout(() => body.classList.remove('supernova'), 4200);
}

let calm = 0, insightV = 0;
function insight(amount) { insightV = Math.max(insightV, amount); }
const resonator = make('button', 'resonator', body);
resonator.type = 'button';
resonator.setAttribute('aria-label', 'inviting them to breathe into its shape for clarity or emotion');
const res = { shown: false, at: -1e9, held: false, value: 0, lastActive: -1e9, idleSince: 0 };
const holdRes = on => { res.held = on; if (on) res.idleSince = 0; };
resonator.addEventListener('pointerdown', e => { e.preventDefault(); holdRes(true); });
for (const t of ['pointerup', 'pointerleave', 'pointercancel']) resonator.addEventListener(t, () => holdRes(false));
resonator.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdRes(true); } });
resonator.addEventListener('keyup', () => holdRes(false));
function stepResonator(dt, now) {
  if (rhythm.energy > 0.3) res.lastActive = now;
  if (!res.shown && !flight && now - res.lastActive < 6000 && rhythm.stillFor(now) > 2400 && now - res.at > 40000) {
    res.shown = true; res.at = now; res.idleSince = now;
    resonator.textContent = ['♇', '☍', '♃', '❖'][Math.floor(Math.random() * 4)];
    resonator.style.setProperty('--x', `${Math.round(vw() * (0.18 + Math.random() * 0.2))}px`);
    resonator.style.setProperty('--y', `${Math.round(vh() * (0.62 + Math.random() * 0.18))}px`);
    resonator.classList.add('shown');
  }
  res.value += ((res.held ? 1 : 0) - res.value) * Math.min(1, dt * (res.held ? 0.5 : 0.9));
  setVar(resonator, '--hold', res.value.toFixed(2));
  if (res.shown && !res.held && res.value < 0.02 && res.idleSince && now - res.idleSince > 7000) { res.shown = false; resonator.classList.remove('shown'); }
  if (res.shown && !res.held && !res.idleSince) res.idleSince = now;
}

const pauseBtn = $('#pause');
function setPaused(on) { rhythm.paused = on; pauseBtn.setAttribute('aria-pressed', String(on)); pauseBtn.textContent = sheetPause.textContent = on ? 'Resume motion' : 'Pause motion'; }
sheetPause.addEventListener('click', () => setPaused(!rhythm.paused));
pauseBtn.addEventListener('click', () => setPaused(!rhythm.paused));
setPaused(reduced);

const pocketForms = renderer ? [0, 1, 2, 3].map(f => { const t = new ThreadsKind(f); t.chaos = 0.6; t.breathScale = 1.4; t.group.visible = false; scene.add(t.group); return t; }) : [];
const pocket = { k: -1, open: 0, stillAt: 0, lastY: -1, turn: 0, form: 0, ring: new THREE.Group(), words: [], branches: [], treading: null, treadTimer: 0 };
cssScene.add(pocket.ring);
function buildPocket(k) {
  for (const w of pocket.words) pocket.ring.remove(w);
  for (const b of pocket.branches) pocket.ring.remove(b.obj);
  pocket.branches = [];
  pocket.k = k; pocket.form = k % 4; pocket.turn = 0;
  const R = 2.3, scale = view.px * R / HOLD, size = 56;

  const lift = stations[k].fork ? 0.34 : 0;
  const parts = stations[k].el.dataset.pocket.split(' ');
  const widths = parts.map(w => (w.length + 1) * size * 0.5 * scale / R);
  let a = -widths.reduce((x, y) => x + y, 0) / 2;
  pocket.words = parts.map((text, i) => {
    const el = make('span', 'pocket-word'); el.textContent = text; el.setAttribute('aria-hidden', 'true');
    const obj = new CSS3DObject(el); obj.scale.setScalar(scale);
    const mid = a + widths[i] / 2; a += widths[i];
    obj.position.set(Math.sin(mid) * R, lift + Math.sin(i * 1.7) * 0.07, -Math.cos(mid) * R);
    obj.rotation.y = -mid;
    pocket.ring.add(obj);
    return obj;
  });
  if (stations[k].fork) buildBranches(k, R, scale);
}

const halfView = () => Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
function buildBranches(k, R, scale) {
  const st = stations[k], links = [...st.fork.querySelectorAll('a')], trod = state.trod[st.id] || [];
  const step = halfView() * (links.length > 2 ? 0.58 : 0.4);
  const angles = links.map((_, i) => (i - (links.length - 1) / 2) * step);
  pocket.branches = links.map((a, i) => {
    const el = a.cloneNode(true);
    el.className = 'pocket-branch';
    el.classList.toggle('trod', trod.includes(a.getAttribute('href')));
    const obj = new CSS3DObject(el); obj.scale.setScalar(scale);
    const ang = angles[i];

    const mid = (links.length - 1) / 2, y = -0.16 - (mid ? 0.2 * (1 - Math.abs(i - mid) / mid) : 0.1);
    obj.position.set(Math.sin(ang) * R, y, -Math.cos(ang) * R);
    obj.rotation.y = -ang;
    pocket.ring.add(obj);
    const b = { el, obj, ang, href: a.getAttribute('href'), form: Number(a.dataset.form ?? 0), held: false };
    el.addEventListener('pointerenter', () => { b.held = true; });
    el.addEventListener('pointerleave', () => { b.held = false; });
    el.addEventListener('focus', () => { b.held = true; });
    el.addEventListener('blur', () => { b.held = false; });
    el.addEventListener('click', e => tread(b, e));
    return b;
  });
}
function tread(b, e) {
  e.preventDefault(); e.stopPropagation();
  if (pocket.treading || pocket.open < 0.5) return;
  const st = stations[pocket.k], trod = (state.trod[st.id] ||= []);
  if (!trod.includes(b.href)) trod.push(b.href);
  st.fork?.querySelector(`a[href="${b.href}"]`)?.classList.add('trod');
  save();
  pocket.treading = b;
  b.el.classList.add('trod', 'treading');

  pocket.form = b.form;
  pocketForms[b.form]?.pulse(Math.random() * 6.28, 1.4, time);
  insight(0.5);
  const dest = b.href.startsWith('#') ? byId[b.href.slice(1)] : null;
  pocket.treadTimer = setTimeout(() => {
    pocket.treading = null; pocket.treadTimer = 0;
    if (dest) choose(dest.i); else location.assign(b.href);
  }, reduced ? 0 : vary(760, 0.45));
}

for (const type of ['wheel', 'touchstart', 'keydown']) addEventListener(type, () => {
  if (!pocket.treadTimer) return;
  clearTimeout(pocket.treadTimer); pocket.treadTimer = 0;
  pocket.treading?.el.classList.remove('treading'); pocket.treading = null;
}, { passive: true });

for (const st of stations) for (const a of st.fork?.querySelectorAll('a') || []) a.classList.toggle('trod', (state.trod[st.id] || []).includes(a.getAttribute('href')));
function pocketTouch() {
  state.choices++; save();
  pocket.form = (pocket.form + 1) % 4;
  pocketForms[pocket.form]?.pulse(Math.random() * 6.28, 1.2, time);
  insight(0.4);
}
const turnQ = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);

const INSIDE = [{ at: [0.91, 0, 0], scale: 4.6, pitch: -Math.PI / 2 }, { at: [0, 0, 0.37], scale: 7.5, pitch: -Math.PI / 2 }, { at: [0, 0.1, 0], scale: 1.9, pitch: 0.4 }, { at: [0, 0, 0], scale: 1.6, pitch: 0.5 }];
const insideV = new THREE.Vector3(), insideE = new THREE.Euler();

const openingSt = stations[0], openingField = Number(openingSt.el.dataset.inside ?? -1);
const openingForm = renderer && openingField >= 0 ? (() => { const t = new ThreadsKind(openingField); t.chaos = 0.5; t.breathScale = 1.6; t.group.visible = false; scene.add(t.group); return t; })() : null;
const opening = { arrive: 0, rest: new THREE.Vector3() };
function stepOpening(dt) {
  if (!openingForm) return;
  opening.arrive += (1 - opening.arrive) * Math.min(1, dt * 1.2);

  const out = clamp((openingSt.z + HOLD - camera.position.z) / GAP, 0, 1);
  const o = opening.arrive * (1 - smooth(0.12, 0.7, out));
  openingForm.group.visible = o > 0.01;
  if (!openingForm.group.visible) return;
  const inside = INSIDE[openingField], scale = inside.scale * (1 + out * 0.5);
  openingForm.yaw = reduced ? 0.3 : time * 0.045; openingForm.pitch = inside.pitch;
  openingForm.group.scale.setScalar(scale);
  opening.rest.set(0, 0, openingSt.z + HOLD);
  insideV.fromArray(inside.at).multiplyScalar(scale).applyEuler(insideE.set(openingForm.pitch, openingForm.yaw, 0));
  openingForm.group.position.copy(opening.rest).sub(insideV);

  openingForm.update({ time, dt: rhythm.paused ? 0 : dt, breath: rhythm.breath, energy: rhythm.energy, phase: rhythm.phase, mode: modeValue, lit: litValue + 3.6 + rhythm.breath * 0.8, shift: state.shift,
    pointerWorld: null, pointerStrength: 0, opacity: o * 3.2, pointScale: vh() * renderer.getPixelRatio() / (2 * Math.tan(camera.fov / 2 * Math.PI / 180)) * Math.min(2.2, scale),
    speed: rhythm.speed, lock: rhythm.lock, mood, chaos: state.chaos / 35, swells: rhythm.swells, whole: Math.max(rhythm.manual ? rhythm.manual.weight : 0, rhythm.lock) });
}
function stepPocket(dt, now, travel, k) {
  if (scrollPos() !== pocket.lastY) { pocket.lastY = scrollPos(); pocket.stillAt = now; }
  const wants = depth && !flight && travel > 0.22 && travel < 0.78 && now - pocket.stillAt > 650;
  if (wants && pocket.k !== k && pocket.open < 0.05) buildPocket(k);
  pocket.open += ((wants && pocket.k === k ? 1 : 0) - pocket.open) * Math.min(1, dt * (wants ? 2.2 : 5));
  if (pocket.open > 0.6 && !state.pockets.includes(pocket.k)) {
    state.pockets.push(pocket.k); save(); insight(0.6);
    stations[pocket.k].pocketMark.hidden = false; sheetRows[pocket.k].p.hidden = false; fitRail();
  }
  const o = pocket.open;

  const reach = pocket.branches.length ? 0 : 1;
  pocket.turn += ((pointer.inside ? (pointer.x / vw() - 0.5) * -1.1 * reach : 0) - pocket.turn) * Math.min(1, dt * 2);
  pocket.ring.position.copy(camera.position);
  pocket.ring.quaternion.copy(camera.quaternion).multiply(turnQ.setFromAxisAngle(yAxis, pocket.turn + Math.sin(rhythm.phase * 0.3) * 0.08));
  for (const w of pocket.words) { setStyle(w.element, 'opacity', o.toFixed(2)); setStyle(w.element, 'visibility', o < 0.01 ? 'hidden' : 'visible'); w.visible = o >= 0.01; }
  if (pocket.branches.length) {
    const held = pocket.branches.find(b => b.held);

    const aim = pointer.inside ? Math.atan((pointer.x / vw() - 0.5) * 2 * Math.tan(halfView())) : 0;
    const off = b => Math.abs(b.ang - pocket.turn - aim);
    const facing = held || pocket.branches.reduce((a, b) => (off(b) < off(a) ? b : a));
    for (const b of pocket.branches) {
      const lit = pocket.treading ? b === pocket.treading : b === facing;
      setStyle(b.el, 'opacity', (o * (lit ? 1 : pocket.treading ? 0.18 : 0.58)).toFixed(2));
      setStyle(b.el, 'visibility', o < 0.01 ? 'hidden' : 'visible'); b.obj.visible = o >= 0.01;
      setStyle(b.el, 'pointerEvents', o > 0.5 ? 'auto' : 'none');
      if (b.lit !== lit) { b.lit = lit; b.el.classList.toggle('facing', lit); }
    }
  }
  body.classList.toggle('in-pocket', o > 0.5);
  pocketForms.forEach((t, f) => {
    const on = f === pocket.form && o > 0.01;
    t.group.visible = on;
    if (!on) return;
    const inside = INSIDE[f], scale = inside.scale * (0.55 + o * 0.45);
    t.yaw = pocket.turn * 0.6 + Math.sin(pocket.k * 2.1) * 0.25; t.pitch = inside.pitch;
    t.group.scale.setScalar(scale);
    insideV.fromArray(inside.at).multiplyScalar(scale).applyEuler(insideE.set(t.pitch, t.yaw, 0));
    t.group.position.copy(camera.position).sub(insideV);
    t.update({ time, dt: rhythm.paused ? 0 : dt, breath: rhythm.breath, energy: rhythm.energy, phase: rhythm.phase, mode: modeValue, lit: litValue + 1.4, shift: state.shift + pocket.k * 0.07,
      pointerWorld: null, pointerStrength: 0, opacity: o * 2.6, pointScale: vh() * (renderer.getPixelRatio()) / (2 * Math.tan(camera.fov / 2 * Math.PI / 180)) * Math.min(2.2, t.group.scale.x),
      speed: rhythm.speed, lock: rhythm.lock, mood, chaos: state.chaos / 35, swells: rhythm.swells, whole: Math.max(rhythm.manual ? rhythm.manual.weight : 0, rhythm.lock) });
  });
}

const oklch = (L, C, h) => [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)];
function hex(h) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s2, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s2, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s2];
}
function rgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s2 = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s2, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s2, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s2];
  return lin.map(x => clamp(x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055, 0, 1));
}
const mix3 = (p, q, t) => p.map((x, i) => x + (q[i] - x) * t);
const css3 = c => `rgb(${rgb(c).map(x => Math.round(x * 255)).join(' ')})`;

const TONES = {
  shadow: { ink: oklch(0.93, 0.02, 90), accent: oklch(0.82, 0.10, 300), gold: oklch(0.84, 0.11, 85) },
  crystal: { ink: oklch(0.97, 0.02, 210), accent: oklch(0.88, 0.15, 195), gold: oklch(0.80, 0.22, 335) },
  calm: { ink: oklch(0.92, 0.04, 235), accent: oklch(0.80, 0.11, 240), a: oklch(0.80, 0.10, 225), b: oklch(0.66, 0.13, 250) },
  insight: { ink: oklch(0.95, 0.06, 90), accent: oklch(0.86, 0.14, 85), a: oklch(0.86, 0.15, 85), b: oklch(0.62, 0.20, 305) },
};
const mood = { amt: 0, a: [1, 1, 1], b: [1, 1, 1] };
let toneKey = '';

const step16 = x => Math.round(x * 16) / 16;
function stepColour() {
  const m = step16(modeValue);
  const base = { ink: mix3(TONES.shadow.ink, TONES.crystal.ink, m), accent: mix3(TONES.shadow.accent, TONES.crystal.accent, m), gold: mix3(TONES.shadow.gold, TONES.crystal.gold, m) };
  const c = calm * 0.7 * (1 - insightV), n = Math.min(1, insightV), cq = step16(c), nq = step16(n);
  const ink = mix3(mix3(base.ink, TONES.calm.ink, cq), TONES.insight.ink, nq * 0.8);
  const accent = mix3(mix3(base.accent, TONES.calm.accent, cq), TONES.insight.accent, nq * 0.8);
  const w = n / (n + calm + 0.001);
  mood.amt = Math.max(calm * 0.5, n * 0.8);
  mood.a = rgb(mix3(TONES.calm.a, TONES.insight.a, w)); mood.b = rgb(mix3(TONES.calm.b, TONES.insight.b, w));
  const key = `${css3(ink)}|${css3(accent)}|${css3(base.gold)}`;
  if (key !== toneKey) { toneKey = key; const [i, a2, g] = key.split('|'); body.style.setProperty('--ink', i); body.style.setProperty('--accent', a2); body.style.setProperty('--gold', g); }
}

const showBtn = make('button', 'show-toggle', body); showBtn.type = 'button';
showBtn.setAttribute('aria-label', 'FOR USERS TO JOURNEY'); showBtn.setAttribute('aria-pressed', 'false');
const showMeter = make('span', 'show-meter', body); showMeter.setAttribute('aria-hidden', 'true');
const show = { on: false, i: 0, phase: '', until: 0, since: 0, n: 0, sum: 0, worst: 0, slow: 0, frames: 0, done: false, lit: null };

const stageLine = make('p', 'show-stage', body); stageLine.setAttribute('aria-live', 'polite');
const stageWords = make('span', 'show-stage-words', stageLine), stageCount = make('span', 'show-stage-count', stageLine);
const stageOrder = stations.flatMap(st => (st.el.dataset.pocket ? [['plane', st.i], ['pocket', st.i]] : [['plane', st.i]]));
function showStage(kind, i) {
  const st = stations[i], el = kind === 'plane' ? st.railButton : st.pocketMark;
  if (kind === 'pocket' && el && el.hidden) { el.hidden = false; fitRail(); }
  if (show.lit !== el) { show.lit?.classList.remove('show-at'); el?.classList.add('show-at'); show.lit = el; }
  stageWords.textContent = kind === 'plane' ? st.label : `◦ ${st.el.dataset.pocket}`;
  stageCount.textContent = `${stageOrder.findIndex(([k, n]) => k === kind && n === i) + 1} / ${stageOrder.length}`;
}

const PACE_WORDS = ['slow, spiralic', 'faster than hands'];
const paceBtn = make('button', 'show-pace', body); paceBtn.type = 'button';
paceBtn.setAttribute('aria-expanded', 'false'); paceBtn.setAttribute('aria-controls', 'show-pace-panel');
const pacePanel = make('div', 'show-pace-panel', body); pacePanel.id = 'show-pace-panel'; pacePanel.hidden = true;
const paceSlow = make('span', 'show-pace-end', pacePanel); paceSlow.textContent = PACE_WORDS[0];
const paceInput = make('input', 'show-pace-input', pacePanel);
Object.assign(paceInput, { type: 'range', min: '-1', max: '1', step: '0.05', value: String(state.showPace) });
paceInput.setAttribute('aria-label', `${PACE_WORDS[0]} … ${PACE_WORDS[1]}`);
const paceFast = make('span', 'show-pace-end', pacePanel); paceFast.textContent = PACE_WORDS[1];
const pace2 = () => 2 ** state.showPace;
function showPaceLabel() { paceBtn.textContent = `${+pace2().toFixed(2)}×`; paceBtn.setAttribute('aria-label', `pace ${paceBtn.textContent}`); }
showPaceLabel();
paceInput.addEventListener('input', () => { state.showPace = clamp(Number(paceInput.value), -1, 1); showPaceLabel(); save(); });
paceBtn.addEventListener('click', () => { pacePanel.hidden = !pacePanel.hidden; paceBtn.setAttribute('aria-expanded', String(!pacePanel.hidden)); if (!pacePanel.hidden) paceInput.focus({ preventScroll: true }); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !pacePanel.hidden) { pacePanel.hidden = true; paceBtn.setAttribute('aria-expanded', 'false'); paceBtn.focus({ preventScroll: true }); } });
addEventListener('pointerdown', e => { if (!pacePanel.hidden && !e.target.closest?.('.show-pace, .show-pace-panel')) { pacePanel.hidden = true; paceBtn.setAttribute('aria-expanded', 'false'); } });

const showWait = ms => vary(ms) / pace2();
const showFlight = () => { if (flight) flight.dur /= pace2(); };

function startShow() {
  Object.assign(show, { on: true, i: current, phase: 'dwell', until: performance.now() + showWait(900), n: 0, sum: 0, worst: 0, slow: 0, frames: 0, done: false });
  showBtn.setAttribute('aria-pressed', 'true'); body.classList.add('showing');
  showStage('plane', current);
}
function stopShow(done = false) {
  if (!show.on) return;
  show.on = false; show.done = done; flight = null;
  showBtn.setAttribute('aria-pressed', 'false'); body.classList.remove('showing');
  show.lit?.classList.remove('show-at'); show.lit = null;
}
showBtn.addEventListener('click', () => show.on ? stopShow() : startShow());

const ownControl = e => e.target?.closest?.('.show-toggle, .show-pace, .show-pace-panel');
for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart']) addEventListener(type, e => { if (show.on && !((type === 'pointerdown' || type === 'keydown') && ownControl(e))) stopShow(); }, { passive: true });
function stepShow(now, raw) {
  if (!show.on) return;
  if (raw < 0.5) { const ms = raw * 1000; show.frames++; show.sum += ms; show.n++; if (show.frames > 20) { show.worst = Math.max(show.worst, ms); if (ms > 50) show.slow++; } }
  if (show.n >= 30) { showMeter.textContent = `${drawnWith} · ${(show.sum / show.n).toFixed(1)} ms · worst ${Math.round(show.worst)} · ${show.slow} slow · level ${pace.level}`; show.sum = 0; show.n = 0; }
  const st = stations[show.i];
  if (show.phase === 'dwell' && now >= show.until) {
    if (st.kind === 'break') triggerBreak(1); else if (st.sculpture) wordsAct(st);
    show.phase = 'acted'; show.until = now + showWait(st.sculpture ? 900 : 300);
  } else if (show.phase === 'acted' && now >= show.until && !breakFx.running && !wordFx.length) {
    if (!st.el.dataset.pocket || !depth) { if (show.i >= stations.length - 1) return stopShow(true); show.i++; travelTo(show.i); showFlight(); showStage('plane', show.i); show.phase = 'toPlane'; show.since = 0; return; }
    travelToPocket(show.i); showFlight(); showStage('pocket', show.i); show.phase = 'toPocket'; show.since = now;
  } else if (show.phase === 'toPocket' && (pocket.open > 0.9 || now - show.since > 12000)) {
    show.phase = 'inPocket'; show.until = now + vary(3000, 0.7) / pace2();
  } else if (show.phase === 'inPocket' && now >= show.until) {
    show.i++; travelTo(show.i); showFlight(); showStage('plane', show.i); show.phase = 'toPlane'; show.since = 0;
  } else if (show.phase === 'toPlane' && current === show.i && !flight) {
    if (!show.since) show.since = now;

    if (now - show.since > 500 / pace2()) { show.phase = 'dwell'; show.until = now + showWait(clamp(stations[show.i].words.textContent.length * 22, 2200, 6500)); }
  }
}
if (probe.get('show')) addEventListener('load', () => setTimeout(startShow, 1500));

const returnFork = (() => {
  if (!cameBackTo) return null;
  const m = /^#pocket-(\d+)$/.exec(cameBackTo), st = m ? stations[Number(m[1])] : byId[cameBackTo.slice(1)];
  const words = m ? st?.el.dataset.pocket : st?.label;
  if (!st || !words) return null;
  const box = make('div', 'return-fork', body); box.setAttribute('role', 'group');

  box.setAttribute('aria-label', byId.where.label);
  const back = make('a', 'return-way', box); back.href = cameBackTo; back.textContent = words;
  const here = make('button', 'return-way', box); here.type = 'button'; here.textContent = byId.opening.label;
  return box;
})();
function dismissReturn() { if (!returnFork || returnFork.hidden) return; returnFork.classList.add('gone'); setTimeout(() => { returnFork.hidden = true; }, 600); }
if (returnFork) {

  const placeReturn = () => { if (depth) body.append(returnFork); else stations[0].el.prepend(returnFork); };

  requestAnimationFrame(placeReturn); addEventListener('resize', () => requestAnimationFrame(placeReturn));
  returnFork.addEventListener('click', e => { if (e.target.closest('.return-way')) setTimeout(dismissReturn, 0); });
  for (const type of ['wheel', 'keydown', 'touchstart']) addEventListener(type, e => { if (!e.target?.closest?.('.return-fork')) dismissReturn(); }, { passive: true, capture: true });
  addEventListener('pointerdown', e => { if (!e.target?.closest?.('.return-fork')) dismissReturn(); }, { passive: true, capture: true });
}

const stagePos = ([kind, i]) => (kind === 'plane' ? i : i + HOLD_SHARE + (1 - HOLD_SHARE) * 0.5);
const stageWordsOf = ([kind, i]) => (kind === 'plane' ? stations[i].label : stations[i].el.dataset.pocket);
function stageNow() { return depth ? clamp(scrollPos() / Math.max(1, scrollMax()), 0, 1) * (stations.length - 1) : current; }
function stageStep(d) {
  const s = stageNow();
  const next = d > 0 ? stageOrder.find(st => stagePos(st) > s + 0.04) : [...stageOrder].reverse().find(st => stagePos(st) < s - 0.04);
  return next || null;
}
let stepsLabeledAt = -1;
function goStage(st) { if (!st) return; if (st[0] === 'plane' || !depth) travelTo(st[1]); else travelToPocket(st[1]); }
const stepUp = make('button', 'rail-step rail-up', railEl), stepDown = make('button', 'rail-step rail-down', railEl);
railEl.prepend(stepUp);
stepUp.type = stepDown.type = 'button'; stepUp.textContent = '↑'; stepDown.textContent = '↓';
function labelSteps() {
  for (const [b, d] of [[stepUp, -1], [stepDown, 1]]) {
    const st = stageStep(d);
    b.disabled = !st;
    const words = st ? stageWordsOf(st) : '';
    if (b.dataset.label !== words) { b.dataset.label = words; b.setAttribute('aria-label', words || (d > 0 ? 'the last stage' : 'the first stage')); }
  }
}

function fitRail() {
  const items = [...railEl.children].filter(el => !el.hidden);
  const fixed = items.reduce((h, el) => h + el.offsetHeight, 0), room = Math.max(120, railEl.clientHeight || vh() - 150 - 28);
  railEl.style.gap = `${clamp((room - fixed) / Math.max(1, items.length - 1), 2, 9).toFixed(1)}px`;
  measureThread();
}
addEventListener('resize', fitRail);
requestAnimationFrame(fitRail);
stepUp.addEventListener('click', () => { goStage(stageStep(-1)); });
stepDown.addEventListener('click', () => { goStage(stageStep(1)); });
for (const b of [stepUp, stepDown]) b.addEventListener('pointerenter', labelSteps);

const LAYER_LIGHT = 0.26;
const layerFade = dist => (depth && !reduced ? smooth(7, 15, dist) * (1 - smooth(15, 15 + GAP * 2.4, dist)) * LAYER_LIGHT : 0);
const fallTexture = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,250,235,1)'); r.addColorStop(0.22, 'rgba(241,203,150,0.75)'); r.addColorStop(1, 'rgba(227,194,124,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = drawnWith === 'webgl' ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
})();
const fallPool = renderer ? Array.from({ length: 16 }, () => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fallTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  sp.visible = false; sp.scale.setScalar(0.24); scene.add(sp); return { sp, on: false };
}) : [];
const falls = [];
function fallThrough(st, { count = 2, from = null, power = 1 } = {}) {
  if (!renderer || !depth || reduced || !st) return;
  const origin = from || (st.sculpture ? st.sculpture.group.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0, st.z));
  for (let n = 0; n < count; n++) {
    const slot = fallPool.find(f => !f.on); if (!slot) return;
    slot.on = true;
    const o = typeof from === 'function' ? from(n) : origin;
    falls.push({ slot, k: st.i, x: o.x + (Math.random() - 0.5) * 0.5, y: o.y + (Math.random() - 0.5) * 0.5, z: o.z, t: -vary(0.12 * n, 1),
      per: vary(1.2, 0.5), spin: (Math.random() < 0.5 ? -1 : 1) * vary(1.3, 0.6), r: vary(0.55, 0.8), power: power * vary(1, 0.4), passed: 0, phase: Math.random() * 6.28 });
  }
}
function stepFalls(dt) {
  for (let i = falls.length - 1; i >= 0; i--) {
    const f = falls[i]; f.t += dt;
    if (f.t < 0) continue;
    const fallen = f.t / f.per, u = fallen / 3;
    if (u >= 1) { f.slot.on = false; f.slot.sp.visible = false; falls.splice(i, 1); continue; }
    const a = f.phase + f.t * f.spin;
    f.slot.sp.position.set(f.x + Math.cos(a) * f.r * u, f.y + Math.sin(a) * f.r * u * 0.7, f.z - fallen * GAP);
    f.slot.sp.visible = true;
    f.slot.sp.material.opacity = Math.min(1, f.t * 4) * (1 - u) ** 0.7 * 0.95;

    while (f.passed < Math.floor(fallen)) { f.passed++; stations[f.k + f.passed]?.sculpture?.pulse(a, f.power * 0.72 ** f.passed, time); }
  }
}

let flipWave = { at: -1e9, from: 0 }, frameClock = 0;
for (const st of stations) st.mode = st.modeGoal = modeValue;

let time = 0, last = performance.now(), fall = 0, lastS = 0, glide = -1;

const pace = { sum: 0, n: 0, level: Number(probe.get('lite') || 0) };
function setLevel(level) {
  pace.level = level; body.classList.toggle('lite', level >= 1);
  if (renderer) { renderer.setPixelRatio(level >= 2 ? 0.75 : Math.min(devicePixelRatio || 1, level >= 1 ? 1 : 1.5)); renderer.setSize(vw(), vh()); }
}
function watchPace(rawDt) {
  if (rawDt > 0.5) return;
  pace.sum += rawDt; pace.n++;
  if (pace.n < 150) return;
  const avg = pace.sum / pace.n; pace.sum = 0; pace.n = 0;
  if (probe.get('fps')) titleBtn.textContent = `${drawnWith} · ${(avg * 1000).toFixed(1)} ms a frame · ${Math.round(1 / avg)} fps · level ${pace.level}`;
  if (avg > 0.03 && pace.level < 2) setLevel(pace.level + 1);
}
const camTarget = new THREE.Vector3();

const tracing = probe.get('trace') === '1', tr = { name: '', at: 0, log: [] };
function traceStage(name) {
  if (!tracing) return;
  const t = performance.now();
  if (tr.name && t - tr.at > 25) tr.log.push(`${stations[current].id} · ${tr.name} ${(t - tr.at).toFixed(0)} ms`);
  tr.name = name; tr.at = t;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  traceStage('show + rhythm');
  watchPace((now - last) / 1000);
  stepShow(now, (now - last) / 1000);
  const elapsed = Math.max(0.001, (now - last) / 1000);
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now; frameClock += dt;
  if (!rhythm.paused) time += dt;
  const breath = rhythm.update(rhythm.paused ? 0 : dt, time, now);

  if (momentum.v) {
    const max = scrollMax(), y = scrollPos(), to = clamp(y + momentum.v * Math.min(elapsed, 0.1), 0, max);
    scrollToY(to);
    momentum.v *= Math.exp(-Math.min(elapsed, 0.1) * MOMENTUM_DECAY);
    if (Math.abs(momentum.v) < 8 || (to <= 0 && momentum.v < 0) || (to >= max && momentum.v > 0)) momentum.v = 0;
  }
  if (flight) {
    const t = clamp((now - flight.start) / flight.dur, 0, 1);
    scrollToY(lerp(flight.from, flight.to, (flight.ease ||= curve())(t)));
    if (t >= 1) flight = null;
  }

  traceStage('camera');

  let next = current, travelNow = 0, gapNow = 0;
  if (depth) {
    const max = Math.max(1, scrollMax());
    const sRaw = clamp(scrollPos() / max, 0, 1) * (stations.length - 1);

    if (glide < 0 || reduced) glide = sRaw; else glide += (sRaw - glide) * Math.min(1, dt * 7);
    const s = Math.abs(sRaw - glide) < 0.0005 ? sRaw : glide;
    const k = Math.min(stations.length - 2, Math.floor(s)), t = s - k;
    const lin = t < HOLD_SHARE ? 0 : (t - HOLD_SHARE) / (1 - HOLD_SHARE), u = lin * lin * (3 - 2 * lin);
    const travel = u;

    if (!flight && !reduced && now - pocket.stillAt > 500 && Math.abs(sRaw - glide) < 0.002 && ((travel > 0.001 && travel < 0.2) || (travel > 0.8 && travel < 0.999))) {
      const to = (travel < 0.5 ? k + HOLD_SHARE * 0.6 : k + 1) / (stations.length - 1) * max;
      flight = { from: scrollPos(), to, start: now, dur: vary(700, 0.6) };
    }
    const swing = reduced ? 0 : Math.sin(travel * Math.PI);
    const angle = (k + travel) * Math.PI * 0.5 + travel * Math.PI;
    camera.position.set(Math.cos(angle) * swing * 1.1, Math.sin(angle) * swing * 0.7, lerp(stations[k].z, stations[k + 1].z, travel) + HOLD);
    camera.up.set(Math.sin(swing * 0.3), Math.cos(swing * 0.3), 0);
    camTarget.set(0, 0, camera.position.z - HOLD);
    camera.lookAt(camTarget);
    if (anamorph) {
      const near = 1 - smooth(0.4, 2.2, Math.abs(camera.position.z - HOLD - astraSt.z)), e = Math.min(1, dt * 3);
      eyeAt.x += (eyeAt.goalX * near - eyeAt.x) * e; eyeAt.y += (eyeAt.goalY * near - eyeAt.y) * e;
      if (!reduced) { camera.position.x += eyeAt.x * 0.55; camera.position.y -= eyeAt.y * 0.4; }
    }
    next = travel < 0.5 ? k : k + 1;
    travelNow = travel; gapNow = k;

    const speed = clamp(Math.abs(s - lastS) / elapsed, 0, 3);
    fall += (speed - fall) * Math.min(1, dt * (speed > fall ? 2.2 : 1.1)); lastS = s;
    const fov = FOV + (reduced || probe.get('fall') === '0' ? 0 : clamp(fall * 13, 0, 24));
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  } else {

    if (flowAnchors.length !== stations.length) measureFlow();
    const y = scrollPos(), A = flowAnchors;
    let k = 0; while (k < stations.length - 2 && A[k + 1] <= y) k++;
    const p = clamp((y - A[k]) / Math.max(1, A[k + 1] - A[k]), 0, 1), lin = clamp((p - 0.38) / 0.62, 0, 1), travel = lin * lin * (3 - 2 * lin);
    const swing = reduced ? 0 : Math.sin(travel * Math.PI) * 0.45, angle = (k + travel) * Math.PI * 0.5 + travel * Math.PI;
    const gz = lerp(stations[k].z, stations[k + 1].z, travel) + HOLD, e = reduced ? 1 : Math.min(1, dt * 12);
    camera.position.set(camera.position.x + (Math.cos(angle) * swing - camera.position.x) * e, camera.position.y + (Math.sin(angle) * swing * 0.7 - camera.position.y) * e, camera.position.z + (gz - camera.position.z) * e);
    camera.up.set(0, 1, 0); camera.lookAt(camera.position.x * 0.4, camera.position.y * 0.4, camera.position.z - HOLD);
    next = travel < 0.5 ? k : k + 1;
    flowStage = k + travel;
  }
  traceStage('plane change');

  if (Math.abs(stageNow() - stepsLabeledAt) > 0.03) { stepsLabeledAt = stageNow(); labelSteps(); }
  if (next !== current || !stations[current].railButton.hasAttribute('aria-current')) {
    stations[current].railButton.removeAttribute('aria-current');
    current = next;
    stations[current].railButton.setAttribute('aria-current', 'location');
    body.dataset.station = stations[current].id;
    if (!state.visited.includes(stations[current].id)) { state.visited.push(stations[current].id); save(); }
    showPlace();
  }
  if (started) address(pocket.open > 0.6 ? `#pocket-${pocket.k}` : `#${stations[current].id}`);
  if (!sheet.hidden) setVar(sheet, '--rim', `${Math.round(rhythm.phase * 40 % 360 / 3) * 3}deg`);
  camera.updateMatrixWorld();

  modeValue += ((state.polarity === 'crystal' ? 1 : 0) - modeValue) * Math.min(1, dt * 3);
  litValue += (litTarget - litValue) * Math.min(1, dt * 0.35);
  calm += ((rhythm.stillFor(now) > 4000 ? 1 : 0) - calm) * Math.min(1, dt * 0.4);
  insightV *= Math.exp(-dt / 2.6);

  setStyle(fieldCalm, 'opacity', calm.toFixed(2));
  setStyle(fieldInsight, 'opacity', insightV.toFixed(2));

  if (byId.glyphic.fade > 0.01 || !depth) { [...breathing.children].forEach((g, i) => setVar(g, '--breath', rhythm.swells[i].level.toFixed(2))); setVar(breathing, '--energy', rhythm.energy.toFixed(2)); }

  traceStage('colour + tab curve');
  stepColour(); stepThread(dt);
  traceStage('break, words, cycle, symmetry, resonator');
  stepBreak(dt); stepWords(dt); stepCycle(dt); stepSymmetry(); stepResonator(dt, now);
  traceStage('pocket');
  if (renderer) stepPocket(dt, now, travelNow, gapNow);
  stepOpening(dt);
  stepFalls(rhythm.paused ? 0 : dt);
  traceStage('sculptures + text');

  const deviceH = vh() * (renderer ? renderer.getPixelRatio() : 1);
  const pointScaleBase = deviceH / (2 * Math.tan(FOV / 2 * Math.PI / 180));
  for (const st of stations) {
    const dist = camera.position.z - st.z;
    const sculptFade = smooth(0.5, 2.6, dist) * (1 - smooth(7, 15, dist)), drawn = sculptFade + layerFade(dist);
    if (frameClock - flipWave.at >= Math.abs(st.i - flipWave.from) * 0.42) st.modeGoal = state.polarity === 'crystal' ? 1 : 0;
    st.mode += (st.modeGoal - st.mode) * Math.min(1, dt * 3);
    const textFade = depth ? smooth(1.2, 3.4, dist) * (1 - smooth(6.5, 13, dist)) : 1;
    st.fade = sculptFade;
    if (st.sculpture) {
      const s = st.sculpture;
      s.group.visible = drawn > 0.002;
      if (s.group.visible) {
        s.group.scale.z = s.group.scale.x * (1 + (depth ? fall * 0.55 : 0));
        const hit = st.i === current ? pointerOn(st) : null;
        s.update({ time, dt: rhythm.paused ? 0 : dt, breath, energy: rhythm.energy, phase: rhythm.phase, mode: st.mode, lit: litValue, shift: state.shift,
          pointerWorld: hit?.point || null, pointerStrength: hit ? hit.strength : 0, opacity: drawn, pointScale: pointScaleBase * s.group.scale.x,
          speed: rhythm.speed, lock: rhythm.lock, mood, chaos: state.chaos / 35, swells: rhythm.swells, whole: Math.max(rhythm.manual ? rhythm.manual.weight : 0, rhythm.lock) });
      }
    }
    if (depth) {
      for (const obj of [st.wordsObj, ...st.extras]) {
        const el = obj.element, f = (obj.userData.kind?.startsWith('astra') ? sculptFade * 0.9 : textFade) * (1 - pocket.open * 0.85);
        setStyle(el, 'opacity', f.toFixed(2));
        setStyle(el, 'visibility', dist < 0.9 || f < 0.005 ? 'hidden' : 'visible');
        setStyle(el, 'pointerEvents', f > 0.6 && !obj.userData.kind?.startsWith('astra') ? 'auto' : 'none');
        obj.visible = !(dist < 0.9 || f < 0.005);
      }
    }
  }
  traceStage('codes, legend, glyph buttons');

  if (byId['spiritual-codes'].fade > 0.01 || !depth) codes.update({ dt: rhythm.paused ? 0 : dt, breath, phase: rhythm.phase, energy: rhythm.energy, calm, insight: insightV });
  if (anamorph) {
    const rel = camera.position.z - (astraSt.z + HOLD);
    anamorph.update(smooth(-9, -1.5, rel) * (1 - smooth(9, 15, rel)), time);
  }
  if (legendMesh) {
    legendMesh.material.opacity = (0.09 + insightV * 0.08) * byId.resonance.fade;
    legendMesh.material.color.setRGB(...mix3(rgb(TONES.shadow.accent), mood.a, mood.amt), drawnWith === 'webgl' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace);
    legendMesh.material.blending = THREE.AdditiveBlending;
    legendMesh.visible = byId.resonance.fade > 0.002;
  }

  for (const h of handles) {
    const show = h.st.fade > 0.55 && (h.st.i === current) && renderer;
    if (show) {
      const v = h.anchor(tmpV).project(camera);
      const x = (v.x + 1) / 2 * vw(), y = (1 - v.y) / 2 * vh();
      h.b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
    if (show !== h.visible) { h.visible = show; h.b.classList.toggle('shown', show); h.b.tabIndex = show ? 0 : -1; }
  }

  traceStage('3D render');
  if (renderer) renderer.render(scene, camera);
  traceStage('text render');
  if (depth) css.render(cssScene, camera);
  traceStage('');
}

addEventListener('resize', () => { chooseLayout(); layout(); });
chooseLayout();
layout();
let started = false;

const landing = location.hash;
const land = () => { if (landing) goTo(landing, true); };
requestAnimationFrame(land);
const begin = () => { land(); setTimeout(() => { land(); started = true; }, 120); };
if (document.readyState === 'complete') begin(); else addEventListener('load', begin);
addEventListener('resize', showPlace);
if (pace.level) setLevel(pace.level);
body.classList.add('ready');
requestAnimationFrame(frame);

async function warmUp() {
  if (!renderer?.compileAsync) return;
  const shown = [...stations.filter(st => st.sculpture).map(st => st.sculpture.group), ...pocketForms.map(t => t.group), legendMesh, ...fallPool.map(f => f.sp)].filter(Boolean);
  const was = shown.map(o => [o.visible, o.frustumCulled]);
  for (const o of shown) { o.visible = true; o.frustumCulled = false; }
  const done = renderer.compileAsync(scene, camera);
  shown.forEach((o, i) => { o.visible = was[i][0]; o.frustumCulled = was[i][1]; });
  try { await done; warm.done = performance.now(); } catch (e) { warm.error = String(e?.message || e); }
}
const warm = { done: 0, error: '' };
requestAnimationFrame(() => setTimeout(warmUp, 250));

window.__castle = { cameBackTo: () => cameBackTo, returnShown: () => Boolean(returnFork && !returnFork.hidden), falls: () => falls.length, layerSeen: () => stations.filter(st => st.sculpture?.group.visible).map(st => st.id), modes: () => stations.map(st => +st.mode.toFixed(2)), stageStep: d => stageStep(d), warm: () => ({ ...warm }), trace: () => tr.log.slice(), renderer: () => drawnWith, cam: () => [camera.position.x, camera.position.y, camera.position.z, camera.fov, scrollY, glide], stations: () => stations.map(s => s.id), current: () => stations[current].id, state: () => ({ ...state }), triggerBreak, breaking: () => breakFx.running, wordsAct: id => wordsAct(byId[id]), pieces: () => sym.base.map((v, p) => ({ far: sym.locked[p] ? 0 : pieceGap(p, v), locked: sym.locked[p] })), wordsMoving: () => wordFx.length, goTo, openSheet, level: () => pace.level, show: () => ({ on: show.on, i: show.i, phase: show.phase, worst: show.worst, slow: show.slow, done: show.done, stage: stageWords.textContent, count: stageCount.textContent, lit: show.lit?.className || null, pace: pace2() }), travelToPocket, pocket: () => ({ k: pocket.k, open: pocket.open, words: pocket.words.length, branches: pocket.branches.map(b => ({ href: b.href, lit: Boolean(b.lit), trod: b.el.classList.contains('trod') })), form: pocket.form, treading: pocket.treading?.href || null }), toggleFlip, travelTo, depth: () => depth };
