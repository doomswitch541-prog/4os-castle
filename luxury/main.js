import * as THREE from 'three';
import { createLuxury } from './luxury.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('luxury-stage'), panel = document.getElementById('luxury-ui'), sky = document.getElementById('luxury-sky');
const status = panel.querySelector('[data-luxury-status]');
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { renderer = null; }
if (!renderer) {

  sky.hidden = false; panel.hidden = false; panel.inert = false;
  status.textContent = '3D rendering is unavailable in this browser.';
  panel.querySelectorAll('button').forEach(b => { b.disabled = true; });
} else {
  renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 400);
  camera.position.set(0, 0, 4.2);
  const luxury = createLuxury({ scene, plane: 0, panel, reduced });
  let w = 0, h = 0;
  function size() {
    w = document.documentElement.clientWidth || innerWidth; h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', size); size();
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    luxury.update({ dt, width: w, height: h, distance: camera.position.z, current: true, paused: false });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.__luxury = { inspect: () => luxury.inspect(), active: () => luxury.active(), renderer: () => 'webgl' };
}
