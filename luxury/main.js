import * as THREE from 'three';
import { createLuxury, DECK } from './luxury.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const canvas = document.getElementById('luxury-stage'), panel = document.getElementById('luxury-ui'), sky = document.getElementById('luxury-sky');
const status = panel.querySelector('[data-luxury-status]');
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !/[?&]aa=0/.test(location.search), alpha: true, powerPreference: 'high-performance' }); } catch { renderer = null; }
if (!renderer) {

  sky.hidden = false; panel.hidden = false; panel.inert = false;
  status.textContent = '3D rendering is unavailable in this browser.';
  panel.querySelectorAll('button').forEach(b => { b.disabled = true; });
} else {
  renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  const probe = new URLSearchParams(location.search);
  renderer.shadowMap.enabled = probe.get('shadows') !== '0'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 600);
  camera.rotation.order = 'YXZ';
  const luxury = createLuxury({ scene, plane: 0, panel, reduced, shadowSize: coarse ? 1024 : 2048 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), EYE = 1.62, P = luxury.pool;
  let w = 0, h = 0;
  function size() {
    w = document.documentElement.clientWidth || innerWidth; h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Number(probe.get('px')) || 1.5)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w / h < 0.8 ? 68 : 46;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', size); size();

  const start = { x: P.x + 0.4, z: P.z + P.d / 2 + (w / h < 0.8 ? 5.4 : 4.6), yaw: 0.05, pitch: 0.0 };
  const at = { ...start }, to = { ...start };
  let touched = -1e9, drift = 0, time = 0;
  const touch = () => { touched = performance.now(); };

  function solids() {
    const out = [{ x: P.x, z: P.z, hx: P.w / 2 + 0.45, hz: P.d / 2 + 0.45 }];
    for (const p of luxury.places()) out.push({ x: p.x, z: p.z, hx: 3.9 * p.scale + 0.4, hz: 2.6 * p.scale + 0.4 });
    return out;
  }
  function keepOnDeck(q) {
    q.x = clamp(q.x, DECK.x - DECK.hx, DECK.x + DECK.hx); q.z = clamp(q.z, DECK.z - DECK.hz, DECK.z + DECK.hz);
    for (const b of solids()) {
      const dx = q.x - b.x, dz = q.z - b.z;
      if (Math.abs(dx) < b.hx && Math.abs(dz) < b.hz) { if (b.hx - Math.abs(dx) < b.hz - Math.abs(dz)) q.x = b.x + Math.sign(dx || 1) * b.hx; else q.z = b.z + Math.sign(dz || 1) * b.hz; }
    }
  }
  const walk = d => { to.x -= Math.sin(to.yaw) * d; to.z -= Math.cos(to.yaw) * d; keepOnDeck(to); };

  const fingers = new Map(); let pinch = 0, moved = 0, downAt = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  canvas.addEventListener('pointerdown', e => { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); moved = 0; downAt = performance.now(); pinch = 0; touch(); canvas.classList.add('looking'); });
  canvas.addEventListener('pointermove', e => {
    const f = fingers.get(e.pointerId); if (!f) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y; f.x = e.clientX; f.y = e.clientY; touch();
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) walk((d - pinch) * 0.02); pinch = d; moved += 9; return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    to.yaw += dx * 0.0042 * (camera.fov / 46); to.pitch = clamp(to.pitch + dy * 0.003, -0.45, 0.5);
  });
  const lift = e => {
    const had = fingers.delete(e.pointerId); if (!fingers.size) canvas.classList.remove('looking'); pinch = 0;
    if (!had || e.type !== 'pointerup' || moved > 8 || performance.now() - downAt > 350) return;
    ndc.set(e.clientX / w * 2 - 1, -(e.clientY / h) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(ground, hit) && hit.distanceTo(camera.position) < 40) {

      const dx = hit.x - at.x, dz = hit.z - at.z, d = Math.hypot(dx, dz) || 1, go = Math.max(0, d - 1.4);
      to.x = at.x + dx / d * go; to.z = at.z + dz / d * go; to.yaw = at.yaw + Math.atan2(Math.sin(Math.atan2(-dx, -dz) - at.yaw), Math.cos(Math.atan2(-dx, -dz) - at.yaw));
      keepOnDeck(to);
    }
  };
  canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', e => { e.preventDefault(); walk(-e.deltaY * 0.006); touch(); }, { passive: false });
  addEventListener('keydown', e => {
    if (e.target.closest?.('button, input, a') || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w') walk(0.9); else if (k === 'ArrowDown' || k === 's') walk(-0.9);
    else if (k === 'ArrowLeft' || k === 'a') to.yaw += 0.16; else if (k === 'ArrowRight' || k === 'd') to.yaw -= 0.16; else return;
    e.preventDefault(); touch();
  });

  let staying = luxury.inspect().staying, seen = '';
  function goToPlace() {
    const p = luxury.places()[0]; if (!p) return;
    to.x = p.x + 0.6; to.z = p.z + 2.6 * p.scale + 3.6; to.yaw = 0.06; to.pitch = 0.1; keepOnDeck(to);
  }
  if (staying) { goToPlace(); Object.assign(at, to); }

  let last = performance.now(), shadowFrames = 3, cost = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const now0 = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    luxury.update({ dt, width: w, height: h, distance: 4.2, current: true, paused: false });
    const st = luxury.inspect(), key = `${st.staying}:${st.selected}:${st.count}`;
    if (key !== seen) { if (st.staying && (seen || staying)) goToPlace(); seen = key; staying = st.staying; shadowFrames = 3; }
    if (luxury.growing()) shadowFrames = 2;
    if (shadowFrames > 0) { renderer.shadowMap.needsUpdate = true; shadowFrames--; }
    const e = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
    at.x += (to.x - at.x) * e; at.z += (to.z - at.z) * e; at.yaw += (to.yaw - at.yaw) * e; at.pitch += (to.pitch - at.pitch) * e;

    const idle = !reduced && now - touched > 4500 && !fingers.size;
    drift += ((idle ? 1 : 0) - drift) * Math.min(1, dt * (idle ? 0.35 : 3));
    const sx = (Math.sin(time * 0.071) * 0.55 + Math.sin(time * 0.043 + 1.7) * 0.35) * drift, sz = Math.sin(time * 0.037 + 0.6) * 0.3 * drift;
    camera.position.set(at.x + Math.cos(at.yaw) * sx - Math.sin(at.yaw) * sz, EYE + Math.sin(time * 0.05) * 0.03 * drift, at.z - Math.sin(at.yaw) * sx - Math.cos(at.yaw) * sz);
    camera.rotation.set(at.pitch + Math.sin(time * 0.053 + 2) * 0.012 * drift, at.yaw - sx * 0.035, 0);
    renderer.render(scene, camera);
    cost += (performance.now() - now0 - cost) * 0.05;
  }
  requestAnimationFrame(frame);
  window.__luxury = { inspect: () => luxury.inspect(), active: () => luxury.active(), renderer: () => 'webgl', eye: () => ({ ...at }), walk, drift: () => drift, cost: () => cost, info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }) };
}
