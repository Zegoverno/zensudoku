// The opaque app iframe cannot use localStorage in zenbot. Keep its existing game snapshot in
// the plugin's own data directory, never in the installed package or in the library itself.
import { constants, closeSync, fstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { LIBRARY_PREFIX } from '../core/sudoku.ts';
import { MAX_SOURCE } from '../core/sudokupad.ts';
import { readLibrary } from './library.ts';
import { rememberImport } from './session.ts';
import type { SourceEntry } from '../ui/adapters.ts';

const MAX_BYTES = 8_000_000;
const snapshot = z.object({
  game: z.string().max(MAX_BYTES),
  sources: z.array(z.object({ id: z.string().regex(/^pad-[a-f0-9]{16}$/), source: z.string().max(MAX_SOURCE) })).max(200),
});
export const resumeInput = {
  save: snapshot.extend({ writer: z.string().regex(/^[a-f0-9]{32}$/), revision: z.number().int().positive() }).optional(),
};
// A frame sends saves immediately, so closing it doesn't cancel a debounced write. Ignore older
// requests if the host relays two writes from the same frame out of order.
const revisions = new Map<string, number>();
const file = () => process.env.ZEN_PLUGIN_DATA && join(process.env.ZEN_PLUGIN_DATA, 'resume-v1.json');

/** Read only the dedicated regular file; a missing or bad save is equivalent to no save. */
export function loadResume() {
  const name = file();
  if (!name) return {};
  const empty = { available: true };
  let fd: number | undefined;
  try {
    fd = openSync(name, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) return empty;
    const saved = snapshot.parse(JSON.parse(readFileSync(fd, 'utf8')));
    const { puzzleId, boards } = JSON.parse(saved.game);
    const ids = new Set([puzzleId, ...Object.keys(boards ?? {}).slice(0, 500)]);
    const sources: SourceEntry[] = saved.sources.filter(e => ids.has(e.id) && rememberImport(e.id, e.source));
    if ([...ids].some(id => typeof id === 'string' && id.startsWith(LIBRARY_PREFIX))) {
      const library = new Map(readLibrary().entries.map(e => [LIBRARY_PREFIX + e.id, e]));
      // Reload library sources from disk; deleted or unreadable puzzles aren't resurrected.
      for (const id of ids) {
        const entry = library.get(id);
        if (!entry) continue;
        const { source, file: _, link: _link, ...info } = entry;
        sources.push({ id, source, library: info });
      }
    }
    return { ...empty, game: saved.game, sources };
  } catch { return empty; }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function saveResume({ writer, revision, ...save }: NonNullable<z.infer<typeof resumeInput.save>>): boolean {
  const name = file();
  if (!name) return false;
  if (revision <= (revisions.get(writer) ?? 0)) return true;
  const raw = JSON.stringify(save);
  if (Buffer.byteLength(raw) > MAX_BYTES) return false;
  const temp = name + '.' + randomUUID();
  try {
    writeFileSync(temp, raw, { mode: 0o600, flag: 'wx' });
    renameSync(temp, name);
    revisions.delete(writer);
    revisions.set(writer, revision);
    if (revisions.size > 100) revisions.delete(revisions.keys().next().value!);
    return true;
  } catch {
    try { unlinkSync(temp); } catch { /* no temporary file */ }
    return false;
  }
}
