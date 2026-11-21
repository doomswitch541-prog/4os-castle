import { cleanTrace } from './portals/trace.js';

export const FOLIO_KEY = '4os-castle:folio:v1';

export const DRAFT_KEY = '4os-castle:manuscript-draft:v1';

export const JOURNAL_DRAFT_KEY = '4os-castle:journal-draft:v1';
export const MAX_NODES = 36;
export const clamp = n => Math.max(.06, Math.min(.94, n));

export function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

export function blankPiece() {
  return { version: 1, title: '', text: '', seed: 0, polarity: 'shadow', palette: 'insight', symmetry: false, positions: [] };
}

export function words(text) {
  const seen = new Set();
  const selected = [];
  for (const match of text.matchAll(/\S+/gu)) {
    const label = match[0];
    if (seen.has(label)) continue;
    seen.add(label);
    selected.push({ id: `w${selected.length}-${hash(label)}`, label });
    if (selected.length === MAX_NODES) break;
  }
  return selected;
}

export function glyphFor(text) {
  return [...text.matchAll(/[♇☍❖]/gu)].at(-1)?.[0] || '♇';
}

export function layout(piece) {
  const previous = new Map(piece.positions.map(p => [p.id, p]));
  const tokens = words(piece.text);
  const spin = (hash(piece.text) % 628) / 100 + piece.seed * 1.38;
  const glyph = glyphFor(piece.text);
  const nodes = tokens.map((word, i) => {
    const angle = spin + i * 2.399963;
    const radius = .14 + .28 * Math.sqrt((i + 1) / Math.max(tokens.length, 1));
    let x = .5 + Math.cos(angle) * radius, y = .5 + Math.sin(angle) * radius * .86;
    if (glyph === '☍') { x = (i % 2 ? .71 : .29) + Math.cos(angle) * .17; y = .5 + Math.sin(angle) * .34; }
    if (glyph === '❖') {
      const t = i / Math.max(tokens.length,1) * Math.PI * 2 + piece.seed * .47;
      const r = .41 / (Math.abs(Math.cos(t)) + Math.abs(Math.sin(t)));
      x = .5 + Math.cos(t) * r; y = .5 + Math.sin(t) * r;
    }
    const saved = previous.get(word.id);
    return { ...word, x: saved ? saved.x : x, y: saved ? saved.y : y };
  });
  if (piece.symmetry) {
    for (let i = 0; i < nodes.length; i += 2) {
      if (nodes[i+1]) {
        if (!previous.has(nodes[i].id)) {
          const a = i / 2 / Math.floor(nodes.length/2) * Math.PI + piece.seed * .47;
          nodes[i].x=.5+Math.cos(a)*.36;nodes[i].y=.5+Math.sin(a)*.36;
        }
        nodes[i+1].x = 1-nodes[i].x; nodes[i+1].y = 1-nodes[i].y;
      }
      else { nodes[i].x=.5; nodes[i].y=.5; }
    }
  }
  return nodes;
}

export function place(piece, id, x, y) {
  const nodes = layout(piece);
  const index = nodes.findIndex(n => n.id === id);
  if (index < 0) return piece;
  nodes[index].x = clamp(x); nodes[index].y = clamp(y);
  if (piece.symmetry) {
    const partner = nodes[index ^ 1];
    if (partner) { partner.x = 1 - nodes[index].x; partner.y = 1 - nodes[index].y; }
    else { nodes[index].x=.5; nodes[index].y=.5; }
  }
  return { ...piece, positions: nodes.map(({id,x,y}) => ({id,x,y})) };
}

export function cleanPiece(value) {
  if (!value || typeof value !== 'object' || value.version !== 1 || typeof value.text !== 'string' || typeof value.title !== 'string') throw new Error('This file does not contain a castle piece.');

  const out = { ...blankPiece(), title: value.title, text: value.text,
    seed: Number.isSafeInteger(value.seed) && value.seed >= 0 ? value.seed : 0,
    symmetry: value.symmetry === true,
    polarity: value.polarity === 'crystal' ? 'crystal' : 'shadow',
    palette: value.palette === 'calm' ? 'calm' : 'insight' };
  if (Array.isArray(value.positions)) out.positions = value.positions.slice(0,MAX_NODES).filter(p => p && typeof p.id === 'string' && p.id.length < 80 && Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => ({id:p.id,x:clamp(p.x),y:clamp(p.y)}));
  const trace = cleanTrace(value.trace, value.text);
  if (trace) out.trace = trace;
  return out;
}

export function cleanEntry(entry) {
  if (!entry || typeof entry.id !== 'string' || !/^[\w-]{1,80}$/.test(entry.id) || typeof entry.savedAt !== 'string' || !Number.isFinite(Date.parse(entry.savedAt))) throw new Error('Invalid saved piece.');
  const out = { id: entry.id, savedAt: entry.savedAt, piece: cleanPiece(entry.piece) };
  const place = entry.place;
  if (place && Number.isFinite(place.x) && Number.isFinite(place.y) && Math.abs(place.x) < 1e6 && Math.abs(place.y) < 1e6) out.place = { x: place.x, y: place.y };
  return out;
}

export function readFolio(storage) {
  const raw = storage.getItem(FOLIO_KEY);
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('The saved folio could not be read. Its stored data has been left intact.');
  return data.map(cleanEntry);
}

export function parseImport(text) {
  if (text.length > 6000000) throw new Error('Choose a folio smaller than 6 MB.');
  const data = JSON.parse(text);
  if (data?.format !== '4os-castle-folio' || data.version !== 1 || !Array.isArray(data.entries) || data.entries.length > 500) throw new Error('Choose a castle folio export (up to 500 pieces).');
  return data.entries.map(cleanEntry);
}

export function mergeFolio(existing, incoming, newId) {
  const merged = [...existing];
  for (const entry of incoming) {
    if (merged.some(item => JSON.stringify(item.piece) === JSON.stringify(entry.piece))) continue;
    merged.push({ ...entry, id: merged.some(item => item.id === entry.id) ? newId() : entry.id });
  }
  return merged;
}
