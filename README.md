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
- Shot-queue swap — the iconic *Bust-A-Move* "fix a bad shot" tap
- Fast Launch option in Zen for quicker projectile and settle timing
- Swappable lantern stencil packs (with a "random" pack that mixes designs per shot)
- Deterministic seeds: same inputs always produce the same board
- Daily leaderboard via the [Paul's Arcade SDK](https://paulgibeault.github.io/)
- Synthesized SFX (lantern release, match/chain, trellis, win/loss) via `Arcade.audio`
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
