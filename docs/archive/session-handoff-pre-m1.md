# Pop-Em — Session Handoff

State as of session pause. Pick up here.

## Where we are

In **design phase, ready to start M1 (skeleton)**. The user said "Good to
start" after locking the design decisions. Next concrete step is creating
the project skeleton (files, no gameplay logic yet).

## Files in this directory

- [initial-concept.md](initial-concept.md) — original Bust-A-Move analysis the user pasted in.
- [initial-concept-v2.md](initial-concept-v2.md) — **the working design doc.** All decisions live here.
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) — this file.

## Project context

- **Game:** Pop-Em — lantern-festival bubble shooter for Paul's Arcade.
- **gameId:** `pop-em` (kebab-case, will be repo slug `paulgibeault/pop-em`).
- **Working dir:** `/Users/paulgibeault/work/pop-em` — **not yet a git repo.**
- **Arcade framework:** lives at `/Users/paulgibeault/work/paulgibeault.github.io`. See [GAME_INTEGRATION.md](../paulgibeault.github.io/GAME_INTEGRATION.md) for the per-game contract and [ARCADE_PLATFORM.md](../paulgibeault.github.io/ARCADE_PLATFORM.md) for the platform design.
- **Closest existing game to model after:** [hecknsic](../hecknsic/) — same author, hex grid, similar conventions. Use its directory layout (`css/`, `js/`, `img/`, `tests/`, `index.html`, `manifest.json`, `package.json`, `sw.js`) as the template.

## Decisions locked (see initial-concept-v2.md for full reasoning)

### Theme & scope
- **Theme:** Lantern festival. Boatman launches paper lanterns up into a bamboo trellis. Six match colors.
- **Multiplayer:** Out of scope for v1. Schema/determinism designed to support it later.
- **Variants v1:** Classic (1:1 Taito), Festival (signature mode, 8 chapters), Endless, Daily, Master.

### Twist mechanics (Festival mode)
- **Gravity rotation:** A *moon* in the upper area defines "up." Late chapters drift the moon to a new edge mid-level; trellis and dead-line rotate with it. Trigger is **shot-count based** with a small ring on the moon counting down.
- **Ripening:** Each lantern's flame burns down over **shot count** (bright → dim → flickering → ember). Embers are indestructible-by-color but worth +50% bonus on drop.
- **Wall-tint shift:** Bouncing off a colored bamboo wall shifts the projectile to that wall's color. Only on Festival levels with explicitly colored walls.
- **Twin Lanterns:** Power-up consumable earned via 6+ drop chains. Spends a Wind Token to fire from primary + mirrored launchers simultaneously. Handedness picks primary side.

### Determinism
- **Seeds everywhere.** mulberry32 PRNG. **Never `Math.random()`** in gameplay.
- Save state = `(seed, level, shotList)` — replay shots silently to restore board.
- Daily: seed derived from date; **endless retries** allowed; per-day-best posts.
- Endless: adaptive difficulty *as a deterministic function* of player score + shot count (no RNG-based adaptation).

### Tech & policy
- **License:** MIT, free, no monetization, no ads, no telemetry.
- **Render:** Canvas2D only (no WebGL). 30fps for ambient/idle, 60fps only during active aim/shot travel. Dirty-region rendering with static + dynamic layers.
- **Hex grid:** pointy-top with odd-r offset rows.
- **Theme support:** Festival opts out (mandatory night palette). Classic supports light/dark via `data-theme`.
- **Settings flowed through:** fontScale (rem-based + canvas font multiplier), reducedMotion (skip moon-drift, slow ambient to ~10fps), audioVolume, handedness (HUD corners + boatman primary side + Twin mirror axis), theme (Classic only).
- **Audio:** lazy-decoded, only the active chapter's clips in memory; suspend AudioContext on `onSuspend`.

### Progression
- Festival = 8 linear chapters × 8 stages each. Each chapter introduces one mechanic; Ch.8 composes everything.
- 1-3 stars per stage (clear / clear with ≤3 trellis drops / clear in ≤N shots). Stars unlock cosmetics, never gate progression.
- Endless unlocks after Festival Ch.1; Master per-chapter after clearing it.
- No daily timers, no paywalls, no shops.

## Proposed milestone plan

M1 is up next.

| # | Milestone | What "done" means |
|---|-----------|-------------------|
| **M1** | **Project skeleton** | `index.html` loads in launcher with no console errors; `Arcade.init` handshake succeeds; lifecycle hooks (suspend/resume) wired but no gameplay. |
| M2 | Hex grid + renderer | Pointy-top odd-r grid math, board renders with placeholder lanterns at static positions. |
| M3 | Aim + shoot | Cannon rotates, fires a colored projectile, snaps to nearest empty hex on collision. |
| M4 | Match + drop | Match-3 detection, drop physics for unsupported clusters, score increments. |
| M5 | Pressure + win/loss | Trellis descent, dead-line check, win/loss screens, restart. **Classic mode minimally complete.** |
| M6 | Mode select + Festival Ch.1 loader | Parchment scroll mode select, festival map UI, level loader. |
| M7 | Determinism + seeds | mulberry32 PRNG, shotList save/replay, Daily challenge URL works. |
| M8 | Visual polish core | Replace placeholders with paper-texture lanterns, palette, motion principles, paper-cut typography. |
| M9 | Festival mechanics | Ripening (Ch.2), moon-shift gravity (Ch.3), wall-tint (Ch.4), continuous orbit (Ch.7), Twin Lanterns power-up (Ch.6), Master mode. |
| M10 | Audio | Ambient bed, snap/match/drop SFX, win/loss stings, chain-pitch chime ladder. |
| M11 | Endless + Daily modes | Procedural board gen, adaptive curve, daily seed derivation, leaderboard categories. |
| M12 | Cosmetics + chapter map polish | Boatman cosmetic unlocks, trail effects, animated festival map. |
| M13 | Acceptance pass | Full §13 GAME_INTEGRATION.md checklist + game-specific checks (§11 of v2 design doc). |

## M1 starting point — what to build first

Files to create (mirror hecknsic layout):

```
pop-em/
├── index.html              # SDK script + Arcade.init('pop-em'); empty <canvas id="game">
├── manifest.json           # scope: "./", start_url: "./index.html?v=0.1.0"
├── package.json            # { type: "module", scripts: { test: "node --test tests/*.test.js" }, version: "0.1.0" }
├── LICENSE                 # MIT, copyright Paul Gibeault
├── README.md               # brief: what it is, how to run locally via dev.sh
├── css/
│   └── style.css           # canvas full-screen, html { font-size: calc(100% * var(--font-scale, 1)); }
├── js/
│   ├── main.js             # entry: await Arcade.ready, set up lifecycle hooks (onSuspend/onResume/onSettingsChange/onStateReplaced), no gameplay yet
│   └── constants.js        # GAME_ID, COLORS array (six lantern hex codes from §7.1 of v2 doc), grid dims
├── img/                    # empty for now; placeholder favicon TBD
└── tests/                  # empty for now; will hold hex-math tests in M2
```

**Conventions to match:**
- SDK link is **root-relative**: `<script src="/arcade-sdk.js"></script>` (per GAME_INTEGRATION §2 — newer guidance than hecknsic's absolute URL).
- `Arcade.init({ gameId: 'pop-em' })` immediately after the SDK loads.
- **No legacy migration needed** — pop-em is a new game with no pre-existing localStorage keys. Skip `Arcade.state.migrate(...)`.
- Use `<script type="module" src="js/main.js">` matching hecknsic's `package.json` `"type": "module"`.
- Set `<meta name="theme-color">` to indigo `#0E1538` (Festival palette base from v2 §7.1).

**Smoke test for M1:**
- `cd /Users/paulgibeault/work/paulgibeault.github.io && ./dev.sh ../pop-em`
- Open `http://127.0.0.1:4791/` → click pop-em launcher card (will need to add the card; see GAME_INTEGRATION §11 — *defer that to M13 or do it now and use a placeholder image*).
- Standalone: open `http://127.0.0.1:4791/pop-em/` directly; should load with no console errors.
- Verify in DevTools → Application → Local Storage that `arcade.v1.pop-em.*` keys *can* be written (test `Arcade.state.set('hello', 'world')` from console).
- Verify `Arcade.context.framed === true` when launched from launcher; `false` when standalone.

## Open question to ask user before M1

- **Git init?** Working dir is not yet a git repo. Standard convention for arcade games is `paulgibeault/<gameId>` GitHub repo. Should I `git init` + add a `.gitignore` (node_modules, .DS_Store) as part of M1, or leave that to the user?
- **Launcher card image:** v2 design doc §10.10 calls for `images/pop-em.png` in the launcher repo (≥ 512×512). Do we have one? If not, M1 can ship without it and the launcher will just 404 on the card image (game itself works).

## Style/process reminders for next session

- User prefers terse responses; no padding, no end-of-turn summaries beyond a sentence or two.
- User likes proposals with **recommendation + tradeoff** for design choices, not just neutral options.
- User has not yet okayed git operations on this repo. Do not `git init`, `git add`, or commit without asking.
- The arcade SDK is the single source of truth for storage/lifecycle/settings. Do not roll any of that locally.
- No emojis in code or docs.
- Default to no comments in code unless the *why* is non-obvious.

## Reference files in other arcade games

When in doubt about a convention, look at hecknsic first:
- [hecknsic/index.html](../hecknsic/index.html) — SDK init pattern, HUD scaffolding.
- [hecknsic/js/main.js](../hecknsic/js/main.js) — lifecycle wiring entry point.
- [hecknsic/js/hex-math.js](../hecknsic/js/hex-math.js) — hex coordinate math (likely directly relevant to M2).
- [hecknsic/js/renderer.js](../hecknsic/js/renderer.js) — Canvas2D rendering patterns.
- [hecknsic/manifest.json](../hecknsic/manifest.json), [hecknsic/sw.js](../hecknsic/sw.js) — PWA scoping.

cozy-solitaire is also nearby ([../cozy-solitaire](../cozy-solitaire)) and is a good model for the "single mandatory aesthetic, opt out of theme" pattern that Festival mode will use.

---

Resume by reading [initial-concept-v2.md](initial-concept-v2.md) and this file, then proceeding with M1.
