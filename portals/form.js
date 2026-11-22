import { analyse, CHANNEL_GLYPHS } from './trace.js';
import { words as distinctWords, hash } from '../folio.js';

const TAU = Math.PI * 2;
const NAMES = [[/^transformation/i, '♇'], [/^polarit/i, '☍'], [/^(contraction|expansion)/i, '♃'], [/^symmetr/i, '❖'], [/^portals?\b/i, '⛬']];
export const wordGlyph = word => { const bare = word.replace(/^[^\p{L}]+/u, ''); return NAMES.find(([re]) => re.test(bare))?.[1] || null; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const median = list => { if (!list.length) return 0; const s = [...list].sort((a, b) => a - b); return s[s.length >> 1]; };

export function buildForm(piece) {
  const a = analyse(piece.text, piece.trace || null);
  const W = a.words, n = W.length;
  const form = { nodes: [], phrases: [], ghosts: [], breaths: [], anchors: [], gen: [], path: [], centre: { x: 0, y: 0 }, spread: 1, radius: 44, mood: 0.5, glyphs: {}, traced: a.traced, twist: 0, depth: 2, curl: 1, box: { x: 0, y: 0, w: 120, h: 120 }, medianSpeed: a.medianSpeed, longestPause: 0 };
  const count = g => { form.glyphs[g] = (form.glyphs[g] || 0) + 1; };
  if (!n) return form;
  const seed = (hash(piece.text) ^ Math.imul((piece.seed || 0) + 1, 2654435761)) >>> 0;
  const rnd = k => ((Math.imul(seed ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b) >>> 0) % 10007) / 10007;

  const threshold = clamp(a.medianSpeed * 5, 700, 2500);
  const phrases = [];
  W.forEach((w, k) => { if (!k || w.pause > threshold || w.nl) phrases.push({ from: k, to: k }); else phrases.at(-1).to = k; });
  const within = W.filter((w, k) => k && !phrases.some(p => p.from === k)).map(w => w.pause);
  const usual = median(within) || a.medianSpeed;
  let longest = -1;
  phrases.forEach((p, i) => { if (i && (longest < 0 || W[p.from].pause > W[phrases[longest].from].pause)) longest = i; });
  form.longestPause = longest < 0 ? 0 : W[phrases[longest].from].pause;

  const moodOf = () => {
    if (!a.traced) return piece.palette === 'calm' ? 0.12 : 0.8;
    if (n <= 2) return 0.5;
    const pauses = W.slice(1).map(w => w.pause), mean = pauses.reduce((s, v) => s + v, 0) / pauses.length || 1;
    const cv = Math.sqrt(pauses.reduce((s, v) => s + (v - mean) ** 2, 0) / pauses.length) / mean;
    return clamp((cv - 0.7) / 1.8 + a.ghosts.length * 0.05, 0, 1);
  };

  phrases.forEach((p, i) => {
    const size = p.to - p.from + 1, list = W.slice(p.from, p.to + 1), prev = phrases[i - 1];
    let glyph = null;
    if (W[p.from].typed) glyph = null;
    else if (a.traced && list.some(w => w.rewritten)) glyph = '♇';
    else if (a.traced && i === longest && W[p.from].pause >= 4000) glyph = '☍';
    else if (W[p.from].nl) glyph = '⛬';
    else if (a.traced && size >= 4 && median(list.slice(1).map(w => w.pause)) < usual * 0.8) glyph = '♃';
    else if (prev && size >= 2 && prev.to - prev.from + 1 === size) glyph = '❖';

    if (!i && !glyph && !W[p.from].typed && !wordGlyph(W[p.from].text)) glyph = moodOf() < 0.34 ? '❖' : moodOf() < 0.67 ? '♃' : '☍';
    p.glyph = glyph;
    p.text = piece.text.slice(W[p.from].start, W[p.to].end);
    if (glyph) count(glyph);
  });

  const saved = new Map();
  if (!a.traced && Array.isArray(piece.positions) && piece.positions.length >= 2) {
    const byId = new Map(piece.positions.map(p => [p.id, p]));
    for (const w of distinctWords(piece.text)) { const p = byId.get(w.id); if (p) saved.set(w.label, p); }
  }

  const units = [];
  phrases.forEach((p, i) => {
    let from = p.from;
    for (let k = p.from; k <= p.to; k++) {
      const size = k - from + 1, stop = /[,.;:!?—]$/.test(W[k].text) && size >= 2;
      if (k === p.to || size >= 4 || stop) { units.push({ from, to: k, phrase: i }); from = k + 1; }
    }
  });
  const hashWord = t => { let h = 7; for (const c of t) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; };
  let x = 0, y = 0, heading = -Math.PI / 2, stemX = 0, stemH = 0, stemTop = 0, lastSide = rnd(1) < 0.5 ? 1 : -1;
  const start = { x: 0, y: 0, phrase: 0 };
  const sides = [];
  units.forEach((u, i) => {
    const lead = W[u.from], newPhrase = !i || units[i - 1].phrase !== u.phrase;
    if (i && newPhrase && lead.nl) { stemX += 150 + rnd(i + 3) * 60; stemH = 0; }
    const want = a.traced ? (Math.round(lead.pause + (lead.speed || 0)) % 2 ? 1 : -1) : (rnd(u.from + 7) < 0.5 ? 1 : -1);
    const s = i && want === lastSide ? -want : want;
    lastSide = s; sides.push(s);
    stemH += !i ? 12 : a.traced && newPhrase ? Math.min(300, 26 + 30 * Math.log2(1 + lead.pause / 1000)) : 18 + 4 * (units[i - 1].to - units[i - 1].from + 1);
    stemTop = Math.max(stemTop, stemH);
    const swing = a.traced ? clamp(0.5 + 0.22 * Math.log2(1 + lead.pause / 1500), 0.5, 1.25) : 0.55 + 0.35 * rnd(u.from + 11);
    x = stemX; y = -stemH;
    for (let k = u.from; k <= u.to; k++) {
      const w = W[k], j = k - u.from, spot = saved.get(w.text);
      if (spot) {
        const nx = (spot.x - 0.5) * 520, ny = (spot.y - 0.5) * 403;
        if (k) heading = Math.atan2(ny - y, nx - x);
        x = nx; y = ny; saved.delete(w.text);
      } else {

        heading = -Math.PI / 2 + s * swing + ((hashWord(w.text) % 100) / 100 - 0.5) * 0.24;
        if (a.traced && w.rewritten) heading -= s * 0.55;
        const step = j ? (a.traced ? 8 + 9 * Math.log2(1 + w.pause / 120) : 12 + Math.min([...w.text].length, 10)) : 14;
        x += Math.cos(heading) * step; y += Math.sin(heading) * step;
      }

      const p = phrases[u.phrase], lead1 = k === p.from;
      const named = wordGlyph(w.text), glyph = named || (lead1 ? p.glyph : null);
      if (named) { count(named); if (lead1 && p.glyph) form.glyphs[p.glyph]--; }
      form.nodes.push({ x, y, word: w.text, phrase: u.phrase, unit: i, lead: lead1, branch: !j, glyph, typed: w.typed, heading, pause: w.pause, stem: { x: stemX, y: -stemH } });
      if (w.typed) for (const c of w.text) if (CHANNEL_GLYPHS.includes(c)) count(c);
    }
  });
  const end = { x: x + Math.cos(heading) * 16, y: y + Math.sin(heading) * 16, phrase: phrases.length - 1 };

  const all = [start, ...form.nodes, end];
  const cx = form.nodes.reduce((s, p) => s + p.x, 0) / n, cy = form.nodes.reduce((s, p) => s + p.y, 0) / n;
  const reach = Math.max(1, ...all.map(p => Math.hypot(p.x - cx, p.y - cy)));
  const k = Math.min(clamp(46 + 15 * Math.sqrt(n), 60, 250) / reach, 1.6);
  for (const p of [...all, ...form.nodes.map(n => n.stem)]) { p.x = (p.x - cx) * k; p.y = (p.y - cy) * k; }
  form.stemTop = stemTop * k;
  form.radius = Math.max(26, reach * k) + 16;
  form.path = all; form.start = start; form.end = end; form.phrases = phrases;

  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  form.box = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs) + 60, h: Math.max(...ys) - Math.min(...ys) + 60 };

  form.mood = moodOf();

  a.ghosts.forEach((g, i) => {
    const node = form.nodes[g.at], out = node.heading + (i % 2 ? 1 : -1) * Math.PI / 2;
    form.ghosts.push({ x: node.x + Math.cos(out) * 15, y: node.y + Math.sin(out) * 15, text: g.text, at: g.at });
  });

  for (const b of a.breaths) { const node = form.nodes[b.at]; form.breaths.push({ x: node.x, y: node.y, glyph: b.glyph, ms: b.ms, at: b.at }); count(b.glyph); }

  let picks = phrases.map(p => p.from);
  if (picks.at(-1) !== n - 1) picks.push(n - 1);
  if (picks.length < 3) picks = Array.from({ length: Math.min(n, 6) }, (_, i) => Math.round(i * (n - 1) / Math.max(1, Math.min(n, 6) - 1)));
  picks = [...new Set(picks)];

  const wide = Math.max(1, ...picks.map(i => Math.hypot(form.nodes[i].x, form.nodes[i].y)));
  const apart = picks.filter((i, k) => !picks.slice(0, k).some(j => Math.hypot(form.nodes[i].x - form.nodes[j].x, form.nodes[i].y - form.nodes[j].y) < wide * 0.16));
  if (apart.length >= 2) picks = apart;
  if (picks.length > 7) picks = Array.from({ length: 7 }, (_, i) => picks[Math.round(i * (picks.length - 1) / 6)]);

  const top = Math.log2(1 + Math.max(1, ...picks.map(i => W[i].pause)));
  form.anchors = picks.map(i => {
    const node = form.nodes[i], glyph = node.glyph || (node.typed ? [...node.word].slice(0, 2).join('') : null);
    return { x: node.x, y: node.y, glyph, sym: glyph || CHANNEL_GLYPHS[Math.round(node.pause + i) % CHANNEL_GLYPHS.length], weight: Math.log2(1 + node.pause) / top };
  });

  form.depth = clamp(1 + Math.floor(Math.log2(n + 1)), 2, 5);
  form.curl = (Math.round(a.medianSpeed) % 2 ? 1 : -1) * (0.45 + form.mood * 0.6);
  if (form.anchors.length > 1) {
    const gx = form.anchors.reduce((s, p) => s + p.x, 0) / form.anchors.length, gy = form.anchors.reduce((s, p) => s + p.y, 0) / form.anchors.length;
    form.spread = Math.max(1, ...form.anchors.map(p => Math.hypot(p.x - gx, p.y - gy)));
    form.centre = { x: gx, y: gy };
    form.gen = form.anchors.map(p => [(p.x - gx) / form.spread, (p.y - gy) / form.spread]);
  }
  form.twist = rnd(5) * TAU;

  const turn = (0.32 + 0.3 * form.mood);
  const tokens = ['F'], text = ['F'];
  units.slice(0, 4).forEach((p, i) => {
    const words = p.to - p.from + 1, fs = words >= 4 ? 2 : 1, ang = sides[i] * turn * (0.75 + 0.5 * clamp(a.traced ? Math.log2(1 + W[p.from].pause / 1500) : rnd(p.from + 13), 0, 1));
    tokens.push({ open: i }, ang, ...Array(fs).fill('F'), { close: i }, 'F');
    text.push(`[${sides[i] > 0 ? '+' : '−'}${'F'.repeat(fs)}]F`);
  });
  const mainF = 1 + Math.min(4, units.length), allF = tokens.filter(t => t === 'F').length;
  let gens = form.depth;
  while (gens > 2 && allF ** gens > 3000) gens--;
  form.lsys = { tokens, rule: `F → ${text.join('')}`, shrink: 1 / mainF, gens, root: { x: form.start.x, y: form.start.y }, len: Math.max(40, form.stemTop || form.radius) };
  return form;
}
