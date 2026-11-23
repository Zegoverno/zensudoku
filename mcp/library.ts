// The local puzzle library: SudokuPad puzzles the owner keeps in $ZEN_PLUGIN_DATA/library/, in any
// subfolders. A `<name>.json` file is { id, source, collection?, number?, title?, author?, video?, link? }
// (only id and source are required); a `<name>.txt` file holds just a source, and its id is its name.
// Dot files and folders are skipped; links that point outside the library, unreadable or invalid files
// are reported as errors and never stop the listing. Without ZEN_PLUGIN_DATA (Claude Desktop, say) the
// library is empty. The server only reads here; nothing in the library is ever written.
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { MAX_SOURCE, decodeSource } from '../core/sudokupad.ts';
import { DIFFICULTIES, VARIANTS } from '../core/sudoku.ts';
import type { Variant, LibraryInfo } from '../core/sudoku.ts';

export interface LibraryEntry extends LibraryInfo { link?: string; source: string; file: string }
export interface Library { available: boolean; root: string; entries: LibraryEntry[]; errors: string[] }

const MAX_FILES = 5000, MAX_DEPTH = 8, MAX_BYTES = 1_000_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const field = (v: unknown, max = 300) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : undefined;
const strings = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const values = [...new Set(v.filter((s): s is string => typeof s === 'string').map(s => s.trim().slice(0, 60)).filter(Boolean))].slice(0, 30);
  return values.length ? values : undefined;
};
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** The library folder, or '' when the host gives the plugin no data folder. */
export const libraryRoot = (env: NodeJS.ProcessEnv = process.env) => env.ZEN_PLUGIN_DATA ? path.join(env.ZEN_PLUGIN_DATA, 'library') : '';

let cache: { key: string; library: Library } | null = null;

/** Every puzzle in the library, sorted by collection, then number (or title, or id) in natural order. */
export function readLibrary(root: string = libraryRoot()): Library {
  if (!root) return { available: false, root: '', entries: [], errors: [] };
  let real: string;
  try { real = realpathSync(root); if (!statSync(real).isDirectory()) throw new Error('not a folder'); }
  catch { return { available: true, root, entries: [], errors: [] }; }
  const files: { file: string; rel: string; mtime: number; size: number }[] = [], errors: string[] = [];
  const walk = (dir: string, rel: string, depth: number) => {
    let names: string[];
    try { names = readdirSync(dir).sort(); } catch { errors.push(`${rel || '.'}: cannot be read`); return; }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      if (files.length >= MAX_FILES) { errors.push(`more than ${MAX_FILES} files: the rest is left out`); return; }
      const full = path.join(dir, name), r = rel ? `${rel}/${name}` : name;
      try {
        const st = lstatSync(full);
        let target = full, tst = st;
        if (st.isSymbolicLink()) {
          target = realpathSync(full);
          if (target !== real && !target.startsWith(real + path.sep)) { errors.push(`${r}: a link that points outside the library`); continue; }
          tst = statSync(target);
        }
        if (tst.isDirectory()) { if (depth < MAX_DEPTH) walk(target, r, depth + 1); else errors.push(`${r}: too deep`); }
        else if (tst.isFile() && /\.(json|txt)$/i.test(name)) files.push({ file: target, rel: r, mtime: tst.mtimeMs, size: tst.size });
      } catch { errors.push(`${r}: cannot be read`); }
    }
  };
  walk(real, '', 0);
  const key = real + '|' + files.map(f => `${f.rel}:${f.mtime}:${f.size}`).join('|');
  if (cache?.key === key) return { ...cache.library, errors: [...errors, ...cache.library.errors] };

  const entries: LibraryEntry[] = [], seen = new Set<string>(), bad: string[] = [];
  for (const f of files) {
    const fail = (why: string) => bad.push(`${f.rel}: ${why}`);
    if (f.size > MAX_BYTES) { fail('too big'); continue; }
    let text: string;
    try { text = readFileSync(f.file, 'utf8'); } catch { fail('cannot be read'); continue; }
    let entry: LibraryEntry;
    const folder = path.dirname(f.rel) === '.' ? '' : path.dirname(f.rel);
    if (/\.txt$/i.test(f.rel)) {
      const id = path.basename(f.rel).replace(/\.txt$/i, '');
      entry = { id, source: text.trim(), file: f.rel, collection: folder || undefined };
    } else {
      let x: Record<string, unknown>;
      try { x = JSON.parse(text); } catch { fail('not valid JSON'); continue; }
      if (!x || typeof x !== 'object' || Array.isArray(x)) { fail('not a JSON object'); continue; }
      entry = {
        id: typeof x.id === 'string' ? x.id : '', source: typeof x.source === 'string' ? x.source.trim() : '', file: f.rel,
        collection: field(x.collection) ?? (folder || undefined), number: field(x.number, 40), title: field(x.title), author: field(x.author),
        video: field(x.video), link: field(x.link),
        difficulty: DIFFICULTIES.find(d => d === field(x.difficulty)?.toLowerCase()),
        variants: strings(x.variants ?? (typeof x.variant === 'string' ? [x.variant] : undefined))?.map(v => v.toLowerCase()).filter((v): v is Variant => VARIANTS.includes(v as Variant)),
        tags: strings(x.tags),
      };
      if (entry.video && !/^https:\/\//.test(entry.video)) entry.video = undefined;
      if (entry.link && !/^https:\/\//.test(entry.link)) entry.link = undefined;
    }
    if (!ID.test(entry.id)) { fail('no valid id (letters, digits, . _ -; at most 100)'); continue; }
    if (!entry.source || entry.source.length > MAX_SOURCE) { fail('no source'); continue; }
    const decoded = decodeSource(entry.source);
    if (typeof decoded === 'string') { fail(decoded); continue; }
    if (seen.has(entry.id)) { fail(`duplicate id ${entry.id}`); continue; }
    seen.add(entry.id);
    entries.push(entry);
  }
  entries.sort((a, b) => natural.compare(a.collection ?? '', b.collection ?? '') ||
    natural.compare(a.number ?? a.title ?? a.id, b.number ?? b.title ?? b.id) || natural.compare(a.id, b.id));
  const library = { available: true, root, entries, errors: bad };
  cache = { key, library };
  return { ...library, errors: [...errors, ...bad] };
}

/** One library entry by id, or null. */
export const libraryEntry = (id: string, root?: string): LibraryEntry | null => readLibrary(root).entries.find(e => e.id === id) ?? null;
