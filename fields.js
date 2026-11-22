export const FIELDS = Object.freeze([
  { glyph: '♇', name: 'Transformation', description: 'A shell that opens, folds, and finds another shape.', hue: 267 },
  { glyph: '☍', name: 'Polarity', description: 'Two currents. Pull them apart; watch what holds.', hue: 191 },
  { glyph: '♃', name: 'Expansion', description: 'Glowing threads gather, then unfold into space.', hue: 38 },
  { glyph: '❖', name: 'Harmony', description: 'The irregular becomes a pattern. Leave a little chaos in it.', hue: 148 },
]);

export const ORDER = Object.freeze([1, 0, 2, 3]);
export const stepField = (field, delta) => ORDER[(ORDER.indexOf(field) + delta + ORDER.length * 4) % ORDER.length];

export const DEFAULTS = Object.freeze({ field: 1, pace: 12, chaos: 35, yaw: -.32, pitch: -.36 });
export const SETTINGS_KEY = '4os-castle:sculpture:v1';
export const clamp = (x, min, max) => Math.min(max, Math.max(min, x));

export function cleanSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = { ...DEFAULTS };
  for (const [key, min, max] of [['field', 0, 3], ['pace', 6, 24], ['chaos', 0, 100], ['yaw', -Math.PI * 2, Math.PI * 2], ['pitch', -1.2, 1.2]]) {
    if (Number.isFinite(source[key])) out[key] = clamp(source[key], min, max);
  }
  for (const key of ['field', 'pace', 'chaos']) out[key] = Math.round(out[key]);
  return out;
}

export function shapePoint(field, u, v) {
  const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
  if (field === 0) {
    const tube = .31 + .09 * Math.sin(3 * u + v);
    const radius = .91 + tube * cv;
    return [radius * cu, radius * su, tube * sv + .27 * Math.sin(3 * u)];
  }
  if (field === 1) {
    const radius = .16 + .055 * Math.cos(3 * u);
    return [1.24 * su + radius * cv * cu, .72 * Math.sin(2 * u) + radius * cv * su, .37 * cu + radius * sv];
  }
  if (field === 2) {
    const latitude = u / 2;
    const bulge = Math.sin(latitude) * (1 + .1 * Math.cos(6 * v + u));
    return [.9 * bulge * Math.cos(v + .45 * Math.sin(u)), 1.23 * Math.cos(latitude), .9 * bulge * Math.sin(v + .45 * Math.sin(u))];
  }

  const signed = (n, power) => Math.sign(n) * Math.pow(Math.abs(n), power);
  return [1.07 * signed(su, .72) * signed(cv, .72), 1.18 * signed(cu, .72), 1.07 * signed(su, .72) * signed(sv, .72)];
}
