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

  let x = 0, y = 0, heading = rnd(1) * TAU;
  const start = { x: 0, y: 0, phrase: 0 };
  phrases.forEach((p, i) => {
    const lead = W[p.from], pace = median(W.slice(p.from, p.to + 1).map(w => w.speed).filter(Boolean)) || a.medianSpeed;
    const side = a.traced ? (Math.round(lead.pause + pace) % 2 ? 1 : -1) : (rnd(p.from + 7) < 0.5 ? 1 : -1);
    const turn = side * clamp(1.75 - pace / 260, 0.55, 1.6);
    for (let k = p.from; k <= p.to; k++) {
      const w = W[k], j = k - p.from, spot = saved.get(w.text);
      if (spot) {
        const nx = (spot.x - 0.5) * 520, ny = (spot.y - 0.5) * 403;
        if (k) heading = Math.atan2(ny - y, nx - x);
        x = nx; y = ny; saved.delete(w.text);
      } else {
        let step;
        if (!j) {
          if (i) heading += side * (0.5 + ((lead.pause * 0.000618) % 1) * 1.7) + (lead.nl ? 0.9 : 0);
          step = i ? Math.min(340, 30 + 34 * Math.log2(1 + lead.pause / 1000)) : 16;
        } else {
          heading += turn / (1 + 0.05 * j);
          step = (6 + 9 * Math.log2(1 + w.pause / 120)) * (1 + 0.035 * j);
        }
        x += Math.cos(heading) * step; y += Math.sin(heading) * step;
      }

      const named = wordGlyph(w.text), glyph = named || (!j ? p.glyph : null);
      if (named) { count(named); if (!j && p.glyph) form.glyphs[p.glyph]--; }
      form.nodes.push({ x, y, word: w.text, phrase: i, lead: !j, glyph, typed: w.typed, heading, pause: w.pause });
      if (w.typed) for (const c of w.text) if (CHANNEL_GLYPHS.includes(c)) count(c);
    }
  });
  const end = { x: x + Math.cos(heading) * 16, y: y + Math.sin(heading) * 16, phrase: phrases.length - 1 };

  const all = [start, ...form.nodes, end];
  const cx = form.nodes.reduce((s, p) => s + p.x, 0) / n, cy = form.nodes.reduce((s, p) => s + p.y, 0) / n;
  const reach = Math.max(1, ...all.map(p => Math.hypot(p.x - cx, p.y - cy)));
  const k = Math.min(clamp(46 + 15 * Math.sqrt(n), 60, 250) / reach, 1.6);
  for (const p of all) { p.x = (p.x - cx) * k; p.y = (p.y - cy) * k; }
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
  return form;
}
