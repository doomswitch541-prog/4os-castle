import { FIELDS, DEFAULTS, SETTINGS_KEY, cleanSettings } from './fields.js';
import { Sculpture } from './sculpture.js';
import { FIELDS as FIELD_LINKS } from './site-pages.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let settings;
try { settings = cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY))); }
catch { settings = { ...DEFAULTS }; }
let toastTimer;
let saveTimer;
let warnedStorage = false;
let scene;

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3600);
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cleanSettings(settings))); }
    catch { if (!warnedStorage) { toast('This browser cannot save settings; the sculpture still works.'); warnedStorage = true; } }
  }, 180);
}

const FIELD_WORDS = [
  ['♇ (transformation)', 'watch it break apart, twist, and rebuild as they engage.'],
  ['☍ (polarity)', 'balancing dualities visually AND energetically.'],
  ['contraction/expansion cycle of existence (thanks, ♃)', '“Whoa…this spoke to a part of me I barely understood.”'],
  ['❖ (divine symmetry)', 'A floating, meditative space where the user drags elements into symmetry'],
];
function field(index) {
  settings.field = (index + FIELDS.length) % FIELDS.length;
  const [name, words] = FIELD_WORDS[settings.field];
  $('field-name').textContent = name;
  $('field-description').textContent = words;
  document.querySelectorAll('[data-field]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.field) === settings.field)));
  scene?.setField(settings.field);
  persist();
}

function refreshControls() {
  for (const key of ['pace', 'chaos']) {
    $(key).value = String(settings[key]);
    $(`${key}-value`).value = `${settings[key]}${key === 'pace' ? ' s' : '%'}`;
  }
}

function motionUI() {
  $('motion-icon').textContent = scene.paused ? '▷' : 'Ⅱ';
  $('motion').setAttribute('aria-label', scene.paused ? 'Resume motion' : 'Pause motion');
  $('motion').setAttribute('aria-pressed', String(scene.paused));

  $('motion-status').textContent = scene.paused ? 'still · drag to turn it' : 'chaos meeting harmony, balance built through polarity';
}

try {
  scene = new Sculpture($('sculpture'), settings, {
    reduced: reducedMotion.matches,
    onPulse(_position, moving) { if (!moving) toast('Motion is paused. Press Resume motion to send a ripple.'); },
    onOrbit(yaw, pitch) { settings.yaw = yaw; settings.pitch = pitch; persist(); },
    onField(delta) { field(settings.field + delta); },
    onGlyph(index) { field(index); },
    onCycle() {},
  });
  motionUI();
} catch (error) {
  toast(error.message);
  $('motion').disabled = true;
  $('save').disabled = true;
}

refreshControls();
field(settings.field);
document.querySelectorAll('[data-field]').forEach(button => button.addEventListener('click', () => field(Number(button.dataset.field))));

{
  const rail = document.querySelector('.glyph-rail'), glyphs = [...rail.querySelectorAll('[data-field]')];
  const button = (cls, text) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; return b; };
  const up = button('glyph-step glyph-up', '↑'), down = button('glyph-step glyph-down', '↓'), walk = button('glyph-step glyph-walk', '▶');
  walk.setAttribute('aria-pressed', 'false');
  glyphs[0].before(up); glyphs[glyphs.length - 1].after(down); down.after(walk);
  const label = () => {
    const i = settings.field;
    up.disabled = i <= 0; down.disabled = i >= glyphs.length - 1;
    up.setAttribute('aria-label', i > 0 ? glyphs[i - 1].getAttribute('aria-label') : 'the first field');
    down.setAttribute('aria-label', i < glyphs.length - 1 ? glyphs[i + 1].getAttribute('aria-label') : 'the last field');
    walk.setAttribute('aria-label', walk.getAttribute('aria-pressed') === 'true' ? 'stop' : 'step through the four glyph fields');
  };
  const go = i => { field(i); if (scene && !scene.paused) scene.pulse(); label(); };
  up.addEventListener('click', () => { if (settings.field > 0) go(settings.field - 1); });
  down.addEventListener('click', () => { if (settings.field < glyphs.length - 1) go(settings.field + 1); });
  for (const g of glyphs) g.addEventListener('click', () => queueMicrotask(label));
  let timer = 0;
  const vary = (ms, spread = 0.5) => ms * (1 - spread / 2 + Math.random() * spread);
  const stopWalk = () => { clearTimeout(timer); timer = 0; walk.setAttribute('aria-pressed', 'false'); walk.textContent = '▶'; label(); };
  const nextStep = () => {
    if (settings.field >= glyphs.length - 1) return stopWalk();
    go(settings.field + 1);
    if (settings.field >= glyphs.length - 1) timer = setTimeout(stopWalk, vary(3200)); else timer = setTimeout(nextStep, vary(5200));
  };
  walk.addEventListener('click', () => {
    if (timer) return stopWalk();
    walk.setAttribute('aria-pressed', 'true'); walk.textContent = 'Ⅱ'; label();
    if (settings.field >= glyphs.length - 1) go(0);
    timer = setTimeout(nextStep, vary(2600));
  });
  const own = e => e.target?.closest?.('.glyph-walk');
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, e => { if (timer && !own(e)) stopWalk(); }, { capture: true, passive: true });
  for (const type of ['wheel', 'touchstart']) addEventListener(type, () => { if (timer) stopWalk(); }, { capture: true, passive: true });
  window.__sculptureSteps = { label, walking: () => Boolean(timer) };
  label();
}

const linked = () => FIELD_LINKS.indexOf(decodeURIComponent(location.hash.slice(1)));
if (linked() >= 0) field(linked());
addEventListener('hashchange', () => { if (linked() >= 0) field(linked()); });
for (const key of ['pace', 'chaos']) {
  $(key).addEventListener('input', () => {
    settings[key] = Number($(key).value);
    refreshControls();
    if (scene) scene.dirty = true;
    persist();
  });
}
$('motion').addEventListener('click', () => { scene.pause(!scene.paused); motionUI(); });
reducedMotion.addEventListener('change', event => { if (event.matches && scene) { scene.pause(true); motionUI(); } });

$('reset').addEventListener('click', () => {
  Object.assign(settings, DEFAULTS);
  if (scene) { scene.yaw = settings.yaw; scene.pitch = settings.pitch; scene.phase = .2; scene.ripples = []; scene.dirty = true; }
  field(0);
  refreshControls();
  persist();
  toast('Original form and controls restored.');
});

$('save').addEventListener('click', async () => {
  $('save').disabled = true;
  try {
    const blob = await scene.still();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `4os-castle-${FIELDS[settings.field].name.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Still saved. A little piece of the castle.');
  } catch (error) { toast(error.message); }
  finally { $('save').disabled = false; }
});

$('source').addEventListener('click', () => {
  $('source-dialog').showModal();
  if (scene) scene.suspended = true;
});
$('close-source').addEventListener('click', () => $('source-dialog').close());
$('source-dialog').addEventListener('close', () => { if (scene) { scene.suspended = false; scene.dirty = true; } });
$('source-dialog').addEventListener('click', event => {
  const r = event.currentTarget.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close();
});

document.addEventListener('keydown', event => {
  if ($('source-dialog').open || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.matches('input, textarea, button, a')) return;
  if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); field(settings.field + (event.key === 'ArrowRight' ? 1 : -1)); }
  if (/^[1-4]$/.test(event.key)) field(Number(event.key) - 1);
  if (event.code === 'Space' && scene) { event.preventDefault(); scene.pause(!scene.paused); motionUI(); }
});

window.addEventListener('pagehide', () => {
  clearTimeout(saveTimer);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cleanSettings(settings))); } catch {   }
});
