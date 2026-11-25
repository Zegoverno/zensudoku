import type { HintKind } from './hint.ts';
import type { Puzzle, Variant } from './sudoku.ts';

export function hintLesson(kind: HintKind): string | undefined {
  if (kind === 'naked') return 'naked-single';
  if (kind === 'hidden') return 'hidden-single';
  // No move was found; the hint itself suggests looking for a naked pair.
  if (kind === 'none') return 'naked-pair';
}

const builtIn: Partial<Record<Variant, string>> = {
  diagonal: 'diagonal-disjoint', killer: 'killer', sandwich: 'sandwich',
  thermo: 'thermo', consecutive: 'consecutive-line', nonconsecutive: 'chess',
  arrow: 'arrows', renban: 'renban', kropki: 'kropki',
  littlekiller: 'little-killer', jigsaw: 'irregular', samurai: 'samurai',
};

// SudokuPad drawing elements are not enough: a green line, dot, or circle can have
// custom semantics. Match explicit rule text or semantic flags from the parser.
const described: [string, RegExp][] = [
  ['killer', /\bkiller (?:cage|sudoku)|\bcages?\b.*?\b(?:sum|total|add)\b/i],
  ['arrows', /\b(?:arrow(?:s|['’]s)?|shaft)\b[^.!?]*\b(?:sum|add)\b|\bsum\b[^.!?]*\barrows?\b/i],
  ['kropki', /\bkropki\b|\b(?:white|black) dots?\b/i],
  ['xv', /\bXVs?\b|\b(?:X|V)s?\s+(?:sum|join|connect|indicate|separate)\b/],
  ['odd-even', /\b(?:grey|gray) (?:circles?|squares?)\b[^.!?]*\b(?:odd|even)\b/i],
  ['quadruples', /\bquadruples?\b/i],
  ['thermo', /\bthermo(?:meter)?s?\b/i],
  ['consecutive-line', /\badjacent (?:digits|cells) along (?:a |the )?lines? (?:must be|are) consecutive\b/i],
  ['whispers', /\b(?:german|dutch) whispers?\b|\b(?:adjacent|neighbou?ring) digits[^.!?]*\bdiffer by at least (?:4|5)\b/i],
  ['renban', /\brenban\b|\blines?[^.!?]*\bset of (?:non[- ]?repeating )?consecutive digits\b/i],
  ['palindrome', /\bpalindromes?\b/i],
  ['region-sum', /\b(?:region sum|equal sums?) lines?\b|\bon a blue line, the sum of digits[^.!?]*\b(?:region|box)\b/i],
  ['sandwich', /\bsandwich(?:es|ed)?\b|\bsum\b[^.!?]*\bbetween (?:the )?1 and (?:the )?9\b/i],
  ['x-sums', /\bX[- ]sums?\b/i],
  ['little-killer', /\blittle killer\b|\bsum of (?:the )?digits (?:along|on) (?:the |an )?indicated diagonal\b/i],
  ['skyscrapers', /\bskyscrapers?\b|\bvisible buildings\b/i],
  ['chess', /\b(?:anti[- ]?(?:knight|king)|non[- ]?consecutive)\b|\b(?:king|knight)['’]s move\b/i],
  ['diagonal-disjoint', /\bdisjoint groups\b|\b(?:main|marked) diagonals?\b[^.!?]*\b(?:repeat|different|once)\b|\bsame position in (?:the )?(?:two |different )?3\s*[×x]\s*3 boxes\b/i],
  ['irregular', /\b(?:irregular regions?|jigsaw sudoku|chaos construction)\b|\beach row, column(?:,)? and (?:marked|9-cell) region\b/i],
];

export function variantLessons(p: Puzzle): string[] {
  const ids = new Set<string>();
  const add = (variant: Variant) => { const id = builtIn[variant]; if (id) ids.add(id); };
  add(p.variant);
  for (const variant of p.library?.variants ?? []) add(variant);
  if (p.pad) {
    const text = p.pad.rules.join(' ').replace(/\s+/g, ' ');
    for (const [id, check] of described) if (check.test(text)) ids.add(id);
    if (p.pad.sandwichClues.length) ids.add('sandwich');
    if (p.pad.chess.knight || p.pad.chess.king) ids.add('chess');
  }
  return [...ids];
}
