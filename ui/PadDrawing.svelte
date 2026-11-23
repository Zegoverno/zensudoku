<script lang="ts">
  // A SudokuPad puzzle's drawing (core/sudokupad.ts), in SudokuPad's layer order: underlays, lines and
  // arrows, killer cages, grid lines and region borders, overlays. It sits under the board's cells, which
  // carry the digits, notes, colours and selection. Black and white follow the theme (ink and paper), as
  // SudokuPad's dark mode does; every other colour is the puzzle's own.
  import type { PadModel, PadRect, PadText } from '../core/sudokupad.ts';
  let { pad }: { pad: PadModel } = $props();

  const BLACK = /^(#000|#000000|#000000ff|rgba\(0,\s*0,\s*0,\s*1\)|black)$/i, WHITE = /^(#fff|#ffffff|#ffffffff|white)$/i;
  /** A puzzle colour as the theme shows it. */
  const paint = (c: string) => c === 'paper' || WHITE.test(c) ? 'var(--paper)' : BLACK.test(c) ? 'var(--ink)' : c;
  const b = $derived(pad.bounds);
  const gridPath = $derived.by(() => {
    const d: string[] = [];
    const g = pad.grid;
    for (let r = 0; r <= g.h; r++) d.push(`M${g.x} ${g.y + r}H${g.x + g.w}`);
    for (let c = 0; c <= g.w; c++) d.push(`M${g.x + c} ${g.y}V${g.y + g.h}`);
    return d.join('');
  });
  const segPath = (segs: [number, number, number, number][]) => segs.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join('');
  const points = (pts: [number, number][]) => pts.map(p => p.join(',')).join(' ');
  const turn = (r: PadRect) => r.angle ? `rotate(${r.angle} ${r.x + r.w / 2} ${r.y + r.h / 2})` : undefined;
</script>

{#snippet label(t: PadText)}
  {#if t.background}<rect x={t.x - .01} y={t.y - t.size * .5} width={t.text.length * t.size * .58 + .02} height={t.size} fill={paint(t.background)} fill-opacity=".9" />{/if}
  {#each t.text.split('\n') as line, k}
    <text x={t.x} y={t.y + (k - (t.text.split('\n').length - 1) / 2) * t.size * 1.05} font-size={t.size} text-anchor={t.anchor}
      fill={paint(t.fill)} stroke={t.stroke === 'none' ? undefined : paint(t.stroke)} stroke-width={t.stroke === 'none' ? undefined : t.strokeWidth}
      transform={t.angle ? `rotate(${t.angle} ${t.x} ${t.y})` : undefined}>{line}</text>
  {/each}
{/snippet}
{#snippet shape(r: PadRect)}
  <g transform={turn(r)} opacity={r.opacity === 1 ? undefined : r.opacity}>
    {#if r.fill !== 'none' || r.stroke !== 'none'}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={r.rx || undefined} ry={r.rx || undefined}
        fill={paint(r.fill)} stroke={r.stroke === 'none' ? undefined : paint(r.stroke)} stroke-width={r.stroke === 'none' ? undefined : r.strokeWidth}
        fill-opacity={r.fillOpacity === 1 ? undefined : r.fillOpacity} stroke-opacity={r.strokeOpacity === 1 ? undefined : r.strokeOpacity} />
    {/if}
  </g>
  {#if r.text}{@render label(r.text)}{/if}
{/snippet}

<svg class="paddraw" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} aria-hidden="true" data-testid="pad-drawing">
  <g class="underlays">{#each pad.under as r}{@render shape(r)}{/each}</g>
  <g class="lines">
    {#each pad.lines as l}
      <polyline points={points(l.points)} fill={l.fill === 'none' ? 'none' : paint(l.fill)} stroke={paint(l.color)} stroke-width={l.width}
        stroke-linecap={l.cap} stroke-linejoin={l.join} stroke-dasharray={l.dash || undefined} opacity={l.opacity === 1 ? undefined : l.opacity} />
    {/each}
  </g>
  <g class="cages">
    {#each pad.cages as c}
      <path d={segPath(c.segments)} fill="none" stroke={paint(c.color)} stroke-width={c.width} stroke-dasharray={c.dash || undefined} />
      {#if c.fill !== 'none'}{#each c.cells as [r, cc]}<rect x={cc} y={r} width="1" height="1" fill={c.fill} />{/each}{/if}
      {#if c.label}{@render label(c.label)}{/if}
    {/each}
  </g>
  <path class="gridlines" d={gridPath} />
  <path class="regions" d={segPath(pad.regionEdges)} stroke-width={3 / 64} />
  <g class="overlays">{#each pad.over as r}{@render shape(r)}{/each}</g>
  <g class="outside">{#each pad.outsideGivens as t}{@render label(t)}{/each}</g>
</svg>

<style>
  .paddraw { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 0;
    font-family: Tahoma, Roboto, Arial, var(--sans); }
  .paddraw text { dominant-baseline: central; paint-order: stroke fill; stroke-linejoin: round; }
  .gridlines { fill: none; stroke: color-mix(in srgb, var(--ink) 70%, var(--paper)); stroke-width: 1px; vector-effect: non-scaling-stroke; }
  .regions { fill: none; stroke: var(--ink); stroke-linecap: square; }
</style>
