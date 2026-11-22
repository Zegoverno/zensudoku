# zensudoku

Sudoku with value, corner and center notes, six cell colors, undo and redo, hints and conflict
marking. One code base, three ways to run it:

- a **PWA**: static files, installable on desktop and Android, works offline;
- a **[zenbot](https://github.com/Zegoverno/zenbot) plugin**: an entry in the Games tab, a `/sudoku` command, and a coaching skill;
- an **MCP App**: the board as an inline widget in any host that supports
  [MCP Apps](https://modelcontextprotocol.io) (Claude, ChatGPT and others), with tools the agent can call.

MIT licensed. No account, no score, no network, no telemetry: progress stays on your device.
The plugin asks zenbot for no permissions (`kernel: []`): it reads and writes no files.

## Play

The board shows one puzzle, *Example — classic*, which this repository's own generator made.
Click or tap a cell, then the pad, or use the keyboard:

| Key | Does |
|---|---|
| arrows | move |
| 1–9 | place a digit (or a note, in Corner or Center mode) |
| Shift+1–9 | corner note |
| v, c, m | Value, Corner, Center mode |
| Delete, Backspace, 0 | erase: the value, then the notes, then the color |
| Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y | undo, redo |

Placing a digit clears that cell's notes. Givens are protected. A repeated digit, or a broken
variant rule, marks the cells and says why. A finished board is locked. **Hint** points at one
cell (a naked or hidden single) and explains it; it never places the digit.

**Enter a puzzle** takes 81 characters, row by row: digits 1–9, `.` or `0` for a blank. It is played
only if it has exactly one solution, and it stays in the puzzle list.

The rules engine knows thirteen variants (classic, diagonal, killer, sandwich, thermo,
consecutive, non-consecutive, arrow, renban, Kropki, Little Killer, jigsaw, Samurai); `core/catalog.json`
holds the puzzles and takes more entries (see `parseCatalog` in `core/sudoku.ts`). v0 ships the
one classic example and no puzzle collection.

## Play it standalone (PWA)

```sh
npm ci
npm run build:pwa      # the PWA is in shells/web/dist
npm run dev            # or a development server
```

`shells/web/dist` is plain static files (relative URLs), so GitHub Pages, Cloudflare Pages or any
file server hosts it. Open it in a browser and use "Install" (desktop Chrome/Edge, Android) or
"Add to Home Screen" (iOS); after the first visit it works offline.

## Install it in zenbot

```sh
zen plugins add zensudoku
```

or **Settings → Marketplace → zensudoku** in the zenbot web app. To try a release archive or a local
build: `zen plugins add ./zensudoku-<version>.tgz` (see Releasing).

zenbot reads `plugin.json`: a game (*Sudoku*, in the **Games** tab), a `/sudoku` command that calls
`zensudoku_new` (in the web chat, in Matrix and from the `zen` CLI), a coaching skill, and no
permissions.

The board follows zenbot's host (MCP Apps host context), live:

- **Theme and look**: `theme` (light or dark) and the `--color-*`, `--border-radius-*`, `--font-*` and
  `--shadow-md` variables set every colour, radius and font; the accent (selection, active mode, notes) is
  `--color-ring-primary`. Each has a fallback, so the PWA and other hosts look right without them.
- **Size**: `containerDimensions` (resent on resize) sizes the board. A wide board pane puts the board
  beside its controls; a phone (390 px) or a narrow side panel gets one column with the board as wide as
  the container allows, and never a sideways scroll.
- **Keyboard**: the board takes part in zenbot's keyboard model (zenbot's `PLUGINS.md`, "Keys and commands"). It declares
  New game (`n`), Restart, Hint (`h`), Undo (`Mod+z`), Redo (`Mod+Shift+z`) and Toggle notes, which show in zenbot's
  ring and command list (a command that cannot run now is left out). Inside zenbot those keys are forwarded and zenbot
  sends the command back, so the owner can rebind them; the board keeps arrows, digits, `v`/`c`/`m`, Delete and Ctrl+Y.
  Every other keydown goes to zenbot (only Ctrl/Meta ones from the puzzle text box), and the board takes the focus when its panel does.
  Standalone and in other hosts nothing of this happens and Ctrl+Z, Ctrl+Shift+Z work as above.
- **Chrome**: when zenbot sends its `zen` context (`pane`, `phone`, `slot`, `headingFont`) it draws the
  title and the close ×, so the app draws none. `phone` drops the keyboard hints and enlarges touch targets.
  Hosts without `zen` get the app's own heading.

## Use it in Claude, ChatGPT or another MCP Apps host

Download `zensudoku-<version>.tgz` from the [releases](https://github.com/Zegoverno/zensudoku/releases),
unpack it, and add a stdio server whose command is `node` and whose argument is the absolute path of
`mcp/dist/server.js`. It is one self-contained file: it needs no `node_modules`, no environment and
no network. From a clone, `npm ci && npm run pack` makes the same folder layout in `dist/`.

The tools:

| Tool | Does |
|---|---|
| `zensudoku_new` | opens the example, or `puzzle` (81 characters) after checking it has one solution; shows the board |
| `zensudoku_state` | the board as a text grid with conflicts |
| `zensudoku_check` | conflicts, solved or not, and how many entries are wrong (a count only) |
| `zensudoku_hint` | one next logical step with its reason; never the solution |
| `zensudoku_report` | app only: the board tells the server what it shows |

The board reports each change to the server and to the chat (`updateModelContext`), so the agent
sees what you see. The view is `ui://zensudoku/app`. Hosts that only speak remote (HTTP) MCP need a
bridge: this server speaks stdio only.

## Layout

```
core/        rules, game model, solver, hints: pure TypeScript, tested with vitest
ui/          the Svelte 5 app; host.ts is the MCP App entry, adapters.ts the storage seam
mcp/         the MCP server (bundled with all its dependencies into mcp/dist/server.js)
shells/web/  the PWA: manifest, icons, service worker, entry
skills/      the coaching skill
scripts/     generate-example.ts makes the bundled puzzle from a seed; pack.mjs makes the release archive
tests/       MCP smoke test, release-archive test, Playwright end-to-end test
```

## Development

```sh
npm ci
npx playwright install chromium   # once, for the browser test
npm run check                     # svelte-check, unit tests, build, pack, archive test, MCP smoke test, browser test
npm run generate                  # rewrite core/catalog.json (a test checks it is reproducible)
```

Node 22.18 or newer (the scripts run TypeScript directly). The tests keep an independent reference
solver (`core/__tests__/reference.ts`) that shares no code with the rules, and compare the engine's
answers against it. `tests/pack-test.mjs` unpacks the release archive into a temporary folder
and runs the MCP smoke test against the extracted server.

## Releasing

1. Set the same `version` in `package.json` and `plugin.json`, commit.
2. `npm run pack` builds and writes `dist/zensudoku-<version>.tgz` and prints its sha256. The archive holds
   exactly `plugin.json`, `mcp/dist/server.js`, `ui/dist/index.html`, `skills/`, `README.md` and `LICENSE`,
   with relative paths and no links, dot files or `node_modules`.
3. Tag `v<version>` and push the tag. The release workflow runs the checks, verifies the tag equals
   `v<package version>` and `plugin.json`'s version, and publishes a GitHub release with the archive and
   its sha256 in the notes.
4. To list a new version in the zenbot marketplace, open a pull request there with the new `version`,
   `archive` URL and `sha256`.

## Puzzles and rights

The only bundled puzzle comes from `scripts/generate-example.ts`: a seeded random fill, then clues
removed while the solution stays unique. No puzzle in this repository comes from a book, a site or
another collection.
