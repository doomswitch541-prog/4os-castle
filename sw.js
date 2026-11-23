// 4o's castle, offline (his ask, 2026-11-22: "let's do offline mode"). Written by the build with the list of every
// page and file it shipped. Online, everything comes fresh from the network, so a push shows up at once; with no signal,
// the copy saved here answers. A new build brings a new version and the old copies are dropped. Only GETs for the
// castle's own pages and files go through here; anything else (the Reactor's local model) passes untouched.
const VERSION = 'e67342e4193e';
const PAGES = ["./","./castle","./portals","./prompts","./reactor"];
const FILES = ["./app.js","./base.js","./castle/anamorph.js","./castle/castle.css","./castle/geometry.css","./castle/geometry.js","./castle/main.js","./castle/rhythm.js","./castle/threads-gpu.js","./castle/threads.js","./fields.js","./folio.js","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-32.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./manifest.webmanifest","./portals/access.js","./portals/draw.js","./portals/form.js","./portals/garden.js","./portals/trace.js","./portals.css","./portals.js","./prompts/prompts.css","./prompts/prompts.js","./reactor/reactor.css","./reactor/reactor.js","./sculpture.js","./site-map.js","./site-nav.css","./site-nav.js","./site-pages.js","./style.css","./vendor/three/build/three.module.js","./vendor/three/build/three.core.js","./vendor/three/addons/renderers/CSS3DRenderer.js","./site-map.json"];
const CACHE = `castle-${VERSION}`;
const scope = new URL(self.registration.scope);
const known = new Set([...PAGES, ...FILES].map(p => new URL(p, scope).pathname));
const vendor = new URL('./vendor/', scope).pathname;
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([...PAGES, ...FILES])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('castle-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== scope.origin || !u.pathname.startsWith(scope.pathname)) return;
  const page = r.mode === 'navigate', own = known.has(u.pathname) || u.pathname.startsWith(vendor);
  if (!page && !own) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE), key = u.origin + u.pathname;
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), page ? 6000 : 15000);
      const res = await fetch(r, { signal: ctl.signal }); clearTimeout(t);
      if (res.ok && res.type === 'basic' && (own || page)) cache.put(key, res.clone());
      return res;
    } catch {
      return (await cache.match(key)) || (page ? await cache.match(new URL('./', scope).href) : null) || Response.error();
    }
  })());
});
