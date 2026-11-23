<script lang="ts">
  import { comboFits, digitsIn, killerCombos, sandwichSets } from '../core/calc.ts';

  let { digits = 9, cell = '', cage = null, title = '', author = '', rules = [], status = '' }: {
    digits?: number; cell?: string; cage?: { sum: number; size: number; placed: number[] } | null;
    title?: string; author?: string; rules?: string[]; status?: string;
  } = $props();
  let sum = $state<number | undefined>(17), size = $state<number | undefined>(3);
  let include = $state(''), exclude = $state('');
  let sandwich = $state<number | undefined>(0);
  const combos = $derived(killerCombos(sum ?? NaN, size ?? NaN, { digits, must: digitsIn(include), mustNot: digitsIn(exclude) }));
  const selected = $derived(cage ? killerCombos(cage.sum, cage.size, { digits }) : []);
  const sets = $derived(sandwichSets(sandwich ?? NaN, digits));
  const print = (set: number[]) => set.length ? set.join(' + ') : 'Empty';
</script>

<section class="helper" aria-label="Sudoku helper">
  {#if title}
    <header><h1>{title}</h1>{#if author}<p>By {author}</p>{/if}</header>
    <div class="card">
      <h2>Puzzle rules</h2>
      {#each rules as rule}<p class="rule">{rule}</p>{/each}
    </div>
  {/if}
  {#if status}<p role="status">{status}</p>{/if}
  <div class="card" data-testid="selected-cage">
    <h2>Selected cage</h2>
    {#if cage}
      <p>{cell} · {cage.sum} in {cage.size} {cage.size === 1 ? 'cell' : 'cells'}</p>
      <p>Placed: {cage.placed.join(', ') || 'none'}. Crossed-out combinations cannot contain all placed digits.</p>
      <ul class="sets">
        {#each selected as set}
          <li>{#if comboFits(set, cage.placed)}{print(set)}{:else}<s aria-label={print(set) + ' (impossible)'}>{print(set)}</s>{/if}</li>
        {:else}<li>No combinations.</li>{/each}
      </ul>
    {:else}
      <p>{cell ? cell + ' is not in a numbered cage. Select a cage cell on the board.' : 'Select a cage cell on the board.'}</p>
    {/if}
  </div>
  <div class="card">
    <h2>Killer calculator</h2>
    <p>Distinct digits from 1 to {digits}.</p>
    <div class="fields">
      <label>Cage sum<input type="number" inputmode="numeric" min="1" max="45" bind:value={sum} /></label>
      <label>Cell count<input type="number" inputmode="numeric" min="1" max={digits} bind:value={size} /></label>
      <label>Must include<input type="text" inputmode="numeric" placeholder="e.g. 19" bind:value={include} /></label>
      <label>Must exclude<input type="text" inputmode="numeric" placeholder="e.g. 6" bind:value={exclude} /></label>
    </div>
    <ul class="sets" aria-label="Killer combinations" aria-live="polite">
      {#each combos as set}<li>{print(set)}</li>{:else}<li>No combinations.</li>{/each}
    </ul>
  </div>
  <div class="card">
    <h2>Sandwich calculator</h2>
    <p>Digits between 1 and {digits} sum to the clue.</p>
    <label>Sandwich sum<input type="number" inputmode="numeric" min="0" max="35" bind:value={sandwich} /></label>
    <div aria-live="polite">
      {#each sets as group}
        <h3>{group.length} {group.length === 1 ? 'digit' : 'digits'}</h3>
        <ul class="sets">{#each group.sets as set}<li>{print(set)}</li>{/each}</ul>
      {:else}<p>No combinations.</p>{/each}
    </div>
  </div>
</section>

<style>
  .helper { display: grid; gap: 10px; color: var(--ink); padding: 12px; min-width: 0; overflow-wrap: anywhere; }
  .card { background: var(--soft); border: 1px solid var(--faint); border-radius: var(--r-md); padding: 12px; min-width: 0; }
  h1, h2, h3 { margin: 0 0 6px; font-family: var(--heading); }
  h1 { font-size: 1.2rem; }
  h2 { font-size: 1rem; }
  h3 { font-size: .85rem; margin-top: 10px; }
  p, label { font-size: .85rem; line-height: 1.45; }
  p { margin: 0 0 8px; color: var(--dim); }
  p:last-child { margin-bottom: 0; }
  .rule { color: var(--ink); white-space: pre-line; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  label { display: grid; gap: 3px; }
  input { width: 100%; min-width: 0; padding: 6px 8px; background: var(--paper); color: var(--ink); border: 1px solid var(--faint); border-radius: var(--r-sm); font: inherit; font-size: 1rem; }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .sets { display: flex; flex-wrap: wrap; gap: 5px; list-style: none; padding: 0; margin: 8px 0 0; }
  li { font: .84rem var(--mono); border: 1px solid var(--faint); background: var(--paper); padding: 4px 7px; border-radius: var(--r-sm); }
  s { color: var(--dim); }
</style>
