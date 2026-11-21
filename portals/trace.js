export const CHANNEL_GLYPHS = ['♇', '☍', '♃', '❖', '⛬'];
const MAX_GAP = 3600000;
const MAX_EVENTS = 200000;
const isHigh = c => c >= 0xd800 && c <= 0xdbff;
const isLow = c => c >= 0xdc00 && c <= 0xdfff;
const median = list => { if (!list.length) return 0; const s = [...list].sort((a, b) => a - b); return s[s.length >> 1]; };

export function diffEvent(prev, next) {
  if (prev === next) return null;
  const max = Math.min(prev.length, next.length);
  let p = 0;
  while (p < max && prev.charCodeAt(p) === next.charCodeAt(p)) p++;
  if (p > 0 && isHigh(prev.charCodeAt(p - 1))) p--;
  let s = 0;
  while (s < max - p && prev.charCodeAt(prev.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
  if (s > 0 && isLow(prev.charCodeAt(prev.length - s))) s--;
  return { pos: p, del: prev.slice(p, prev.length - s), ins: next.slice(p, next.length - s) };
}

export function replay(trace) {
  let text = trace.base;
  for (let i = 0; i < trace.e.length; i += 4) {
    const pos = trace.e[i + 1], del = trace.e[i + 2], ins = trace.e[i + 3];
    if (text.substr(pos, del.length) !== del) throw new Error('This trace does not match its text.');
    text = text.slice(0, pos) + ins + text.slice(pos + del.length);
  }
  return text;
}

export function cleanTrace(value, text) {
  if (!value || typeof value !== 'object' || value.v !== 1 || typeof value.base !== 'string' || !Array.isArray(value.e)) return null;
  if (value.e.length % 4 || value.e.length > MAX_EVENTS * 4) return null;
  for (let i = 0; i < value.e.length; i += 4) {
    const gap = value.e[i], pos = value.e[i + 1];
    if (!Number.isFinite(gap) || gap < 0 || !Number.isSafeInteger(pos) || pos < 0) return null;
    if (typeof value.e[i + 2] !== 'string' || typeof value.e[i + 3] !== 'string') return null;
  }
  const b = [];
  if (Array.isArray(value.b)) for (const item of value.b.slice(0, 500)) {
    if (!Array.isArray(item) || !Number.isSafeInteger(item[0]) || item[0] < 0 || typeof item[1] !== 'string' || item[1].length > 16 || !Array.isArray(item[2])) continue;
    const ms = item[2].filter(n => Number.isFinite(n) && n > 0).slice(0, 40).map(n => Math.min(600000, Math.round(n)));
    if (ms.length) b.push([item[0], item[1], ms]);
  }
  const t0 = typeof value.t0 === 'string' && Number.isFinite(Date.parse(value.t0)) ? value.t0 : new Date(0).toISOString();
  const trace = { v: 1, t0, base: value.base, e: value.e.map((x, i) => (i % 4 === 0 ? Math.min(MAX_GAP, Math.round(x)) : x)), b };
  try { if (replay(trace) !== text) return null; } catch { return null; }
  return trace;
}

export class Recorder {
  constructor(saved = null, base = '') {
    this.t0 = saved ? saved.t0 : new Date().toISOString();
    this.base = saved ? saved.base : base;
    this.e = saved ? [...saved.e] : [];
    this.b = saved ? saved.b.map(([n, glyph, ms]) => [n, glyph, [...ms]]) : [];
    this.text = saved ? replay(saved) : base;
    this.last = null;
  }
  get events() { return this.e.length / 4; }
  input(next, now) {
    const change = diffEvent(this.text, next);
    if (!change || this.events >= MAX_EVENTS) { this.text = change ? this.text : next; return null; }
    const gap = this.last === null ? 0 : Math.min(MAX_GAP, Math.max(0, Math.round(now - this.last)));
    this.last = now;
    this.e.push(gap, change.pos, change.del, change.ins);
    this.text = next;
    return { gap, ...change };
  }

  breath(glyph, ms) {
    const latest = this.b.at(-1);
    if (latest && latest[0] === this.events && latest[1] === glyph) latest[2].push(Math.round(ms));
    else this.b.push([this.events, glyph, [Math.round(ms)]]);
  }
  toJSON() { return { v: 1, t0: this.t0, base: this.base, e: [...this.e], b: this.b.map(([n, g, ms]) => [n, g, [...ms]]) }; }
}

const TYPED = /^(?:[♇☍♃❖⛬]|\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍)+$/u;
function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; }

export function analyse(text, trace) {
  const matches = [...text.matchAll(/\S+/gu)];
  const gaps = new Array(text.length).fill(0), order = new Array(text.length).fill(-1);
  const ghosts = [], breaths = [];
  if (trace) {
    let chars = [];
    for (let i = 0; i < trace.base.length; i++) chars.push({ gap: 0, ev: -1, alive: true, prev: null });
    let run = null;
    for (let i = 0, n = 0; i < trace.e.length; i += 4, n++) {
      const gap = trace.e[i], pos = trace.e[i + 1], del = trace.e[i + 2], ins = trace.e[i + 3];
      if (del) {
        const removed = chars.splice(pos, del.length), before = chars[pos - 1] || null;
        for (const c of removed) { c.alive = false; c.prev = before; }

        if (run && run.ev === n - 1 && pos + del.length === run.pos) run.text = del + run.text;
        else if (run && run.ev === n - 1 && pos === run.pos) run.text += del;
        else { run = { text: del }; ghosts.push(run); }
        run.pos = pos; run.ev = n; run.prev = before;
      }
      if (ins) {
        const fresh = [];
        for (let k = 0; k < ins.length; k++) fresh.push({ gap: k ? 0 : gap, ev: n, alive: true, prev: null });
        chars = chars.slice(0, pos).concat(fresh, chars.slice(pos));
        run = null;
      }
    }
    chars.forEach((c, i) => { c.i = i; gaps[i] = c.gap; order[i] = c.ev; });
    for (const ghost of ghosts) { let a = ghost.prev; while (a && !a.alive) a = a.prev; ghost.index = a ? a.i + 1 : 0; }
  }
  const words = matches.map((m, k) => {
    const start = m.index, end = start + m[0].length, from = k ? matches[k - 1].index + matches[k - 1][0].length : 0;
    const between = text.slice(from, start);
    let pause = 0, speed = 0;
    if (trace) {
      for (let j = from; j <= start; j++) pause = Math.max(pause, gaps[j]);
      speed = median(gaps.slice(start + 1, end).filter(g => g > 0));
    } else {

      const h = hash(m[0] + k), last = k ? matches[k - 1][0] : '';
      pause = !k ? 0 : between.includes('\n') ? 2600 + h % 900 : /[.!?…]["”’)]?$/u.test(last) ? 1500 + h % 500 : /[,;:—–]$/u.test(last) ? 520 + h % 160 : 150 + h % 130;
      speed = 85 + h % 70;
    }
    return { text: m[0], start, end, pause, speed, nl: k > 0 && between.includes('\n'), rewritten: false, typed: TYPED.test(m[0]) };
  });
  const placed = [];
  for (const ghost of ghosts) {
    if (!ghost.text.trim() || !words.length) continue;
    let at = words.findIndex(w => ghost.index <= w.end);
    if (at < 0) at = words.length - 1;
    words[at].rewritten = true;
    placed.push({ text: ghost.text.trim(), at });
  }
  if (trace) for (const [count, glyph, ms] of trace.b) {
    let best = -2, at = Math.max(0, words.length - 1);
    words.forEach((w, k) => { for (let j = w.start; j < w.end; j++) if (order[j] < count && order[j] > best) { best = order[j]; at = k; } });
    breaths.push({ at, glyph, ms });
  }
  return { words, ghosts: placed, breaths, traced: Boolean(trace), medianSpeed: median(words.map(w => w.speed).filter(Boolean)) || 140 };
}
