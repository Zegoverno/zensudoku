// The local library: what it lists, how it sorts, and what it refuses, in a temporary folder.
import * as LZ from 'lz-string';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { libraryEntry, libraryRoot, readLibrary } from './library.ts';
import { findPuzzle, libraryPuzzle, openLibrary } from './session.ts';

const lz = ((LZ as unknown as { compressToBase64?: unknown }).compressToBase64 ? LZ : (LZ as unknown as { default: typeof LZ }).default) as typeof LZ;
const BOXES4 = '[[[0,0],[0,1],[1,0],[1,1]],[[0,2],[0,3],[1,2],[1,3]],[[2,0],[2,1],[3,0],[3,1]],[[2,2],[2,3],[3,2],[3,3]]]';
const source = (title: string) => 'scl' + lz.compressToBase64(`{ce:[[{v:1},{v:2},,],[,,,{v:2}],[{v:2},,{v:4},],[,,,{v:1}]],re:${BOXES4},ca:[{v:'title: ${title}'}]}`);

const data = mkdtempSync(path.join(tmpdir(), 'zensudoku-lib-')), root = path.join(data, 'library');
const outside = mkdtempSync(path.join(tmpdir(), 'zensudoku-out-'));
afterAll(() => { rmSync(data, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
const put = (rel: string, text: string) => { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), text); };
const json = (x: object) => JSON.stringify(x);

put('book/p10.json', json({ id: 'b-10', collection: 'Book', number: 'P10', title: 'Ten', author: 'Ann', video: 'https://youtu.be/x', source: source('Ten') }));
put('book/p2.json', json({ id: 'b-2', collection: 'Book', number: 'P2', title: 'Two', source: source('Two') }));
put('book/p9.json', json({ id: 'b-9', collection: 'Book', number: 'P9', source: source('Nine'), video: 'javascript:alert(1)' }));
put('alpha/one.txt', source('Plain') + '\n');
put('alpha/deep/er/x.json', json({ id: 'deep-1', source: source('Deep') }));
put('.hidden.json', json({ id: 'hidden', source: source('Hidden') }));
put('.dot/inside.json', json({ id: 'dotted', source: source('Dotted') }));
put('bad/notjson.json', '{nope');
put('bad/noid.json', json({ source: source('x') }));
put('bad/badid.json', json({ id: '../x', source: source('x') }));
put('bad/nosource.json', json({ id: 'nosource' }));
put('bad/garbage.json', json({ id: 'garbage', source: 'not a puzzle' }));
put('bad/dup.json', json({ id: 'b-2', source: source('Again') }));
put('readme.md', '# not a puzzle');
writeFileSync(path.join(outside, 'secret.json'), json({ id: 'secret', source: source('Secret') }));
symlinkSync(path.join(outside, 'secret.json'), path.join(root, 'link.json'));
symlinkSync(path.join(root, 'book', 'p2.json'), path.join(root, 'alpha', 'inside-link.json'));

describe('the library', () => {
  it('is empty, not an error, without a data folder', () => {
    expect(libraryRoot({})).toBe('');
    expect(readLibrary('')).toEqual({ available: false, root: '', entries: [], errors: [] });
    expect(readLibrary(path.join(data, 'missing')).entries).toEqual([]);
  });
  it('lists JSON and .txt puzzles in every subfolder, sorted by collection then number in natural order', () => {
    const lib = readLibrary(root);
    expect(lib.available).toBe(true);
    expect(lib.entries.map(e => e.id)).toEqual(['one', 'deep-1', 'b-2', 'b-9', 'b-10']);
    expect(lib.entries.find(e => e.id === 'one')).toMatchObject({ collection: 'alpha', file: 'alpha/one.txt' });
    expect(lib.entries.find(e => e.id === 'b-10')).toMatchObject({ collection: 'Book', number: 'P10', title: 'Ten', author: 'Ann', video: 'https://youtu.be/x' });
    expect(lib.entries.find(e => e.id === 'b-9')!.video).toBeUndefined();
  });
  it('skips dot files, reports what it cannot use, and never follows a link out', () => {
    const lib = readLibrary(root);
    const ids = lib.entries.map(e => e.id);
    for (const id of ['hidden', 'dotted', 'secret', 'nosource', 'garbage']) expect(ids).not.toContain(id);
    const errors = lib.errors.join('\n');
    expect(errors).toMatch(/link\.json: a link that points outside/);
    expect(errors).toMatch(/notjson\.json: not valid JSON/);
    expect(errors).toMatch(/noid\.json: no valid id/);
    expect(errors).toMatch(/badid\.json: no valid id/);
    expect(errors).toMatch(/nosource\.json: no source/);
    expect(errors).toMatch(/garbage\.json: Not a SudokuPad puzzle/);
    expect(errors).toMatch(/duplicate id b-2/);
    expect(errors).not.toMatch(/readme/);
  });
  it('opens an entry as a puzzle with its library details', () => {
    const entry = libraryEntry('b-10', root)!;
    const p = libraryPuzzle(entry);
    expect(typeof p === 'string' ? p : [p.id, p.name, p.pad!.author, p.pad!.video, p.library?.collection]).toEqual(['lib-b-10', 'P10 · Ten', 'Ann', 'https://youtu.be/x', 'Book']);
  });
  it('the session finds library puzzles by id through ZEN_PLUGIN_DATA', () => {
    const before = process.env.ZEN_PLUGIN_DATA;
    process.env.ZEN_PLUGIN_DATA = data;
    try {
      expect(findPuzzle('lib-deep-1')?.name).toBe('Deep');
      expect(findPuzzle('lib-nope')).toBeNull();
      const s = openLibrary('b-2');
      expect(typeof s === 'string' ? s : s.puzzle.id).toBe('lib-b-2');
      expect(openLibrary('nope')).toMatch(/No puzzle/);
    } finally {
      if (before === undefined) delete process.env.ZEN_PLUGIN_DATA; else process.env.ZEN_PLUGIN_DATA = before;
    }
  });
});
