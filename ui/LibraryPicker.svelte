<script lang="ts">
  // The library picker: the puzzles grouped by collection, searchable by number, title or author, and
  // driven by the keyboard (type to search, ↑ ↓ to move, Enter to open, Escape to close). Each line
  // says whether that puzzle is solved (✓) or started (•) on this device.
  import { onMount, tick } from 'svelte';
  import type { LibraryItem, LibraryList } from './adapters.ts';
  let { list, error = '', mark, onpick, onclose }: {
    list: LibraryList | null; error?: string;
    mark: (item: LibraryItem) => '' | 'solved' | 'started';
    onpick: (item: LibraryItem) => void; onclose: () => void;
  } = $props();

  let query = $state(''), active = $state(0), input: HTMLInputElement | undefined = $state(), box: HTMLDivElement | undefined = $state();
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return (list?.entries ?? []).filter(e => !q || [e.number, e.title, e.author, e.id].some(s => s?.toLowerCase().includes(q)));
  });
  const groups = $derived.by(() => {
    const out: { name: string; items: { item: LibraryItem; k: number }[] }[] = [];
    shown.forEach((item, k) => {
      const name = item.collection ?? '';
      if (out.at(-1)?.name !== name) out.push({ name, items: [] });
      out.at(-1)!.items.push({ item, k });
    });
    return out;
  });
  $effect(() => { query; active = 0; });
  onMount(() => input?.focus());
  async function move(by: number) {
    if (!shown.length) return;
    active = (active + by + shown.length) % shown.length;
    await tick();
    box?.querySelector(`[data-k="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'PageDown') move(8);
    else if (e.key === 'PageUp') move(-8);
    else if (e.key === 'Enter' && shown[active]) onpick(shown[active]);
    else if (e.key === 'Escape') onclose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  const label = (e: LibraryItem) => [e.number, e.title].filter(Boolean).join(' · ') || e.id;
</script>

<div class="picker" role="dialog" aria-label="Library" tabindex="-1" onkeydown={key}>
  <div class="head">
    <input bind:this={input} bind:value={query} type="search" placeholder="Search number, title or author" aria-label="Search the library"
      aria-controls="library-list" aria-activedescendant={shown[active] ? `lib-${active}` : undefined} />
    <button class="close" aria-label="Close the library" onclick={onclose}>×</button>
  </div>
  {#if error}<p class="note bad" role="alert">{error}</p>
  {:else if !list}<p class="note" role="status">Loading the library…</p>
  {:else}
    {#if !list.available}<p class="note">No local library here: it lives in zenbot's plugin data. Puzzles you import on this device are listed instead.</p>{/if}
    {#if list.errors}<p class="note">{list.errors} file{list.errors === 1 ? '' : 's'} in the library could not be read.</p>{/if}
    {#if !list.entries.length}<p class="note" role="status">{list.available ? 'The library is empty.' : 'Nothing imported yet.'}</p>
    {:else if !shown.length}<p class="note" role="status">No puzzle matches “{query}”.</p>{/if}
    <div class="list" id="library-list" role="listbox" aria-label="Puzzles" bind:this={box}>
      {#each groups as g}
        {#if g.name}<div class="group" role="presentation">{g.name}</div>{/if}
        {#each g.items as { item, k } (item.puzzleId)}
          {@const m = mark(item)}
          <div id={`lib-${k}`} data-k={k} role="option" tabindex="-1" aria-selected={k === active} class:on={k === active}
            data-testid="library-item" data-id={item.id} onclick={() => onpick(item)} onkeydown={key} onmousemove={() => (active = k)}>
            <span class="mark" class:solved={m === 'solved'} aria-label={m ? (m === 'solved' ? 'solved' : 'in progress') : undefined}>{m === 'solved' ? '✓' : m === 'started' ? '•' : ''}</span>
            <span class="name">{label(item)}</span>
            {#if item.author}<span class="by">{item.author}</span>{/if}
          </div>
        {/each}
      {/each}
    </div>
  {/if}
</div>

<style>
  .picker { margin: 10px 0; border: 1px solid var(--faint); border-radius: var(--r-md); background: var(--soft); padding: 8px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
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
