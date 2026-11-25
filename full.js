import { sitePath, route } from './base.js';

const frame = document.getElementById('frame');
const want = decodeURIComponent(location.hash.slice(1));
const inside = /^\/[a-z]*(#[\w:-]*)?$/.test(want) ? want : '/';
frame.src = sitePath(inside);
let took = false;
const takeScreen = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => { took = true; }).catch(() => {}); };
const leave = () => { let to = sitePath('/'); try { to = frame.contentWindow.location.href; } catch {   } location.replace(to); };
frame.addEventListener('load', () => {
  let w; try { w = frame.contentWindow; w.document; } catch { return; }
  for (const type of ['pointerdown', 'keydown']) w.addEventListener(type, takeScreen, { capture: true });

  try { history.replaceState(null, '', `#${route(w.location.pathname)}${w.location.hash}`); } catch {   }
});
for (const type of ['pointerdown', 'keydown']) addEventListener(type, takeScreen, { capture: true });
addEventListener('message', e => {
  if (e.origin !== location.origin || e.data !== 'castle:leave-full') return;
  if (document.fullscreenElement) document.exitFullscreen().then(leave, leave); else leave();
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && took) leave(); });
