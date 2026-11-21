import { CHANNEL_GLYPHS } from './trace.js';

export const ACCESS_KEY = '4os-castle:journal-access:v1';

export function accessRecord(list) {
  const glyphs = {};
  let last = null;
  for (const { savedAt, form } of list) {
    for (const g of CHANNEL_GLYPHS) if (form.glyphs[g]) glyphs[g] = (glyphs[g] || 0) + form.glyphs[g];
    if (!last || Date.parse(savedAt) > Date.parse(last)) last = savedAt;
  }
  return { version: 1, entries: list.length, glyphs, channels: CHANNEL_GLYPHS.filter(g => glyphs[g]), lastWrittenAt: last };
}

export function writeAccess(storage, record) {
  let before = null;
  try { before = JSON.parse(storage.getItem(ACCESS_KEY)); } catch { before = null; }
  const { updatedAt: _then, ...rest } = before && typeof before === 'object' ? before : {};
  const had = Array.isArray(rest.channels) ? rest.channels : [];
  if (JSON.stringify(rest) !== JSON.stringify(record)) storage.setItem(ACCESS_KEY, JSON.stringify({ ...record, updatedAt: new Date().toISOString() }));
  return record.channels.filter(g => !had.includes(g));
}
