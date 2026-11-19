// What the host tells the app about its surroundings, as reactive state the board lays itself out by.
// zenbot adds `zen: { pane, phone, slot, headingFont }` to the MCP Apps host context and sends
// `containerDimensions` on every resize; other hosts (Claude, ChatGPT) and the PWA send none of
// it, so every field has a neutral default: `zen` false, size 0 (unknown), and the board falls back
// to filling its column.
export interface HostView {
  /** zenbot is the host: it draws the title and the close ×, so the app draws none. */
  zen: boolean;
  pane: 'board' | 'side' | '';
  phone: boolean;
  slot: string;
  /** A CSS font-family for headings, or ''. */
  headingFont: string;
  /** The container in pixels; 0 when the host did not say. A maximum counts as the size. */
  width: number;
  height: number;
}

export const host: HostView = $state({ zen: false, pane: '', phone: false, slot: '', headingFont: '', width: 0, height: 0 });

const px = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
/** Plain family lists only: no declarations, braces or markup in a value that lands in a stylesheet. */
const family = (s: unknown) => (typeof s === 'string' && s.length <= 200 && !/[;{}<>\\]/.test(s) ? s.trim() : '');

/** Reads the host context (any shape, any host) into `host`. */
export function readHost(ctx: unknown): void {
  const c = (ctx && typeof ctx === 'object' ? ctx : {}) as { zen?: unknown; containerDimensions?: Record<string, unknown> };
  const zen = c.zen && typeof c.zen === 'object' ? c.zen as Record<string, unknown> : null;
  host.zen = !!zen;
  host.pane = zen?.pane === 'board' || zen?.pane === 'side' ? zen.pane : '';
  host.phone = zen?.phone === true;
  host.slot = typeof zen?.slot === 'string' ? zen.slot : '';
  host.headingFont = family(zen?.headingFont);
  const d = c.containerDimensions ?? {};
  host.width = px(d.width ?? d.maxWidth);
  host.height = px(d.height ?? d.maxHeight);
}
