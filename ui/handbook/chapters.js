import { VARIANTS } from './variants.js';

// The book's content. Diagrams are pattern illustrations: they show only what the technique needs.
const RING = 'r3c3-7 r7c3-7 r4-6c3 r4-6c7';
const CORNERS = 'r1-2c1-2 r1-2c8-9 r8-9c1-2 r8-9c8-9';
const EXAMPLE_SEVENS = 'r1c4:7 r2c7:7 r3c3:7 r4c1:7 r5c5:7 r6c8:7 r7c6:7 r8c2:7 r9c9:7';
const CANCELLED = 'b5 r1-2c3-7 r8-9c3-7 r3-7c1-2 r3-7c8-9';

export const LEVELS = {
  basic: 'Basic', core: 'Core', advanced: 'Advanced', expert: 'Expert', sets: 'Set theory', variant: 'Variants',
};

export const CHAPTERS = [
  {
    id: 'how', title: 'How to read this book', intro: `
      <p>Every technique here answers one question: <em>what can I rule out, and why?</em> Each page gives the idea in a sentence,
      a diagram you can step through, a checklist for <b>spotting</b> it in a real grid, and the trap people fall into.</p>
      <p><b>Notation.</b> Rows are r1–r9 from the top, columns c1–c9 from the left, so <code>r3c5</code> is row 3, column 5.
      Boxes are numbered 1–9 from left to right, top to bottom. A <em>house</em> is any row, column or box.</p>
      <div class="legend" role="group" aria-label="How to read the diagrams">
        <div class="legend-group">
          <h3>Digits</h3>
          <ul>
            <li><i class="dot g" aria-hidden="true">7</i>Candidate to look at</li>
            <li><i class="dot r" aria-hidden="true">7</i>Candidate crossed out</li>
            <li><i class="big" aria-hidden="true">7</i>Digit placed</li>
          </ul>
        </div>
        <div class="legend-group">
          <h3>Shaded cells</h3>
          <ul>
            <li><i class="swatch pattern" aria-hidden="true"></i>Where the pattern starts</li>
            <li><i class="swatch related" aria-hidden="true"></i>Other cells involved</li>
            <li><i class="swatch target" aria-hidden="true"></i>Where candidates come out</li>
            <li><i class="swatch excluded" aria-hidden="true"></i>Blocked or cancelled cells</li>
          </ul>
        </div>
        <div class="legend-group">
          <h3>Links and groups</h3>
          <ul>
            <li><i class="ln s" aria-hidden="true"></i><span>Solid: at least one is true</span></li>
            <li><i class="ln w" aria-hidden="true"></i><span>Dashed: not both can be true</span></li>
            <li><i class="swatch pair" aria-hidden="true"></i>Orange and blue: two distinct groups</li>
          </ul>
        </div>
      </div>
      <p>Diagrams show only what each technique needs; the empty cells are not part of the lesson. Small digits are
      <em>candidates</em> (centre marks / pencil marks): the digits still possible in that cell.</p>
      <h3>The spotting ladder</h3>
      <p>When you're stuck, climb in this order. Each rung is cheaper to look for than the next, and most puzzles need only the first few.</p>
      <ol class="ladder">
        <li><b>Singles</b>: scan each digit across boxes, then look for a cell with one candidate left.</li>
        <li><b>Locked candidates</b>: a digit confined to one line inside a box, or to one box inside a line.</li>
        <li><b>Subsets</b>: two cells with the same two candidates, three with three.</li>
        <li><b>Fish</b>: pick one digit, then look at rows (or columns) where it has only two spots.</li>
        <li><b>Wings</b>: cells with exactly two candidates that see each other in a triangle.</li>
        <li><b>Chains and colouring</b>: follow "if not here, then there" links for one digit or across bivalue cells.</li>
        <li><b>Uniqueness</b>: four cells in a rectangle that would allow two solutions.</li>
        <li><b>Set theory</b>: in variant puzzles, compare two groups of houses that must hold the same digits.</li>
      </ol>`,
    sections: [],
  },
  {
    id: 'basics', title: 'Chapter 1 · The basics', intro: `<p>Every hard solve is mostly these moves. Get them fast before going further.</p>`,
    sections: [
      {
        id: 'hidden-single', title: 'Cross-hatching: the hidden single', level: 'basic',
        idea: 'Pick a digit and a box. Every row and column that already has that digit rules out its cells in the box. If only one cell is left, the digit goes there.',
        fig: {
          givens: 'r2c5:5 r3c8:5 r7c2:5 r1c3:7 r5c6:2 r8c8:9 r6c1:4',
          steps: [
            { t: 'Pick a digit', shade: { b1: 'pattern' }, text: 'Where does <b>5</b> go in box 1? Box 1 needs a 5 somewhere.' },
            { t: 'Rows', arrows: [['r2c5', 'r2c1'], ['r3c8', 'r3c1']], shade: { 'r2c1-9 r3c1-9': 'excluded', b1: 'pattern', 'r2c1-3 r3c1-3': 'excluded' }, mark: [], text: 'Rows 2 and 3 already have a 5 (r2c5, r3c8), so no 5 can go in rows 2–3 of box 1.' },
            { t: 'Columns', arrows: [['r7c2', 'r1c2']], shade: { 'r1-9c2': 'excluded' }, text: 'Column 2 has a 5 at r7c2, which rules out r1c2. r1c3 is taken by a 7.' },
            { t: 'Place it', solve: 'r1c1:5', text: 'Only <b>r1c1</b> is left, so it is 5. That is a <em>hidden single</em>: the cell may have other candidates, but it is the only home for 5 in its box.' },
          ],
        },
        spot: ['Go digit by digit (1 to 9) and box by box: this "scanning" finds most singles in easy puzzles.',
          'Start with the digit that is already placed most often: it rules out the most.',
          'The same works in a row or column: one empty cell in a line that can still take the digit.'],
        trap: 'Scanning only one direction. Check rows and columns: a digit in another box still blocks this one through its row or column.',
      },
      {
        id: 'naked-single', title: 'The naked single', level: 'basic',
        idea: 'A cell that sees eight different digits in its row, column and box can only be the ninth.',
        fig: {
          givens: 'r5c1:1 r5c8:2 r1c5:3 r9c5:4 r4c4:5 r6c6:6 r4c6:7 r6c4:8',
          steps: [
            { t: 'Look at one cell', shade: { 'r5c1-9 r1-9c5 b5': 'pattern', r5c5: 'related' }, text: 'r5c5 sees its row (1, 2), its column (3, 4) and its box (5, 6, 7, 8).' },
            { t: 'Place it', solve: 'r5c5:9', text: 'Eight digits are taken, so r5c5 is <b>9</b>.' },
          ],
        },
        spot: ['Look at crowded intersections: a cell whose row, column and box are all busy.',
          'Once you keep candidates, a naked single is simply a cell with one candidate left.'],
      },
      {
        id: 'pointing', title: 'Locked candidates I: pointing', level: 'basic',
        idea: 'If inside a box a digit can only be in one row (or column), that row\'s copy of the digit must be in this box. Remove the digit from the rest of that row.',
        fig: {
          givens: 'r1c1:1 r2c2:7 r3c2:6 r3c3:8',
          cands: 'r1c2:25 r1c3:23 r2c1:49 r2c3:34 r3c1:259 r2c5:145 r2c6:25 r2c8:46',
          steps: [
            { t: 'Look in the box', shade: { b1: 'pattern' }, mark: [['r2c1 r2c3', '4', 'g']], text: 'Start with <b>box 1</b>. Its <b>4</b> can only go in r2c1 or r2c3, and both are in row 2.' },
            { t: 'Eliminate', shade: { 'r2c4-9': 'related' }, arrows: [['r2c3', 'r2c9']], elim: [['r2c5 r2c8', '4']], text: 'The box "points" along row 2: row 2\'s 4 is inside box 1, so remove 4 from the rest of the row (r2c5, r2c8).' },
          ],
        },
        spot: ['For each box and digit, check whether the candidates line up in one row or one column.',
          'Most useful when a box has only two or three spots for a digit.'],
        aka: 'Pointing pair/triple.',
      },
      {
        id: 'claiming', title: 'Locked candidates II: claiming', level: 'basic',
        idea: 'The reverse: if inside a row (or column) a digit can only be in one box, the box\'s copy of that digit must be on this row. Remove it from the rest of the box.',
        fig: {
          givens: 'r1c1:1 r2c2:7 r2c5:5 r2c8:4 r3c2:8',
          cands: 'r2c1:36 r2c3:69 r2c4:29 r2c6:13 r2c7:289 r2c9:13 r1c2:26 r1c3:359 r3c1:46 r3c3:236',
          steps: [
            { t: 'Look in the row', shade: { 'r2c1-9': 'pattern' }, mark: [['r2c1 r2c3', '6', 'g']], text: 'Start with <b>row 2</b>. Its <b>6</b> can only go in r2c1 or r2c3, and both are in box 1.' },
            { t: 'Eliminate', shade: { 'r1c1-3 r3c1-3': 'related' }, elim: [['r1c2 r3c1 r3c3', '6']], text: 'Row 2 "claims" box 1\'s 6: the box\'s 6 must be on row 2, so remove 6 from the rest of the box (r1c2, r3c1, r3c3).' },
          ],
        },
        spot: ['For each line, check whether a digit\'s candidates all fall in the same box.'],
        aka: 'Box/line reduction.',
      },
    ],
  },
  {
    id: 'subsets', title: 'Chapter 2 · Subsets', intro: `<p>N cells in a house that can only hold N digits own those digits. It works both ways: <em>naked</em> (look at the cells) and <em>hidden</em> (look at the digits).</p>`,
    sections: [
      {
        id: 'naked-pair', title: 'Naked pair', level: 'core',
        idea: 'Two cells in a house with the same two candidates must hold those two digits between them. No other cell in that house can have them.',
        fig: {
          givens: 'r3c3:4 r3c4:6 r3c7:3 r3c9:8',
          cands: 'r3c1:127 r3c2:27 r3c5:159 r3c6:27 r3c8:259',
          steps: [
            { t: 'Find the pair', shade: { 'r3c1-9': 'pattern' }, mark: [['r3c2 r3c6', '27', 'g']], text: 'r3c2 and r3c6 both have only <b>2 and 7</b>.' },
            { t: 'Eliminate', elim: [['r3c1', '27'], ['r3c8', '2']], text: 'One is 2 and the other 7, so remove 2 and 7 from the rest of row 3. r3c1 is now a single: 1.' },
          ],
        },
        spot: ['Scan for cells with exactly two candidates, then check whether a twin is in the same house.',
          'If the pair also shares a box, clean the box too.'],
      },
      {
        id: 'hidden-pair', title: 'Hidden pair', level: 'core',
        idea: 'If two digits can only go in the same two cells of a house, those cells hold those two digits. Every other candidate in those two cells goes.',
        fig: {
          givens: 'r7c9:2 r8c8:7 r9c8:4',
          cands: 'r7c7:1368 r7c8:36 r8c7:3569 r8c9:569 r9c7:39 r9c9:1589',
          steps: [
            { t: 'Count the digits', shade: { b9: 'pattern' }, mark: [['r7c7 r9c9', '18', 'g']], text: 'In box 9, <b>1</b> and <b>8</b> each appear in only two cells, and they are the same two: r7c7 and r9c9.' },
            { t: 'Eliminate', elim: [['r7c7', '36'], ['r9c9', '59']], text: 'Those two cells must be 1 and 8, so remove everything else from them.' },
          ],
        },
        spot: ['Count, for each digit, how many places it has in a house. Digits with two places are the raw material.',
          'Hidden subsets hide in busy cells: look past the clutter.'],
      },
      {
        id: 'naked-triple', title: 'Naked triple (and quad)', level: 'core',
        idea: 'Three cells in a house whose candidates together use only three digits own those three digits. Each cell needn\'t have all three.',
        fig: {
          givens: 'r3c5:1 r5c5:8 r6c5:2 r9c5:5',
          cands: 'r1c5:36 r4c5:39 r8c5:69 r2c5:347 r7c5:4679',
          steps: [
            { t: 'Three cells, three digits', shade: { 'r1-9c5': 'pattern' }, mark: [['r1c5', '36', 'g'], ['r4c5', '39', 'g'], ['r8c5', '69', 'g']], text: 'In column 5, r1c5 {3,6}, r4c5 {3,9} and r8c5 {6,9} together use only <b>3, 6, 9</b>.' },
            { t: 'Eliminate', elim: [['r2c5', '3'], ['r7c5', '69']], text: 'Remove 3, 6 and 9 from the other cells. r2c5 and r7c5 are now a naked pair {4,7}.' },
          ],
        },
        spot: ['Easy to miss when no cell shows all three digits (the {36}{39}{69} shape above).',
          'Quads exist, and so do hidden triples and quads; in a house with 7 empty cells, a hidden quad is the mirror image of a naked triple. Look for whichever is smaller.'],
      },
    ],
  },
  {
    id: 'fish', title: 'Chapter 3 · Fish', intro: `<p>Fish work on <b>one digit</b> at a time. Ignore every other candidate and look at where that digit can go in each row or column.</p>`,
    sections: [
      {
        id: 'x-wing', title: 'X-Wing', level: 'advanced',
        idea: 'If a digit has exactly two spots in each of two rows, and those spots line up in the same two columns, it will take both columns there. Remove it from the rest of those columns.',
        fig: {
          focus: true,
          cands: 'r2c3:7 r2c7:7 r6c3:7 r6c7:7 r4c3:7 r8c7:7 r9c3:7 r4c1:7 r9c9:7',
          steps: [
            { t: 'Two rows, two spots', shade: { 'r2c1-9 r6c1-9': 'pattern' }, mark: [['r2c3 r2c7 r6c3 r6c7', '7', 'g']], text: 'Only 7s are shown; other candidates and clues are left out. Rows 2 and 6 each have <b>exactly two</b> places for 7, both in columns 3 and 7.' },
            { t: 'Eliminate', reset: true, arrows: [['r1c3', 'r9c3'], ['r1c7', 'r9c7']], shade: { 'r1-9c3 r1-9c7': 'related', 'r2c1-9 r6c1-9': 'pattern' }, mark: [['r2c3 r6c7 r2c7 r6c3', '7', 'g']], elim: [['r4c3 r9c3 r8c7', '7']], text: 'The 7s sit on one diagonal or the other. <b>Either way</b>, columns 3 and 7 already get their 7 in rows 2 and 6, and a column holds only one 7. Remove 7 from r4c3, r9c3 and r8c7, without knowing which diagonal is true. The next step shows why.' },
            { t: 'Why', reset: true, shade: { 'r1-9c3 r1-9c7': 'related', 'r2c1-9 r6c1-9': 'pattern' }, mark: [['r2c3 r6c7 r2c7 r6c3', '7', 'g']], hold: 4500,
              text: 'Watch both cases play. Whichever diagonal holds the 7s, each placed 7 rules out the other spot in its row, then sweeps its column. <b>The same three 7s disappear every time.</b>',
              frames: [
                { t: 'Diagonal A: r2c3 and r6c7', solve: 'r2c3:7 r6c7:7', elim: [['r2c7 r6c3 r4c3 r9c3 r8c7', '7']], arrows: [['r2c3', 'r2c7', 0.4], ['r6c7', 'r6c3', 0.4], ['r2c3', 'r9c3', 1.5], ['r6c7', 'r9c7', 1.5]] },
                { t: 'Diagonal B: r2c7 and r6c3', solve: 'r2c7:7 r6c3:7', elim: [['r2c3 r6c7 r4c3 r9c3 r8c7', '7']], arrows: [['r2c7', 'r2c3', 0.4], ['r6c3', 'r6c7', 0.4], ['r6c3', 'r1c3', 1.5], ['r6c3', 'r9c3', 1.5], ['r2c7', 'r9c7', 1.5]] },
              ] },
          ],
        },
        spot: ['Pick a digit. Count its candidates per row; mark rows with exactly two.',
          'Two such rows whose pairs share columns form an X-Wing. Then do the same with columns (eliminating in rows).',
          'Turn on a single-digit highlight in your app (SudokuPad: click a digit) to see it fast.'],
        trap: 'The rows need exactly two spots; the columns are where you eliminate and can have any number.',
      },
      {
        id: 'swordfish', title: 'Swordfish (and Jellyfish)', level: 'advanced',
        idea: 'The X-Wing with three rows: if a digit\'s spots in three rows all fall inside the same three columns, those rows use up the digit in those columns.',
        fig: {
          focus: true,
          cands: 'r1c2:4 r1c8:4 r5c2:4 r5c5:4 r8c5:4 r8c8:4 r3c5:4 r6c8:4 r9c2:4 r4c2:4 r3c1:4',
          steps: [
            { t: 'Three rows', shade: { 'r1c1-9 r5c1-9 r8c1-9': 'pattern' }, mark: [['r1c2 r1c8 r5c2 r5c5 r8c5 r8c8', '4', 'g']], text: 'Only 4s are shown. Rows 1, 5 and 8 each have two places for <b>4</b>, and all of them are in columns 2, 5 and 8.' },
            { t: 'Eliminate', arrows: [['r1c2', 'r9c2'], ['r1c5', 'r9c5'], ['r1c8', 'r9c8']], shade: { 'r1-9c2 r1-9c5 r1-9c8': 'related', 'r1c1-9 r5c1-9 r8c1-9': 'pattern' }, elim: [['r3c5 r6c8 r9c2 r4c2', '4']], text: 'Three rows need three 4s, one per row, all inside columns 2, 5 and 8, so one per column. <b>Either way</b> those columns get their 4 from rows 1, 5 and 8: remove 4 from their other cells. r3c1 is untouched: it is not in those columns. The next step shows why.' },
            { t: 'Why', reset: true, shade: { 'r1-9c2 r1-9c5 r1-9c8': 'related', 'r1c1-9 r5c1-9 r8c1-9': 'pattern' }, hold: 5600,
              text: 'Choose r1c2 or r1c8. Each placed 4 crosses out the other candidate in its column among the three fish rows, forcing the next placement. Then the three columns sweep the targets. <b>The same four 4s disappear every time.</b>',
              frames: [
                { t: 'Choose r1c2 → r5c5 → r8c8', solve: 'r1c2:4 r5c5:4 r8c8:4', placeAt: { r5c5: 1, r8c8: 2 }, elim: [['r1c8 r5c2 r8c5 r3c5 r6c8 r9c2 r4c2', '4']],
                  strikeAt: { r1c8: 0.45, r5c2: 0.45, r8c5: 1.45 },
                  arrows: [['r1c2', 'r9c2', 2.8], ['r5c5', 'r1c5', 2.8], ['r8c8', 'r1c8', 2.8]] },
                { t: 'Choose r1c8 → r8c5 → r5c2', solve: 'r1c8:4 r8c5:4 r5c2:4', placeAt: { r8c5: 1, r5c2: 2 }, elim: [['r1c2 r8c8 r5c5 r3c5 r6c8 r9c2 r4c2', '4']],
                  strikeAt: { r1c2: 0.45, r8c8: 0.45, r5c5: 1.45 },
                  arrows: [['r1c8', 'r9c8', 2.8], ['r8c5', 'r1c5', 2.8], ['r5c2', 'r1c2', 2.8], ['r5c2', 'r9c2', 2.8]] },
              ] },
          ],
        },
        spot: ['Each row may have two or three spots; what matters is that together they use only three columns.',
          'Four rows in four columns is a <b>Jellyfish</b>. Bigger fish don\'t exist in practice: a 5-fish always has a smaller mirror fish in the other direction.'],
      },
      {
        id: 'skyscraper', title: 'Skyscraper', level: 'advanced',
        idea: 'Two columns with exactly two spots for a digit, sharing one row (the base). One of the other two ends (the tops) must hold the digit; remove it from any cell that sees both tops.',
        fig: {
          focus: true,
          cands: 'r1c2:2 r8c2:2 r3c5:2 r8c5:2 r3c1:2 r3c3:2 r1c4:2 r1c6:2 r1c9:2 r5c7:2',
          steps: [
            { t: 'Two strong columns', shade: { 'r1-9c2 r1-9c5': 'pattern' }, mark: [['r1c2 r8c2 r3c5 r8c5', '2', 'g']], links: [['r1c2:2', 'r8c2:2', 's'], ['r3c5:2', 'r8c5:2', 's']], text: 'Only 2s are shown. Columns 2 and 5 each have exactly two places for <b>2</b>. Their bottom spots share row 8, so they cannot both be 2.' },
            { t: 'Eliminate', reset: true, shade: { 'r1c2 r3c5': 'related' }, links: [['r1c2:2', 'r8c2:2', 's'], ['r3c5:2', 'r8c5:2', 's'], ['r8c2:2', 'r8c5:2', 'w']], elim: [['r3c1 r3c3 r1c4 r1c6', '2']], text: 'Remove 2 from every cell that sees both tops: r3c1 and r3c3 (box 1 + row 3), r1c4 and r1c6 (row 1 + box 2). r1c9 sees only one top and stays.' },
            { t: 'Why', reset: true, shade: {"r8c2 r8c5": "pattern", "r1c2 r3c5": "related"}, hold: 4800,
              text: "The two bottoms share a row, so they cannot both be 2. Each column needs a 2, so <b>at least one top must be 2</b>. Pick either top and watch it rule out the same four candidates.",
              frames: [
                {"t": "Pick the left top (r1c2). It rules out its bottom, then all four targets.", "solve": "r1c2:2", "elim": [["r8c2", "2"], ["r3c1 r3c3 r1c4 r1c6", "2"]], "strikeAt": {"r3c1": 1.65, "r3c3": 1.65, "r1c4": 1.65, "r1c6": 1.65, "r8c2": 0.65}},
                {"t": "Pick the right top (r3c5). It rules out its bottom, then the same four targets.", "solve": "r3c5:2", "elim": [["r8c5", "2"], ["r3c1 r3c3 r1c4 r1c6", "2"]], "strikeAt": {"r3c1": 1.65, "r3c3": 1.65, "r1c4": 1.65, "r1c6": 1.65, "r8c5": 0.65}},
              ] },
          ],
        },
        spot: ['It is an X-Wing that missed by one: the tops are out of line.',
          'Works with rows too (the building lies on its side).'],
      },
      {
        id: 'kite', title: 'Two-string kite', level: 'advanced',
        idea: 'A row and a column, each with exactly two spots for a digit, with one end of each in the same box. The two far ends: one of them is the digit.',
        fig: {
          focus: true,
          cands: 'r2c2:5 r2c7:5 r1c3:5 r6c3:5 r6c7:5 r4c7:5 r6c5:5',
          steps: [
            { t: 'Two strings', shade: { 'r2c1-9 r1-9c3': 'pattern' }, mark: [['r2c2 r2c7 r1c3 r6c3', '5', 'g']], links: [['r2c2:5', 'r2c7:5', 's'], ['r1c3:5', 'r6c3:5', 's']], text: 'Only 5s are shown. Row 2 has two places for <b>5</b> (c2, c7); column 3 has two (r1, r6). The ends r2c2 and r1c3 share box 1.' },
            { t: 'Eliminate', reset: true, shade: { 'r2c7 r6c3': 'related' }, links: [['r2c2:5', 'r2c7:5', 's'], ['r1c3:5', 'r6c3:5', 's'], ['r2c2:5', 'r1c3:5', 'w']], elim: [['r6c7', '5']], text: 'r6c7 sees both ends (column 7 and row 6): it can\'t be 5.' },
            { t: 'Why', reset: true, shade: {"r2c2 r1c3": "pattern", "r2c7 r6c3": "related"}, hold: 4800,
              text: "The two near ends share a box, so they cannot both be 5. Each string needs a 5, so <b>at least one far end must be 5</b>. The loop shows all three possible arrangements. Either far end is enough to rule out r6c7.",
              frames: [
                {"t": "Pick the far end r2c7. It crosses out r2c2. Now also choose r1c3 as 5, which crosses out r6c3. r2c7 still rules out r6c7.", "solve": "r2c7:5 r1c3:5", "placeAt": {"r1c3": 1.35}, "elim": [["r2c2", "5"], ["r6c3", "5"], ["r6c7", "5"]], "strikeAt": {"r2c2": 0.65, "r6c3": 2, "r6c7": 2.7}},
                {"t": "Pick the far end r6c3. It crosses out r1c3. Now also choose r2c2 as 5, which crosses out r2c7. r6c3 still rules out r6c7.", "solve": "r6c3:5 r2c2:5", "placeAt": {"r2c2": 1.35}, "elim": [["r1c3", "5"], ["r2c7", "5"], ["r6c7", "5"]], "strikeAt": {"r1c3": 0.65, "r2c7": 2, "r6c7": 2.7}},
                { t: 'Pick both far ends: r2c7 and r6c3. Each crosses out its near end, and both see r6c7.', solve: 'r2c7:5 r6c3:5', placeAt: { r6c3: 1.35 }, elim: [['r2c2 r1c3 r6c7', '5']], strikeAt: { r2c2: 0.65, r1c3: 2, r6c7: 2.7 } },
              ] },
          ],
        },
        spot: ['Look for a box where a strong row and a strong column of the same digit both "touch down".',
          'Skyscraper, kite and the turbot fish are all the same idea: a short X-chain (Chapter 5).'],
      },
    ],
  },
  {
    id: 'wings', title: 'Chapter 4 · Wings', intro: `<p>Wings use <b>bivalue cells</b> (cells with exactly two candidates). They are small, three-cell chains, and they're the first technique that mixes digits.</p>`,
    sections: [
      {
        id: 'xy-wing', title: 'XY-Wing (Y-Wing)', level: 'advanced',
        idea: 'A pivot {X,Y} sees two pincers {X,Z} and {Y,Z}. Whatever the pivot is, one pincer becomes Z. Remove Z from cells that see both pincers.',
        fig: {
          givens: 'r1c1:4 r1c2:8 r1c3:7',
          cands: 'r2c2:12 r2c7:19 r3c1:29 r2c3:39 r3c8:49 r3c9:59 r2c9:68',
          steps: [
            { t: 'Pivot and pincers', shade: { r2c2: 'pattern', 'r2c7 r3c1': 'related' }, mark: [['r2c2', '12', 'g'], ['r2c7', '19', 'g'], ['r3c1', '29', 'g']], text: 'Pivot r2c2 {1,2}. It sees r2c7 {1,9} along row 2 and r3c1 {2,9} in box 1. Both pincers share <b>9</b>.' },
            { t: 'Eliminate', elim: [['r2c3 r3c8 r3c9', '9']], text: 'Any cell seeing both pincers loses 9: r2c3 (row 2 + box 1), r3c8 and r3c9 (row 3 + box 3).' },
            { t: 'Why', reset: true, shade: {"r2c2": "pattern", "r2c7 r3c1": "related"}, hold: 3900,
              text: "Watch each value of the pivot. A pivot of 1 or 2 forces the matching pincer to 9. <b>The same three 9s are ruled out each time.</b>",
              frames: [
                {"t": "Pivot is 1 → r2c7 is 9", "solve": "r2c2:1 r2c7:9", "placeAt": {"r2c2": 0, "r2c7": 0.65}, "elim": [["r2c3 r3c8 r3c9", "9"]], "strikeAt": {"r2c3": 1.35, "r3c8": 1.35, "r3c9": 1.35}},
                {"t": "Pivot is 2 → r3c1 is 9", "solve": "r2c2:2 r3c1:9", "placeAt": {"r2c2": 0, "r3c1": 0.65}, "elim": [["r2c3 r3c8 r3c9", "9"]], "strikeAt": {"r2c3": 1.35, "r3c8": 1.35, "r3c9": 1.35}},
              ] },
          ],
        },
        spot: ['List the bivalue cells. Find one whose two digits each appear in another bivalue cell it can see.',
          'Check the pincers share the same third digit.'],
        trap: 'The pincers needn\'t see each other; they must each see the pivot.',
        aka: 'Y-Wing. Despite the name, it has nothing to do with the X-Wing: that one is a fish on one digit.',
      },
      {
        id: 'xyz-wing', title: 'XYZ-Wing', level: 'advanced',
        idea: 'Like an XY-Wing, but the pivot has all three digits {X,Y,Z}. Now the pivot itself might be Z, so you can only eliminate Z from cells that see all three.',
        fig: {
          givens: 'r1c1:4 r1c2:8 r1c3:7',
          cands: 'r2c2:129 r2c7:19 r3c1:29 r2c3:39 r3c8:49',
          steps: [
            { t: 'The shape', shade: { r2c2: 'pattern', 'r2c7 r3c1': 'related' }, mark: [['r2c2', '129', 'g'], ['r2c7', '19', 'g'], ['r3c1', '29', 'g']], text: 'Pivot r2c2 {1,2,9}, pincers r2c7 {1,9} and r3c1 {2,9}.' },
            { t: 'Eliminate', elim: [['r2c3', '9']], text: 'r2c3 sees all three: remove 9. r3c8 sees both pincers but not the pivot, so it keeps its 9.' },
            { t: 'Why', reset: true, shade: {"r2c2": "pattern", "r2c7 r3c1": "related"}, hold: 3900,
              text: "Watch each value of the pivot. A pivot of 1 or 2 forces the matching pincer to 9. A pivot of 9 supplies the 9 itself. <b>The same 9 at r2c3 is ruled out each time.</b>",
              frames: [
                {"t": "Pivot is 1 → r2c7 is 9", "solve": "r2c2:1 r2c7:9", "placeAt": {"r2c2": 0, "r2c7": 0.65}, "elim": [["r2c3", "9"]], "strikeAt": {"r2c3": 1.35}},
                {"t": "Pivot is 2 → r3c1 is 9", "solve": "r2c2:2 r3c1:9", "placeAt": {"r2c2": 0, "r3c1": 0.65}, "elim": [["r2c3", "9"]], "strikeAt": {"r2c3": 1.35}},
                {"t": "Pivot is 9", "solve": "r2c2:9", "placeAt": {"r2c2": 0}, "elim": [["r2c3", "9"]], "strikeAt": {"r2c3": 1.35}},
              ] },
          ],
        },
        spot: ['Look for a tri-value cell next to two bivalue cells it can see.', 'The targets are almost always in the pivot\'s box.'],
      },
      {
        id: 'w-wing', title: 'W-Wing', level: 'advanced',
        idea: 'Two identical bivalue cells {X,Y} that can\'t see each other, joined by a strong link on X. They can\'t both be X, so one is Y.',
        fig: {
          cands: 'r1c2:46 r8c7:46 r5c2:16 r5c7:68 r1c7:47 r8c2:34',
          steps: [
            { t: 'Twins and bridge', shade: { 'r1c2 r8c7': 'pattern', 'r5c1-9': 'related' }, mark: [['r1c2 r8c7', '46', 'g'], ['r5c2 r5c7', '6', 'g']], links: [['r5c2:6', 'r5c7:6', 's']], text: 'The twins r1c2 and r8c7 are both {4,6}. Row 5 has just two spots for 6, and each sees a different twin.' },
            { t: 'Eliminate', elim: [['r1c7 r8c2', '4']], text: 'Remove 4 from cells that see both twins: r1c7 and r8c2.' },
            { t: 'Why', reset: true, shade: {"r1c2 r8c7": "pattern", "r5c1-9": "related"}, hold: 3900,
              text: "Row 5 must put its 6 at one end of the bridge. That 6 forces the twin in its column to 4. <b>Either choice rules out 4 at r1c7 and r8c2.</b>",
              frames: [
                {"t": "Bridge 6 is at r5c2 → r1c2 is 4", "solve": "r5c2:6 r1c2:4", "placeAt": {"r5c2": 0, "r1c2": 0.65}, "elim": [["r1c7 r8c2", "4"], ["r5c7", "6"]], "strikeAt": {"r1c7": 1.35, "r8c2": 1.35, "r5c7": 0.35}},
                {"t": "Bridge 6 is at r5c7 → r8c7 is 4", "solve": "r5c7:6 r8c7:4", "placeAt": {"r5c7": 0, "r8c7": 0.65}, "elim": [["r1c7 r8c2", "4"], ["r5c2", "6"]], "strikeAt": {"r1c7": 1.35, "r8c2": 1.35, "r5c2": 0.35}},
              ] },
          ],
        },
        spot: ['Find matching bivalue pairs far apart, then check whether one of their digits has a strong link bridging them.'],
      },
    ],
  },
  {
    id: 'chains', title: 'Chapter 5 · Chains and colouring', intro: `<p>Chains generalise every pattern so far. A <b>strong link</b> means "if not A then B"; a <b>weak link</b> means "if A then not B". Alternate them, starting and ending with strong links, and the two ends of the chain can't both be false.</p>`,
    sections: [
      {
        id: 'coloring', title: 'Simple colouring and the X-chain', level: 'expert',
        idea: 'For one digit, join cells by strong links (the only two spots in a house) and colour them alternately. One colour is all true, the other all false. A cell that sees both colours can\'t hold the digit.',
        fig: {
          focus: true,
          cands: 'r1c1:8 r1c6:8 r3c5:8 r8c5:8 r8c1:8 r5c1:8 r8c8:8',
          steps: [
            { t: 'Colour the strong links', shade: { 'r1c1 r3c5': 'groupA', 'r1c6 r8c5': 'groupB' }, mark: [['r1c1 r1c6 r3c5 r8c5', '8', 'g']], links: [['r1c1:8', 'r1c6:8', 's'], ['r1c6:8', 'r3c5:8', 's'], ['r3c5:8', 'r8c5:8', 's']], text: 'Only 8s are shown. <b>8</b> has two places in row 1 (c1, c6), in box 2 (r1c6, r3c5) and in column 5 (r3, r8). Each is a strong link. Alternate orange and blue along the links.' },
            { t: 'Eliminate', elim: [['r8c1', '8']], text: 'r8c1 sees an orange cell (r1c1, column 1) and a blue one (r8c5, row 8). Whichever colour is true, r8c1 sees an 8. Remove it.' },
            { t: 'Why', reset: true, shade: {"r1c1 r3c5": "groupA", "r1c6 r8c5": "groupB"}, hold: 3900,
              text: "Try each colour as true. The strong links force the opposite colour false. The orange case reaches r8c1 through column 1; the blue case reaches it through row 8. <b>Either way, r8c1 loses 8.</b>",
              frames: [
                {"t": "Orange is true → column 1 rules out r8c1", "solve": "r1c1:8 r3c5:8", "placeAt": {"r1c1": 0, "r3c5": 0.65}, "elim": [["r8c1", "8"], ["r1c6", "8"], ["r8c5", "8"]], "strikeAt": {"r8c1": 1.35, "r1c6": 0.35, "r8c5": 1}},
                {"t": "Blue is true → row 8 rules out r8c1", "solve": "r1c6:8 r8c5:8", "placeAt": {"r1c6": 0, "r8c5": 0.65}, "elim": [["r8c1", "8"], ["r1c1", "8"], ["r3c5", "8"]], "strikeAt": {"r8c1": 1.35, "r1c1": 0.35, "r3c5": 0.35}},
              ] },
          ],
        },
        spot: ['Choose a digit with many bivalue houses (exactly two spots).', 'If two cells of the <em>same</em> colour see each other, that colour is false: a "colour wrap", and every cell of it goes.',
          'An X-chain is the same idea written as a line: strong–weak–strong… ending on strong links.'],
      },
      {
        id: 'xy-chain', title: 'XY-Chain', level: 'expert',
        idea: 'A chain of bivalue cells, each passing one digit to the next. If it starts and ends with the same digit Z, one of the two ends is Z.',
        fig: {
          cands: 'r1c1:12 r1c5:23 r4c5:34 r4c9:14 r1c9:15 r4c1:16',
          steps: [
            { t: 'Bivalue cells', shade: { 'r1c1 r1c5 r4c5 r4c9': 'pattern' }, text: 'Four bivalue cells, each seeing the next: r1c1 {1,2} → r1c5 {2,3} → r4c5 {3,4} → r4c9 {4,1}.' },
            { t: 'Eliminate', elim: [['r1c9 r4c1', '1']], text: 'r1c9 and r4c1 see both ends: remove 1.' },
            { t: 'Why', reset: true, shade: { 'r1c1 r1c5 r4c5 r4c9': 'pattern' }, hold: 6000,
              text: 'Start by choosing the <b>other digit</b> at either end instead of 1. Each placement rules out the shared candidate in the next cell, so that cell must take its other digit. Follow the whole chain: the opposite end becomes <b>1</b> and rules out the same two candidates.',
              frames: [
                {"t": "Start with 2 at r1c1 → 3 at r1c5 → 4 at r4c5 → 1 at r4c9", "solve": "r1c1:2 r1c5:3 r4c5:4 r4c9:1", "placeAt": {"r1c5": 0.8, "r4c5": 1.6, "r4c9": 2.4}, "elim": [["r1c9 r4c1", "1"]], "strikeAt": {"r1c9": 3.2, "r4c1": 3.2}},
                {"t": "Start with 4 at r4c9 → 3 at r4c5 → 2 at r1c5 → 1 at r1c1", "solve": "r4c9:4 r4c5:3 r1c5:2 r1c1:1", "placeAt": {"r4c5": 0.8, "r1c5": 1.6, "r1c1": 2.4}, "elim": [["r1c9 r4c1", "1"]], "strikeAt": {"r1c9": 3.2, "r4c1": 3.2}},
              ] },
          ],
        },
        spot: ['An XY-Wing is a three-cell XY-chain.', 'Start from a bivalue cell and hop to bivalue cells it sees, writing the digit passed along.'],
        aka: 'Longer chains that mix strong links in houses and inside cells are Alternating Inference Chains (AIC); the logic is identical.',
      },
    ],
  },
  {
    id: 'unique', title: 'Chapter 6 · Uniqueness', intro: `<p>A proper puzzle has one solution. Some patterns would allow two, so the setter can't have meant them. <b>Only use these when you trust the puzzle is unique</b>; many CtC variant setters prefer you not to need them.</p>`,
    sections: [
      {
        id: 'unique-rectangle', title: 'Unique rectangle', level: 'expert',
        idea: 'If swapping two digits would turn one solution into another, neither arrangement can be the answer to a puzzle with exactly one solution. This rectangle uses that fact to rule out two candidates.',
        fig: {
          cands: 'r2c1:38 r2c5:38 r3c1:38 r3c5:368',
          steps: [
            { t: 'Three corners and a spare digit', shade: { 'r2c1 r2c5 r3c1 r3c5': 'pattern' }, mark: [['r2c1 r2c5 r3c1 r3c5', '38', 'g']], text: 'All four corners can be 3 or 8, but <b>only the bottom-right corner (r3c5) can also be 6</b>. The two left corners are in box 1; the two right corners are in box 2.' },
            { t: 'Eliminate', elim: [['r3c5', '38']], text: 'A 3 or an 8 at the bottom right would let you swap the four corners without changing the rest of the grid. If the puzzle has exactly one solution, cross out 3 and 8 there. <b>Only 6 remains.</b>' },
            { t: 'Why', proof: 'swap', reset: true, shade: { 'r2c1 r2c5 r3c1 r3c5': 'pattern' }, hold: 6200,
              text: 'Suppose the first arrangement belongs to a completed solution. Swapping the four corners gives another solution without changing anything else: each affected row, column and box still has one 3 and one 8. <b>Count what would happen under that assumption:</b>',
              frames: [
                { t: '1 solution if this arrangement completes the grid: start with r3c5 = 3 and fill the other three corners.', solve: 'r3c5:3 r2c5:8 r3c1:8 r2c1:3', placeAt: { r2c5: 0.9, r3c1: 1.65, r2c1: 2.45 } },
                { t: '2 solutions after the swap. All other cells stay the same. The puzzle would not be unique.', solve: 'r3c5:8 r2c5:3 r3c1:3 r2c1:8' },
                { t: 'A unique puzzle forbids both arrangements. Cross out 3 and 8 at r3c5, then place 6.', shade: { r3c5: 'related' }, elim: [['r3c5', '38']], strikeAt: { r3c5: 0.55 }, solve: 'r3c5:6', placeAt: { r3c5: 2.4 } },
              ] },
          ],
        },
        spot: ['Look for three identical bivalue cells forming three corners of a rectangle spanning two boxes.', 'Other types (2–6) and the BUG (bivalue universal grave: every cell bivalue but one) use the same reasoning.'],
        trap: 'The rectangle must span exactly two boxes. With four boxes, swapping changes which digit sits in each box.',
      },
    ],
  },
  {
    id: 'sets', title: 'Chapter 7 · Set theory', intro: `<p>Set theory is the engine behind most famous Cracking the Cryptic breaks. The rule: <b>any group of N houses contains each digit exactly N times.</b> If two groups have the same number of houses, they hold the same digits. Remove the cells they share and what's left on each side still matches. To find your own: choose two groups with the same number of houses, count how often each cell is used on each side, cancel the cells where the counts match, and compare what's left.</p>`,
    sections: [
      {
        id: 'secret', title: 'The secret and the rule of 45', level: 'sets',
        idea: 'Every row, column and box holds 1–9 once, so it sums to 45. In a killer, cages that fill a box except one cell give that cell for free.',
        fig: {
          cages: [{ cells: 'r1c1-3', sum: 15 }, { cells: 'r2c1-2 r3c1', sum: 14 }, { cells: 'r2c3 r3c3', sum: 10 }, { cells: 'r3c2 r4c2', sum: 14 }],
          steps: [
            { t: 'One box', shade: { b1: 'pattern' }, text: 'Box 1 sums to <b>45</b>.' },
            { t: 'Cages inside', shade: { 'r1c1-3 r2c1-2 r3c1 r2c3 r3c3': 'related' }, text: 'Three cages sit wholly inside it: 15 + 14 + 10 = <b>39</b>.' },
            { t: 'The innie', shade: { r3c2: 'related' }, solve: 'r3c2:6', text: 'The one cell left, r3c2, is an <em>innie</em>: 45 − 39 = <b>6</b>.' },
            { t: 'And out', solve: 'r4c2:8', text: 'Its cage is 14, so r4c2 = 8. When cages stick <em>out</em> of a region instead, the extra cells are <em>outies</em>: their sum is the cage total minus 45.' },
          ],
        },
        spot: ['Count cage totals region by region, starting with boxes almost covered by whole cages.', 'Rows and columns work too, and so do several houses at once (two rows sum to 90).',
          'The same "secret" sizes everything: arrows, sandwiches and little killers all lean on it.'],
      },
      {
        id: 'leftovers', title: 'Law of leftovers', level: 'sets',
        idea: 'In a jigsaw (irregular) sudoku, compare N rows with the N regions that mostly sit in them. The cells of the rows outside the regions hold the same digits as the cells of the regions outside the rows.',
        fig: {
          jig: `AAAAABBBB
                AAABBBBBC
                ACCCCCCCC
                .........
                .........
                .........
                .........
                .........
                .........`,
          jigColors: { A: '#fbe7c6', B: '#d9ecfb', C: '#e6f4dc' },
          steps: [
            { t: 'Two rows, two regions', shade: {}, text: 'Rows 1–2 (18 cells) and the regions A and B (18 cells) are both two houses, so they hold the same 18 digits.' },
            { t: 'Cancel the overlap', shade: { 'r1c1-9 r2c1-8': 'excluded' }, text: 'Seventeen cells are in both. Cross them out on each side.' },
            { t: 'The leftovers', shade: { 'r2c9 r3c1': 'related' }, text: 'Left over: r2c9 (in the rows, not in A or B) and r3c1 (in A, not in the rows). <b>They hold the same digit.</b>' },
          ],
        },
        spot: ['Walk down the grid one row at a time and see which regions are "nearly finished".', 'With more leftovers, it\'s a set of digits: three cells out and three cells in contain the same three digits.'],
      },
      {
        id: 'phistomefel', title: 'The Phistomefel ring', level: 'sets',
        idea: 'In every sudoku, the 16 cells of the ring around the central box contain exactly the same digits as the four 2×2 corners. Found by the setter Phistomefel; GH040 in your library is built on it.',
        fig: {
          steps: [
            { t: 'Find the two shapes', ring: [[RING, 'groupA'], [CORNERS, 'groupB']], text: 'Orange: the 16 cells that hug the middle box. Blue: the four 2×2 corners, also 16 cells. <b>If blue contains two 7s, orange contains two 7s.</b> The same goes for any digit.' },
            { t: 'Watch the 7s get counted', proof: 'count', hold: 5600,
              text: 'These are the same nine 7s throughout. The little number beside a 7 shows how many times it has gone on the current list. Watch <b>r3c3</b>: it counts once for row 3, then again for column 3. On the box list, it counts only once.',
              frames: [
                { t: 'Start with nine 7s: two in the orange ring and two in the blue corners.', solve: EXAMPLE_SEVENS, ring: [[RING, 'groupA'], [CORNERS, 'groupB']] },
                { t: 'Orange list: count the 7 in each of rows 3–7. Running total: 5.', solve: EXAMPLE_SEVENS, shade: { 'r3-7c1-9': 'groupA' }, tags: { 'r3c3 r4c1 r5c5 r6c8 r7c6': '1' } },
                { t: 'Add the 7 in each of columns 3–7. Three 7s get counted again. Running total: 10.', solve: EXAMPLE_SEVENS, shade: { 'r3-7c1-9 r1-9c3-7': 'groupA' }, tags: { 'r3c3 r5c5 r7c6': '2', 'r1c4 r2c7 r4c1 r6c8': '1' } },
                { t: 'Start the blue list: count the 7 in each of the nine boxes. Running total: 9.', solve: EXAMPLE_SEVENS, shade: { 'r1-9c1-9': 'groupB' }, tags: { 'r1c4 r2c7 r3c3 r4c1 r5c5 r6c8 r7c6 r8c2 r9c9': '1' } },
                { t: 'Count the middle box again. Only r5c5 gets counted twice. Running total: 10.', solve: EXAMPLE_SEVENS, shade: { 'r1-9c1-9': 'groupB', b5: 'pattern' }, tags: { 'r1c4 r2c7 r3c3 r4c1 r6c8 r7c6 r8c2 r9c9': '1', r5c5: '2' } },
              ] },
            { t: 'Compare one 7', reset: true, solve: EXAMPLE_SEVENS, shade: { r3c3: 'pattern' }, tags: { r3c3: '2:1' }, text: 'Ignore the other 7s for a moment. The 7 at <b>r3c3</b> is written down twice on orange (row 3 and column 3) and once on blue (box 1). Cross out one copy on each list. That leaves <b>one orange copy</b> of this 7. The 7 itself never moves.' },
            { t: 'Do the same for all nine', reset: true, solve: EXAMPLE_SEVENS, shade: { [CANCELLED]: 'excluded' }, tags: { 'r3c3 r7c6': '2:1', 'r8c2 r9c9': '0:1', r5c5: '2:2', 'r1c4 r2c7 r4c1 r6c8': '1:1' }, ring: [[RING, 'groupA'], [CORNERS, 'groupB']], text: 'Each label is <b>orange count : blue count</b>. Equal counts cancel completely (grey). Each ring 7 leaves one orange copy (<b>2:1</b>); each corner 7 leaves one blue copy (<b>0:1</b>).' },
            { t: 'See what survives', reset: true, tags: null, solve: 'r3c3:7 r7c6:7 r8c2:7 r9c9:7', shade: { [CANCELLED]: 'excluded' }, ring: [[RING, 'groupA'], [CORNERS, 'groupB']], text: 'We started with <b>10 copies on each list</b> and crossed off <b>8 matched pairs</b> in this example. These are the survivors: two orange 7s, two blue 7s. The other five 7s are still on the Sudoku board; we just stopped counting them.' },
            { t: 'Why it always works', reset: true, tags: null, shade: { [CANCELLED]: 'excluded' }, ring: [[RING, 'groupA'], [CORNERS, 'groupB']], text: 'The counts depend on <b>where the cell is</b>, not what digit it holds. Any digit starts with ten copies on each list. Any matched pair takes one off each list. Only ring cells can leave an orange copy, and only corners can leave a blue copy. So whatever digit you count, the ring and corners must have the same number of it.' },
          ],
        },
        spot: ['Reach for it when a puzzle has clues around the ring or in the corners (cages, thermos or arrows there).',
          'Typical use: if the corners can\'t contain a digit more than twice, the ring can\'t either; if a corner 2×2 has a 9, a 9 is in the ring.'],
      },
    ],
  },
  VARIANTS,
];

export const CHEATSHEET = [
  ['Hidden single', 'One spot for a digit in a house', 'Places a digit'],
  ['Naked single', 'One candidate in a cell', 'Places a digit'],
  ['Pointing / claiming', 'Digit confined to box ∩ line', 'Digit from rest of line / box'],
  ['Naked / hidden pair', 'Two cells, two digits', 'Those digits elsewhere / other digits there'],
  ['X-Wing / Swordfish', 'Digit in 2/3 rows using 2/3 columns', 'Digit from rest of those columns'],
  ['Skyscraper / kite', 'Two strong links joined by a weak one', 'Digit from cells seeing both ends'],
  ['XY-Wing', 'Pivot {XY} + pincers {XZ}, {YZ}', 'Z from cells seeing both pincers'],
  ['XYZ-Wing', 'Pivot {XYZ} + pincers {XZ}, {YZ}', 'Z from cells seeing all three'],
  ['W-Wing', 'Twin {XY} cells + strong link on X', 'Y from cells seeing both twins'],
  ['Colouring / X-chain', 'One digit, alternating strong links', 'Digit from cells seeing both colours'],
  ['XY-Chain', 'Bivalue cells passing digits along', 'End digit from cells seeing both ends'],
  ['Unique rectangle', '3 corners {XY} in 2 boxes', 'X and Y from the fourth corner'],
  ['Rule of 45', 'Cages nearly fill a house', 'The innie / outie value'],
  ['Law of leftovers', 'N rows vs N jigsaw regions', 'Leftover cells share digits'],
  ['Phistomefel ring', 'Ring around box 5 vs 2×2 corners', 'Same 16 digits'],
];
