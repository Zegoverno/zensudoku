import { describe, expect, it } from 'vitest';
import { commandId, commandList, focused, keyPayload, shouldForward } from './zen-keys.ts';

const all = { next: true, hint: true, notes: true, undo: true, redo: true };

describe('commandList', () => {
  it('declares the game commands in ring order with zenbot key forms', () => {
    expect(commandList(all)).toEqual([
      { id: 'new-game', title: 'New game', key: 'n', ring: true },
      { id: 'restart', title: 'Restart', ring: true },
      { id: 'hint', title: 'Hint', key: 'h', ring: true },
      { id: 'undo', title: 'Undo', key: 'Mod+z', ring: true },
      { id: 'redo', title: 'Redo', key: 'Mod+Shift+z' },
      { id: 'toggle-notes', title: 'Toggle notes' },
    ]);
  });
  it('leaves out what cannot run now, keeps restart', () => {
    const ids = commandList({ next: false, hint: false, notes: false, undo: false, redo: true }).map(c => c.id);
    expect(ids).toEqual(['restart', 'redo']);
  });
  it('respects the contract: id, title, key shapes, at most four ring commands', () => {
    const list = commandList(all);
    expect(list.length).toBeLessThanOrEqual(30);
    expect(list.filter(c => c.ring).length).toBeLessThanOrEqual(4);
    for (const c of list) {
      expect(c.id).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(c.title.length).toBeLessThanOrEqual(60);
      if (c.key) expect(c.key).toMatch(/^(Mod\+)?(Alt\+)?(Shift\+)?[a-z]$/);
    }
    // keys zenbot keeps for itself, and the board's own keys, are not declared
    const reserved = ['Mod+k', 'Mod+.', 'Mod+\\', 'Mod+Shift+\\', '?', 'Escape', 'g', 'v', 'c', 'm'];
    expect(list.map(c => c.key).filter(k => k && reserved.includes(k))).toEqual([]);
  });
});

describe('keys', () => {
  const ev = (o: Partial<KeyboardEvent>) => ({ key: 'n', code: 'KeyN', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o }) as KeyboardEvent;
  it('builds the zen/key payload from the event', () => {
    expect(keyPayload(ev({ key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true }), false)).toEqual({ key: 'z', code: 'KeyZ', ctrl: true, meta: false, alt: false, shift: true, typing: false });
    expect(keyPayload(ev({}), true).typing).toBe(true);
  });
  it('forwards everything outside text fields, only Ctrl/Meta ones inside', () => {
    expect(shouldForward(ev({}), false)).toBe(true);
    expect(shouldForward(ev({}), true)).toBe(false);
    expect(shouldForward(ev({ ctrlKey: true }), true)).toBe(true);
    expect(shouldForward(ev({ metaKey: true }), true)).toBe(true);
  });
  it('reads notification params defensively', () => {
    expect(commandId({ id: 'undo' })).toBe('undo');
    expect(commandId({ id: 'rm-rf' })).toBeNull();
    expect(commandId(undefined)).toBeNull();
    expect(focused({ focused: true })).toBe(true);
    expect(focused({ focused: false })).toBe(false);
    expect(focused(null)).toBe(false);
  });
});
