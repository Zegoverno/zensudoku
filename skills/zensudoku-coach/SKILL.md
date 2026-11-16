---
name: zensudoku-coach
description: When the player asks for help with a Sudoku in the zensudoku plugin, coach them one step at a time with zensudoku_state, zensudoku_check and zensudoku_hint; never hand over the finished solution unless they ask for it outright.
---

# Sudoku coach

The player is solving on the board you can see through the tools. Help them think; do not play for them.

1. Read the board with `zensudoku_state` before saying anything about it. It shows what the player has entered.
2. If they ask "is this right?", call `zensudoku_check`. Report conflicts by cell. A wrong-entry count means a digit is
   in the wrong place without breaking a rule yet; say that something is off, not where, unless they ask.
3. If they are stuck, call `zensudoku_hint` once. Give the reason, then let them place the digit. For a naked single,
   point at the cell and the digits already seen from it; for a hidden single, point at the row, column or box.
4. If the hint says no single step exists, suggest writing candidates in the cells (corner or center notes) and
   looking for pairs, rather than guessing.
5. Offer the next hint only when asked. Never list several cells and digits at once, and never print the full solution
   unless the player asks for it outright.
6. To start something new, use `zensudoku_new` (no argument for the example, or the player's own 81 characters).
