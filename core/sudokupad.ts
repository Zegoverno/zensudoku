// SudokuPad puzzles, read without SudokuPad. Pure: no DOM, no storage, no network.
//
// A SudokuPad source is what sudokupad.app/api/puzzle/<id> returns: `scl` or `ctc` and the lz-string
// (base64) of SudokuPad's compact puzzle text; `fpuz` and the lz-string of an f-puzzles JSON; or the
// compact text itself, starting with "{". The compact text is JSON with short keys (ce, re, u, o, l, a,
// ca…), unquoted keys, single-quoted strings, bare values (t/f, CFCFCF colours) and empty array slots.
//
// `parseSudokuPad` turns a source into a `PadModel`: the grid, its givens and regions, the metadata
// (title, author, rules, solution, video) and the drawing as plain primitives in cell units (x is the
// column, y the row), in SudokuPad's layer order: underlays, then lines and arrows, then killer
// cages, then the grid lines and region borders, then overlays. Sizes and widths are SudokuPad's
// pixels at its 64 px cell, divided by 64. The board (ui/PadDrawing.svelte) draws them as they are.
import * as LZ from 'lz-string';

// ---- decoding ----
const lz = ((LZ as unknown as { decompressFromBase64?: unknown }).decompressFromBase64 ? LZ : (LZ as unknown as { default: typeof LZ }).default) as typeof LZ;
export const MAX_SOURCE = 300_000;
const MAX_TEXT = 3_000_000;

/** The puzzle text inside a source: SudokuPad's compact text, or an f-puzzles JSON (`fpuz`). A string says why not. */
export function decodeSource(source: string): { format: 'scl' | 'fpuz' | 'text'; text: string } | string {
  let s = String(source ?? '').trim();
  if (!s) return 'The puzzle source is empty.';
  if (s.length > MAX_SOURCE) return 'The puzzle source is too long.';
  // A full link: keep what follows the host (sudokupad.app/<source> or ?puzzleid=<source>).
  const link = /^https?:\/\/[^/]+\/(?:sudoku\/)?(?:\?puzzleid=)?(.+)$/i.exec(s);
  if (link) s = link[1];
  if (/%[0-9a-f]{2}/i.test(s)) { try { s = decodeURIComponent(s); } catch { /* keep it as it is */ } }
  const prefixed = /^(scl|ctc|fpuzzles|fpuz)([\s\S]*)$/.exec(s);
  if (prefixed) {
    let text = '';
    try { text = lz.decompressFromBase64(prefixed[2].replace(/\s/g, '+')) ?? ''; } catch { text = ''; }
    if (!text || text.length > MAX_TEXT) return 'The puzzle source could not be decoded.';
    return { format: prefixed[1].startsWith('fpuz') ? 'fpuz' : 'scl', text };
  }
  if (s.startsWith('{')) return { format: 'text', text: s };
  if (/^[A-Za-z0-9]{6,16}$/.test(s)) return 'That is a SudokuPad short id: paste the puzzle source (what sudokupad.app/api/puzzle/<id> returns), not the id.';
  return 'Not a SudokuPad puzzle: a source starts with scl, ctc, fpuz or {.';
}

/** Reads SudokuPad's compact text (or plain JSON) into plain values. Lenient like SudokuPad, bounded like a parser should be. */
export function readCompact(text: string): unknown {
  let i = 0, depth = 0;
  const fail = (why: string): never => { throw new Error(`${why} at ${i}`); };
  const space = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const str = (): string => {
    const q = text[i++];
    let out = '';
    while (i < text.length && text[i] !== q) {
      if (text[i] === '\\') {
        const e = text[i + 1];
        if (e === 'n') out += '\n';
        else if (e === 't') out += '\t';
        else if (e === 'u' && /^[0-9a-f]{4}$/i.test(text.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16)); i += 4; }
        else out += e ?? '';
        i += 2;
      } else out += text[i++];
    }
    if (i >= text.length) fail('unterminated string');
    i++;
    return out;
  };
  const bare = (): unknown => {
    const start = i;
    while (i < text.length && !/[,\]}:]/.test(text[i])) i++;
    const t = text.slice(start, i).trim();
    if (t === 't' || t === 'true') return true;
    if (t === 'f' || t === 'false') return false;
    if (t === '' || t === 'null' || t === 'undefined') return null;
    if (t === '#0') return '#000000';
    if (t === '#F') return '#FFFFFF';
    if (/^[0-9a-f]{6}$/i.test(t) && !/^\d+$/.test(t)) return '#' + t;
    if (/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return Number(t);
    return t;
  };
  const value = (): unknown => {
    space();
    const c = text[i];
    if (c === '{' || c === '[') {
      if (++depth > 64) fail('too deep');
      i++;
      const out: unknown = c === '{' ? {} : [];
      const close = c === '{' ? '}' : ']';
      space();
      // An empty slot (`[a,,b]`, `[a,]`) holds nothing, as in SudokuPad.
      if (text[i] === close) { i++; depth--; return out; }
      for (;;) {
        space();
        if (i >= text.length) fail('unterminated');
        if (Array.isArray(out)) {
          if (text[i] === ',' || text[i] === close) out.push(null);
          else out.push(value());
        } else {
          space();
          let key: string;
          if (text[i] === '"' || text[i] === "'") key = str();
          else { const s = i; while (i < text.length && text[i] !== ':') i++; key = text.slice(s, i).trim(); }
          space();
          if (text[i] !== ':') fail('expected :');
          i++;
          const v = value();
          if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') (out as Record<string, unknown>)[key] = v;
        }
        space();
        if (text[i] === ',') { i++; space(); if (text[i] === close && !Array.isArray(out)) { i++; break; } continue; }
        if (text[i] === close) { i++; break; }
        fail('expected , or ' + close);
      }
      depth--;
      return out;
    }
    if (c === '"' || c === "'") return str();
    return bare();
  };
  const out = value();
  space();
  if (i < text.length) fail('trailing text');
  return out;
}

// SudokuPad's short keys and the names they stand for.
const LONG: Record<string, string> = {
  c: 'color', ca: 'cages', ct: 'center', c1: 'borderColor', c2: 'backgroundColor', ce: 'cells', cs: 'cellSize',
  a: 'arrows', o: 'overlays', u: 'underlays', w: 'width', h: 'height', v: 'value', vd: 'videos', l: 'lines',
  r: 'rounded', re: 'regions', fs: 'fontSize', th: 'thickness', hl: 'headLength', wp: 'wayPoints', t: 'title',
  te: 'text', d: 'duration', d2: 'd',
};
const COLOR_KEYS = new Set(['color', 'borderColor', 'backgroundColor', 'textColor', 'textStroke', 'fill', 'stroke', 'fontC', 'outlineC']);
function expand(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(expand);
  if (!x || typeof x !== 'object') return x;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    const key = LONG[k] && !(LONG[k] in (x as object)) ? LONG[k] : k;
    let val = expand(v);
    if (COLOR_KEYS.has(key) && typeof val === 'string' && /^[0-9a-f]{6}$/i.test(val)) val = '#' + val;
    out[key] = val;
  }
  return out;
}

// ---- the model ----
export type Seg = [number, number, number, number];
export interface PadText { x: number; y: number; text: string; size: number; fill: string; stroke: string; strokeWidth: number; anchor: 'middle' | 'start'; angle: number; /** A box behind the text (a cage label's). */ background?: string }
export interface PadRect {
  x: number; y: number; w: number; h: number; rx: number; angle: number;
  fill: string; stroke: string; strokeWidth: number; opacity: number; fillOpacity: number; strokeOpacity: number;
  text: PadText | null;
}
export interface PadPath { points: [number, number][]; color: string; width: number; opacity: number; dash: string; fill: string; cap: 'round' | 'butt'; join: 'round' | 'miter' }
export interface PadCage { cells: [number, number][]; segments: Seg[]; color: string; width: number; dash: string; fill: string; label: PadText | null }
export interface PadModel {
  rows: number; cols: number;
  /** Digits 1..digits are played. */
  digits: number;
  /** One per cell of the rows × cols array; 0 for none. */
  givens: number[];
  /** The cells that are played (outside-clue areas are not), row-major indices. */
  active: number[];
  /** Units that hold each digit once: rows and columns of the played area, and its regions. */
  units: { rule: 'row' | 'column' | 'region'; label: string; cells: number[] }[];
  /** Where R1C1 of the played area is in the array. */
  origin: [number, number];
  /** The played area as a rectangle in cell units: only it gets grid lines, region borders and an outer border. */
  grid: { x: number; y: number; w: number; h: number };
  title: string; author: string; rules: string[];
  /** One per cell: the digit, 0 for a cell left empty, -1 for any entry; null when the puzzle carries none. */
  solution: number[] | null;
  video: string;
  /** No drawing beyond regions and plain shading, and the classic rules leave only a few solutions. */
  classic: boolean;
  under: PadRect[]; lines: PadPath[]; cages: PadCage[]; regionEdges: Seg[]; over: PadRect[];
  /** Givens outside the played area, drawn like clues. */
  outsideGivens: PadText[];
  /** The drawing's extent, in cell units. */
  bounds: { x: number; y: number; w: number; h: number };
}

const PX = 1 / 64;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([0-9.,%\s-]+\)|[a-z]{3,20})$/i;
const color = (c: unknown, fallback = 'none'): string => typeof c === 'string' && SAFE_COLOR.test(c.trim()) ? c.trim() : fallback;
const num = (n: unknown, fallback = 0): number => {
  const v = typeof n === 'string' && n.trim() ? Number(n) : n;
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};
const list = (x: unknown): unknown[] => Array.isArray(x) ? x : [];
const obj = (x: unknown): Record<string, unknown> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {};
const point = (p: unknown): [number, number] | null => {
  if (!Array.isArray(p) || p.length < 2) return null;
  const r = num(p[0], NaN), c = num(p[1], NaN);
  return Number.isFinite(r) && Number.isFinite(c) && Math.abs(r) < 1000 && Math.abs(c) < 1000 ? [c, r] : null;
};
const textOf = (t: unknown): string => (typeof t === 'number' ? String(t) : typeof t === 'string' ? t : '').slice(0, 300);
// SudokuPad draws a shape whose colour has no alpha at half opacity, except these.
const OPAQUE = ['#000000', '#CFCFCF', '#FFFFFF', 'none'];
const hasAlpha = (c: string) => /^\s*(#....(....)?|rgba|transparent)\s*$/.test(c);

function rect(part: Record<string, unknown>): PadRect | null {
  const centre = point(part.center);
  if (!centre) return null;
  const w = num(part.width, 1), h = num(part.height, 1);
  const fill = color(part.backgroundColor);
  let border = color(part.borderColor);
  if (fill === border) border = 'none';
  const size = num(part.borderSize) || num(part.thickness) || (border !== 'none' ? 2 : 0);
  const legacy = !OPAQUE.includes(fill) && !hasAlpha(fill);
  const bs = size * PX;
  const out: PadRect = {
    x: centre[0] - w / 2 + bs / 2, y: centre[1] - h / 2 + bs / 2, w: Math.max(0, w - bs), h: Math.max(0, h - bs),
    rx: part.rounded === true ? Math.max(0, 0.5 * (Math.min(w, h) - bs)) : 0, angle: num(part.angle),
    fill, stroke: border, strokeWidth: bs, opacity: num(part.opacity, 1), fillOpacity: legacy ? .5 : 1, strokeOpacity: legacy ? .5 : 1, text: null,
  };
  const t = textOf(part.text);
  if (t !== '') {
    // SudokuPad adds 4 px to an under/overlay's font size.
    const size = (part.fontSize === undefined ? 16 : num(part.fontSize, 16)) + 4;
    const textColor = part.textColor !== undefined ? color(part.textColor, '#000000') : color(part.color, '#000000');
    out.text = {
      x: centre[0], y: centre[1] + 0.06 * h, text: t, size: size * PX, fill: textColor,
      stroke: part.textColor !== undefined ? 'none' : color(part.textStroke ?? part.stroke), strokeWidth: 3 * PX,
      anchor: 'middle', angle: num(part.angle),
    };
  }
  return out;
}

function path(part: Record<string, unknown>, arrow = false): PadPath[] {
  const points = list(part.wayPoints).map(point).filter((p): p is [number, number] => !!p);
  if (points.length < (arrow ? 2 : 1)) return [];
  let th = num(part.thickness, arrow ? 3 : 2);
  if (!arrow && th === 1) th = 2;
  const base: PadPath = {
    points, color: color(part.color), width: th * PX, opacity: num(part.opacity, 1),
    dash: typeof part['stroke-dasharray'] === 'string' && /^[0-9.,\s]+$/.test(part['stroke-dasharray']) ? part['stroke-dasharray'].split(/[\s,]+/).map(n => Number(n) * PX).join(' ') : '',
    fill: arrow ? 'none' : color(part.fill), cap: 'round', join: 'round',
  };
  if (!arrow) return [base];
  // An arrow: the shaft stops one stroke width short of its end, where an open head (90°) points on.
  const shaft = points.map(p => [...p] as [number, number]);
  const [a, b] = [shaft[shaft.length - 2], shaft[shaft.length - 1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  b[0] -= ux * th * PX; b[1] -= uy * th * PX;
  const size = part.headLength !== undefined ? num(part.headLength) * 2 : th * 10 * PX, k = 0.5 * Math.SQRT1_2 * size;
  const head: [number, number][] = [[b[0] - ux * k - uy * k, b[1] - uy * k + ux * k], [b[0], b[1]], [b[0] - ux * k + uy * k, b[1] - uy * k - ux * k]];
  return [{ ...base, points: shaft, cap: 'butt' }, { ...base, points: head, join: 'miter', cap: 'butt' }];
}

/** The outline of a set of cells, inset by `d` (cell units): merged straight segments. */
export function outline(cells: [number, number][], d = 0): Seg[] {
  const set = new Set(cells.map(([r, c]) => `${r},${c}`));
  const has = (r: number, c: number) => set.has(`${r},${c}`);
  const out: Seg[] = [];
  const sides: [number, number, number, number][] = [[-1, 0, 0, 1], [0, 1, 1, 0], [1, 0, 0, 1], [0, -1, 1, 0]];
  for (const [r, c] of cells) for (const [dr, dc, tr, tc] of sides) {
    if (has(r + dr, c + dc)) continue;
    const pull = (e: 1 | -1) => has(r + e * tr, c + e * tc) ? (has(r + e * tr + dr, c + e * tc + dc) ? -d : 0) : d;
    const a = pull(-1), b = pull(1);
    if (tr === 0) { const y = dr < 0 ? r + d : r + 1 - d; out.push([c + a, y, c + 1 - b, y]); }
    else { const x = dc > 0 ? c + 1 - d : c + d; out.push([x, r + a, x, r + 1 - b]); }
  }
  // Join segments that continue each other, so a dash pattern runs on unbroken.
  const key = (n: number) => Math.round(n * 1000);
  const merged: Seg[] = [];
  for (const horizontal of [true, false]) {
    const group = new Map<number, Seg[]>();
    for (const s of out) if ((s[1] === s[3]) === horizontal && !(s[0] === s[2] && s[1] === s[3])) {
      const k = key(horizontal ? s[1] : s[0]);
      group.set(k, [...(group.get(k) ?? []), s]);
    }
    for (const segs of group.values()) {
      const at = (s: Seg) => horizontal ? [s[0], s[2]] : [s[1], s[3]];
      segs.sort((p, q) => at(p)[0] - at(q)[0]);
      let cur: Seg | null = null;
      for (const s of segs) {
        if (cur && key(at(cur)[1]) === key(at(s)[0])) { if (horizontal) cur[2] = s[2]; else cur[3] = s[3]; }
        else { if (cur) merged.push(cur); cur = [...s] as Seg; }
      }
      if (cur) merged.push(cur);
    }
  }
  return merged;
}

const META = /^(.+?):\s*([\s\S]+)/;
const plain = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

/** A source (or an already decoded SudokuPad object) as a model. A string says why it cannot be played. */
export function parseSudokuPad(source: string): PadModel | string {
  const decoded = decodeSource(source);
  if (typeof decoded === 'string') return decoded;
  let raw: unknown;
  try { raw = decoded.format === 'fpuz' ? fromFPuzzles(JSON.parse(decoded.text)) : expand(readCompact(decoded.text)); }
  catch { return 'The puzzle text could not be read.'; }
  return buildModel(obj(raw));
}

export function buildModel(p: Record<string, unknown>): PadModel | string {
  const rowsList = list(p.cells);
  const rows = rowsList.length, cols = Math.max(0, ...rowsList.map(r => list(r).length));
  if (rows < 1 || cols < 1) return 'The puzzle has no grid.';
  if (rows > 30 || cols > 30) return 'The grid is too big to play here (at most 30 × 30).';
  const size = rows * cols, at = (r: number, c: number) => r * cols + c;
  const inGrid = (r: number, c: number) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < rows && c >= 0 && c < cols;

  // Regions: the played area is the union of the regions of the common size (outside-clue areas
  // may be regions of another size); with none, every cell is played.
  const regions = list(p.regions).map(reg => {
    const cells = list(reg).map(rc => Array.isArray(rc) ? [num(rc[0], NaN), num(rc[1], NaN)] : null)
      .filter((rc): rc is number[] => !!rc && inGrid(rc[0], rc[1])).map(([r, c]) => at(r, c));
    return [...new Set(cells)];
  }).filter(cells => cells.length > 0);
  const counts = new Map<number, number>();
  for (const reg of regions) counts.set(reg.length, (counts.get(reg.length) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
  const played = regions.filter(reg => reg.length === common);
  // Like SudokuPad, the played area is the rectangle the regions span (a region left out is the rest of it).
  const spanned = played.length ? played.flat() : Array.from({ length: size }, (_, i) => i);
  const rs = spanned.map(i => Math.floor(i / cols)), cs = spanned.map(i => i % cols);
  const [r0, r1, c0, c1] = [Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)];
  const active: number[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) active.push(at(r, c));
  const activeSet = new Set(active);
  const digits = Math.max(1, Math.min(9, played.length ? common : Math.min(r1 - r0 + 1, c1 - c0 + 1)));

  // Givens: digits on played cells; any other given is drawn as a clue.
  const givens = Array<number>(size).fill(0), outsideGivens: PadText[] = [];
  rowsList.forEach((row, r) => list(row).forEach((cell, c) => {
    const v = obj(cell).value;
    if (v === undefined || v === null || v === '') return;
    const n = Number(v);
    if (activeSet.has(at(r, c)) && Number.isInteger(n) && n >= 1 && n <= digits) givens[at(r, c)] = n;
    else outsideGivens.push({ x: c + .5, y: r + .5 + .06, text: textOf(v), size: 40 * PX, fill: '#000000', stroke: 'none', strokeWidth: 0, anchor: 'middle', angle: 0 });
  }));

  // Units: rows and columns of the played area (dropped, like SudokuPad, when the givens repeat in
  // one, or when a line is longer than the digits), and the regions that fit the digits.
  const units: PadModel['units'] = [];
  const lines: PadModel['units'] = [];
  for (let r = r0; r <= r1; r++) lines.push({ rule: 'row', label: `row ${r - r0 + 1}`, cells: active.filter(i => Math.floor(i / cols) === r) });
  for (let c = c0; c <= c1; c++) lines.push({ rule: 'column', label: `column ${c - c0 + 1}`, cells: active.filter(i => i % cols === c) });
  const repeats = (cells: number[]) => { const seen = cells.map(i => givens[i]).filter(Boolean); return new Set(seen).size < seen.length; };
  if (lines.every(u => u.cells.length <= digits && !repeats(u.cells))) units.push(...lines.filter(u => u.cells.length > 1));
  regions.filter(reg => reg.length > 1 && reg.length <= digits && reg.every(i => activeSet.has(i))).forEach((cells, k) => {
    if (!repeats(cells)) units.push({ rule: 'region', label: `region ${k + 1}`, cells });
  });

  // Metadata: cages without cells, then a metadata object.
  const meta: { title?: string; author?: string; rules: string[]; solution?: string; other: string[] } = { rules: [], other: [] };
  for (const cage of list(p.cages).map(obj)) {
    if (list(cage.cells).length) continue;
    const m = META.exec(String(cage.value ?? ''));
    if (!m) continue;
    const [, name, value] = m;
    if (name === 'rules') meta.rules.push(plain(value));
    else if (name === 'title' || name === 'author' || name === 'solution') meta[name] = plain(value);
    else meta.other.push(name);
  }
  const extra = { ...obj(p.metaData), ...obj(p.metadata) };
  for (const key of ['title', 'author', 'solution'] as const) if (typeof extra[key] === 'string' || typeof extra[key] === 'number') meta[key] = plain(String(extra[key]));
  if (typeof extra.rules === 'string') meta.rules.push(plain(extra.rules));
  else if (Array.isArray(extra.rules)) meta.rules.push(...extra.rules.filter((s): s is string => typeof s === 'string').map(plain));
  let solution: number[] | null = null;
  const sol = (meta.solution ?? '').trim();
  if (sol.length === size) {
    // A digit; '.', '0' or a space for a cell left empty; anything else ('?') for any entry.
    solution = [...sol].map((ch, i) => !activeSet.has(i) ? -1 : /[1-9]/.test(ch) ? Number(ch) : /[.0 ]/.test(ch) ? 0 : -1);
    if (!solution.some(n => n > 0) || solution.some(n => n > digits) || givens.some((g, i) => g && solution![i] >= 0 && g !== solution![i])) solution = null;
  }
  const videoId = obj(list(p.videos)[0]).id;
  const video = typeof videoId === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? `https://youtu.be/${videoId}` : '';

  // The drawing, layer by layer.
  // A box around a whole outside cell would make it look like a grid cell: such a cell is plain background,
  // so its overlay keeps its fill and text but loses its border.
  const unbordered = (r: PadRect | null): PadRect | null => {
    if (!r || r.stroke === 'none' || r.w < .9 || r.h < .9) return r;
    const [cr, cc] = [Math.floor(r.y + r.h / 2), Math.floor(r.x + r.w / 2)];
    return inGrid(cr, cc) && !activeSet.has(at(cr, cc)) ? { ...r, stroke: 'none' } : r;
  };
  const under = list(p.underlays).map(obj).map(part => unbordered(rect(part))).filter((r): r is PadRect => !!r);
  const over = list(p.overlays).map(obj).map(part => unbordered(rect(part))).filter((r): r is PadRect => !!r);
  const paths = [...list(p.arrows).map(obj).flatMap(a => path(a, true)), ...list(p.lines).map(obj).flatMap(l => path(l))];
  const cages: PadCage[] = [];
  for (const cage of list(p.cages).map(obj)) {
    const cells = list(cage.cells).map(rc => Array.isArray(rc) ? [num(rc[0], NaN), num(rc[1], NaN)] as [number, number] : null)
      .filter((rc): rc is [number, number] => !!rc && Number.isInteger(rc[0]) && Number.isInteger(rc[1]) && Math.abs(rc[0]) < 100 && Math.abs(rc[1]) < 100);
    if (!cells.length || cage.hidden === true) continue;
    const style = typeof cage.style === 'string' ? cage.style : 'killer';
    if (style === 'hidden' || style === '' || cage.style === null) continue;
    const box = style === 'box', fill = style === 'windoku' ? '#cfcfcf33' : style === 'extraregion' ? 'rgba(178, 178, 178, 0.4)' : 'none';
    const d = box ? 0 : style === 'extraregion' ? .09375 : .08;
    const value = textOf(cage.value);
    const [lr, lc] = [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
    cages.push({
      cells, segments: outline(cells, d),
      color: color(cage.borderColor ?? cage.outlineC, '#000000'), width: (box ? 3 : 1.5) * PX, dash: box || fill !== 'none' ? '' : `${5 * PX} ${3 * PX}`,
      fill, label: value.trim() && !META.test(value) ? { x: lc + .035, y: lr + .15 + .012, text: value, size: 13 * PX, fill: color(cage.textColor ?? cage.fontC, '#000000'), stroke: 'none', strokeWidth: 0, anchor: 'start', angle: 0, background: 'paper' } : null,
    });
  }
  // Like SudokuPad, only the played area is the grid: region borders are clipped to it (a region of an
  // outside-clue area gets none), and the played area's own outline is the outer border.
  const gridRect = { x: c0, y: r0, w: c1 - c0 + 1, h: r1 - r0 + 1 };
  const regionEdges = [
    ...regions.map(reg => reg.filter(i => activeSet.has(i))).filter(reg => reg.length).flatMap(reg => outline(reg.map(i => [Math.floor(i / cols), i % cols]))),
    ...outline(active.map(i => [Math.floor(i / cols), i % cols])),
  ];

  // Classic: nothing drawn beyond regions and plain shading, no outside area, and the classic rules
  // alone leave a handful of solutions (a "pick your difficulty" cell may leave a few).
  const plainShade = (r: PadRect) => !r.text && !r.rx && !r.angle;
  let classic = !paths.length && !cages.length && !over.length && under.every(plainShade) && !outsideGivens.length &&
    active.length === size && played.length > 0 && played.length * common === size && digits >= 4 && !meta.other.length;
  if (classic) {
    const found = solveUnits(givens, active, units, digits, 10);
    classic = !found.exhausted && found.count >= 1 && found.count < 10;
  }

  // The extent: the grid and everything drawn around it.
  let x0 = 0, y0 = 0, x1 = cols, y1 = rows;
  const grow = (x: number, y: number, m = 0) => { x0 = Math.min(x0, x - m); y0 = Math.min(y0, y - m); x1 = Math.max(x1, x + m); y1 = Math.max(y1, y + m); };
  for (const r of [...under, ...over]) {
    grow(r.x, r.y); grow(r.x + r.w, r.y + r.h);
    if (r.text) { const half = r.text.text.length * r.text.size * .36; grow(r.text.x - half, r.text.y - r.text.size / 2); grow(r.text.x + half, r.text.y + r.text.size / 2); }
  }
  for (const l of paths) for (const [x, y] of l.points) grow(x, y, l.width / 2);
  for (const c of cages) for (const [ax, ay, bx, by] of c.segments) { grow(ax, ay); grow(bx, by); }
  for (const t of outsideGivens) grow(t.x, t.y, .5);
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  x0 = clamp(x0, -6, 0); y0 = clamp(y0, -6, 0); x1 = clamp(x1, cols, cols + 6); y1 = clamp(y1, rows, rows + 6);
  const m = .04;

  return {
    rows, cols, digits, givens, active, units, origin: [r0, c0], grid: gridRect,
    title: meta.title ?? '', author: meta.author ?? '', rules: meta.rules.filter(Boolean), solution, video, classic,
    under, lines: paths, cages, regionEdges, over, outsideGivens,
    bounds: { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m },
  };
}

/** Counts solutions under `units` (each digit once per unit), up to `limit`, within a node budget. */
export function solveUnits(givens: number[], active: number[], units: { cells: number[] }[], digits: number, limit = 2, budget = 200_000): { count: number; solution: number[] | null; exhausted: boolean } {
  const cells = [...givens], peers = new Map<number, number[]>();
  for (const i of active) peers.set(i, []);
  for (const u of units) for (const i of u.cells) peers.get(i)?.push(...u.cells.filter(j => j !== i));
  for (const [i, ps] of peers) peers.set(i, [...new Set(ps)]);
  const all = (1 << (digits + 1)) - 2;
  let nodes = 0, count = 0, solution: number[] | null = null, exhausted = false;
  const free = (i: number) => { let m = all; for (const j of peers.get(i)!) if (cells[j]) m &= ~(1 << cells[j]); return m; };
  for (const i of active) if (cells[i] && !(free(i) & (1 << cells[i]))) return { count: 0, solution: null, exhausted };
  const ones = (m: number) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
  const search = () => {
    if (count >= limit || exhausted) return;
    if (++nodes > budget) { exhausted = true; return; }
    let best = -1, bestMask = 0, bestCount = 99;
    for (const i of active) {
      if (cells[i]) continue;
      const m = free(i), k = ones(m);
      if (k < bestCount) { best = i; bestMask = m; bestCount = k; if (k <= 1) break; }
    }
    if (best < 0) { count++; solution ??= [...cells]; return; }
    for (let n = 1; n <= digits; n++) {
      if (!(bestMask & (1 << n))) continue;
      cells[best] = n;
      search();
      cells[best] = 0;
      if (count >= limit || exhausted) return;
    }
  };
  search();
  return { count, solution, exhausted };
}

// ---- f-puzzles ----
const fRC = (s: unknown): [number, number] | null => {
  const m = typeof s === 'string' ? /R(-?\d+(?:\.\d*)?)C(-?\d+(?:\.\d*)?)/.exec(s) : null;
  return m ? [Number(m[1]) - 1, Number(m[2]) - 1] : null;
};
const mid = ([r, c]: [number, number]): [number, number] => [r + .5, c + .5];
const centreOf = (part: Record<string, unknown>): [number, number] | null => {
  if (typeof part.cell === 'string') { const rc = fRC(part.cell); return rc && mid(rc); }
  const cells = list(part.cells).map(fRC).filter((rc): rc is [number, number] => !!rc).map(mid);
  if (!cells.length) return null;
  return [cells.reduce((a, [r]) => a + r, 0) / cells.length, cells.reduce((a, [, c]) => a + c, 0) / cells.length];
};
const fLines = (part: Record<string, unknown>) => list(part.lines).map(line => list(line).map(fRC).filter((rc): rc is [number, number] => !!rc).map(mid)).filter(l => l.length);
const FP_COLORS = '#a8a8a8a8,#000,#ffa0a0,#ffdf61,#feffaf,#b0ffb0,#61d060,#d0d0ff,#8180f0,#ff08ff,#ffd0d0'.split(',');
const KILLER_DIR: Record<string, [number, number]> = { UR: [-1, 1], UL: [-1, -1], DR: [1, 1], DL: [1, -1] };

/** An f-puzzles JSON as SudokuPad's puzzle object: the constraints SudokuPad draws, drawn the way it does. */
export function fromFPuzzles(f: unknown): Record<string, unknown> {
  const fp = obj(f), size = Math.max(1, Math.min(30, Math.round(num(fp.size, 9))));
  let bh = Math.floor(Math.sqrt(size)); while (bh > 1 && size % bh) bh--;
  const bw = size / bh;
  const cells: Record<string, unknown>[][] = [], regions = new Map<string, [number, number][]>();
  const underlays: Record<string, unknown>[] = [], overlays: Record<string, unknown>[] = [], lines: Record<string, unknown>[] = [], arrows: Record<string, unknown>[] = [], cages: Record<string, unknown>[] = [];
  list(fp.grid).slice(0, size).forEach((row, r) => {
    cells.push([]);
    list(row).slice(0, size).forEach((cell, c) => {
      const x = obj(cell);
      cells[r].push(x.given && x.value !== undefined ? { value: x.value } : {});
      const region = x.region === null ? 'none' : x.region === undefined ? String(Math.floor(r / bh) * bh + Math.floor(c / bw)) : String(x.region);
      if (region !== 'none') regions.set(region, [...(regions.get(region) ?? []), [r, c]]);
      let col = x.c ?? list(x.cArray)[0];
      if (typeof col === 'number' || (typeof col === 'string' && /^\d+$/.test(col))) col = FP_COLORS[Number(col)];
      if (typeof col === 'string') underlays.push({ backgroundColor: col, center: [r + .5, c + .5], rounded: false, width: 1, height: 1 });
    });
  });
  const meta = (name: string, value: unknown) => { if (value !== undefined && value !== null && value !== '') cages.push({ value: `${name}: ${value}` }); };
  meta('title', fp.title); meta('author', fp.author); meta('rules', fp.ruleset);
  const sol = Array.isArray(fp.solution) ? fp.solution.map(n => String(n ?? '.').length === 1 ? String(n ?? '.') : '?').join('') : typeof fp.solution === 'string' ? fp.solution : '';
  if (sol && !/^([.]*|0*)$/.test(sol)) meta('solution', sol);
  const each = (key: string, fn: (part: Record<string, unknown>) => void) => list(fp[key]).map(obj).forEach(fn);
  each('thermometer', part => fLines(part).forEach(pts => {
    underlays.push({ borderColor: '#CFCFCF', backgroundColor: '#CFCFCF', center: pts[0], rounded: true, width: .85, height: .85 });
    lines.push({ color: '#CFCFCF', thickness: 21, wayPoints: pts });
  }));
  each('killercage', part => cages.push({ cells: list(part.cells).map(fRC).filter(Boolean), value: part.value, unique: true }));
  each('cage', part => {
    const value = part.value;
    if (typeof value === 'string' && /^[a-z]+: /.test(value)) { cages.push({ value }); return; }
    cages.push({ cells: list(part.cells).map(fRC).filter(Boolean), value, outlineC: part.outlineC, fontC: part.fontC });
  });
  each('arrow', part => {
    for (const pts of fLines(part)) {
      if (pts.length < 2) continue;
      const dr = pts[1][0] - pts[0][0], dc = pts[1][1] - pts[0][1], dist = Math.hypot(dr, dc) || 1;
      const start: [number, number] = [pts[0][0] + Math.round(40 * Math.sign(dr) / dist) / 100, pts[0][1] + Math.round(40 * Math.sign(dc) / dist) / 100];
      arrows.push({ color: '#a1a1a1', headLength: .3, thickness: 5, wayPoints: [start, ...pts.slice(1)] });
    }
    const bulb = list(part.cells).map(fRC).filter((rc): rc is [number, number] => !!rc).map(mid);
    if (!bulb.length) return;
    const rs = bulb.map(p => p[0]), cs = bulb.map(p => p[1]);
    if (Math.min(...rs) === Math.max(...rs) || Math.min(...cs) === Math.max(...cs))
      overlays.push({ borderColor: '#a1a1a1', backgroundColor: '#ffffff', center: centreOf(part), fontSize: 16, borderSize: 5, rounded: true, text: '', width: .83 + Math.max(...cs) - Math.min(...cs), height: .83 + Math.max(...rs) - Math.min(...rs) });
    else {
      lines.push({ color: '#a1a1a1', thickness: 45, opacity: .7, wayPoints: bulb });
      lines.push({ color: '#ffffff', thickness: 35, opacity: .8, wayPoints: bulb });
    }
  });
  const dot = (fill: string, ink: string) => (part: Record<string, unknown>) => overlays.push({ borderColor: '#000000', backgroundColor: fill, center: centreOf(part), rounded: true, width: .3, height: .3, text: part.value ?? '', color: ink });
  each('difference', dot('#FFFFFF', '#000'));
  each('ratio', dot('#000000', '#fff'));
  each('xv', part => overlays.push({ backgroundColor: '#FFFFFF', borderColor: '#FFFFFF', center: centreOf(part), fontSize: 21, rounded: false, width: .25, height: .25, text: part.value }));
  each('even', part => underlays.push({ borderColor: '#CFCFCF', backgroundColor: '#CFCFCF', center: centreOf(part), rounded: false, width: .7, height: .7 }));
  each('odd', part => underlays.push({ borderColor: '#CFCFCF', backgroundColor: '#CFCFCF', center: centreOf(part), rounded: true, width: .7, height: .7 }));
  each('palindrome', part => fLines(part).forEach(pts => lines.push({ color: '#CFCFCF', thickness: 16, wayPoints: pts })));
  each('sandwichsum', part => overlays.push({ backgroundColor: '#FFFFFF', borderColor: '#FFFFFF', center: centreOf(part), fontSize: 32, rounded: false, width: .25, height: .25, text: part.value }));
  each('littlekillersum', part => {
    const rc = fRC(part.cell), dir = KILLER_DIR[String(part.direction)];
    if (!rc || !dir) return;
    const [r, c] = mid(rc);
    arrows.push({ color: '#000000', thickness: 2, wayPoints: [[r + .3 * dir[0], c + .3 * dir[1]], [r + .48 * dir[0], c + .48 * dir[1]]] });
    overlays.push({ backgroundColor: '#FFFFFF', borderColor: '#FFFFFF', center: [r, c], fontSize: 28, width: .25, height: .25, rounded: false, text: part.value ?? '' });
  });
  const minMax = (key: string, inwards: boolean) => {
    const parts = list(fp[key]).map(obj), others = new Set(parts.map(p => String(p.cell)));
    const a = inwards ? .44 : .39, b = inwards ? .39 : .44;
    for (const part of parts) {
      const centre = centreOf(part);
      if (!centre) continue;
      underlays.push({ backgroundColor: '#ccc', center: centre, rounded: false, width: 1, height: 1 });
      for (const [dy, dx] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
        const nr = Math.floor(centre[0] + dy + 1), nc = Math.floor(centre[1] + dx + 1);
        if (nr < 1 || nc < 1 || nr > size || nc > size || others.has(`R${nr}C${nc}`)) continue;
        lines.push({ color: '#000000', thickness: 1, wayPoints: [[centre[0] + dy * a + .1 * dx, centre[1] + dx * a + .1 * dy], [centre[0] + dy * b, centre[1] + dx * b], [centre[0] + dy * a - .1 * dx, centre[1] + dx * a - .1 * dy]] });
      }
    }
  };
  minMax('minimum', true); minMax('maximum', false);
  each('line', part => fLines(part).forEach(pts => lines.push({ color: part.outlineC, thickness: 32 * num(part.width, .1), wayPoints: pts })));
  each('rectangle', part => overlays.push({ backgroundColor: part.baseC, borderColor: part.outlineC, center: centreOf(part), borderSize: 1, rounded: false, width: part.width, height: part.height, text: part.value, angle: part.angle }));
  each('circle', part => overlays.push({ backgroundColor: part.baseC, borderColor: part.outlineC, textColor: part.fontC, center: centreOf(part), borderSize: 1, rounded: true, width: part.width, height: part.height, text: part.value, angle: part.angle }));
  each('text', part => {
    const text = part.value === undefined || part.value === null ? '' : String(part.value).replace(/ /g, ' ');
    if (!text) return;
    const fontC = typeof part.fontC === 'string' ? part.fontC : '#000000';
    overlays.push({ color: fontC, textStroke: ['#fff', '#ffffff'].includes(fontC.toLowerCase()) ? '#000' : '#fff', center: centreOf(part), fontSize: Math.round(32 * num(part.size, 1)), rounded: false, width: .25, height: .25, text, angle: part.angle });
  });
  if (fp['diagonal+']) lines.push({ color: '#34BBE6', thickness: 2, wayPoints: [[0, size], [size, 0]] });
  if (fp['diagonal-']) lines.push({ color: '#34BBE6', thickness: 2, wayPoints: [[0, 0], [size, size]] });
  each('extraregion', part => cages.push({ style: 'extraregion', cells: list(part.cells).map(fRC).filter(Boolean) }));
  each('clone', part => [...list(part.cells), ...list(part.cloneCells)].map(fRC).filter((rc): rc is [number, number] => !!rc).forEach(rc =>
    underlays.push({ borderColor: '#CFCFCF', backgroundColor: '#CFCFCF', center: mid(rc), rounded: false, width: 1, height: 1 })));
  each('quadruple', part => overlays.push({ backgroundColor: '#FFFFFF', borderColor: '#000000', center: centreOf(part), fontSize: 14, rounded: true, width: .7, height: .7, text: list(part.values).join(' ') }));
  each('betweenline', part => fLines(part).forEach(pts => {
    if (pts.length < 2) return;
    for (const end of [pts[0], pts[pts.length - 1]]) overlays.push({ borderColor: '#CFCFCF', backgroundColor: '#FFFFFF', center: end, borderSize: 2, rounded: true, width: .8, height: .8 });
    lines.push({ color: '#CFCFCF', thickness: 2, wayPoints: pts });
  }));
  const globals = ['antiknight', 'antiking', 'nonconsecutive', 'disjointgroups'].filter(k => fp[k]);
  for (const g of globals) cages.push({ value: `${g}: true` });
  return { cells, regions: [...regions.values()], underlays, overlays, lines, arrows, cages };
}
