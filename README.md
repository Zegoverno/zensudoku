# zensudoku

Sudoku with value, corner and center notes, six cell colors, undo and redo, hints and conflict
marking. It also plays [SudokuPad](https://sudokupad.app) puzzles, drawn the way SudokuPad draws
them, from a source you import or from a local library of your own. One code base, three ways to run it:

- a **PWA**: static files, installable on desktop and Android, works offline;
- a **[zenbot](https://github.com/Zegoverno/zenbot) plugin**: an entry in the Games tab, a Sudoku helper side view, a `/sudoku` command, and a coaching skill;
- an **MCP App**: the board as an inline widget in any host that supports
  [MCP Apps](https://modelcontextprotocol.io) (Claude, ChatGPT and others), with tools the agent can call.

MIT licensed. No account, no score, no network, no telemetry: progress stays on your device.
The plugin asks zenbot for no permissions (`kernel: []`): it reads only its own data folder (the local
library, below) and writes no files.

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
| l | the puzzle picker |

Placing a digit clears that cell's notes. With **Auto-clear notes** on (the default),
it also removes that digit from corner and center notes in the same row, column or region.
Undo and redo include the placement and all its changes in one step. The switch is
saved on this device; in zenbot it is also available as **Toggle auto-clear notes**.
Givens are protected. A repeated digit, or a broken
variant rule, marks the cells and says why. A finished board is locked. **Hint** points at one
cell (a naked or hidden single) and explains it; it never places the digit.

**Enter a puzzle** takes 81 characters, row by row: digits 1–9, `.` or `0` for a blank. It is played
only if it has exactly one solution, and it stays in the puzzle list.

The rules engine knows thirteen variants (classic, diagonal, killer, sandwich, thermo,
consecutive, non-consecutive, arrow, renban, Kropki, Little Killer, jigsaw, Samurai); `core/catalog.json`
holds the puzzles and takes more entries (see `parseCatalog` in `core/sudoku.ts`). v0 ships the
one classic example and no puzzle collection.

## SudokuPad puzzles

A SudokuPad source is what `https://sudokupad.app/api/puzzle/<id>` returns: `scl` (or `ctc`) and the
lz-string (base64) of SudokuPad's compact puzzle text, `fpuz` and the lz-string of an f-puzzles JSON, or the
compact text itself, starting with `{`. zensudoku reads it offline (`core/sudokupad.ts`) and draws it in
SudokuPad's layer order: shading and other underlays, lines and arrows, killer cages, grid lines and region
borders, overlays (dots, circles, clue text), with SudokuPad's sizes and colours. Clues outside the grid (sandwich,
skyscraper, Little Killer) are drawn around it; only the cells inside the regions are played. Black and white
follow the theme, as in SudokuPad's dark mode. From an f-puzzles source it draws what SudokuPad draws.

The board is any size up to 30 × 30, with digits 1 to N (N is the regions' size, at most 9). Notes, colors,
undo and redo and saved progress work as for any puzzle. The side panel shows the title, the author, the rules
and **Watch the solution** when the puzzle names a video. What zensudoku checks:

- repeats in rows, columns and regions, always;
- with a solution in the puzzle, the board against it;
- with no drawing beyond regions and shading, and the classic rules leaving only a few solutions (a "pick your
  difficulty" cell, say), any full board without repeats is solved, and **Hint** works as on a classic puzzle;
- otherwise a full board without repeats says *Board full, no repeats. The variant rules can't be checked here:
  compare with the solution video.* zensudoku does not enforce free-text variant rules, so it has no solving hints for these.

In the PWA, **Import a SudokuPad puzzle** takes a source, keeps it on this device and lists it under **Puzzles**.

## The local library

**Puzzles** (or `l`) brings together built-ins, entered/imported puzzles, and in zenbot the plugin's local data folder, `$ZEN_PLUGIN_DATA/library/`
(for zenbot, `~/.zenbot/plugin-data/zensudoku/library/`), grouped by collection, searchable by number, title or
author or tag, with ✓ for solved and • for started on this device. Put each puzzle in any subfolder as

- `<name>.json`: `{"id": "…", "source": "…", "collection": "…", "number": "…", "title": "…", "author": "…", "video": "https://…", "link": "https://…"}`;
  only `id` (letters, digits, `.`, `_`, `-`) and `source` are required. Optional filters use `difficulty`
  (`easy`, `medium`, `hard`) and `variants` (e.g. `["killer", "sandwich"]`). Optional `tags` are searchable.
  Missing or unrecognized metadata is unclassified; or
- `<name>.txt`: just a source; its id is the file name.

The list is sorted by collection, then number (or title), in natural order. Dot files are skipped; a file that
cannot be read, is not valid, repeats an id or is a link out of the library is listed as an error and left out.
The server only reads this folder. Hosts that give no data folder (Claude Desktop, the PWA) have no library.

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
  New game (`n`), Restart, Hint (`h`), Undo (`Mod+z`), Redo (`Mod+Shift+z`), Toggle notes and Puzzles (`l`), which show in zenbot's
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
| `zensudoku_new` | opens the example, `puzzle` (81 characters) after checking it has one solution, or a SudokuPad source; shows the board |
| `zensudoku_library` | the local library: id, collection, number, title and author (`query` filters), and how many files could not be read |
| `zensudoku_open` | opens a library puzzle by id, with its rules; shows the board |
| `zensudoku_state` | the board as a text grid with conflicts |
| `zensudoku_check` | conflicts, solved or not (or full but not checkable), and how many entries are wrong (a count only) |
| `zensudoku_hint` | one next logical step with its reason; never the solution |
| `zensudoku_report` | app only: the board tells the server what it shows |
| `zensudoku_puzzle` | app only: the source of a SudokuPad puzzle the server opened, so the board can draw it |

The board reports each change to the server and to the chat (`updateModelContext`), so the agent
sees what you see. The view is `ui://zensudoku/app`. Hosts that only speak remote (HTTP) MCP need a
bridge: this server speaks stdio only.

## Layout

```
core/        rules, game model, solver, hints, SudokuPad sources (sudokupad.ts): pure TypeScript, tested with vitest
ui/          the Svelte 5 app; host.ts is the MCP App entry, adapters.ts the storage seam
mcp/         the MCP server (bundled with all its dependencies into mcp/dist/server.js); library.ts reads the local library
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
another collection. SudokuPad puzzles you import or keep in the local library stay on your device; the tests use
small puzzles written for them.

## Sudoku helper

Hover, keyboard-focus, or tap a numbered killer cage or recognized sandwich clue on the board for
its digit combinations. Built-in sandwich clues and explicitly typed f-puzzles clues are recognized.
SudokuPad artwork is only recognized when an explicit, unambiguous outside-clue rule and the clue
position identify a sandwich sum. Other outside numbers remain ordinary artwork.

Open the collapsible **Sudoku helper** inside the game for the full calculators. It sits beside the
board on a wide screen and below it on a phone. The standalone zenbot helper view still works.

- **Selected cage:** a numbered cage shows every distinct-digit set for its sum and size.
  Sets that cannot contain the digits already entered in the cage are greyed out and crossed
  out. The helper does not test those sets against other grid constraints.
- **Killer calculator:** enter the sum and cell count; optionally type digits to include or
  exclude. Combinations are unordered sets, not placements.
- **Sandwich calculator:** enter a sum to see sets grouped by length, from digits 2–8
  on a 9×9 grid (2 through N−1 on smaller grids). A sum of 0 means an empty sandwich.
