<script lang="ts">
  import { CHAPTERS, LEVELS, CHEATSHEET } from './handbook/chapters.js';
  import { figure } from './handbook/render.js';
  import styles from './handbook/book.css?raw';
  let { section = 'how', onclose }: { section?: string; onclose: () => void } = $props();
  let active = $state('how');
  let dialog: HTMLDialogElement;
  let surface: HTMLDivElement;
  const page = $derived(CHAPTERS.find(c => c.id === active || c.sections.some(s => s.id === active)) ?? CHAPTERS[0]);
  const lesson = $derived(page.sections.find(l => l.id === active));
  $effect(() => { active = section; });
  $effect(() => { if (!dialog.open) dialog.showModal(); });
  $effect(() => {
    const current = lesson, chapter = page, cheat = active === 'cheatsheet';
    const root = surface.shadowRoot ?? surface.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    // Keep the printed-book palette local to the guide, including its controls.
    style.textContent = styles.replaceAll(':root', ':host') + `
      :host { display:block; background:var(--paper); color:var(--ink); font:17px/1.6 Charter,Georgia,serif; container-type:inline-size; }
      .tech { margin:0; padding:16px; } .intro,.lessons,.cheat-wrap { padding:0 16px 16px; }
      .cheat-wrap { overflow-x:auto; }
      .fig { grid-template-columns:minmax(0, min(48%,420px)) minmax(0,1fr); gap:18px; }
      @container (max-width:600px) { .fig { grid-template-columns:minmax(0,1fr); } .svgbox { max-width:390px; width:100%; } }
    `;
    const div = document.createElement(current ? 'article' : 'div');
    let diagram: ReturnType<typeof figure> | undefined;
    if (current) {
      div.className = 'tech';
      div.innerHTML = `<div class="tech-head"><h3>${current.title}</h3><span class="lvl ${current.level}">${LEVELS[current.level]}</span></div><p class="idea">${current.idea}</p>`;
      diagram = figure(current.fig);
      div.append(diagram);
      div.insertAdjacentHTML('beforeend', [
        current.body ? `<div class="body">${current.body}</div>` : '',
        current.spot ? `<div class="spot"><h4>How to spot it</h4><ul>${current.spot.map(s => `<li>${s}</li>`).join('')}</ul></div>` : '',
        current.trap ? `<div class="trap"><h4>Watch out</h4><p>${current.trap}</p></div>` : '',
        current.aka ? `<p class="aka"><b>Also:</b> ${current.aka}</p>` : '',
      ].join(''));
    } else if (cheat) {
      div.className = 'cheat-wrap';
      div.innerHTML = `<table class="cheat"><thead><tr><th>Technique</th><th>Look for</th><th>Gives</th></tr></thead><tbody>${CHEATSHEET.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    } else {
      div.className = 'intro';
      div.innerHTML = chapter.intro;
      if (chapter.sections.length) {
        const list = document.createElement('ul');
        for (const l of chapter.sections) {
          const li = document.createElement('li'), button = document.createElement('button');
          button.type = 'button'; button.textContent = l.title; button.onclick = () => { active = l.id; };
          li.append(button); list.append(li);
        }
        div.append(list);
      }
    }
    root.replaceChildren(style, div);
    surface.scrollTop = 0;
    return () => diagram?.dispose();
  });
</script>

<dialog bind:this={dialog} aria-labelledby="sudoku-learn-heading" onclose={onclose}>
  <header>
    <h2 id="sudoku-learn-heading">Sudoku handbook</h2>
    <button type="button" onclick={() => dialog.close()} aria-label="Close handbook">Close</button>
  </header>
  <label>
    <span>Go to lesson</span>
    <select bind:value={active}>
      {#each CHAPTERS as chapter}
        <optgroup label={chapter.title}>
          <option value={chapter.id}>{chapter.sections.length ? 'Chapter overview' : chapter.title}</option>
          {#each chapter.sections as lesson}<option value={lesson.id}>{lesson.title}</option>{/each}
        </optgroup>
      {/each}
      <option value="cheatsheet">Cheat sheet</option>
    </select>
  </label>
  <div class="page" bind:this={surface} data-testid="handbook-page" data-section={active}></div>
</dialog>

<style>
  dialog { width:min(920px, calc(100% - 20px)); max-height:calc(100% - 20px); margin:auto; padding:0;
    background:#f6f1e7; color:#2b2622; border:1px solid #ddd3c2; border-radius:12px; box-shadow:0 12px 60px #0004; }
  dialog[open] { display:flex; flex-direction:column; }
  dialog::backdrop { background:#17151090; }
  header,label { padding:10px 14px; display:flex; align-items:center; gap:8px; }
  header { justify-content:space-between; border-bottom:1px solid #ddd3c2; }
  h2 { margin:0; font:600 19px system-ui,sans-serif; }
  label { font:13px system-ui,sans-serif; }
  select { min-width:0; flex:1; }
  select,button { background:#fffdf8; color:#2b2622; border:1px solid #a99e8e; border-radius:6px; padding:6px 8px; font:14px system-ui,sans-serif; }
  .page { min-height:0; overflow:auto; overscroll-behavior:contain; padding:0 4px; }
</style>
