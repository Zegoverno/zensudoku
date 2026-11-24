<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Store } from './state.svelte.ts';
  import type { Snapshot } from './adapters.ts';
  import { CATALOG, CUSTOM_PREFIX, VARIANT_LABEL, VARIANT_RULE, clueList, customPuzzle, filtered, findPuzzle, gridText, hintable, padPuzzle, related, chessRelated, playVerdict, violations } from '../core/sudoku.ts';
  import type { Puzzle } from '../core/sudoku.ts';
  import { COLORS, MODES, addToSelection, choose, effectiveMode, enter, erase, hasNoteOnAll, isDone, next, notesOf, peekBoard, puzzleOf, redo, restart, select as selectCell, selectAll, setAutoClear, setColor, toggleNote, toggleSelection, undo } from '../core/sudoku-game.ts';
  import { formatTime } from '../core/play-time.ts';
  import type { Mode } from '../core/sudoku-game.ts';
  import { hint as nextHint } from '../core/hint.ts';
  import { arrowPoints, cageEdges, centre, thermoPoints } from '../core/sudoku-draw.ts';
  import { activeCells, coord, digitsOf, geometryUnits, moveCell, widthOf } from '../core/sudoku-extra.ts';
  import PadDrawing from './PadDrawing.svelte';
  import Helper from './Helper.svelte';
  import ClueCalc from './ClueCalc.svelte';
  import { cageOf, sumCages } from '../core/calc.ts';
  import LibraryPicker from './LibraryPicker.svelte';
  import type { LibraryItem, LibraryList, LibrarySource } from './adapters.ts';
  import { typing } from './keys.ts';
  import { host as idle } from './host-state.svelte.ts';
  import type { HostView } from './host-state.svelte.ts';
  import { shouldForward } from './zen-keys.ts';
  import type { Avail, CommandId } from './zen-keys.ts';
  /** `store` keeps the game and saves it; `onchange` tells a host about the open board after every change; `host` is what the host says about the container (the PWA gives none).
   *  Under zenbot (`host.zen`): `oncommands` gets what the board can do whenever that changes, `onkey` the keys the board did not handle
   *  (the host runs the commands bound to them and calls `run`), and the board's own Ctrl+Z / Ctrl+Shift+Z are left to the host's Undo / Redo.
   *  `library` lists SudokuPad puzzles and fetches their sources (the server's library, or the PWA's imports); `onlink` opens a link
   *  through the host (without it, links open in a new tab); `importer` shows the box that imports a SudokuPad source (the PWA). */
  let { store, onchange, host = idle, oncommands, onkey, library, onlink, importer = false }: {
    store: Store; onchange?: (s: Snapshot) => void; host?: HostView; oncommands?: (a: Avail) => void; onkey?: (e: KeyboardEvent, typing: boolean) => void;
    library?: LibrarySource; onlink?: (url: string) => void; importer?: boolean;
  } = $props();
  const game = $derived(store.game);
  const save = () => { store.save(); elapsed = store.elapsed(); };

  const puzzle = $derived(puzzleOf(game));
  const board = $derived(peekBoard(game));
  const selectedCage = $derived(cageOf(puzzle, board.selected));
  const helperCage = $derived(selectedCage ? { sum: selectedCage.sum, size: selectedCage.cells.length, placed: selectedCage.cells.map(i => board.cells[i]).filter(Boolean) } : null);
  function toggleAutoClear() { setAutoClear(game, !game.autoClear); save(); }
  const rules = $derived(violations(board.cells, puzzle));
  const bad = $derived(new Set(rules.flatMap(v => v.cells)));
  const done = $derived(isDone(game));
  const sp = $derived(puzzle.pad);
  const standing = $derived(playVerdict(board.cells, puzzle));
  const digitList = $derived(Array.from({ length: digitsOf(puzzle) }, (_, k) => k + 1));
  const aspect = $derived(sp ? sp.bounds.w / sp.bounds.h : 1);
  const FULL = 'Board full. This app cannot verify all the puzzle rules.';
  const filled = $derived(board.cells.filter(Boolean).length);
  const width = $derived(widthOf(puzzle));
  const activeCellsList = $derived(activeCells(puzzle));
  // A digit is used up once it is placed as many times as the grid holds it, with none of them in conflict:
  // its pad button dims and gets a check (it still works, to fix or note).
  const usedUp = $derived.by(() => {
    const per = activeCellsList.length / digitList.length, count = new Map<number, number>(), out = new Set<number>();
    if (!Number.isInteger(per)) return out;
    for (const i of activeCellsList) if (board.cells[i]) count.set(board.cells[i], (count.get(board.cells[i]) ?? 0) + (bad.has(i) ? per + 1 : 1));
    for (const n of digitList) if (count.get(n) === per) out.add(n);
    return out;
  });
  const outlinedRegions = $derived(geometryUnits(puzzle).filter(u => u.rule === 'box' || u.rule === 'region').map(u => u.cells));
  const selectedSet = $derived(new Set(board.selection));
  // More than one cell selected: Value mode shows (and acts as) Corner, without changing the saved mode.
  const mode = $derived(effectiveMode(game));
  const autoCorner = $derived(mode !== game.mode);
  const peerSet = $derived(new Set(activeCellsList.filter(i => related(puzzle, board.selected, i))));
  // Cells a knight's or king's move away, on puzzles with that rule: a second, distinct tint.
  const chessSet = $derived(new Set(activeCellsList.filter(i => !peerSet.has(i) && chessRelated(puzzle, board.selected, i))));
  const choices = $derived(filtered(game.variant, game.difficulty));
  // Entered puzzles are not catalog entries, but stay reachable after browsing away.
  const entered = $derived(Object.keys(game.boards).map(findPuzzle).filter((p): p is Puzzle => !!p && p.id.startsWith(CUSTOM_PREFIX)));
  const padOpened = $derived(Object.keys(game.boards).map(findPuzzle).filter((p): p is Puzzle => !!p?.pad));
  let picking = $state(false), libList = $state<LibraryList | null>(null), libError = $state(''), padSource = $state(''), importError = $state('');
  const pickerList = $derived<LibraryList>({
    available: libList?.available ?? false, errors: libList?.errors ?? 0,
    entries: [
      ...CATALOG.map(p => ({ id: p.id, puzzleId: p.id, title: p.name, collection: 'Built-in', variants: [p.variant], difficulty: p.difficulty ?? undefined })),
      ...entered.map((p, k) => ({ id: p.id, puzzleId: p.id, title: `${p.name} ${k + 1} · ${p.givens.filter(Boolean).length} clues`, collection: 'Entered puzzles', variants: [p.variant] })),
      ...padOpened.filter(p => !libList?.entries.some(e => e.puzzleId === p.id)).map(p => ({
        ...p.library, id: p.library?.id ?? p.id, puzzleId: p.id, title: p.library?.title ?? p.name,
        author: p.pad!.author, collection: p.library?.collection ?? 'Imported puzzles',
        variants: p.library?.variants ?? (p.pad!.classic ? ['classic'] as const : undefined),
      })),
      ...(libList?.entries ?? []),
    ],
  });
  const cages = $derived(sumCages(puzzle));
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
  let viewportWidth = $state(0), viewportHeight = $state(0);
  const viewWidth = $derived(host.width || viewportWidth);
  const viewHeight = $derived(host.height || viewportHeight);
  const compact = $derived(host.phone || (viewWidth > 0 && viewWidth < 480));
  const pad = $derived(compact ? 10 : 16);
  const wide = $derived(!host.phone && viewWidth >= 760 && viewHeight >= 380);
  const boardPx = $derived.by(() => {
    const w = viewWidth, h = viewHeight;
    if (!w) return 0;
    if (wide) return Math.max(320, Math.min((h - 2 * pad) * aspect, w - 2 * pad - 24 - 300, 680));
    const room = w - 2 * pad;
    return Math.max(120, h ? Math.min(room, 520, Math.max(220, h - 96) * aspect) : Math.min(room, 520));
  });
  let grid: HTMLDivElement | undefined = $state();
  let surface: HTMLDivElement;
  let elapsed = $state(0), confirming = $state(false);
  let inView = true, pageActive = true;
  function refreshVisibility() {
    store.setPlaying(pageActive && inView && !picking && !document.hidden);
    elapsed = store.elapsed();
  }
  $effect(() => { picking; refreshVisibilityUntracked(); });
  // Only picker visibility is a reactive dependency; changing a cell or the clock
  // should not recreate listeners, the interval or its running segment.
  function refreshVisibilityUntracked() { untrack(refreshVisibility); }

  export function stopTimer() {
    pageActive = false;
    refreshVisibility();
  }
  onMount(() => {
    const show = () => { pageActive = true; refreshVisibility(); };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      refreshVisibility();
    });
    observer.observe(surface);
    refreshVisibility();
    document.addEventListener('visibilitychange', refreshVisibility);
    window.addEventListener('pagehide', stopTimer);
    window.addEventListener('pageshow', show);
    const display = setInterval(() => { elapsed = store.elapsed(); }, 200);
    const checkpoint = setInterval(() => store.checkpoint(), 2000);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', refreshVisibility);
      window.removeEventListener('pagehide', stopTimer);
      window.removeEventListener('pageshow', show);
      clearInterval(display);
      clearInterval(checkpoint);
      stopTimer();
    };
  });
  function restartPuzzle() { restart(game); save(); }
  function confirmSolve() { store.save(true); elapsed = store.elapsed(); confirming = false; }

  const act = (changed: boolean) => { if (changed) save(); return changed; };
  function select(i: number, focus = false) {
    selectCell(game, i);
    save();
    if (focus) tick().then(() => grid?.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)?.focus());
  }
  const setMode = (m: Mode) => { game.mode = m; save(); };
  /** Cell clicks and drags: a plain press selects one cell, Shift adds, Ctrl/Cmd toggles. A drag adds every cell it crosses. */
  let dragging = $state(false);
  const cellAt = (e: PointerEvent) => { const c = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]'); return c ? Number(c.dataset.cell) : -1; };
  function press(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    dragging = true;
    const changed = e.shiftKey ? addToSelection(game, i) : e.ctrlKey || e.metaKey ? toggleSelection(game, i) : selectCell(game, i);
    if (changed) save();
  }
  function sweep(e: PointerEvent) {
    if (!dragging) return;
    if (e.pointerType === 'mouse' && !e.buttons) { dragging = false; return; }
    const i = cellAt(e);
    if (i >= 0 && !selectedSet.has(i) && addToSelection(game, i)) save();
  }
  function release() { if (dragging) { dragging = false; focusBoard(); } }
  function open(id: string) { choose(game, id); save(); }
  $effect(() => { puzzle.id; standing; confirming = false; });
  /** Runs a command zenbot picked (or its key): the same actions as the buttons. */
  export function run(id: CommandId) {
    if (id === 'new-game') act(next(game));
    else if (id === 'restart') restartPuzzle();
    else if (id === 'hint') { if (!done) askHint(); }
    else if (id === 'undo') act(undo(game));
    else if (id === 'redo') act(redo(game));
    else if (id === 'toggle-notes') setMode(game.mode === 'value' ? 'corner' : 'value');
    else if (id === 'toggle-auto-clear') toggleAutoClear();
    else if (id === 'library') openPicker();
  }
  /** Puts the keyboard focus on the board: the selected cell. */
  export function focusBoard() { grid?.querySelector<HTMLButtonElement>(`[data-cell="${board.selected}"]`)?.focus(); }
  const avail = $derived<Avail>({
    next: canNext, hint: !done && hintable(puzzle), notes: !done, library: true,
    undo: (game.history[puzzle.id]?.undo.length ?? 0) > 0, redo: (game.history[puzzle.id]?.redo.length ?? 0) > 0,
  });
  $effect(() => { if (host.zen) oncommands?.({ ...avail }); });
  function key(e: KeyboardEvent) {
    if (e.defaultPrevented || e.isComposing) return;
    const inField = typing(e), blocked = inField || (e.target instanceof HTMLElement && (e.target.matches('select') || !!e.target.closest('.helper-controls, .auto-clear')));
    if (!blocked && handle(e)) { e.preventDefault(); return; }
    // Under zenbot, every key the board did not use goes to the host, which owns the declared shortcuts.
    if (host.zen && shouldForward(e, blocked)) onkey?.(e, inField);
  }
  /** The board's own keys; true when it used the key. */
  function handle(e: KeyboardEvent): boolean {
    if (!host.zen && (e.ctrlKey || e.metaKey) && !e.altKey && ['z', 'y'].includes(e.key.toLowerCase())) {
      act(e.key.toLowerCase() === 'y' || e.shiftKey ? redo(game) : undo(game));
      return true;
    }
    if (host.zen && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'y') { act(redo(game)); return true; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'a') { act(selectAll(game)); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === 'Escape' && board.selection.length > 1 && !picking) { select(board.selected, true); return true; }
    const moves: Record<string, [number,number]> = { ArrowLeft: [0,-1], ArrowRight: [0,1], ArrowUp: [-1,0], ArrowDown: [1,0] };
    const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (e.key in moves) {
      const to = moveCell(puzzle, board.selected, ...moves[e.key]);
      if (e.shiftKey) { act(addToSelection(game, to)); focusBoard(); } else select(to, true);
    }
    else if (e.shiftKey && digit) act(toggleNote(game, 'corner', Number(digit)));
    else if (/^[1-9]$/.test(e.key)) act(enter(game, Number(e.key)));
    else if (['Backspace', 'Delete', '0'].includes(e.key)) act(erase(game));
    else if (e.key === 'v') setMode('value');
    else if (e.key === 'c') setMode('corner');
    else if (e.key === 'm') setMode('center');
    else if (e.key === 'l' && !host.zen) openPicker();
    else return false;
    return true;
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

  // The library picker, and importing a SudokuPad source.

  function openPicker() {
    if (picking) return;
    picking = true; libList = null; libError = '';
    library?.list().then(l => { libList = l; }, () => { libError = 'The local library could not be read.'; });
  }
  let pickerButton: HTMLButtonElement;
  function closePicker(returnToPicker = false) {
    picking = false;
    tick().then(() => returnToPicker ? pickerButton.focus() : focusBoard());
  }
  /** solved, started (a board with entries) or neither, from this device's saved progress. */
  function mark(item: LibraryItem): '' | 'solved' | 'started' {
    const b = game.boards[item.puzzleId];
    if (b?.play.solved) return 'solved';
    const p = b && findPuzzle(item.puzzleId);
    if (!b || !p) return '';
    return b.cells.some((n, i) => n && !p.givens[i]) || b.corner.some(Boolean) || b.center.some(Boolean) || b.colors.some(Boolean) ? 'started' : '';
  }
  async function pick(item: LibraryItem) {
    if (!findPuzzle(item.puzzleId)) {
      if (!library) return;
      const got = await library.source(item).catch(() => 'The puzzle could not be fetched.');
      if (typeof got === 'string') { libError = got; return; }
      const p = padPuzzle(got.source, got.library);
      if (typeof p === 'string') { libError = `This puzzle cannot be played: ${p}`; return; }
      store.sources.add(got);
    }
    open(item.puzzleId);
    closePicker();
  }
  function importPad() {
    const source = padSource.trim(), p = padPuzzle(source);
    if (typeof p === 'string') { importError = p; return; }
    store.sources.add({ id: p.id, source });
    importError = ''; padSource = '';
    open(p.id);
  }
  function clueTarget(x: number, y: number, w: number, h: number) {
    const bounds = sp?.bounds ?? { x: 0, y: 0, w: width, h: width };
    return `left:${(x - bounds.x) / bounds.w * 100}%;top:${(y - bounds.y) / bounds.h * 100}%;width:${w / bounds.w * 100}%;height:${h / bounds.h * 100}%`;
  }
  /** Where a cell's button sits: a grid area on the classic board, a box on a SudokuPad drawing. */
  function place(i: number): string {
    if (!sp) return `grid-area: ${Math.floor(i / width) + 1} / ${i % width + 1}`;
    const { x, y, w, h } = sp.bounds, pc = (n: number) => `${(n * 100).toFixed(4)}%`;
    return `left: ${pc((i % width - x) / w)}; top: ${pc((Math.floor(i / width) - y) / h)}; width: ${pc(1 / w)}; height: ${pc(1 / h)}`;
  }
  function link(url: string, e: MouseEvent) { if (onlink) { e.preventDefault(); onlink(url); } }
  // Tell the host (if any) about the board; plain text, no notes.
  $effect(() => {
    onchange?.({ puzzleId: puzzle.id, name: puzzle.name, givens: gridText(puzzle.givens), cells: gridText(board.cells), selected: board.selected });
  });
</script>

{#snippet cell(i: number)}
    {@const n = board.cells[i]}
    <button
      data-cell={i}
      style={place(i)}
      data-value={n || ''}
      data-corner={notesOf(board.corner[i]).join('')}
      data-center={notesOf(board.center[i]).join('')}
      data-color={board.colors[i] || ''}
      class:given={!!puzzle.givens[i]}
      class:selected={selectedSet.has(i)}
      class:cursor={board.selected === i}
      class:related={board.selected !== i && peerSet.has(i)}
      class:chess={board.selected !== i && chessSet.has(i)}
      class:matching={!!n && n === board.cells[board.selected]}
      class:conflict={bad.has(i)}
      class:hinted={hintCell === i}
      class:labeled={cageLabel.has(i)}
      class:right={!sp && puzzle.variant !== 'jigsaw' && puzzle.variant !== 'samurai' && ((i % 9) === 2 || (i % 9) === 5)}
      class:bottom={!sp && puzzle.variant !== 'jigsaw' && puzzle.variant !== 'samurai' && (Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5)}
      tabindex={board.selected === i ? 0 : -1}
      aria-label={cellLabel(i)}
      aria-pressed={selectedSet.has(i)}
      onpointerdown={e => press(e, i)}
      onclick={e => { if (!e.detail) select(i); }}>
      {#if board.colors[i]}<i class="mark" style:background={`var(--c${board.colors[i]})`}></i>{/if}
      {#if n}<span class="v">{n}</span>
      {:else}
        {#if board.corner[i]}<span class="corner" aria-hidden="true">{#each notesOf(board.corner[i]) as d, k}<b style:grid-area={`${SLOTS[k][0]} / ${SLOTS[k][1]}`}>{d}</b>{/each}</span>{/if}
        {#if board.center[i]}<span class="center" aria-hidden="true">{notesOf(board.center[i]).join('')}</span>{/if}
      {/if}
    </button>
{/snippet}

{#snippet cageCalc(c: typeof cages[number], x: number, y: number)}
  <ClueCalc sum={c.sum} digits={digitsOf(puzzle)} size={c.cells.length} placed={c.cells.map(i => board.cells[i]).filter(Boolean)}
    label={`Killer cage sum ${c.sum} in ${c.cells.length} cells`} style={clueTarget(x, y, .49, .43)} />
{/snippet}

<svelte:window onkeydown={key} onpointermove={sweep} onpointerup={release} onpointercancel={release} bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />
<div class="games" bind:this={surface} class:samurai={puzzle.variant === 'samurai'} class:wide class:compact class:phone={host.phone} class:zen={host.zen} style:--side={width} style:--pad={`${pad}px`} style:--board={boardPx ? `${boardPx}px` : null}>
  <div class="top">
  <header>
    {#if !host.zen}<div><div class="eyebrow">Games</div><h1>Sudoku</h1></div>{/if}
    <button class="action puzzle-picker" bind:this={pickerButton} aria-expanded={picking} onclick={() => (picking ? closePicker(true) : openPicker())}>Puzzles <span aria-hidden="true">▾</span></button>
  </header>
  {#if picking}<LibraryPicker list={pickerList} loading={!!library && !libList && !libError} error={libError} {mark} onpick={pick} onclose={() => closePicker(true)} />{/if}
  {#if sp}
  <div class="info" data-testid="pad-info">
      <div><strong>{puzzle.name}</strong>{#if sp.author} · <span data-testid="author">by {sp.author}</span>{/if}</div>
      {#if puzzle.library?.collection}<div class="rating">{puzzle.library.collection}</div>{/if}
      {#if sp.rules.length}
        <div class="rules" data-testid="rules" tabindex="-1">{#each sp.rules as para}{#each para.split(/\n+/) as line}<p>{line}</p>{/each}{/each}</div>
      {:else}<div class="rule">{VARIANT_RULE.sudokupad}</div>{/if}
      {#if sp.video}<a class="video" href={sp.video} target="_blank" rel="noopener noreferrer" onclick={e => link(sp.video, e)} data-testid="video">Watch the solution</a>{/if}
    </div>
  {:else}
  <div class="info">
    <div><strong>{puzzle.name}</strong> · {VARIANT_LABEL[puzzle.variant]} · <span data-testid="difficulty">{puzzle.difficulty ? `${cap(puzzle.difficulty)} (provisional)` : 'Not rated'}</span></div>
    <div class="rating">{puzzle.rating}</div>
    <div class="rule">{VARIANT_RULE[puzzle.variant]}</div>
  </div>
  {/if}
  <div class="play-time">
    <span>Time <span data-testid="elapsed">{board.play.finished && !board.play.timed ? '—' : formatTime(elapsed)}</span></span>
    <span>Best <span data-testid="best">{board.play.bestMs === null ? '—' : formatTime(board.play.bestMs)}</span></span>
    {#if !board.play.timed}<span class="timing-note">Earlier play wasn’t timed</span>{/if}
  </div>
  <div class="progress"><span role="status" data-testid="status">{done ? 'Beautifully done. Puzzle complete!' : rules.length ? rules[0].message : standing === 'full' ? FULL : `${filled} of ${activeCellsList.length} filled`}</span><button class="reset" title="Clear the board and timer; keep your best time" onclick={restartPuzzle}>Restart</button></div>
  {#if !done && standing === 'full'}
    {#if confirming}
      <div class="solve-confirm" role="group" aria-label="Confirm solution">
        <span>Only confirm if you’ve checked the puzzle’s rules or solution yourself.</span>
        <button class="action" onclick={confirmSolve}>Confirm solved</button>
        <button class="action" onclick={() => confirming = false}>Cancel</button>
      </div>
    {:else}
      <button class="action" onclick={() => confirming = true}>Mark solved</button>
    {/if}
  {/if}
  </div>
  <div class="board-scroll" role="region" aria-label="Board viewport">
  {#if sp}
    <div class="grid pad" role="group" aria-label="Sudoku board" bind:this={grid} data-overlay="sudokupad"
      style:aspect-ratio={`${sp.bounds.w} / ${sp.bounds.h}`} style:--cw={100 / sp.bounds.w}>
      <PadDrawing pad={sp} />
      {#each cages as c}
        {@const at = c.cells[0]}
        {@render cageCalc(c, at % width + .25, Math.floor(at / width) + .21)}
      {/each}
      {#each sp.sandwichClues as t}
        <ClueCalc sum={Number(t.text)} digits={sp.digits} label={`Sandwich sum ${Number(t.text)}`} style={clueTarget(t.x, t.y, .79, .79)} />
      {/each}
      {#each activeCellsList as i}{@render cell(i)}{/each}
    </div>
  {:else}
  <div class="frame" class:sandwich={hasSandwich} class:littlekiller={puzzle.variant === 'littlekiller'}>
    {#if hasSandwich}
      <div class="cluecols">{#each puzzle.colSandwich as s, k}{#if s == null}<span></span>{:else}<ClueCalc sum={s} digits={digitsOf(puzzle)} label={`Column ${k + 1} sandwich sum ${s}`} />{/if}{/each}</div>
      <div class="cluerows">{#each puzzle.rowSandwich as s, k}{#if s == null}<span></span>{:else}<ClueCalc sum={s} digits={digitsOf(puzzle)} label={`Row ${k + 1} sandwich sum ${s}`} />{/if}{/each}</div>
    {/if}
    <div class="gridbox">
      <div class="grid" role="group" aria-label="Sudoku board" bind:this={grid}>
        {#each activeCellsList as i}
          {@render cell(i)}
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
      {#each cages as c}
        {@const at = c.cells[0]}
        {@render cageCalc(c, at % width + .25, Math.floor(at / width) + .22)}
      {/each}
      {#if puzzle.variant === 'jigsaw' || puzzle.variant === 'samurai'}
        <svg class="region-overlay" viewBox={`0 0 ${width} ${width}`} aria-hidden="true">
          {#each outlinedRegions as region}{#each cageEdges(region,0,width) as [x1,y1,x2,y2]}<line {x1} {y1} {x2} {y2} class="region-edge" />{/each}{/each}
        </svg>
      {/if}
    </div>
  </div>
  {/if}
  </div>
  <div class="bottom">
  <div class="modes" role="group" aria-label="Entry mode">
    {#each MODES as m}<button aria-pressed={mode === m} onclick={() => setMode(m)}>{LABEL[m]}{autoCorner && mode === m ? ' (auto)' : ''}</button>{/each}
  </div>
  <div class="digits" role="group" aria-label="Number pad" style:--digits={digitList.length}>
    {#each digitList as n}
      <button aria-label={mode === 'value' ? `Place ${n}` : `${LABEL[mode]} mark ${n}${autoCorner ? ' (auto)' : ''}`}
        class:on={mode !== 'value' && hasNoteOnAll(game, mode, n)}
        class:done={usedUp.has(n)} title={usedUp.has(n) ? `All ${n}s placed` : undefined}
        onclick={() => act(enter(game, n))}>{n}</button>
    {/each}
  </div>
  <div class="colors" role="group" aria-label="Cell colors">
    {#each COLORS as name, k}<button aria-label={`Color ${name}`} aria-pressed={board.selection.every(i => board.colors[i] === k + 1)} style:--sw={`var(--c${k + 1})`} onclick={() => act(setColor(game, k + 1))}></button>{/each}
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
  <label class="auto-clear"><input type="checkbox" role="switch" checked={game.autoClear} onchange={toggleAutoClear} /> Auto-clear notes</label>
    <details class="helper-controls enter">
      <summary>Sudoku helper</summary>
      <Helper digits={digitsOf(puzzle)} cell={coord(puzzle, board.selected)} cage={helperCage} />
    </details>
  <details class="enter">
    <summary>Enter a puzzle</summary>
    <p>Paste 81 characters, row by row: digits 1–9, and . or 0 for a blank. It must have exactly one solution.</p>
    <textarea rows="3" spellcheck="false" aria-label="Puzzle text" placeholder="81 digits and dots, row by row" bind:value={pasted}></textarea>
    <div><button class="action" onclick={play} disabled={!pasted.trim()}>Play it</button></div>
    {#if entryError}<p class="bad" role="alert" data-testid="entry-error">{entryError}</p>{/if}
  </details>
  {#if importer}
    <details class="enter">
      <summary>Import a SudokuPad puzzle</summary>
      <p>Paste a SudokuPad puzzle source: what sudokupad.app/api/puzzle/&lt;id&gt; returns (it starts with scl, ctc, fpuz or {'{'}). It stays on this device and appears in Puzzles.</p>
      <textarea rows="3" spellcheck="false" aria-label="SudokuPad source" placeholder="scl…" bind:value={padSource}></textarea>
      <div><button class="action" onclick={importPad} disabled={!padSource.trim()}>Import</button></div>
      {#if importError}<p class="bad" role="alert" data-testid="import-error">{importError}</p>{/if}
    </details>
  {/if}
  {#if clues.length}
    <details class="clues" data-testid="clue-list">
      <summary>Clues as a list</summary>
      {#each clues as group}<h2>{group.title}</h2><ul>{#each group.items as item}<li>{item}</li>{/each}</ul>{/each}
    </details>
  {/if}
  <footer><span>{#if !host.phone}Arrows move · Shift+arrows, Shift+click or drag select several cells (Ctrl+A all empty, Esc one) · 1–9 place or note (corner notes on several cells) · Shift+1–9 corner note · v, c, m choose Value, Corner, Center · Delete erases · Ctrl+Z undoes{#if !host.zen} · l opens the puzzle picker{/if}<br />{/if}Restart clears the board and timer, but keeps your best time and solved status.</span></footer>
  </div>
</div>

<style>
  .auto-clear { display: flex; align-items: center; gap: 6px; font-size: .85rem; }
  .auto-clear input { accent-color: var(--accent); width: 18px; height: 18px; }
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
  button:focus-visible, summary:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
  .info { font-size: 13px; line-height: 1.5; margin: 8px 0; }
  .info .rating, .info .rule { color: var(--dim); font-size: 12px; }
  /* A SudokuPad puzzle: its own drawing under transparent cells placed on it (PadDrawing.svelte). */
  .grid.pad { display: block; position: relative; border: 0; border-radius: 0; box-shadow: none; overflow: visible; }
  .grid.pad button[data-cell] { position: absolute; border: 0; z-index: 1; }
  /* Low specificity, so the selected, peer, chess and matching tints below still show over the drawing. */
  .grid.pad :where(button[data-cell]) { background: transparent; }
  .grid.pad .v { font-size: max(13px, calc(var(--cw) * .58cqw)); }
  .grid.pad .corner { font-size: max(7px, calc(var(--cw) * .25cqw)); }
  .grid.pad .center { font-size: max(8px, calc(var(--cw) * .28cqw)); }
  .grid.pad .given { color: var(--ink); }
  .grid.pad .related { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .grid.pad .chess { background: color-mix(in srgb, var(--chess, #d08a1e) 24%, transparent); }
  .info .rules { max-height: 12em; overflow-y: auto; margin: 6px 0 4px; padding-right: 4px; color: var(--ink); font-size: 12.5px; line-height: 1.45; }
  .info .rules p { margin: 0 0 6px; }
  .info .video { display: inline-block; margin-top: 4px; color: var(--accent); font-size: 12.5px; }
  .progress { display: flex; align-items: center; justify-content: space-between; min-height: 32px; font-size: 12px; gap: 8px; }
  .play-time { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: var(--dim); font-variant-numeric: tabular-nums; margin-top: 6px; }
  .play-time [data-testid] { color: var(--ink); font-weight: 600; }
  .timing-note { font-size: 12px; }
  .solve-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; }
  .reset { color: var(--dim); text-decoration: underline; padding: 6px; border-radius: var(--r-md); }
  .frame { display: grid; grid-template-columns: 0 minmax(0, 1fr); grid-template-rows: 0 auto; }
  .frame.sandwich { grid-template-columns: 1.7em minmax(0, 1fr); grid-template-rows: 1.7em auto; }
  .cluecols, .cluerows { display: grid; font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums; }
  .cluecols { grid-column: 2; grid-row: 1; grid-template-columns: repeat(9, minmax(0, 1fr)); padding: 0 2px; }
  .cluerows { grid-column: 1; grid-row: 2; grid-template-rows: repeat(9, minmax(0, 1fr)); padding: 2px 0; }
  .cluecols, .cluerows { color: var(--ink); }
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
  .grid .related { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .grid .chess { background: color-mix(in srgb, var(--chess, #d08a1e) 22%, transparent); }
  .grid .matching { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .grid, .grid button { touch-action: none; user-select: none; -webkit-user-select: none; }
  .grid button.selected { background: color-mix(in srgb, var(--accent) 42%, transparent); box-shadow: inset 0 0 0 2px var(--accent); }
  .grid .selected.cursor { box-shadow: inset 0 0 0 3px var(--accent); }
  .grid .conflict .v { color: var(--err); text-decoration: underline wavy; }
  .grid .conflict { box-shadow: inset 0 0 0 1px var(--err); }
  .grid .selected.cursor.conflict { box-shadow: inset 0 0 0 3px var(--accent); }
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
  .digits { display: grid; grid-template-columns: repeat(var(--digits, 9), minmax(0, 1fr)); gap: 4px; margin: 6px 0 10px; }
  .digits button { border: 1px solid var(--faint); border-radius: var(--r-md); min-height: 42px; font-size: 20px; padding: 0; background: var(--soft); }
  .digits button.on { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
  .digits button.done { position: relative; color: var(--faint); }
  .digits button.done::after { content: '✓'; position: absolute; top: 2px; right: 5px; font-size: 11px; color: var(--accent); }
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
  .helper-controls { border: 1px solid var(--faint); border-radius: var(--r-md); padding: 4px 10px; background: var(--soft); }
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
  @media (max-width: 420px) { .eyebrow { font-size: 10px; } }
</style>
