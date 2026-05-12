<div align="center">

<img src="img/logo.png" alt="Moon Glow" width="200" />

# Moon Glow

**A lantern-festival bubble shooter for [Paul's Arcade](https://paulgibeault.github.io/).**

<a href="https://paulgibeault.github.io/">
  <img src="https://img.shields.io/badge/▶%20PLAY%20NOW-Paul's%20Arcade-0E1538?style=for-the-badge&labelColor=F4A261&color=0E1538" alt="Play Now on Paul's Arcade" height="60" />
</a>

</div>

---

## About

> *"Float a lantern. Steady the moon. Don't let the trellis touch the water."*

Moon Glow is a bubble shooter dressed in the quiet of a midsummer night
festival. A boatman launches paper lanterns up into a bamboo trellis;
match three or more of the same color to set them adrift on the breeze
before the trellis creeps down to the water.

The tone is *Animal Crossing at midnight*, not *Candy Crush* — restrained
animation, generous negative space, and tension that comes from the slow
descent of the trellis rather than kinetic chaos.

## Modes

| Mode | What it is |
| ---- | ---------- |
| **Classic** | A faithful homage to the original *Bust-A-Move*. Six colors, hex grid, ceiling drop. |
| **Festival** | Eight chapters, each introducing one signature twist — rotating gravity, ripening embers, color-shifting bamboo walls, and the Twin Lanterns power-up. |
| **Endless** | Procedural board, infinite descent, one score chase. |
| **Daily** | One seed per day. Same board for everyone, one attempt. |
| **Master** | Replay any cleared Festival chapter with *all* twists active at once. |

## Features

- Hex grid with snap-to-place physics and one-bounce aim assist
- Shot-queue swap — the iconic *Bust-A-Move* "fix a bad shot" tap
- Deterministic seeds: same inputs always produce the same board
- Daily leaderboard via the [Paul's Arcade SDK](https://paulgibeault.github.io/)

## Run locally

The launcher repo at `paulgibeault.github.io` ships a dev harness that stages
the launcher and one or more games side-by-side on a single localhost origin
(required for the Arcade SDK postMessage handshake and shared `localStorage`).

```sh
cd ../paulgibeault.github.io
./dev.sh ../moon-glow
```

Then open `http://127.0.0.1:4791/` for the launcher, or
`http://127.0.0.1:4791/moon-glow/` for standalone mode.

## Theme

Festival mode opts out of `data-theme` and renders a fixed night palette;
this is intentional per §5 of [GAME_INTEGRATION.md](../paulgibeault.github.io/GAME_INTEGRATION.md).
Classic mode (when implemented) will respect `data-theme="light"` / `"dark"`.

## License

MIT — see [LICENSE](LICENSE).
