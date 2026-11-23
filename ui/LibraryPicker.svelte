<script lang="ts">
  // The library picker: the puzzles grouped by collection, searchable by number, title or author, and
  // driven by the keyboard (type to search, ↑ ↓ to move, Enter to open, Escape to close). Each line
  // says whether that puzzle is solved (✓) or started (•) on this device.
  import { onMount, tick } from 'svelte';
  import { DIFFICULTIES, VARIANTS, VARIANT_LABEL } from '../core/sudoku.ts';
  import { matchesSolveFilter } from '../core/play-time.ts';
  import type { SolveFilter } from '../core/play-time.ts';
  import type { LibraryItem, LibraryList } from './adapters.ts';
  let { list, error = '', loading = false, mark, onpick, onclose }: {
    list: LibraryList; error?: string; loading?: boolean;
    mark: (item: LibraryItem) => '' | 'solved' | 'started';
    onpick: (item: LibraryItem) => void; onclose: () => void;
  } = $props();

  let query = $state(''), active = $state(0), input: HTMLInputElement | undefined = $state(), box: HTMLDivElement | undefined = $state();
  let variant = $state('all'), difficulty = $state('all');
  let solved = $state<SolveFilter>('all');
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return list.entries.filter(e =>
      matchesSolveFilter(solved, solved !== 'all' && mark(e) === 'solved') &&
      (variant === 'all' || (variant === 'unknown' ? !e.variants?.length : e.variants?.some(v => v === variant))) &&
      (difficulty === 'all' || (difficulty === 'unknown' ? !e.difficulty : e.difficulty === difficulty)) &&
      (!q || [e.number, e.title, e.author, e.id, e.collection, ...(e.tags ?? [])].some(s => s?.toLowerCase().includes(q))));
  });
  const groups = $derived.by(() => {
    const out = new Map<string, { name: string; items: { item: LibraryItem; k: number }[] }>();
    shown.forEach(item => {
      const name = item.collection ?? 'Local puzzles';
      if (!out.has(name)) out.set(name, { name, items: [] });
      out.get(name)!.items.push({ item, k: 0 });
    });
    let k = 0;
    for (const { items } of out.values()) for (const entry of items) entry.k = k++;
    return [...out.values()];
  });
  const options = $derived(groups.flatMap(g => g.items.map(e => e.item)));
  $effect(() => { options; active = 0; });
  onMount(() => input?.focus());
  async function move(by: number) {
    if (!shown.length) return;
    active = (active + by + shown.length) % shown.length;
    await tick();
    box?.querySelector(`[data-k="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    else if (e.target !== input) return;
    else if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'PageDown') move(8);
    else if (e.key === 'PageUp') move(-8);
    else if (e.key === 'Enter' && options[active]) onpick(options[active]);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  const label = (e: LibraryItem) => [e.number, e.title].filter(Boolean).join(' · ') || e.id;
</script>

<div class="picker" role="dialog" aria-label="Puzzle picker" tabindex="-1" onkeydown={key}>
  <div class="head">
    <input bind:this={input} bind:value={query} type="search" role="combobox" aria-expanded="true" placeholder="Search puzzles" aria-label="Search puzzles"
      aria-controls="library-list" aria-activedescendant={options[active] ? `lib-${active}` : undefined} />
    <button class="close" aria-label="Close puzzle picker" onclick={onclose}>×</button>
  </div>
  <div class="filters">
    <label>Variant<select aria-label="Variant" bind:value={variant}><option value="all">All variants</option>
      {#each VARIANTS as v}<option value={v}>{VARIANT_LABEL[v]}</option>{/each}
      <option value="unknown">Unclassified</option></select></label>
    <label>Difficulty<select aria-label="Difficulty" bind:value={difficulty}><option value="all">Any difficulty</option>
      {#each DIFFICULTIES as d}<option value={d}>{d}</option>{/each}
      <option value="unknown">Unclassified</option></select></label>
    <label>Status<select aria-label="Status" bind:value={solved}><option value="all">All</option>
      <option value="solved">Solved</option><option value="unsolved">Unsolved</option></select></label>
  </div>
  {#if error}<p class="note bad" role="alert">{error}</p>{/if}
  {#if loading}<p class="note" role="status">Loading local puzzles…</p>{/if}
  {#if list.errors}<p class="note">{list.errors} local puzzle files could not be read.</p>{/if}
  {#if !shown.length}<p class="note" role="status">No matching puzzles.</p>{/if}
    <div class="list" id="library-list" role="listbox" aria-label="Puzzles" bind:this={box}>
      {#each groups as g}
        {#if g.name}<div class="group" role="presentation">{g.name}</div>{/if}
        {#each g.items as { item, k } (item.puzzleId)}
          {@const m = mark(item)}
          <div id={`lib-${k}`} data-k={k} role="option" tabindex="-1" aria-selected={k === active} class:on={k === active}
            aria-label={[label(item), item.author, m === 'solved' ? 'Solved' : m === 'started' ? 'In progress' : 'Unsolved'].filter(Boolean).join(', ')}
            data-testid="library-item" data-id={item.id} onclick={() => onpick(item)} onkeydown={key} onmousemove={() => (active = k)}>
            <span class="mark" class:solved={m === 'solved'} aria-hidden="true">{m === 'solved' ? '✓' : m === 'started' ? '•' : ''}</span>
            <span class="name">{label(item)}</span>
            {#if item.author}<span class="by">{item.author}</span>{/if}
          </div>
        {/each}
      {/each}
    </div>
</div>

<style>
  .picker { margin: 10px 0; border: 1px solid var(--faint); border-radius: var(--r-md); background: var(--soft); padding: 8px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  label { font-size: 12px; color: var(--dim); display: grid; gap: 3px; min-width: 0; }
  select { min-width: 0; min-height: 34px; color: var(--ink); background: var(--paper); font: inherit; border: 1px solid var(--faint); border-radius: var(--r-sm); }
  .head { display: flex; gap: 6px; }
  input { flex: 1; min-width: 0; font: inherit; font-size: 14px; color: var(--ink); background: var(--paper); border: 1px solid var(--faint); border-radius: var(--r-md); padding: 8px; }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .close { min-width: 36px; border-radius: var(--r-md); font-size: 18px; color: var(--dim); cursor: pointer; }
  .note { margin: 2px 4px; font-size: 12px; color: var(--dim); overflow-wrap: anywhere; }
  .note.bad { color: var(--err); }
  .list { max-height: min(50vh, 360px); overflow-y: auto; overflow-x: hidden; }
  .group { font-size: 11px; font-weight: 600; color: var(--dim); padding: 8px 6px 3px; position: sticky; top: 0; background: var(--soft); }
  [role=option] { display: grid; grid-template-columns: 1.2em minmax(0, 1fr) auto; gap: 6px; align-items: baseline; padding: 6px; border-radius: var(--r-sm); font-size: 13px; cursor: pointer; }
  [role=option].on { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .by { color: var(--dim); font-size: 11px; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mark { color: var(--dim); text-align: center; }
  .mark.solved { color: var(--ok); }
</style>
