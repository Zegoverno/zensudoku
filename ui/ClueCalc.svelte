<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { killerCombos, comboFits, sandwichSets } from '../core/calc.ts';

  let { sum, digits, size, placed = [], label, style }: {
    sum: number; digits: number; size?: number; placed?: number[]; label: string; style?: string;
  } = $props();
  const id = $props.id();
  let trigger: HTMLButtonElement, popup: HTMLElement;
  let visible = $state(false);
  let hovered = false, focused = false, pinned = false;
  let leave: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(leave));

  function hover() { clearTimeout(leave); hovered = true; void sync(); }
  function unhover() { leave = setTimeout(() => { hovered = false; void sync(); }, 120); }

  const groups = $derived(size === undefined ? sandwichSets(sum, digits) : [{
    length: size, sets: killerCombos(sum, size, { digits }).filter(set => comboFits(set, placed)),
  }]);

  async function sync() {
    visible = hovered || focused || pinned;
    if (!visible) { popup.hidePopover(); return; }
    await tick();
    if (!visible || !trigger.isConnected) return;
    popup.showPopover();
    position();
  }
  function position() {
    if (!visible) return;
    const a = trigger.getBoundingClientRect(), b = popup.getBoundingClientRect();
    if (!a.width || a.bottom < 0 || a.top > innerHeight) { dismiss(); return; }
    popup.style.left = `${Math.max(8, Math.min(a.left, innerWidth - b.width - 8))}px`;
    popup.style.top = `${Math.max(8, a.bottom + b.height + 12 <= innerHeight ? a.bottom + 4 : a.top - b.height - 4)}px`;
  }
  function dismiss() { hovered = focused = pinned = false; void sync(); }
  function activate() {
    if (pinned) dismiss();
    else { pinned = true; void sync(); }
  }
  function outside(e: PointerEvent) {
    if (visible && e.target instanceof Node && !trigger.contains(e.target) && !popup.contains(e.target)) dismiss();
  }
  function escape(e: KeyboardEvent) {
    if (visible && e.key === 'Escape') { dismiss(); e.preventDefault(); }
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={escape} onresize={position} onscrollcapture={position} />
<button type="button" class:positioned={!!style} {style} bind:this={trigger} data-testid="clue-calculator"
  aria-label={label} aria-expanded={visible} aria-controls={id} aria-describedby={visible ? id : undefined}
  onpointerenter={e => { if (e.pointerType === 'mouse') hover(); }}
  onpointerleave={e => { if (e.pointerType === 'mouse') unhover(); }}
  onfocus={() => { focused = trigger.matches(':focus-visible'); void sync(); }}
  onblur={() => { focused = pinned = false; void sync(); }} onclick={activate}>{sum}</button>
<section class="result" id={id} bind:this={popup} popover="manual" aria-label="Digit combinations" data-testid="clue-results"
  onpointerenter={e => { if (e.pointerType === 'mouse') hover(); }}
  onpointerleave={e => { if (e.pointerType === 'mouse') unhover(); }}>
  {#if visible}
  <strong>{label}</strong>
  {#if groups.some(g => g.sets.length)}
    {#each groups as g}
      <div class="group">
        {#if size === undefined}<small>{g.length} between {1} and {digits}</small>{/if}
        <div class="sets">{#each g.sets as set}<span>{set.join(' + ') || 'Empty'}</span>{/each}</div>
      </div>
    {/each}
  {:else}
    <div>No digit combinations.</div>
  {/if}
  {/if}
</section>

<style>
  button { border: 0; background: transparent; color: inherit; font: inherit; padding: 0; cursor: pointer; touch-action: manipulation; }
  button:hover, button[aria-expanded=true] { background: color-mix(in srgb, var(--accent) 17%, transparent); border-radius: var(--r-sm); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  button.positioned { position: absolute; z-index: 4; transform: translate(-50%, -50%); color: transparent; border-radius: var(--r-sm); }
  .result { position: fixed; inset: auto; margin: 0; padding: 10px 12px; box-sizing: border-box; max-width: min(300px, calc(100vw - 16px));
    max-height: calc(100dvh - 16px); overflow: auto;
    border: 1px solid var(--faint); border-radius: var(--r-md); background: var(--paper); color: var(--ink);
    box-shadow: 0 5px 18px #0003; font-size: 13px; }
  .group { margin-top: 5px; }
  small { color: var(--dim); }
  .sets { display: flex; flex-wrap: wrap; gap: 4px; }
  .sets span { padding: 2px 5px; border-radius: 4px; background: var(--soft); }
</style>
