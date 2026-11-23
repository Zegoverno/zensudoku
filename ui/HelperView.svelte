<script lang="ts">
  import { onMount } from 'svelte';
  import Helper from './Helper.svelte';
  import { typing } from './keys.ts';
  import { shouldForward } from './zen-keys.ts';
  import type { helperState } from '../mcp/app.ts';

  type State = ReturnType<typeof helperState>;
  let { read, onkey }: { read: () => Promise<State>; onkey: (e: KeyboardEvent, typing: boolean) => void } = $props();
  let snapshot = $state<State>();
  let status = $state('Connecting to the board…');

  onMount(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!document.hidden) {
        try {
          const next = await read();
          if (stopped) return;
          if (snapshot?.version !== next.version || status) snapshot = next;
          status = '';
        } catch {
          if (!stopped) status = 'Board unavailable. Retrying…';
        }
      }
      if (!stopped) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  });

  function key(e: KeyboardEvent) {
    const field = typing(e);
    if (!e.defaultPrevented && !e.isComposing && shouldForward(e, field)) onkey(e, field);
  }
</script>

<svelte:window onkeydown={key} />
<Helper title={snapshot?.title} author={snapshot?.author} rules={snapshot?.rules.length ? snapshot.rules : snapshot ? [snapshot.rule] : []}
  digits={snapshot?.digits} cell={snapshot?.cell} cage={snapshot?.cage} {status} />
