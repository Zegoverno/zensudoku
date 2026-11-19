<script lang="ts">
  import { tick } from 'svelte';
  import type { Store } from './state.svelte.ts';
  import type { Snapshot } from './adapters.ts';
  import { CATALOG, CUSTOM_PREFIX, DIFFICULTIES, VARIANTS, VARIANT_LABEL, VARIANT_RULE, clueList, customPuzzle, filtered, findPuzzle, gridText, related, violations } from '../core/sudoku.ts';
  import type { Difficulty, Puzzle, Variant } from '../core/sudoku.ts';
  import { COLORS, MODES, bit, choose, enter, erase, isDone, next, notesOf, peekBoard, puzzleOf, redo, reset, select as selectCell, setColor, setFilters, toggleNote, undo } from '../core/sudoku-game.ts';
  import type { Mode } from '../core/sudoku-game.ts';
  import { hint as nextHint } from '../core/hint.ts';
  import { arrowPoints, cageEdges, centre, thermoPoints } from '../core/sudoku-draw.ts';
  import { activeCells, coord, geometryUnits, moveCell, widthOf } from '../core/sudoku-extra.ts';
  import { typing } from './keys.ts';
  import { host as idle } from './host-state.svelte.ts';
  import type { HostView } from './host-state.svelte.ts';
  /** `store` keeps the game and saves it; `onchange` tells a host about the open board after every change; `host` is what the host says about the container (the PWA gives none). */
  let { store, onchange, host = idle }: { store: Store; onchange?: (s: Snapshot) => void; host?: HostView } = $props();
  const game = $derived(store.game);
  const save = () => store.save();

  const puzzle = $derived(puzzleOf(game));
  const board = $derived(peekBoard(game));
  const rules = $derived(violations(board.cells, puzzle));
  const bad = $derived(new Set(rules.flatMap(v => v.cells)));
  const done = $derived(isDone(game));
  const filled = $derived(board.cells.filter(Boolean).length);
  const width = $derived(widthOf(puzzle));
  const activeCellsList = $derived(activeCells(puzzle));
  const outlinedRegions = $derived(geometryUnits(puzzle).filter(u => u.rule === 'box' || u.rule === 'region').map(u => u.cells));
  const peerSet = $derived(new Set(activeCellsList.filter(i => related(puzzle, board.selected, i))));
  const choices = $derived(filtered(game.variant, game.difficulty));
  // Entered puzzles are not catalog entries, but stay reachable after browsing away.
  const entered = $derived(Object.keys(game.boards).map(findPuzzle).filter((p): p is Puzzle => !!p && p.id.startsWith(CUSTOM_PREFIX)));
  const manyVariants = new Set(CATALOG.map(p => p.variant)).size > 1 || new Set(CATALOG.map(p => p.difficulty)).size > 1;
  const canNext = $derived(choices.length > 0 && !(choices.length === 1 && choices[0].id === puzzle.id));
  const clues = $derived(clueList(puzzle));
  const hasSandwich = $derived(puzzle.rowSandwich.some(v => v != null) || puzzle.colSandwich.some(v => v != null));
  const cageAt = $derived(new Map(puzzle.cages.flatMap(c => c.cells.map(i => [i, c] as const))));
  const cageLabel = $derived(new Map(puzzle.cages.map(c => [Math.min(...c.cells), c.sum] as const)));
  const thermoAt = $derived(new Map(puzzle.thermometers.flatMap(t => t.map((i, k) => [i, `thermometer cell ${k + 1} of ${t.length}`] as const))));
  const LABEL: Record<Mode, string> = { value: 'Value', corner: 'Corner', center: 'Center' };
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  // Corner notes sit around the cell's edge in this order (row, column in a 3×3 grid).
  const SLOTS = [[1, 1], [1, 3], [3, 1], [3, 3], [1, 2], [3, 2], [2, 1], [2, 3], [2, 2]];

  // Layout by the container the host reports (px; 0 = unknown, then the board fills its column).
  // Narrow (a phone, a side panel): one column, the board as wide as the container allows and no
  // taller than it. Wide (a board pane): the board on the left, the controls beside it.
  const compact = $derived(host.phone || (host.width > 0 && host.width < 480));
  const pad = $derived(compact ? 10 : 16);
  const wide = $derived(!host.phone && host.width >= 760 && host.height >= 380);
  const boardPx = $derived.by(() => {
    const { width: w, height: h } = host;
    if (!w) return 0;
    if (wide) return Math.max(320, Math.min(h - 2 * pad, w - 2 * pad - 24 - 300, 680));
    const room = w - 2 * pad;
    return Math.max(120, h ? Math.min(room, 520, Math.max(220, h - 96)) : Math.min(room, 520));
  });
  let grid: HTMLDivElement;
  const act = (changed: boolean) => { if (changed) save(); return changed; };
  function select(i: number, focus = false) {
    selectCell(game, i);
    save();
    if (focus) tick().then(() => grid?.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)?.focus());
  }
  const setMode = (m: Mode) => { game.mode = m; save(); };
  const pickFilter = (variant: Variant | 'all', difficulty: Difficulty | 'all') => { setFilters(game, variant, difficulty); save(); };
  function open(id: string) { choose(game, id); save(); }
  function key(e: KeyboardEvent) {
    if (e.defaultPrevented || e.isComposing || typing(e) || e.target instanceof HTMLSelectElement) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && ['z', 'y'].includes(e.key.toLowerCase())) {
      act(e.key.toLowerCase() === 'y' || e.shiftKey ? redo(game) : undo(game));
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const moves: Record<string, [number,number]> = { ArrowLeft: [0,-1], ArrowRight: [0,1], ArrowUp: [-1,0], ArrowDown: [1,0] };
    const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (e.key in moves) select(moveCell(puzzle, board.selected, ...moves[e.key]), true);
    else if (e.shiftKey && digit) act(toggleNote(game, 'corner', Number(digit)));
    else if (/^[1-9]$/.test(e.key)) act(enter(game, Number(e.key)));
    else if (['Backspace', 'Delete', '0'].includes(e.key)) act(erase(game));
    else if (e.key === 'v') setMode('value');
    else if (e.key === 'c') setMode('corner');
    else if (e.key === 'm') setMode('center');
    else return;
    e.preventDefault();
  }
  function arrowHead(a:[number,number], b:[number,number]): string {
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),x=dx/len*.2,y=dy/len*.2;
    return `M${b[0]-x+y},${b[1]-y-x} L${b[0]},${b[1]} L${b[0]-x-y},${b[1]-y+x}`;
  }
  function cellLabel(i: number): string {
    const n = board.cells[i], parts = [`Row ${Math.floor(i / width) + 1}, column ${i % width + 1}: ${n || 'empty'}`];
    if (puzzle.givens[i]) parts.push('given');
    if (board.corner[i]) parts.push(`corner notes ${notesOf(board.corner[i]).join(' ')}`);
    if (board.center[i]) parts.push(`center notes ${notesOf(board.center[i]).join(' ')}`);
    if (board.colors[i]) parts.push(`colored ${COLORS[board.colors[i] - 1].toLowerCase()}`);
    if (cageAt.get(i)) parts.push(`cage sum ${cageAt.get(i)!.sum}`);
    if (thermoAt.get(i)) parts.push(thermoAt.get(i)!);
    for (const clue of clues.flatMap(g => g.items)) if (clue.includes(coord(puzzle,i))) parts.push(clue);
    if (bad.has(i)) parts.push('conflict');
    return parts.join(', ');
  }

  // Entering a puzzle, and asking for a hint.
  let pasted = $state(''), entryError = $state(''), hintText = $state(''), hintCell = $state(-1);
  function play() {
    const made = customPuzzle(pasted);
    if (typeof made === 'string') { entryError = made; return; }
    entryError = ''; pasted = '';
    open(made.id);
  }
  function askHint() {
    const h = nextHint(puzzle, board.cells);
    hintText = h.message; hintCell = h.kind === 'naked' || h.kind === 'hidden' ? h.cell! : -1;
    if (hintCell >= 0) select(hintCell, true);
  }
  $effect(() => { puzzle.id; board.cells.join(''); hintText = ''; hintCell = -1; });
  // Tell the host (if any) about the board; plain text, no notes.
  $effect(() => {
    onchange?.({ puzzleId: puzzle.id, name: puzzle.name, givens: gridText(puzzle.givens), cells: gridText(board.cells), selected: board.selected });
  });
</script>

<svelte:window onkeydown={key} />
<div class="games" class:samurai={puzzle.variant === 'samurai'} class:wide class:compact class:phone={host.phone} class:zen={host.zen} style:--side={width} style:--pad={`${pad}px`} style:--board={boardPx ? `${boardPx}px` : null}>
  <div class="top">
  <header>{#if !host.zen}<div><div class="eyebrow">Games</div><h1>Sudoku</h1></div>{/if}<button class="action" disabled={!canNext} onclick={() => act(next(game))}>New puzzle</button></header>
  <div class="filters">
    {#if manyVariants}
    <label>Variant<select value={game.variant} onchange={e => pickFilter(e.currentTarget.value as Variant | 'all', game.difficulty)}>
      <option value="all">All variants</option>{#each VARIANTS as v}<option value={v}>{VARIANT_LABEL[v]}</option>{/each}
    </select></label>
    <label>Difficulty<select value={game.difficulty} onchange={e => pickFilter(game.variant, e.currentTarget.value as Difficulty | 'all')}>
      <option value="all">Any difficulty</option>{#each DIFFICULTIES as d}<option value={d}>{cap(d)}</option>{/each}
    </select></label>
    {/if}
    <label class="wide">Puzzle<select value={puzzle.id} onchange={e => open(e.currentTarget.value)}>
      {#if !choices.some(c => c.id === puzzle.id)}<option value={puzzle.id}>{puzzle.name}</option>{/if}
      {#each choices as c}<option value={c.id}>{c.name}{c.difficulty ? ` · ${c.difficulty}` : ''}</option>{/each}
      {#if entered.length}<optgroup label="Entered puzzles">{#each entered as c, k}<option value={c.id}>{c.name} {k + 1} · {c.givens.filter(Boolean).length} clues</option>{/each}</optgroup>{/if}
    </select></label>
  </div>
  {#if !choices.length}<p class="none" role="status">No puzzle has this variant and difficulty yet.</p>{/if}
  <div class="info">
    <div><strong>{puzzle.name}</strong> · {VARIANT_LABEL[puzzle.variant]} · <span data-testid="difficulty">{puzzle.difficulty ? `${cap(puzzle.difficulty)} (provisional)` : 'Not rated'}</span></div>
    <div class="rating">{puzzle.rating}</div>
    <div class="rule">{VARIANT_RULE[puzzle.variant]}</div>
  </div>
  <div class="progress"><span role="status">{done ? 'Beautifully done. Puzzle complete!' : rules.length ? rules[0].message : `${filled} of ${activeCellsList.length} filled`}</span><button class="reset" onclick={() => act(reset(game))}>Reset</button></div>
  </div>
  <div class="board-scroll" role="region" aria-label="Board viewport">
  <div class="frame" class:sandwich={hasSandwich} class:littlekiller={puzzle.variant === 'littlekiller'}>
    {#if hasSandwich}
      <div class="cluecols">{#each puzzle.colSandwich as s, k}<span role="img" aria-label={s == null ? `Column ${k + 1}: no clue` : `Column ${k + 1} sandwich sum ${s}`}>{s ?? ''}</span>{/each}</div>
      <div class="cluerows">{#each puzzle.rowSandwich as s, k}<span role="img" aria-label={s == null ? `Row ${k + 1}: no clue` : `Row ${k + 1} sandwich sum ${s}`}>{s ?? ''}</span>{/each}</div>
    {/if}
    <div class="gridbox">
      <div class="grid" role="group" aria-label="Sudoku board" bind:this={grid}>
        {#each activeCellsList as i}
          {@const n = board.cells[i]}
          <button
            data-cell={i}
            style:grid-area={`${Math.floor(i / width) + 1} / ${i % width + 1}`}
            data-value={n || ''}
            data-corner={notesOf(board.corner[i]).join('')}
            data-center={notesOf(board.center[i]).join('')}
            data-color={board.colors[i] || ''}
            class:given={!!puzzle.givens[i]}
            class:selected={board.selected === i}
            class:related={board.selected !== i && peerSet.has(i)}
            class:matching={!!n && n === board.cells[board.selected]}
            class:conflict={bad.has(i)}
            class:hinted={hintCell === i}
            class:labeled={cageLabel.has(i)}
            class:right={puzzle.variant !== 'jigsaw' && puzzle.variant !== 'samurai' && ((i % 9) === 2 || (i % 9) === 5)}
            class:bottom={puzzle.variant !== 'jigsaw' && puzzle.variant !== 'samurai' && (Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5)}
            tabindex={board.selected === i ? 0 : -1}
            aria-label={cellLabel(i)}
            aria-pressed={board.selected === i}
            onclick={() => select(i)}>
            {#if board.colors[i]}<i class="mark" style:background={`var(--c${board.colors[i]})`}></i>{/if}
            {#if n}<span class="v">{n}</span>
            {:else}
              {#if board.corner[i]}<span class="corner" aria-hidden="true">{#each notesOf(board.corner[i]) as d, k}<b style:grid-area={`${SLOTS[k][0]} / ${SLOTS[k][1]}`}>{d}</b>{/each}</span>{/if}
              {#if board.center[i]}<span class="center" aria-hidden="true">{notesOf(board.center[i]).join('')}</span>{/if}
            {/if}
          </button>
        {/each}
      </div>
      <svg class="overlay" viewBox={`0 0 ${width} ${width}`} aria-hidden="true" data-overlay={puzzle.variant}>
        {#if puzzle.variant === 'diagonal'}
          <line x1="0" y1="0" x2="9" y2="9" class="diag" /><line x1="9" y1="0" x2="0" y2="9" class="diag" />
        {/if}
        {#each puzzle.thermometers as t}
          <polyline points={thermoPoints(t)} class="thermo" />
          <circle cx={centre(t[0])[0]} cy={centre(t[0])[1]} r=".33" class="bulb" />
        {/each}
        {#each puzzle.cages as c}
          {#each cageEdges(c.cells) as [x1, y1, x2, y2]}<line {x1} {y1} {x2} {y2} class="cage" />{/each}
        {/each}
        {#each puzzle.cages as c}
          {@const at = Math.min(...c.cells)}
          <text x={(at % 9) + .12} y={Math.floor(at / 9) + .3} class="sum">{c.sum}</text>
        {/each}
        {#each puzzle.consecutive as [a, b]}
          {@const [ax, ay] = centre(a)}{@const [bx, by] = centre(b)}
          <rect x={(ax + bx) / 2 - (ay === by ? .07 : .22)} y={(ay + by) / 2 - (ay === by ? .22 : .07)} width={ay === by ? .14 : .44} height={ay === by ? .44 : .14} rx=".05" class="bar" />
        {/each}
        {#each puzzle.arrows ?? [] as a}
          <polyline points={arrowPoints(a.circle,a.cells)} class="arrowline" />
          <circle cx={centre(a.circle)[0]} cy={centre(a.circle)[1]} r=".38" class="arrowcircle" />
          {@const end = centre(a.cells[a.cells.length-1])}
          {@const prev = centre(a.cells[a.cells.length-2])}
          <path d={arrowHead(prev,end)} class="arrowhead" />
        {/each}
        {#each puzzle.renbans ?? [] as t}<polyline points={thermoPoints(t)} class="renban" />{/each}
        {#each puzzle.dots ?? [] as d}
          {@const a = centre(d.cells[0])}{@const b = centre(d.cells[1])}
          <circle cx={(a[0]+b[0])/2} cy={(a[1]+b[1])/2} r=".13" class="dot" class:black={d.kind === 'black'} />
        {/each}
        {#each puzzle.littleKillers ?? [] as d}
          {@const a = centre(d.cells[0])}{@const b = centre(d.cells[1])}
          {@const origin = [a[0]-(b[0]-a[0])*.85,a[1]-(b[1]-a[1])*.85] as [number,number]}
          <line x1={origin[0]} y1={origin[1]} x2={a[0]} y2={a[1]} class="little-arrow" />
          <path d={arrowHead(origin,a)} class="arrowhead" />
          <text x={origin[0]-(b[0]-a[0])*.27} y={origin[1]-(b[1]-a[1])*.27+.1} class="little-sum" text-anchor="middle">{d.sum}</text>
        {/each}
      </svg>
      {#if puzzle.variant === 'jigsaw' || puzzle.variant === 'samurai'}
        <svg class="region-overlay" viewBox={`0 0 ${width} ${width}`} aria-hidden="true">
          {#each outlinedRegions as region}{#each cageEdges(region,0,width) as [x1,y1,x2,y2]}<line {x1} {y1} {x2} {y2} class="region-edge" />{/each}{/each}
        </svg>
      {/if}
    </div>
  </div>
  </div>
  <div class="bottom">
  <div class="modes" role="group" aria-label="Entry mode">
    {#each MODES as m}<button aria-pressed={game.mode === m} onclick={() => setMode(m)}>{LABEL[m]}</button>{/each}
  </div>
  <div class="digits" role="group" aria-label="Number pad">
    {#each [1,2,3,4,5,6,7,8,9] as n}
      <button aria-label={game.mode === 'value' ? `Place ${n}` : `${LABEL[game.mode]} mark ${n}`}
        class:on={game.mode !== 'value' && !!((game.mode === 'corner' ? board.corner : board.center)[board.selected] & bit(n))}
        onclick={() => act(enter(game, n))}>{n}</button>
    {/each}
  </div>
  <div class="colors" role="group" aria-label="Cell colors">
    {#each COLORS as name, k}<button aria-label={`Color ${name}`} aria-pressed={board.colors[board.selected] === k + 1} style:--sw={`var(--c${k + 1})`} onclick={() => act(setColor(game, k + 1))}></button>{/each}
    <button class="plain" aria-label="Clear color" onclick={() => act(setColor(game, 0))}>×</button>
  </div>
  <div class="tools">
    <button class="action" onclick={() => act(erase(game))}>Erase</button>
    <button class="action" aria-label="Undo" onclick={() => act(undo(game))}>Undo</button>
    <button class="action" aria-label="Redo" onclick={() => act(redo(game))}>Redo</button>
  </div>
  <div class="hint">
    <button class="action" onclick={askHint}>Hint</button>
    <span role="status" data-testid="hint">{hintText}</span>
  </div>
  <details class="enter">
    <summary>Enter a puzzle</summary>
    <p>Paste 81 characters, row by row: digits 1–9, and . or 0 for a blank. It must have exactly one solution.</p>
    <textarea rows="3" spellcheck="false" aria-label="Puzzle text" placeholder="81 digits and dots, row by row" bind:value={pasted}></textarea>
    <div><button class="action" onclick={play} disabled={!pasted.trim()}>Play it</button></div>
    {#if entryError}<p class="bad" role="alert" data-testid="entry-error">{entryError}</p>{/if}
  </details>
  {#if clues.length}
    <details class="clues" data-testid="clue-list">
      <summary>Clues as a list</summary>
      {#each clues as group}<h2>{group.title}</h2><ul>{#each group.items as item}<li>{item}</li>{/each}</ul>{/each}
    </details>
  {/if}
  <footer><span>{#if !host.phone}Arrows move · 1–9 place or note · Shift+1–9 corner note · v, c, m choose Value, Corner, Center · Delete erases · Ctrl+Z undoes<br />{/if}Progress is saved on this device, notes included. No account, no score, no rush.</span></footer>
  </div>
</div>

<style>
  .games { --c1: #e5534b; --c2: #f09a3e; --c3: #e6c93a; --c4: #4fae6a; --c5: #4a8fe0; --c6: #9b6bd6;
    --pad: 20px; width: min(100%, 520px); margin: 0 auto; padding: calc(var(--pad) + 4px) var(--pad); box-sizing: border-box; color: var(--ink); }
  /* Wide (a board pane): the board beside its controls. */
  .games.wide { width: 100%; max-width: none; display: grid; grid-template-columns: var(--board) minmax(260px, 340px); grid-template-areas: 'board top' 'board bottom'; grid-template-rows: auto 1fr; column-gap: 24px; justify-content: center; align-content: start; }
  .wide .top { grid-area: top; } .wide .bottom { grid-area: bottom; } .wide .board-scroll { grid-area: board; }
  .top, .bottom { min-width: 0; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .zen header { justify-content: flex-end; }
  h1 { font-family: var(--heading); font-size: 30px; font-weight: 550; margin: 4px 0; letter-spacing: -.04em; }
  .info strong { font-family: var(--heading); font-weight: 600; }
  .eyebrow { color: var(--dim); font-size: 12px; }
  .action { border: 1px solid var(--faint); border-radius: var(--r-md); padding: 8px 12px; white-space: nowrap; background: var(--soft); }
  button { cursor: pointer; touch-action: manipulation; }
  button:disabled { opacity: .4; cursor: default; }
  button:not(:disabled):hover { background: color-mix(in srgb, var(--accent) 12%, var(--soft)); }
  button:focus-visible, select:focus-visible, summary:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
  .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 8px; }
  .filters label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--dim); min-width: 0; }
  .filters .wide { grid-column: 1 / -1; }
  select { font: inherit; font-size: 13px; color: var(--ink); background: var(--soft); border: 1px solid var(--faint); border-radius: var(--r-md); padding: 7px 8px; min-width: 0; min-height: 36px; }
  .none { color: var(--warn); font-size: 12px; margin: 4px 0; }
  .info { font-size: 13px; line-height: 1.5; margin: 8px 0; }
  .info .rating, .info .rule { color: var(--dim); font-size: 12px; }
  .progress { display: flex; align-items: center; justify-content: space-between; min-height: 32px; font-size: 12px; gap: 8px; }
  .reset { color: var(--dim); text-decoration: underline; padding: 6px; border-radius: var(--r-md); }
  .frame { display: grid; grid-template-columns: 0 minmax(0, 1fr); grid-template-rows: 0 auto; }
  .frame.sandwich { grid-template-columns: 1.7em minmax(0, 1fr); grid-template-rows: 1.7em auto; }
  .cluecols, .cluerows { display: grid; font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums; }
  .cluecols { grid-column: 2; grid-row: 1; grid-template-columns: repeat(9, minmax(0, 1fr)); padding: 0 2px; }
  .cluerows { grid-column: 1; grid-row: 2; grid-template-rows: repeat(9, minmax(0, 1fr)); padding: 2px 0; }
  .cluecols span, .cluerows span { display: flex; align-items: center; justify-content: center; color: var(--ink); }
  .gridbox { grid-column: 2; grid-row: 2; position: relative; }
  .grid { container-type: inline-size; display: grid; grid-template-columns: repeat(var(--side), minmax(0, 1fr)); grid-template-rows: repeat(var(--side), minmax(0, 1fr)); border: 2px solid var(--ink); border-radius: var(--r-sm); overflow: hidden; box-shadow: var(--shadow); }
  .grid { aspect-ratio: 1; position: relative; z-index: 1; }
  /* The host's container sets --board; unknown, the board fills its column. */
  .board-scroll { overflow: auto; padding: 1px; width: var(--board, 100%); max-width: 100%; margin: 0 auto; }
  .wide .board-scroll { margin: 0; align-self: start; }
  .samurai { width: min(100%, 980px); }
  .samurai .board-scroll { width: 100%; }
  .samurai.wide { max-width: none; width: 100%; grid-template-columns: minmax(0, 1fr); grid-template-areas: 'top' 'board' 'bottom'; }
  .samurai .frame { min-width: 680px; }
  .samurai .grid { border: 0; }
  .samurai .grid button { border: 1px solid color-mix(in srgb, var(--ink) 32%, var(--paper)); }
  .samurai .v { font-size: max(15px, 2.4cqw); }
  .samurai .corner { font-size: max(7px, 1.1cqw); }
  .samurai .center { font-size: max(8px, 1.2cqw); }
  .littlekiller { margin: 12%; }
  .overlay { overflow: visible; z-index: 0; }
  .arrowline, .little-arrow, .arrowhead { fill: none; stroke: var(--ink); stroke-width: .045; opacity: .7; }
  .arrowcircle { fill: none; stroke: var(--ink); stroke-width: .035; }
  .renban { fill: none; stroke: #9860b0; stroke-width: .16; opacity: .5; stroke-linecap: round; stroke-linejoin: round; }
  .dot { fill: var(--paper); stroke: var(--ink); stroke-width: .035; }
  .dot.black { fill: var(--ink); }
  .little-sum { font-size: .32px; fill: var(--ink); }
  /* Region boundaries must sit above cell fills and align to the grid's inner box. */
  .region-overlay { position: absolute; inset: 2px; width: calc(100% - 4px); height: calc(100% - 4px); z-index: 2; pointer-events: none; overflow: visible; }
  .samurai .region-overlay { inset: 0; width: 100%; height: 100%; }
  .region-edge { stroke: var(--ink); stroke-width: 2.5px; vector-effect: non-scaling-stroke; }
  .grid button { position: relative; min-width: 0; min-height: 0; align-self: stretch; border: 0; border-right: 1px solid color-mix(in srgb, var(--ink) 32%, var(--paper)); border-bottom: 1px solid color-mix(in srgb, var(--ink) 32%, var(--paper)); padding: 0; border-radius: 0; color: var(--dim); overflow: hidden; }
  .v { position: relative; font-size: max(15px, 5.6cqw); }
  .grid .given { color: var(--ink); font-weight: 650; }
  .grid .related { background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .grid .matching { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .grid .selected { background: color-mix(in srgb, var(--accent) 28%, transparent); box-shadow: inset 0 0 0 2px var(--accent); }
  .grid .conflict .v { color: var(--err); text-decoration: underline wavy; }
  .grid .conflict { box-shadow: inset 0 0 0 1px var(--err); }
  .grid .selected.conflict { box-shadow: inset 0 0 0 2px var(--accent); }
  .grid .right { border-right: 2px solid var(--ink); }
  .grid .bottom { border-bottom: 2px solid var(--ink); }
  .mark { position: absolute; inset: 0; opacity: .38; pointer-events: none; }
  .corner { position: absolute; inset: 2px 3px; display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); font-size: max(7px, 2.7cqw); line-height: 1; color: var(--accent); pointer-events: none; }
  .labeled .corner { top: 24%; }
  .corner b { font-weight: 500; place-self: center; }
  .center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0 12%; font-size: max(8px, 3.1cqw); letter-spacing: .02em; color: var(--ink); overflow-wrap: anywhere; line-height: 1.05; pointer-events: none; }
  .overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .diag { stroke: var(--dim); stroke-width: .08; opacity: .45; }
  .thermo { fill: none; stroke: var(--dim); stroke-width: .22; stroke-linecap: round; stroke-linejoin: round; opacity: .45; }
  .bulb { fill: var(--dim); opacity: .45; }
  .cage { stroke: var(--ink); stroke-width: .035; stroke-dasharray: .1 .07; opacity: .75; }
  .sum { font-size: .26px; fill: var(--ink); font-family: var(--sans); paint-order: stroke; stroke: var(--paper); stroke-width: .08; font-variant-numeric: tabular-nums; }
  .bar { fill: var(--paper); stroke: var(--ink); stroke-width: .025; }
  .modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 14px 0 6px; }
  .modes button, .tools button { border: 1px solid var(--faint); border-radius: var(--r-md); min-height: 40px; font-size: 13px; background: var(--soft); }
  .modes button[aria-pressed='true'] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .digits { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 4px; margin: 6px 0 10px; }
  .digits button { border: 1px solid var(--faint); border-radius: var(--r-md); min-height: 42px; font-size: 20px; padding: 0; background: var(--soft); }
  .digits button.on { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
  .colors { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-bottom: 10px; }
  .colors button { min-height: 32px; border-radius: var(--r-md); border: 1px solid var(--faint); background: color-mix(in srgb, var(--sw) 45%, transparent); }
  .colors button.plain { background: none; color: var(--dim); }
  .colors button[aria-pressed='true'] { border: 2px solid var(--accent); }
  .tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .clues { margin: 14px 0 4px; font-size: 12px; }
  .clues summary { cursor: pointer; color: var(--dim); padding: 6px 0; }
  .clues h2 { font-size: 12px; font-weight: 600; margin: 8px 0 2px; }
  .clues ul { margin: 0; padding-left: 18px; color: var(--dim); line-height: 1.5; }
  footer { margin-top: 12px; }
  footer span { color: var(--dim); font-size: 11px; line-height: 1.7; }
  .hint { display: flex; align-items: center; gap: 10px; margin: 10px 0 0; font-size: 12px; line-height: 1.5; }
  .hint span { color: var(--dim); min-width: 0; }
  .enter { margin: 12px 0 0; font-size: 12px; }
  .enter summary { cursor: pointer; color: var(--dim); padding: 6px 0; }
  .enter p { color: var(--dim); margin: 4px 0 6px; }
  .enter textarea { width: 100%; box-sizing: border-box; font: 13px/1.4 var(--mono); color: var(--ink); background: var(--soft); border: 1px solid var(--faint); border-radius: var(--r-md); padding: 8px; margin-bottom: 6px; }
  .enter .bad { color: var(--err); }
  .grid .hinted { box-shadow: inset 0 0 0 2px var(--accent); }
  .progress [role=status] { min-width: 0; overflow-wrap: anywhere; }
  .enter p, .hint span, footer span, .info { overflow-wrap: anywhere; }
  /* Fingers: bigger targets on a phone. */
  .phone .modes button, .phone .tools button, .phone .action { min-height: 44px; }
  .phone .digits button { min-height: 48px; }
  .phone .colors button { min-height: 38px; }
  /* A narrow side panel: the pad's rows tighten, never overflow. */
  .compact .modes, .compact .digits, .compact .colors, .compact .tools { gap: 3px; }
  .compact .digits button { font-size: 18px; }
  .compact .modes button, .compact .tools button, .compact .action { padding-inline: 6px; font-size: 12px; }
  .compact .filters { grid-template-columns: minmax(0, 1fr); }
  @media (max-width: 420px) { .eyebrow { font-size: 10px; } }
</style>
