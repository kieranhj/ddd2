# Spike: four strips scrolled in software on a Model B

*`spikes/swscroll/`, built and measured 2026-11-07, jsbeeb MCP (`B-DFS1.2`, a Model B). Asked by
the owner the same day: "Model B would be preferable. Can we spike the software scrolling idea to
see if it's feasible?"*

## Why not the hardware

Each player's strip is the original's band of 7 MODE 2 character rows: 4,480 bytes. A CRTC
rupture can give each strip its own start address, but the strips scroll at different speeds, so
they cannot share the one hardware wrap ring. Each strip then needs a doubled buffer (8,960
bytes), and four of them come to 35,840 bytes, more than a Model B has. A Master 128 could split
them between main and shadow RAM; the owner prefers the Model B.

## Why software is cheap here

The original's scene is sparse:

- **The sky is black.**
- **The ground does not change when it scrolls.** The ground character is
  `VDU 23,250,255,255,255,255,0,0,0,0` (DENIS line 40): four solid lines, the same at every
  column.
- **Obstacles are 8x16-pixel sprites,** 4 columns wide and two character rows tall, plotted with
  `STA` and carrying their own black background (`plot_sprite`).
- **Holes are 16 pixels wide** (two `sprite_blank`s side by side).

So scrolling a strip by d columns means:

- **Each visible obstacle:** redraw it d columns to the left and clear the d columns it moved off.
- **Each hole:** open d columns at its leading edge and close d columns at its trailing edge.
- **The rider** stays at a fixed column and is redrawn over whatever passed under it.

Nothing else is touched.

## What was built

- **Code and data:** 1,649 bytes at `&1900`-`&1F70`. The MOS stays in, with `VDU 22,2` for the mode and
  `OSBYTE 19` for v-sync. The screen is the original's: strip k's obstacles are on character rows
  7+7k and 8+7k, and its ground on row 9+7k.
- **Sprites:** taken from our rebuilt DENIS3 (`make_data.py`) and stored column by column.
- **Course:** a seeded stand-in, not the original's levels. It has 196 objects over 8,000
  columns, 46 of them holes, spaced 20-48 columns apart.
- **Riders:** each strip has one at column 12, at its own speed: 1.00, 1.50, 2.25 and 2.93
  columns a frame. 2.93 is the original's top speed: `update_player` adds velocity x 3/256, and
  velocity is capped at 250.
- **Code style:** plain on purpose. One `JSR` per column, 8-byte loops through `(zp),Y`, and the
  rider redrawn on every frame its strip moves.

## Measured

| What | Result |
|---|---|
| Picture | obstacles and holes move in step with each strip's speed. Holes open and close cleanly, and the rider is drawn over a passing grave (screenshot, frame 185) |
| Rate, mixed speeds | **100 loop passes in 100 fields** (`frames` 91 to 191) |
| Rate, all four at 2.93 | **100 in 100** (`frames` 191 to 291) |
| Update cost, all four at 0.98 - the original's real top speed per field (step 2) | **21,987 - 23,510 cycles** over four frames: hardly less. The cost is redrawing every visible object each time its strip moves, not the distance |
| Update cost, all four at 2.93 (3x the real top speed; see step 2) | **25,158 - 27,328 cycles** from `frame_start` to `frame_end`, over four frames. That includes the MOS interrupts that land inside it, and is 63-68% of a 40,000-cycle field |

## What it says

**Feasible.** The plain version already holds 50 Hz with all four riders at top speed. The room
it leaves for the game is too small, but the costs are easy to see.

**Estimate, not yet measured:** the bulk is two things.

- **The 16-byte column copy through `(zp),Y` with a `JSR` per column.** An unrolled copy with
  self-modified absolute addresses runs at about 9 cycles a byte instead of about 20.
- **The rider redraw.** It is about a quarter of the total, and is only needed when something is
  passing under the rider.

Together these should bring the worst case to roughly 8-12K cycles.

## Not answered yet

- **Tearing.** The spike draws straight onto the displayed screen. If a strip is redrawn while
  the raster is passing through it, the picture tears. The cure is to order the strip updates
  behind the raster, or to time each strip's redraw into the gap after the raster leaves it,
  which needs IRQ1V and a timer. jsbeeb screenshots will not show it reliably; this needs b2 or
  real hardware.
- **The original's own frame rate**, so the sequel's speed matches: PLAN.md step 2.
- **The rest of the game's cost:** jumping, collisions, enemies, the panel, sound and the keys.
