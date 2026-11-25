// Draws a sudoku diagram (SVG) from a small spec, with cumulative steps.
const S = 44, P = 6, W = 9 * S + 2 * P;
const NS = 'http://www.w3.org/2000/svg';
export const SHADE = {
  pattern: 'var(--diagram-pattern)', related: 'var(--diagram-related)',
  target: 'var(--diagram-target)', excluded: 'var(--diagram-excluded)',
  groupA: 'var(--diagram-group-a)', groupB: 'var(--diagram-related)',
};
const GROUP_BORDER = { groupA: '#ffb766', groupB: '#8ec5ff' };
const MARK = { g: '#8fdc8f', r: '#ff9e9e', o: '#ffb766', b: '#8ec5ff', p: '#d1b0ff' };

function expand(s) {
  if (/^\d-\d$/.test(s)) { const [a, b] = s.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
  return s.split('').map(Number);
}
// "r1-3c2 r5c147 b5" -> ["r1c2", ...]
export function cells(expr) {
  const out = [];
  for (const tok of String(expr).trim().split(/\s+/)) {
    if (!tok) continue;
    let m = tok.match(/^b(\d+)$/);
    if (m) { for (const b of expand(m[1])) { const r0 = Math.floor((b - 1) / 3) * 3, c0 = ((b - 1) % 3) * 3; for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) out.push(`r${r0 + r}c${c0 + c}`); } continue; }
    m = tok.match(/^r([\d-]+)c([\d-]+)$/);
    if (!m) throw new Error('bad cell ' + tok);
    for (const r of expand(m[1])) for (const c of expand(m[2])) out.push(`r${r}c${c}`);
  }
  return out;
}
const rc = id => { const m = id.match(/^r(\d)c(\d)$/); return [+m[1], +m[2]]; };
const xy = id => { const [r, c] = rc(id); return [P + (c - 1) * S, P + (r - 1) * S]; };
const pairs = s => (s || '').trim().split(/\s+/).filter(Boolean).map(t => { const [e, v] = t.split(':'); return [e, v]; });
const candPos = (id, d) => { const [x, y] = xy(id); return [x + (((d - 1) % 3) + 0.5) * S / 3, y + (Math.floor((d - 1) / 3) + 0.5) * S / 3]; };

function el(tag, attrs, parent, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// The state after step k; a frame (of a looping step) is applied on top, like one more step.
export function accumulate(spec, k, frame) {
  const st = { shade: {}, marks: {}, elims: {}, solve: {}, links: [], tags: null, ring: [], arrows: [] };
  const list = [...spec.steps.slice(0, k + 1), ...(frame ? [frame] : [])];
  for (const s of list) {
    if (s.reset) { st.shade = {}; st.links = []; st.ring = []; st.arrows = []; st.elims = {}; st.solve = {}; }
    for (const [expr, col] of Object.entries(s.shade || {})) for (const c of cells(expr)) st.shade[c] = col;
    for (const [expr, ds, col] of s.mark || []) for (const c of cells(expr)) for (const d of ds) (st.marks[c] ||= {})[d] = col;
    for (const [expr, ds] of s.elim || []) for (const c of cells(expr)) for (const d of ds) (st.elims[c] ||= new Set()).add(+d);
    for (const [c, v] of pairs(s.solve)) st.solve[c] = v;
    st.links.push(...(s.links || []));
    st.ring.push(...(s.ring || []));
    st.arrows = s.arrows || [];
    if (s.tags !== undefined) st.tags = s.tags;
  }
  // The targets have the same background in Eliminate and Why.
  // Intermediate strikes in a proof don't become target cells.
  const step = spec.steps[k];
  const targets = step.frames ? (step.proof ? [] : spec.steps[k - 1]?.elim || []) : Object.entries(st.elims);
  for (const [expr] of targets) for (const id of cells(expr)) st.shade[id] = 'target';
  return st;
}

// anim: animate what this step adds (shading fades, marks pop, arrows draw, strikes follow the arrow).
function draw(svg, spec, k, anim, frame) {
  svg.textContent = '';
  const st = accumulate(spec, k, frame);
  const prev = !anim ? null : frame ? accumulate(spec, k) : k > 0 ? accumulate(spec, k - 1) : accumulate({ steps: [{}] }, 0);
  const center = id => xy(id).map(v => v + S / 2);
  // When this step draws arrows, what they rule out appears as an arrow passes its cell; the rest after them.
  const arrowDelay = (id, rest = 1.05) => {
    if (!anim || !st.arrows.length) return 0;
    let best = null;
    for (const [a, b, d = 0] of st.arrows) {
      const [x1, y1] = center(a), [x2, y2] = center(b), [px, py] = center(id);
      const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1, t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / L2));
      if (Math.hypot(x1 + t * (x2 - x1) - px, y1 + t * (y2 - y1) - py) < S * 0.6) best = Math.min(best ?? 9, d + 0.15 + t * 0.9);
    }
    return best ?? rest;
  };
  const g = el('g', {}, svg);
  el('rect', { x: P, y: P, width: 9 * S, height: 9 * S, fill: '#fffdf8' }, g);
  // region shading (jigsaw)
  const jig = spec.jig ? spec.jig.replace(/\s+/g, '') : null;
  const jcol = spec.jigColors || {};
  if (jig) for (let i = 0; i < 81; i++) { const ch = jig[i]; if (jcol[ch]) { const id = `r${Math.floor(i / 9) + 1}c${i % 9 + 1}`; const [x, y] = xy(id); el('rect', { x, y, width: S, height: S, fill: jcol[ch] }, g); } }
  for (const [id, col] of Object.entries(st.shade)) { const [x, y] = xy(id); el('rect', { x, y, width: S, height: S, fill: SHADE[col], class: prev && prev.shade[id] !== col ? 'fade' : '', style: prev && prev.shade[id] !== col ? `animation-delay:${arrowDelay(id, 0)}s` : '' }, g); }
  // grid
  for (let i = 0; i <= 9; i++) {
    const t = jig ? 0.6 : (i % 3 ? 0.6 : 2.4), c = '#3b3631';
    if (!jig || i === 0 || i === 9) {
      const w = (i === 0 || i === 9) ? 2.4 : t;
      el('line', { x1: P + i * S, y1: P, x2: P + i * S, y2: P + 9 * S, stroke: c, 'stroke-width': w }, g);
      el('line', { x1: P, y1: P + i * S, x2: P + 9 * S, y2: P + i * S, stroke: c, 'stroke-width': w }, g);
    } else {
      el('line', { x1: P + i * S, y1: P, x2: P + i * S, y2: P + 9 * S, stroke: '#b9b2a6', 'stroke-width': 0.6 }, g);
      el('line', { x1: P, y1: P + i * S, x2: P + 9 * S, y2: P + i * S, stroke: '#b9b2a6', 'stroke-width': 0.6 }, g);
    }
  }
  if (jig) {
    const at = (r, c) => (r < 0 || r > 8 || c < 0 || c > 8) ? '#' : jig[r * 9 + c];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const a = at(r, c);
      if (c < 8) { const b = at(r, c + 1); if (a !== b && (a !== '.' || b !== '.')) el('line', { x1: P + (c + 1) * S, y1: P + r * S, x2: P + (c + 1) * S, y2: P + (r + 1) * S, stroke: '#3b3631', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, g); }
      if (r < 8) { const b = at(r + 1, c); if (a !== b && (a !== '.' || b !== '.')) el('line', { x1: P + c * S, y1: P + (r + 1) * S, x2: P + (c + 1) * S, y2: P + (r + 1) * S, stroke: '#3b3631', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, g); }
    }
  }
  for (const [side, index, value, direction] of spec.outside || []) {
    const mid = P + (index - 0.5) * S;
    const [x, y] = side === 'left' ? [P - 16, mid] : side === 'right' ? [W - P + 16, mid] : side === 'top' ? [mid, P - 16] : [mid, W - P + 16];
    if (side === 'top' && direction === 'se') {
      // Aim at the entry cell's top-left corner, along the diagonal through its centre.
      const tx = mid - S / 2 + 2, ty = P + 2;
      el('text', { x: tx - 24, y: ty - 12, 'text-anchor': 'middle', 'font-size': 16, fill: '#3b3631', 'font-weight': 700 }, g, value);
      el('path', { d: `M${tx - 13},${ty - 13} L${tx},${ty} m-6,0 h6 v-6`, fill: 'none', stroke: '#3b3631', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    } else {
      el('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 16, fill: '#3b3631', 'font-weight': 700 }, g, value);
    }
  }
  // variant lines
  for (const ln of spec.lines || []) {
    const pts = cells(ln.cells).map(id => { const [x, y] = xy(id); return [x + S / 2, y + S / 2]; });
    const d = pts.map(p => p.join(',')).join(' ');
    const sty = { whisper: ['#5fcf5f', 8], renban: ['#c58cf0', 12], thermo: ['#bdbdbd', 11], arrow: ['#9a948a', 2], region: ['#6fb6ff', 8], plain: ['#8c847c', 6], between: ['#7096ac', 5] }[ln.kind];
    el('polyline', { points: d, fill: 'none', stroke: sty[0], 'stroke-width': sty[1], 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: spec.cands ? 0.45 : 0.85 }, g);
    if (ln.kind === 'between') for (const [x, y] of [pts[0], pts.at(-1)]) el('circle', { cx: x, cy: y, r: 15, fill: '#e0ebef', stroke: '#7096ac', 'stroke-width': 2 }, g);
    if (ln.kind === 'thermo') el('circle', { cx: pts[0][0], cy: pts[0][1], r: 15, fill: '#bdbdbd', opacity: spec.cands ? 0.45 : 1 }, g);
    if (ln.kind === 'arrow') {
      el('circle', { cx: pts[0][0], cy: pts[0][1], r: 17, fill: '#fffdf8', stroke: '#9a948a', 'stroke-width': 2 }, g);
      const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const tip = [b[0] + 6 * Math.cos(ang), b[1] + 6 * Math.sin(ang)];
      for (const s of [-1, 1]) el('line', { x1: tip[0], y1: tip[1], x2: tip[0] - 10 * Math.cos(ang + s * 0.6), y2: tip[1] - 10 * Math.sin(ang + s * 0.6), stroke: '#9a948a', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
    }
  }
  // cages
  for (const cage of spec.cages || []) {
    const set = new Set(cells(cage.cells)), d = 4;
    for (const id of set) {
      const [r, c] = rc(id), [x, y] = xy(id), has = (rr, cc) => set.has(`r${rr}c${cc}`);
      const attrs = { stroke: '#3b3631', 'stroke-width': 1, 'stroke-dasharray': '3 2.5' };
      const L = has(r, c - 1), R = has(r, c + 1), U = has(r - 1, c), D = has(r + 1, c);
      if (!U) el('line', { ...attrs, x1: x + (L ? 0 : d), y1: y + d, x2: x + S - (R ? 0 : d), y2: y + d }, g);
      if (!D) el('line', { ...attrs, x1: x + (L ? 0 : d), y1: y + S - d, x2: x + S - (R ? 0 : d), y2: y + S - d }, g);
      if (!L) el('line', { ...attrs, x1: x + d, y1: y + (U ? 0 : d), x2: x + d, y2: y + S - (D ? 0 : d) }, g);
      if (!R) el('line', { ...attrs, x1: x + S - d, y1: y + (U ? 0 : d), x2: x + S - d, y2: y + S - (D ? 0 : d) }, g);
    }
  }
  // kropki dots
  for (const [id, kind] of Object.entries(spec.parity || {})) {
    const [x, y] = xy(id), cx = x + S / 2, cy = y + S / 2;
    if (kind === 'odd') el('circle', { cx, cy, r: 15, fill: '#d5d1cb' }, g);
    else el('rect', { x: cx - 14, y: cy - 14, width: 28, height: 28, fill: '#d5d1cb' }, g);
  }
  for (const [a, b, label] of spec.edges || []) {
    const [xa, ya] = xy(a), [xb, yb] = xy(b), cx = (xa + xb + S) / 2, cy = (ya + yb + S) / 2;
    el('circle', { cx, cy, r: label.length > 1 ? 11 : 8, fill: '#fffdf8', stroke: '#6a6057' }, g);
    el('text', { x: cx, y: cy + 3, 'text-anchor': 'middle', 'font-size': 10, 'font-family': 'system-ui' }, g, label);
  }
  for (const [a, b, kind] of spec.dots || []) {
    const [xa, ya] = xy(a), [xb, yb] = xy(b);
    el('circle', { cx: (xa + xb) / 2 + S / 2, cy: (ya + yb) / 2 + S / 2, r: 6, fill: kind === 'b' ? '#2b2622' : '#fff', stroke: '#2b2622', 'stroke-width': 1.5 }, g);
  }
  // ring outlines (dashed groups)
  for (const [expr, col] of st.ring) for (const id of cells(expr)) { const [x, y] = xy(id); el('rect', { x: x + 3, y: y + 3, width: S - 6, height: S - 6, fill: 'none', stroke: GROUP_BORDER[col], 'stroke-width': 3, rx: 6 }, g); }
  // direction arrows [from, to], drawn under the digits
  for (const [fa, fb, d = 0] of st.arrows) {
    const [x1, y1] = center(fa), [x2, y2] = center(fb), ang = Math.atan2(y2 - y1, x2 - x1);
    const ex = x2 - 12 * Math.cos(ang), ey = y2 - 12 * Math.sin(ang);
    el('line', { x1, y1, x2: ex, y2: ey, stroke: '#b4532a', 'stroke-width': 8, 'stroke-linecap': 'round', opacity: 0.4, pathLength: 1, class: anim ? 'draw' : '', style: anim ? `animation-delay:${d}s` : '' }, g);
    const head = [[x2, y2], [ex - 11 * Math.sin(ang), ey + 11 * Math.cos(ang)], [ex + 11 * Math.sin(ang), ey - 11 * Math.cos(ang)]];
    el('polygon', { points: head.map(p => p.join(',')).join(' '), fill: '#b4532a', opacity: 0.5, class: anim ? 'fade' : '', style: anim ? `animation-delay:${d + 0.9}s` : '' }, g);
  }
  // digits
  for (const [id, v] of pairs(spec.givens)) { const [x, y] = xy(id); el('text', { x: x + S / 2, y: y + S / 2 + 9, 'text-anchor': 'middle', 'font-size': 26, fill: '#2b2622', 'font-weight': 600 }, g, v); }
  for (const [id, v] of pairs(spec.placed)) { const [x, y] = xy(id); el('text', { x: x + S / 2, y: y + S / 2 + 9, 'text-anchor': 'middle', 'font-size': 26, fill: '#2f6fd6' }, g, v); }
  for (const [id, v] of Object.entries(st.solve)) { const [x, y] = xy(id); const sg = el('g', { class: prev && !prev.solve[id] ? 'pop' : '', style: prev && !prev.solve[id] ? `animation-delay:${frame ? (frame.placeAt?.[id] ?? 0) : arrowDelay(id)}s` : '' }, g); el('circle', { cx: x + S / 2, cy: y + S / 2, r: 17, fill: '#dff0ff' }, sg); el('text', { x: x + S / 2, y: y + S / 2 + 9, 'text-anchor': 'middle', 'font-size': 26, fill: '#1f5fcf', 'font-weight': 600 }, sg, v); }
  for (const cage of spec.cages || []) {
    const first = cells(cage.cells).sort((a, b) => { const [ra, ca] = rc(a), [rb, cb] = rc(b); return ra - rb || ca - cb; })[0];
    const [x, y] = xy(first);
    el('rect', { x: x + 2, y: y + 2, width: String(cage.sum).length * 6 + 4, height: 11, fill: '#fffdf8' }, g);
    el('text', { x: x + 4, y: y + 11, 'font-size': 10, fill: '#3b3631', 'font-weight': 600 }, g, cage.sum);
  }
  // candidates
  for (const [id, ds] of pairs(spec.cands)) {
    const until = anim && frame?.placeAt?.[id];
    if (st.solve[id] && !until) continue;
    const notes = until ? el('g', { class: 'until-placed', style: `animation-delay:${until}s` }, g) : g;
    for (const ch of ds) {
      const d = +ch; let [cx, cy] = candPos(id, d); let fs = 11;
      if (spec.focus) { const [x, y] = xy(id); cx = x + S / 2; cy = y + S / 2; fs = 18; }
      const m = st.marks[id]?.[d], gone = st.elims[id]?.has(d);
      const newGone = prev && gone && !prev.elims[id]?.has(d), newMark = prev && m && !gone && prev.marks[id]?.[d] !== m;
      // A candidate struck in this step stays visible as it was until its strike pops in on top.
      if (newGone) {
        const was = prev.marks[id]?.[d];
        if (was) el('circle', { cx, cy: cy - 0.5, r: spec.focus ? 13 : 7, fill: MARK[was] || was }, notes);
        el('text', { x: cx, y: cy + fs * 0.36, 'text-anchor': 'middle', 'font-size': fs, fill: '#4d463f', 'font-weight': was ? 700 : 400 }, notes, d);
      }
      const cg = el('g', { class: newGone || newMark ? 'pop' : '', style: newGone ? `animation-delay:${frame?.strikeAt?.[id] ?? arrowDelay(id)}s` : '' }, notes);
      if (gone) el('circle', { cx, cy: cy - 0.5, r: spec.focus ? 13 : 7, fill: MARK.r }, cg);
      else if (m) el('circle', { cx, cy: cy - 0.5, r: spec.focus ? 13 : 7, fill: MARK[m] || m }, cg);
      el('text', { x: cx, y: cy + fs * 0.36, 'text-anchor': 'middle', 'font-size': fs, fill: gone ? '#b21f1f' : '#4d463f', 'font-weight': m || gone ? 700 : 400 }, cg, d);
      if (gone) el('line', { x1: cx - (spec.focus ? 10 : 6), y1: cy + (spec.focus ? 9 : 5), x2: cx + (spec.focus ? 10 : 6), y2: cy - (spec.focus ? 9 : 5), stroke: '#b21f1f', 'stroke-width': 1.6 }, cg);
    }
  }
  // chain links: [from "r1c1:7", to "r1c5:7", "s"|"w"]
  for (const [a, b, kind] of st.links) {
    const [ia, da] = a.split(':'), [ib, db] = b.split(':');
    const cen = (id, d) => { if (spec.focus) { const [x, y] = xy(id); return [x + S / 2, y + S / 2]; } return candPos(id, +d); };
    const [x1, y1] = cen(ia, da), [x2, y2] = cen(ib, db);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1, bend = Math.min(26, len * 0.18);
    const qx = mx - (y2 - y1) / len * bend, qy = my + (x2 - x1) / len * bend;
    el('path', { d: `M${x1},${y1} Q${qx},${qy} ${x2},${y2}`, fill: 'none', stroke: kind === 'w' ? '#d0532b' : '#2c7a3a', 'stroke-width': 2.2, 'stroke-dasharray': kind === 'w' ? '5 4' : '', opacity: 0.9, class: prev && !prev.links.some(l => l.join() === [a, b, kind].join()) ? 'fade' : '' }, g);
  }
  // tags: { "r1c1": "+1" } or a function(id) -> text
  if (st.tags) {
    const tags = typeof st.tags === 'function' ? Object.fromEntries(cells('r1-9c1-9').map(id => [id, st.tags(id)]).filter(([, v]) => v != null && v !== '')) : st.tags;
    const printed = new Set([...pairs(spec.givens), ...pairs(spec.placed)].map(([id]) => id));
    for (const [expr, v] of Object.entries(tags)) for (const id of cells(expr)) {
      const [x, y] = xy(id), besideDigit = Boolean(st.solve[id]) || printed.has(id);
      el('text', { x: x + (besideDigit ? S - (String(v).length > 1 ? 10 : 6) : S / 2), y: y + (besideDigit ? 12 : S / 2 + 6), 'text-anchor': 'middle', 'font-size': besideDigit ? 11 : 16, fill: '#5a4a3a', 'font-weight': 700, opacity: 0.85 }, g, v);
    }
  }
}

export function figure(spec) {
  const wrap = document.createElement('figure');
  wrap.className = 'fig';
  const left = (spec.outside || []).some(([side]) => side === 'left') ? 30 : 0;
  const right = (spec.outside || []).some(([side]) => side === 'right') ? 30 : 0;
  const top = (spec.outside || []).some(([side]) => side === 'top') ? 30 : 0;
  const bottom = (spec.outside || []).some(([side]) => side === 'bottom') ? 30 : 0;
  const svg = el('svg', { viewBox: `${-left} ${-top} ${W + left + right} ${W + top + bottom}`, role: 'img', 'aria-label': spec.alt || 'Sudoku diagram' });
  const side = document.createElement('div'); side.className = 'fig-side';
  const tabs = document.createElement('div'); tabs.className = 'steps';
  const text = document.createElement('div'); text.className = 'step-text';
  const nav = document.createElement('div'); nav.className = 'nav';
  const prev = Object.assign(document.createElement('button'), { textContent: '← Back' });
  const next = Object.assign(document.createElement('button'), { textContent: 'Next step →', className: 'primary' });
  nav.append(prev, next);
  let k = 0, shown = false, timer = 0;
  const btns = spec.steps.map((s, i) => { const b = Object.assign(document.createElement('button'), { textContent: `${i + 1}. ${s.t}` }); b.onclick = () => show(i); tabs.appendChild(b); return b; });
  function show(i) {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches, anim = shown && !still; shown = true;
    clearInterval(timer);
    k = i;
    const step = spec.steps[k];
    if (step.frames) {
      // A looping step: play each frame in turn (e.g. one per case), forever, while the step is shown.
      let f = 0;
      const play = () => { const fr = step.frames[f]; draw(svg, spec, k, !still, fr); text.innerHTML = `${step.text}<p class="frame">▶ ${fr.t}</p>`; f = (f + 1) % step.frames.length; };
      play(); timer = setInterval(play, step.hold || 4500);
    } else { draw(svg, spec, k, anim); text.innerHTML = step.text; }
    btns.forEach((b, j) => b.classList.toggle('on', j === k));
    prev.disabled = k === 0; next.disabled = k === spec.steps.length - 1;
  }
  prev.onclick = () => k > 0 && show(k - 1);
  next.onclick = () => k < spec.steps.length - 1 && show(k + 1);
  side.append(tabs, text, nav);
  const box = document.createElement('div'); box.className = 'svgbox'; box.appendChild(svg);
  wrap.append(box, side);
  show(0);
  wrap.dispose = () => clearInterval(timer);
  return wrap;
}
