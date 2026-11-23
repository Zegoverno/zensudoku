// SudokuPad sources: decoding, the compact text, the model and its drawing, N×N rules, completion and
// hints. Every puzzle here is written by hand for these tests.
import * as LZ from 'lz-string';
import { describe, expect, it } from 'vitest';
import { buildModel, decodeSource, fromFPuzzles, outline, parseSudokuPad, readCompact, solveUnits } from './sudokupad.ts';
import type { PadModel } from './sudokupad.ts';
import { LIBRARY_PREFIX, findPuzzle, padPuzzle, sourceId, verdict, violations, wrongEntries } from './sudoku.ts';
import type { Puzzle } from './sudoku.ts';
import { coord, digitsOf, isActive, moveCell, sizeOf } from './sudoku-extra.ts';
import { blankBoard, choose, enter, newGame, place, restore, select, serialize } from './sudoku-game.ts';
import { hint } from './hint.ts';
import { renderGrid } from './text.ts';

const lz = ((LZ as unknown as { compressToBase64?: unknown }).compressToBase64 ? LZ : (LZ as unknown as { default: typeof LZ }).default) as typeof LZ;
const scl = (text: string) => 'scl' + lz.compressToBase64(text);
const model = (source: string): PadModel => { const m = parseSudokuPad(source); if (typeof m === 'string') throw new Error(m); return m; };
const puzzle = (source: string, id?: string): Puzzle => { const p = padPuzzle(source, id ? { id } : undefined); if (typeof p === 'string') throw new Error(p); return p; };

// A 4×4 with 2×2 boxes. Its one solution:  1 2 3 4 / 3 4 1 2 / 2 1 4 3 / 4 3 2 1
const BOXES4 = '[[[0,0],[0,1],[1,0],[1,1]],[[0,2],[0,3],[1,2],[1,3]],[[2,0],[2,1],[3,0],[3,1]],[[2,2],[2,3],[3,2],[3,3]]]';
const TINY = `{id:'tiny',cs:50,ce:[[{v:1},{v:2},,],[,,,{v:2}],[{v:2},,{v:4},],[,,,{v:1}]],re:${BOXES4},` +
  `ca:[{v:'title: Tiny'},{v:'author: A. Setter'},{v:'rules: Normal sudoku rules apply.'}],vd:[{id:'abcDEF12345',t:'Video',d:60}]}`;
const SOLUTION4 = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];

describe('decoding a source', () => {
  it('reads scl, ctc, a link, and the compact text itself', () => {
    for (const s of [scl(TINY), 'ctc' + lz.compressToBase64(TINY), TINY, `https://sudokupad.app/${scl(TINY)}`]) {
      const d = decodeSource(s);
      expect(typeof d === 'string' ? d : d.text).toBe(TINY);
    }
    expect(decodeSource('fpuz' + lz.compressToBase64('{"size":4}'))).toEqual({ format: 'fpuz', text: '{"size":4}' });
  });
  it('a base64 source whose + became a space still decodes', () => {
    const s = scl(TINY + ' '.repeat(40));
    expect(typeof decodeSource(s.replace(/\+/g, ' '))).toBe('object');
  });
  it('says why it cannot read one', () => {
    expect(decodeSource('')).toMatch(/empty/);
    expect(decodeSource('Xy7Kq2Lm9P')).toMatch(/short id/);
    expect(decodeSource('hello world')).toMatch(/Not a SudokuPad puzzle/);
    expect(decodeSource('scl@@@@')).toMatch(/could not be decoded/);
    expect(parseSudokuPad('{ce:[[')).toMatch(/could not be read/);
    expect(parseSudokuPad('{ce:[]}')).toMatch(/no grid/);
  });
});

describe('the compact text', () => {
  it('takes unquoted keys, single quotes, bare booleans and colours', () => {
    expect(readCompact("{a:'it\\'s',b:t,c:f,d:CFCFCF,e:#0,f:#F,g:-1.5,h:'x\"y',i:null}")).toEqual(
      { a: "it's", b: true, c: false, d: '#CFCFCF', e: '#000000', f: '#FFFFFF', g: -1.5, h: 'x"y', i: null });
    expect(readCompact('{"a":[1,2],"b":"c"}')).toEqual({ a: [1, 2], b: 'c' });
  });
  it('counts empty slots like SudokuPad: [a,,b] has three, [a,] has two', () => {
    expect(readCompact('[1,,2]')).toEqual([1, null, 2]);
    expect(readCompact('[1,]')).toEqual([1, null]);
    expect(readCompact('[,,]')).toEqual([null, null, null]);
    expect(readCompact('[]')).toEqual([]);
  });
  it('refuses what is not a value, and never sets a prototype', () => {
    expect(() => readCompact('{a:1')).toThrow();
    expect(() => readCompact('{a 1}')).toThrow();
    expect(() => readCompact('[1,2')).toThrow();
    expect(() => readCompact('['.repeat(100) + ']'.repeat(100))).toThrow(/deep/);
    expect(Object.getPrototypeOf(readCompact('{__proto__:{x:1}}'))).toBe(Object.prototype);
  });
});

describe('the model', () => {
  it('has the grid, givens, regions and metadata', () => {
    const m = model(scl(TINY));
    expect([m.rows, m.cols, m.digits, m.active.length]).toEqual([4, 4, 4, 16]);
    expect(m.givens).toEqual([1, 2, 0, 0, 0, 0, 0, 2, 2, 0, 4, 0, 0, 0, 0, 1]);
    expect(m.units.map(u => u.rule)).toEqual([...Array(4).fill('row'), ...Array(4).fill('column'), ...Array(4).fill('region')]);
    expect([m.title, m.author, m.rules, m.video]).toEqual(['Tiny', 'A. Setter', ['Normal sudoku rules apply.'], 'https://youtu.be/abcDEF12345']);
    expect(m.solution).toBeNull();
    expect(m.classic).toBe(true);
    expect(m.cages).toEqual([]);
    expect(m.regionEdges.length).toBeGreaterThan(0);
  });
  it('only the cells of the regions are the grid: an outside-clue area has no lines, borders or play', () => {
    // The 4×4 of TINY at rows 2–5, columns 2–5 of a 6×6 `ce`, under two rows and beside two columns of clues:
    // a clue given, a long text, and a boxed outside cell, all in the L-shaped area that a region also covers.
    const boxes = [[2, 2], [2, 4], [4, 2], [4, 4]].map(([r, c]) => `[[${r},${c}],[${r},${c + 1}],[${r + 1},${c}],[${r + 1},${c + 1}]]`);
    const L = Array.from({ length: 36 }, (_, i) => [Math.floor(i / 6), i % 6]).filter(([r, c]) => r < 2 || c < 2).map(rc => `[${rc}]`);
    const row = (r: number) => `[${Array.from({ length: 6 }, (_, c) => (r === 0 && c === 3 ? '{v:7}' : r === 2 && c === 2 ? '{v:1}' : '')).join(',')}]`;
    const m = model(scl(`{ce:[${Array.from({ length: 6 }, (_, r) => row(r)).join(',')}],re:[[${L}],${boxes}],` +
      `o:[{ct:[0.5,0.5],w:1,h:1,c1:#0,fs:12,te:'Ath + Bth'},{ct:[2.5,2.5],w:1,h:1,c1:#0}]}`));
    expect([m.rows, m.cols, m.digits, m.active.length, m.origin]).toEqual([6, 6, 4, 16, [2, 2]]);
    expect(m.grid).toEqual({ x: 2, y: 2, w: 4, h: 4 });
    // nothing outside the grid is bordered: no region edge, and the clue is text, not a digit
    expect(m.regionEdges.length).toBeGreaterThan(0);
    for (const [x1, y1, x2, y2] of m.regionEdges) for (const v of [x1, y1, x2, y2]) expect(v).toBeGreaterThanOrEqual(2);
    expect(m.givens[2 * 6 + 2]).toBe(1);
    expect(m.givens[3]).toBe(0);
    expect(m.outsideGivens.map(t => t.text)).toEqual(['7']);
    // the boxed outside cell keeps its text but loses its border; the one inside the grid keeps both
    expect(m.over.map(r => r.stroke)).toEqual(['none', '#000000']);
    expect(m.over[0].text?.text).toBe('Ath + Bth');
    // the long text overflows into the margin, and the drawing's extent holds it
    expect(m.bounds.x).toBeLessThan(0);
    const p = puzzle(scl(`{ce:[${Array.from({ length: 6 }, (_, r) => row(r)).join(',')}],re:[[${L}],${boxes}]}`));
    expect(isActive(p, 3)).toBe(false);
    expect(isActive(p, 2 * 6 + 2)).toBe(true);
  });
  it('reads a solution: digits, . for an empty cell, ? for any', () => {
    const m = model(scl(TINY.replace("{v:'rules:", `{v:'solution: ${SOLUTION4.join('')}'},{v:'rules:`)));
    expect(m.solution).toEqual(SOLUTION4);
    const blanks = model(scl(TINY.replace("{v:'rules:", `{v:'solution: 12?4.412${'?'.repeat(8)}'},{v:'rules:`)));
    expect(blanks.solution!.slice(0, 8)).toEqual([1, 2, -1, 4, 0, 4, 1, 2]);
    // A solution that contradicts a given is ignored.
    expect(model(scl(TINY.replace("{v:'rules:", `{v:'solution: 9${'1'.repeat(15)}'},{v:'rules:`))).solution).toBeNull();
  });
  it('plays only the area its regions span; clues outside are drawn, not played', () => {
    // A 6×6 board with a clue row above, a clue column left: 7 × 7 cells, regions in rows 1–6, columns 1–6.
    const regions = [0, 1, 2, 3, 4, 5].map(k => `[${[0, 1, 2, 3, 4, 5].map(j => `[${1 + Math.floor(k / 2) * 2 + Math.floor(j / 3)},${1 + (k % 2) * 3 + (j % 3)}]`).join(',')}]`);
    const text = `{ce:[${Array(7).fill('[,,,,,,]').join(',')}],re:[${regions.join(',')}],o:[{ct:[0.5,2.5],w:0.25,h:0.25,c1:#F,c2:#F,fs:24,te:'12'}]}`;
    const p = puzzle(scl(text));
    expect([p.pad!.rows, p.pad!.cols, p.pad!.digits, p.pad!.active.length, p.pad!.origin]).toEqual([7, 7, 6, 36, [1, 1]]);
    expect(isActive(p, 0)).toBe(false);
    expect(isActive(p, 8)).toBe(true);
    expect(coord(p, 8)).toBe('R1C1');
    expect(moveCell(p, 8, -1, 0)).toBe(6 * 7 + 1); // wraps inside the played area
    expect(p.pad!.over[0].text?.text).toBe('12');
    expect(p.pad!.classic).toBe(false); // something is drawn
    expect(renderGrid(p, p.givens).split('\n')).toHaveLength(6);
  });
});

describe('the drawing', () => {
  const draw = (parts: string) => model(scl(`{ce:[[,,,],[,,,],[,,,],[,,,]],re:${BOXES4},${parts}}`));
  it('shapes: half opacity for a colour without alpha, except SudokuPad\'s opaque ones', () => {
    const m = draw("u:[{ct:[0.5,0.5],w:1,h:1,c2:FF0000},{ct:[1.5,1.5],w:1,h:1,c2:CFCFCF},{ct:[2.5,2.5],w:1,h:1,c2:'#FF000080'}]");
    expect(m.under.map(r => r.fillOpacity)).toEqual([.5, 1, 1]);
    expect(m.under[0]).toMatchObject({ x: 0, y: 0, w: 1, h: 1, fill: '#FF0000', stroke: 'none', rx: 0 });
  });
  it('a border is 2 px unless sized, inset by half; rounded is a circle; text grows by 4 px', () => {
    const m = draw("o:[{ct:[1,1],w:0.5,h:0.5,c1:#0,c2:#F,r:t,fs:12,te:'7'},{ct:[2,2],w:0.5,h:0.5,c1:#0,borderSize:4,a:'x'}]");
    const [dot, box] = m.over;
    expect(dot.strokeWidth).toBeCloseTo(2 / 64);
    expect(dot.x).toBeCloseTo(0.75 + 1 / 64);
    expect(dot.rx).toBeCloseTo(0.5 * (0.5 - 2 / 64));
    expect(dot.text).toMatchObject({ text: '7', x: 1, anchor: 'middle' });
    expect(dot.text!.size).toBeCloseTo(16 / 64);
    expect(box.strokeWidth).toBeCloseTo(4 / 64);
    expect(box.fill).toBe('none');
  });
  it('lines in cell units, x the column; a 1 px line is drawn 2 px, like SudokuPad', () => {
    const m = draw('l:[{wp:[[0.5,0.5],[0.5,2.5]],c:CFCFCF,th:21},{wp:[[1.5,0.5],[1.5,1.5]],c:#0,th:1},{c:#0,th:5}]');
    expect(m.lines).toHaveLength(2);
    expect(m.lines[0]).toMatchObject({ points: [[0.5, 0.5], [2.5, 0.5]], color: '#CFCFCF', cap: 'round' });
    expect(m.lines[0].width).toBeCloseTo(21 / 64);
    expect(m.lines[1].width).toBeCloseTo(2 / 64);
  });
  it('an arrow: the shaft stops a stroke short and an open head points on from there', () => {
    const m = draw('a:[{wp:[[0.5,0.5],[0.5,3.5]],c:A1A1A1,th:4,hl:0.3}]');
    const [shaft, head] = m.lines;
    expect(shaft.points[1][0]).toBeCloseTo(3.5 - 4 / 64);
    expect(head.points).toHaveLength(3);
    expect(head.points[1]).toEqual(shaft.points[1]);
    expect(head.points[0][0]).toBeCloseTo(shaft.points[1][0] - 0.3 * Math.SQRT1_2);
    expect(head.points[0][1]).toBeCloseTo(0.5 + 0.3 * Math.SQRT1_2);
  });
  it('a killer cage: a dashed outline inset from its cells, its label at the top-left cell; metadata cages are not drawn', () => {
    const m = draw("ca:[{ce:[[1,1],[1,2],[2,1]],v:15},{v:'title: x'}]");
    expect(m.cages).toHaveLength(1);
    expect(m.cages[0].dash).not.toBe('');
    expect(m.cages[0].label).toMatchObject({ text: '15', anchor: 'start' });
    expect(m.cages[0].label!.x).toBeCloseTo(1.035);
    expect(m.cages[0].segments.every(([x1, y1, x2, y2]) => Math.min(x1, x2) >= 1.08 - 1e-9 && Math.min(y1, y2) >= 1.08 - 1e-9));
  });
  it('outlines merge into straight runs', () => {
    expect(outline([[0, 0], [0, 1]])).toHaveLength(4);
    expect(outline([[0, 0], [0, 1], [1, 0]])).toHaveLength(6);
  });
  it('the extent covers what is drawn outside the grid', () => {
    const m = draw("a:[{wp:[[-0.7,-0.7],[-0.1,-0.1]],c:#0,th:2,hl:0.2}],o:[{ct:[-0.8,-0.8],w:0.25,h:0.25,fs:28,te:'23'}]");
    expect(m.bounds.x).toBeLessThan(-0.8);
    expect(m.bounds.y).toBeLessThan(-0.8);
    expect(m.bounds.x + m.bounds.w).toBeGreaterThanOrEqual(4);
  });
  it('unsafe colours never reach the drawing', () => {
    const m = draw("u:[{ct:[0.5,0.5],w:1,h:1,c2:'url(javascript:x)'}]");
    expect(m.under[0].fill).toBe('none');
  });
});

describe('f-puzzles', () => {
  const f = {
    size: 4, title: 'Four', author: 'Setter', ruleset: 'Classic rules.',
    grid: [[{ value: 1, given: true }, {}, {}, {}], [{}, {}, {}, { value: 2, given: true }], [{}, {}, {}, {}], [{}, {}, {}, {}]],
    killercage: [{ cells: ['R3C1', 'R3C2'], value: '3' }],
    thermometer: [{ lines: [['R4C1', 'R4C2', 'R4C3']] }],
    difference: [{ cells: ['R1C1', 'R1C2'] }],
    solution: SOLUTION4,
  };
  it('becomes SudokuPad\'s puzzle: givens, boxes, metadata, solution and its drawing', () => {
    const m = model('fpuz' + lz.compressToBase64(JSON.stringify(f)));
    expect([m.rows, m.digits, m.title, m.author, m.rules]).toEqual([4, 4, 'Four', 'Setter', ['Classic rules.']]);
    expect(m.givens.filter(Boolean)).toEqual([1, 2]);
    expect(m.units.filter(u => u.rule === 'region')).toHaveLength(4);
    expect(m.solution).toEqual(SOLUTION4);
    expect(m.cages[0].label?.text).toBe('3');
    expect(m.under.some(r => r.rx > 0)).toBe(true); // the bulb
    expect(m.lines[0].width).toBeCloseTo(21 / 64);
    expect(m.over[0]).toMatchObject({ fill: '#FFFFFF' });
  });
  it('skips what it does not draw, and a grid region of null is no region', () => {
    const sp = fromFPuzzles({ size: 4, grid: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ region: null }))), renban: [{ lines: [['R1C1', 'R1C2']] }] });
    expect(sp.regions).toEqual([]);
    expect(sp.lines).toEqual([]);
  });
});

describe('playing a SudokuPad puzzle', () => {
  it('an N×N board: digits 1..N, repeats in rows, columns and regions', () => {
    const p = puzzle(scl(TINY));
    expect([sizeOf(p), digitsOf(p)]).toEqual([16, 4]);
    const cells = [...p.givens];
    cells[2] = 1; // R1C3 = 1: row 1 already has a 1
    expect(violations(cells, p).map(v => v.rule)).toEqual(['row']);
    cells[2] = 0; cells[5] = 1; // R2C2 = 1: its box holds the 1 of R1C1
    expect(violations(cells, p).map(v => v.rule)).toEqual(['region']);
    const g = newGame(p);
    select(g, 2);
    expect(place(g, 5)).toBe(false); // no 5 on a 4×4
    expect(enter(g, 3)).toBe(true);
  });
  it('a classic grid: any full board without repeats is solved, so a "pick a cell" puzzle takes each choice', () => {
    // Four cells left open: two classic solutions (3 4 or 4 3 in rows 1 and 3), both accepted.
    const pick = TINY.replace('ce:[[{v:1},{v:2},,],[,,,{v:2}],[{v:2},,{v:4},],[,,,{v:1}]]', 'ce:[[{v:1},{v:2},,],[{v:3},{v:4},{v:1},{v:2}],[{v:2},{v:1},,],[{v:4},{v:3},{v:2},{v:1}]]');
    const p = puzzle(scl(pick));
    expect(p.pad!.classic).toBe(true);
    expect(solveUnits(p.givens, p.pad!.active, p.pad!.units, 4, 10).count).toBe(2);
    expect(verdict(SOLUTION4, p)).toBe('solved');
    const other = [1, 2, 4, 3, 3, 4, 1, 2, 2, 1, 3, 4, 4, 3, 2, 1];
    expect(verdict(other, p)).toBe('solved');
    expect(verdict(other.map((n, i) => (i === 15 ? 0 : n)), p)).toBe('open');
  });
  it('a solution decides; without one, a variant full of digits says it cannot check its rules', () => {
    const withSolution = puzzle(scl(TINY.replace("{v:'rules:", `{v:'solution: ${SOLUTION4.join('')}'},{v:'rules:`).replace('re:', "l:[{wp:[[0.5,0.5],[1.5,1.5]],c:#0,th:8}],re:")));
    expect(verdict(SOLUTION4, withSolution)).toBe('solved');
    const swapped = [1, 2, 4, 3, ...SOLUTION4.slice(4)];
    expect(verdict(swapped, withSolution)).toBe('open');
    expect(wrongEntries(swapped, withSolution)).toBe(2);
    const variant = puzzle(scl(TINY.replace('re:', "l:[{wp:[[0.5,0.5],[1.5,1.5]],c:#0,th:8}],re:")));
    expect(variant.pad!.classic).toBe(false);
    expect(verdict(SOLUTION4, variant)).toBe('full');
    expect(verdict(SOLUTION4.map((n, i) => (i === 3 ? 0 : n)), variant)).toBe('open');
  });
  it('a solution with empty cells: those must stay empty', () => {
    const text = TINY.replace("{v:'rules:", "{v:'solution: 12..............'},{v:'rules:").replace('re:', 'l:[{wp:[[0.5,0.5],[1.5,1.5]],c:#0,th:8}],re:');
    const p = puzzle(scl(text.replace('ce:[[{v:1},{v:2},,],[,,,{v:2}],[{v:2},,{v:4},],[,,,{v:1}]]', 'ce:[[{v:1},,,],[,,,],[,,,],[,,,]]')));
    expect(verdict([1, 2, ...Array(14).fill(0)], p)).toBe('solved');
    expect(verdict([1, 2, 3, ...Array(13).fill(0)], p)).toBe('open');
  });
  it('hints on a classic grid; none for a variant', () => {
    const p = puzzle(scl(TINY));
    expect(hint(p, p.givens).kind).toMatch(/^(naked|hidden)$/);
    const variant = puzzle(scl(TINY.replace('re:', "l:[{wp:[[0.5,0.5],[1.5,1.5]],c:#0,th:8}],re:")));
    expect(hint(variant, variant.givens)).toMatchObject({ kind: 'unavailable' });
    // A wrong entry that leaves no classic solution is caught before a hint.
    const wrong = [...p.givens]; wrong[3] = 3;
    expect(violations(wrong, p)).toEqual([]);
    expect(hint(p, wrong).kind).toBe('mistake');
  });
  it('is found by its id once registered, and its board saves and restores', () => {
    const source = scl(TINY), p = puzzle(source, 'tiny-1');
    expect(p.id).toBe(LIBRARY_PREFIX + 'tiny-1');
    expect(findPuzzle(p.id)).toBe(p);
    expect(puzzle(source).id).toBe(sourceId(source));
    const g = newGame(p);
    select(g, 2); enter(g, 3);
    const back = restore(serialize(g))!;
    expect(back.puzzleId).toBe(p.id);
    expect(back.boards[p.id].cells[2]).toBe(3);
    expect(choose(back, 'example-classic')).toBe(true);
    expect(blankBoard(p).cells).toEqual(p.givens);
  });
  it('builds a model from a SudokuPad object directly', () => {
    const m = buildModel({ cells: [[{ value: 1 }, {}], [{}, {}]] });
    expect(typeof m === 'string' ? m : [m.rows, m.digits, m.givens]).toEqual([2, 2, [1, 0, 0, 0]]);
  });
});
