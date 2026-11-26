<div align="center">

<img src="img/logo.png" alt="Moon Lit" width="200" />

# Moon Lit

**A lantern-festival bubble shooter for [Paul's Arcade](https://paulgibeault.github.io/).**

<a href="https://paulgibeault.github.io/">
  <img src="https://img.shields.io/badge/▶%20PLAY%20NOW-Paul's%20Arcade-0E1538?style=for-the-badge&labelColor=F4A261&color=0E1538" alt="Play Now on Paul's Arcade" height="60" />
</a>

</div>

---

## About

> *"Float a lantern. Steady the moon. Don't let the trellis touch the water."*

Moon Lit is a bubble shooter dressed in the quiet of a midsummer night
festival. A boatman launches paper lanterns up into a bamboo trellis;
match three or more of the same color to set them adrift on the breeze
before the trellis creeps down to the water.

The tone is *Animal Crossing at midnight*, not *Candy Crush* — restrained
animation, generous negative space, and tension that comes from the slow
descent of the trellis rather than kinetic chaos.

## Modes

Pick a mode from the in-game menu (tap the menu / press **Space** to open it).
Each mode keeps its own saved game and progress, so you can switch freely
without losing your place.

| Mode | What it is |
| ---- | ---------- |
| **Campaign** | The default. Level-by-level progression with hand-tuned configs — colors, starting rows, descent pacing, and stencil packs all ramp up as you climb. Some later levels go timed. Your cleared level is remembered between sessions. |
| **Zen** | Untimed. The trellis only creeps down as you shoot, never on a clock — float lanterns at your own pace. An optional **Fast Launch** toggle speeds up the projectile and settle animations for players who want flow without the timer. |
| **Speed** | Timed. The trellis descends on a clock and shots fire on a short cooldown — a faster, higher-pressure take on the same board. Fast launch is always on. |
| **Puzzle** | 50 hand-crafted teaser boards in seven chapters, each introducing a mechanic — anchor-cut drops, golden targets, stone blockers, multi-step logic, pressure finales where the trellis itself sinks toward the water, a master set of composed traps, and a final cruelty chapter of orphans, poisoned seats, and nested locks. Each puzzle ships a fixed shot queue and a goal: **clear every lantern** or **clear the marked target lanterns**. Every board is machine-verified solvable with forgiving aim windows (`node tools/test-puzzles.js`), and difficulty is tuned against a blind-luck win-probability meter (`node tools/measure-difficulty.js`). |

## Features

- Four play modes — Campaign, Zen, Speed, and Puzzle — each with its own saved game and progress
- Hex grid with snap-to-place physics and one-bounce aim assist
- Fast Launch option in Zen for quicker projectile and settle timing
- Swappable lantern stencil packs (with a "random" pack that mixes designs per shot)
- Deterministic seeds: same inputs always produce the same board
- Daily leaderboard via the [Paul's Arcade SDK](https://paulgibeault.github.io/)
- Environmental audio via `Arcade.audio` — cues composed as node graphs from the SDK element library's physical gestures (paper, flame, blast, rope, bronze, koto string, insect), all sharing one convolution room, over an ambient bed with no sustained layer at all: a quiet pond at night, heard as rare discrete events over silence, whose insects get busier as the field sinks toward the waterline. The synthesis lives in the framework; `js/soundpack.js` is design only. Needs SDK 3.7.0; on older cached clients the game plays silent by design — the pack is the sound, and there is no fallback profile.
- Personal bests (best score, best chain, best campaign level) via `Arcade.records`

## Run locally

The launcher repo at `paulgibeault.github.io` ships a dev harness that stages
the launcher and one or more games side-by-side on a single localhost origin
(required for the Arcade SDK postMessage handshake and shared `localStorage`).

```sh
cd ../paulgibeault.github.io
./dev.sh ../moon-lit
```

Then open `http://127.0.0.1:4791/` for the launcher, or
`http://127.0.0.1:4791/moon-lit/` for standalone mode.

## Theme

Moon Lit opts out of `data-theme` and renders a fixed night palette across all
modes; this is intentional per §5 of
[GAME_INTEGRATION.md](../paulgibeault.github.io/GAME_INTEGRATION.md).

## License

MIT — see [LICENSE](LICENSE).
