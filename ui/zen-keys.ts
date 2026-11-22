// How the board takes part in zenbot's keyboard model (zenbot PLUGINS.md, "Keys and commands").
// Only under a zen host: the board declares its commands (`zen/commands`), forwards the keys it does not
// use (`zen/key`), and runs a command when the host picks one (`zen/command`); `zen/focus` puts the focus
// on the board. Standalone and in other hosts none of this happens (host.ts only wires it under `zen`).
// Pure functions, so they are unit tested without a browser.

/** What the board can do right now; a command that cannot run is not declared. */
export interface Avail { next: boolean; hint: boolean; notes: boolean; undo: boolean; redo: boolean }

export type CommandId = 'new-game' | 'restart' | 'hint' | 'undo' | 'redo' | 'toggle-notes';

export interface ZenCommand { id: CommandId; title: string; key?: string; ring?: true }

/**
 * The declared commands, in the order the ring shows them (zenbot takes the first four with `ring`).
 * Keys follow zenbot's key form. The board's own keys (arrows, digits, v/c/m for the entry mode,
 * Delete) are not commands: they stay the board's, so "Toggle notes" has no default shortcut.
 */
export function commandList(a: Avail): ZenCommand[] {
  const all: [boolean, ZenCommand][] = [
    [a.next, { id: 'new-game', title: 'New game', key: 'n', ring: true }],
    [true, { id: 'restart', title: 'Restart', ring: true }],
    [a.hint, { id: 'hint', title: 'Hint', key: 'h', ring: true }],
    [a.undo, { id: 'undo', title: 'Undo', key: 'Mod+z', ring: true }],
    [a.redo, { id: 'redo', title: 'Redo', key: 'Mod+Shift+z' }],
    [a.notes, { id: 'toggle-notes', title: 'Toggle notes' }],
  ];
  return all.filter(([ok]) => ok).map(([, c]) => c);
}

/** The `zen/key` payload of a keydown: the event's own fields, and whether focus is in a text field. */
export function keyPayload(e: KeyboardEvent, typing: boolean) {
  return { key: e.key, code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey, typing };
}

/** Whether a keydown the board did not handle goes to zenbot: all of them, but only Ctrl/Meta ones while typing. */
export const shouldForward = (e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>, typing: boolean): boolean => !typing || e.ctrlKey || e.metaKey;

/** Reads a `zen/command` or `zen/focus` notification's params defensively. */
export function commandId(params: unknown): CommandId | null {
  const id = (params as { id?: unknown } | null)?.id;
  return typeof id === 'string' && ['new-game', 'restart', 'hint', 'undo', 'redo', 'toggle-notes'].includes(id) ? (id as CommandId) : null;
}
export const focused = (params: unknown): boolean => (params as { focused?: unknown } | null)?.focused === true;
