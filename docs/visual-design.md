# Moon Lit — Visual Design Plan

A redesign of the in-canvas visuals to match the look and vibe of
[../img/logo.png](../img/logo.png). The M8 visual-polish milestone — see
[design-concept.md](design-concept.md) for the broader design context.

The goal is a cinematic, layered scene viewed from the lakeshore: the player
(unseen) stands on the bank, looking out at a boatman on the open lake who
hooks paper lanterns from the foreground water and lifts them into the
bamboo canopy above. Live bamboo grows along both sides of the view,
silhouetted against the moonlit sky.

## Scene composition (from the player's POV)

The viewer is **on the bank**, looking out at a moonlit lake. Live bamboo
grows on both sides of the frame, silhouetted. The lake itself extends to
the horizon — there is **no far bank** opposite the viewer. Layers, back
to front:

1. **Sky** — deep indigo gradient (`#0E1538` → `#1B274D`), sparse stars,
   a large pale-cream moon (`#F5E9C9`) with a warm halo (`#E8B770`).
2. **Lake horizon** — distant water meeting sky in a soft band; the moon
   reflects on the far water. Open lake, no opposite shore.
3. **Mid-distance** — boatman silhouette in his wooden boat, out on the
   open lake. Drawn small (≈ 25–30% of viewW), conical hat, holding his
   long pole.
4. **Water surface** — dark lake (`#0A0F22`), gentle indigo ripples
   (`#3D5681`), a soft moon reflection trail, occasional ambient sparkles.
5. **Play-space layer** — the hex grid with its lanterns. Conceptually
   mid-air over the water; rendered the same on-screen as today, but the
   *bamboo canopy* at the top (replacing the trellis bar) is where lanterns
   "catch."
6. **The pole during aim/fire** — drawn over the play space because it
   visually crosses through it. The hook tip is the focal point.
7. **Queue lanterns** — drifting in the foreground water, *closer to camera*
   (≈ 1.3× in-grid lantern size), bobbing.
8. **Live side bamboo** — tall stalks of growing bamboo along the very-left
   and very-right edges of the canvas, near-opaque silhouettes, drawn last
   so they truly frame the view. Some stalks lean slightly inward; leaf
   clusters hang from a few of them.
9. **HUD / overlays** — score, descent meter, end screens.

## Visual mapping (logo → game)

| Logo element                        | Current rendering                          | Target rendering                                                              |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Indigo sky + sparse stars           | flat vertical gradient                     | gradient + cached starfield + faint warmer band near the moon                 |
| Pale cream moon w/ warm halo        | small disc + faint halo gradient           | larger moon, multi-stop halo, gentle pulse (skipped under reduced-motion)     |
| Natural growing bamboo              | flat brown horizontal trellis bar          | mid-distance canopy of leaves + live tall stalks growing on both side edges   |
| Six glowing paper lanterns          | flat colored circles (radial gradient)     | bell-shape sprite per color w/ rib lines, tassel, top loop, warm bloom        |
| Boatman + boat                      | gun-barrel launcher                        | mid-distance silhouette in wooden boat on the open lake, holding a hook-pole  |
| Open lake to the horizon            | (none)                                     | lake surface w/ ripples, moon reflection trail; no opposite shore             |
| Still water at bottom               | empty space below grid                     | dark lake band w/ ripples; the dead-line *is* the waterline                   |
| Disconnected lanterns               | instant clear (no animation)               | flame snuffs → paper flutters down → splashes into the lake → fades           |
| Painterly paper-cut typography      | system sans-serif                          | Cormorant Garamond for titles + Inter for HUD numbers                         |

## Bamboo: natural growing only

All bamboo is **natural growing** — no built structures, arches, uprights, or
scaffolding. Two distinct uses, at different depths:

- **Mid-distance bamboo canopy** at the top of the play space — slender stalks
  descending from above the canvas with leaf clusters bunching at the top.
  This replaces the brown trellis bar at
  [js/renderer.js:80-95](js/renderer.js#L80-L95) (`drawTrellis`). Lanterns
  "catch" in the leaves at row 0; gameplay is unchanged.
- **Live side bamboo** at the very-left and very-right canvas edges — tall
  stalks of growing bamboo, near-opaque silhouettes, with a few leaf
  clusters hanging off them. Some lean slightly inward to soften the frame.
  These sit *in front of* the play space and frame the view from the bank.

The internal name `trellis` stays in code for now (the data structure is what
it is), but the visual layer presents it as canopy.

## Boatman + hook-pole launcher

Replaces the existing barrel-shaped launcher at
[js/renderer.js:153-185](js/renderer.js#L153-L185) (`drawLauncher`).

### Mechanics — what stays

Aim math, projectile physics, snap, win/loss are **unchanged**. The shot still
leaves from `launcherTip(layout)` and follows the same traced path with side
bounces. The redesign is purely renderer + queue UX.

### Visual sequence

- **Idle / aiming**: boatman is mid-distance in his boat. Pole pivots from a
  fixed shoulder anchor and points up-and-slightly-forward toward the canopy
  at the aim angle. Tip is small (distant). The dotted aim-line emanates from
  the hook tip.
- **Hook dip** (~120 ms on release): pole rotates *toward the camera* — the
  tip arcs down-and-forward into the foreground water. We sell the depth
  with foreshortening: the tip scales up and shifts toward the bottom-center
  of the canvas. The tip lands at the leading queue lantern and hooks it.
- **Lift** (existing flight duration): pole sweeps along the projectile
  trajectory and tracks the lantern. Tip scale tapers from "near" back to
  "play-space" size as the lantern crosses depth into the grid. When the
  shot bounces off a side wall, the pole flexes via tangent rotation rather
  than literal physics — it's a metaphor, not a rigid body.
- **Settle + return** (~120 ms): lantern locks into its grid slot; pole
  returns to ready pose at the boatman's shoulder.

Reduced-motion collapses the dip and return phases to instant transitions.
The lantern travels exactly as it does today; only the visual flourish is
elided.

### Boatman as a live background figure

Carve out animation slots up front so future polish drops in cleanly:

- **Idle body sway** — 2-pose loop, ~0.6 Hz shoulder dip, additive over the
  base silhouette. Skipped under reduced-motion.
- **Pole-ready pose** — pole rests against the boatman's shoulder when no aim
  is happening and the player has been idle > 800 ms. Pole rises into aim
  when the cursor moves.
- **Boat bob** — slow ~0.3 Hz vertical bob, synced with the water ripple
  driver so the boat looks afloat, not drawn-on.
- **Reaction to chains** — one-shot pole-twirl or hat-tip on a chain drop
  ≥ 4 lanterns. Triggered off `game.lastResolution`.

Implement these as named animation tracks on a small `boatman` state object
so adding more later (yawn, paddle sweep, lantern wave) is data, not
rewiring.

## Lantern queue: drifting foreground procession

Replaces the right-side `drawShotQueue` at
[js/renderer.js:187-202](js/renderer.js#L187-L202).

### Visual model

- Queue lives in the **foreground water** — bottom ~22% of canvas, in front
  of the boatman.
- **5 visible slots** at full size (≈ 1.3× the in-grid lantern size, since
  they're closer to camera). A 6th eases in from off-canvas left after each
  fire.
- Lanterns drift slowly **rightward** at a constant pace, anchored to fixed
  slot positions, with a gentle vertical sine bob.
- The leading lantern (rightmost slot) is the current shot, positioned where
  the pole tip naturally reaches it during the hook dip — i.e., near
  bottom-center.
- No "next" label needed — color and bell-shape read instantly at full size.

### Game-state changes

- Extend `game.queue` from `{current, next}` to an ordered array of length 5
  (configurable). `current = queue[0]`, `next = queue[1]`.
- On `advanceQueue`: shift left, push a new rng-picked color at the tail.
- Save/replay (M7) trivially extends — the queue regenerates from
  `seed + shotCount`.

### Animation state

A per-lantern struct: `{ slotIndex, x, targetX, bob, color }`. Updated once
per frame; cheap. On fire, the leading lantern's `targetX` becomes "track
the pole tip" until the hook completes; the others advance one slot; a new
lantern enters at `slotIndex = 4`.

## Lantern lifecycle: anchors, flame-out, and the drop

A lantern is buoyant only while its flame burns, and only as long as
something supports it. A lantern is "supported" if it can trace a path
through populated neighbors to an **anchor point**.

### Anchors

- **Today**: the only anchor is the bamboo canopy itself — row 0 of the
  hex grid. Any populated cell that can BFS to row 0 through populated
  neighbors is supported. Implemented at
  [js/match.js:45-77](js/match.js#L45-L77) (`dropFloating`).
- **Future levels** (M9 / Festival mechanics) may introduce additional
  anchors: **side walls** of the bamboo grove, **rocks** wedged into the
  canopy, fixed knots, or other inert anchor cells. The data model is
  open — anchors are simply the seed cells the connectivity BFS starts
  from. Visually they should read as "things a lantern can rest
  against": a bamboo node, a stone outcrop, a vine knot.

### Drop sequence

When a match-pop or descent severs a cluster from every anchor, the
disconnected lanterns enter the drop sequence — each cell that is no
longer connected to an anchor:

1. **Flame goes out** (~200 ms): the warm interior glow snuffs to a thin
   curl of smoke. The lantern dims to its ember state — paper rim still
   visible but no inner light and no outer bloom.
2. **Fall** (~400 ms, accelerating): the now-dark lantern drops with a
   gentle paper flutter (slight rotation oscillation). The fall path is
   purely visual — no collision with grid cells or other falling
   lanterns.
3. **Splash** (~250 ms): the lantern hits the lake surface, a soft
   splash ring + a brief intensification of the local indigo ripple,
   then the lantern fades to nothing.

The drop sequence is **purely cosmetic**. Game state already cleared the
disconnected cells inside `dropFloating` before the animation began —
the visual is layered over the empty cells, not coupled to them. Score
is awarded immediately on disconnect, not on splash, so input remains
responsive.

Reduced-motion collapses all three phases to an instant fade-out at the
cell's grid position; no fall, no splash particles.

The "Drop chains" beat in Phase 9 below implements this sequence; the
"flame goes out" cue is what visually distinguishes a *drop* from a
*pop* (which keeps the lantern's color and bursts upward as embers).

## Asset strategy

You have two ways to land this:

- **Procedural-only** — Canvas2D shapes + gradients. Cheap, no new files,
  no licensing, but won't truly hit "painterly paper-cut."
- **Hybrid** — ship a small set of bitmap assets and keep everything else
  procedural. Probably ~150 KB total, and the painterly look becomes
  attainable.

**Recommendation: hybrid.** Concrete asset list, all generated from existing
externally-provided source art via [tools/build-images.sh](tools/build-images.sh):

| Path                                  | Purpose                                                                       | Approx size |
| ------------------------------------- | ----------------------------------------------------------------------------- | ----------- |
| `img/lantern-atlas.png`               | Six lantern sprites in a 3×2 grid at one canonical size; tinted at draw time. | ~50 KB      |
| `img/canopy.png`                      | Mid-distance bamboo canopy at the top of the play space, transparent corners. | ~30 KB      |
| `img/side-bamboo.png`                 | Live tall bamboo stalks growing at the left and right canvas edges, transparent. | ~50 KB      |
| `img/boatman-sprites.png`             | Boatman silhouette poses (idle + 2 sway frames + pole-twirl). One sheet.      | ~20 KB      |

`tools/build-images.sh` is the single source of truth for rendered art —
extend it as new master images come in, run once, commit the outputs.

Image-generation prompts for the four masters live in [img-prompts.md](img-prompts.md)
(to be created). Match the style anchors from
[design-concept.md §7.1](design-concept.md): deep indigo night palette,
warm lantern bloom, painterly paper-cut.

## Implementation phases

Order respects asset dependencies and stacks visual wins early. Each phase
ships as one or more discrete commits.

### Phase 1 — Static-layer cache + scene background

Foundational: nothing else lands cleanly without this.

- New [js/scene.js](js/scene.js).
- Offscreen canvas for the **static layer**: sky, stars, moon, lake, side
  bamboo, canopy. Re-rendered only on resize / settings change.
- Dynamic layer (board, lanterns, pole, projectile, queue, overlays) keeps
  drawing per-frame onto the visible canvas.
- Sky: existing gradient + faint warmer band near the moon.
- Stars: 80–120 cached dots at deterministic mulberry32-seeded positions.
  Two sizes, two alphas. Optional twinkle on ~6 stars under not-reduced-motion.
- Moon: bigger (~12% of `min(viewW, viewH)`), three radial-gradient halo
  stops, plus a tinted atmosphere band. Optional 0.04 Hz radius pulse under
  not-reduced-motion.
- Lake: bottom ~22% darkens to `#0A0F22`; one or two horizontal indigo
  ripple bands at and below the dead-line; a vertical moon-reflection trail
  centered under the moon.
- Lake horizon: a soft band where the lake meets the sky. No opposite shore.

No new assets yet; everything procedural.

### Phase 2 — Lantern bell-shape sprites

Highest visual ROI. Required before queue redesign reads correctly.

Touches `drawLantern` at [js/renderer.js:137](js/renderer.js#L137).

Either procedural (bell silhouette: ellipse top + cylindrical body + tapered
base, two rib lines, top loop, tassel, warm interior radial gradient, outer
bloom under not-reduced-motion) or atlas-driven (`drawImage` from
`img/lantern-atlas.png`, six pre-shaded variants).

Hit/snap radius stays at `size * 0.78` so collision is unaffected.

### Phase 3 — Foreground queue procession

Replaces the existing `drawShotQueue`.

- Extend `game.queue` to a length-5 ordered array.
- Add per-lantern animation state.
- Render in the foreground water band, larger than in-grid, with bob and
  drift.
- Smooth easing on advance: leading lantern's `targetX` follows the pole
  tip during fire; others slide right by one slot; a new lantern eases in
  from off-canvas left.

### Phase 4 — Boatman + boat (mid-distance, no pole yet)

- Boatman silhouette + boat hull at mid-distance in the water.
- Idle body sway and boat bob animations wired up.
- No pole yet — the existing barrel launcher continues to fire while the
  boatman is just decorative. (Lets you ship this without coupling to the
  pole work.)

### Phase 5 — Pole + three-phase fire animation

The narrative payoff. Connects boatman ↔ queue ↔ canopy.

- Pole drawn from boatman's hand to a tip; rotation, length, and tip-scale
  driven by the animation phase.
- Three phases on fire: hook dip → lift → settle + return. Pole tracks the
  projectile during lift.
- Aim line now emanates from the pole tip, not from `launcherTip`.
- Reduced-motion collapses dip and return to instant.

### Phase 6 — Bamboo canopy at the top of the play space

- Replaces the brown trellis bar.
- Canopy sprite (`img/canopy.png`) drawn at the top of the cached static
  layer.
- Optional very-low-amplitude leaf sway under not-reduced-motion, achieved
  with a thin animated alpha mask over the cached canopy rather than
  redrawing.

### Phase 7 — Live side bamboo

- Tall live bamboo stalks growing at the very-left and very-right canvas
  edges, in front of the play space, framing the view from the bank.
- A few stalks lean slightly inward; some carry leaf clusters.
- From `img/side-bamboo.png`, drawn into the cached static layer.

### Phase 8 — Typography + end overlays

- Add Cormorant Garamond (titles) + Inter (HUD numbers). Self-host woff2;
  ~25 KB total.
- Score: serif, larger, slight cream drop-shadow.
- "Trellis cleared / collapsed" overlay: serif, paper-cream `#F5E9C9`, with
  a faint paper-texture rectangle behind it (one pre-rendered tile drawn at
  low alpha).
- "Click to restart" stays Inter, lower-case, low-alpha.

### Phase 9 — Particles + ambient

- **Match-pop**: 6–10 ember dots drift upward and fade over ~600 ms in
  the popped lantern's color. The lantern keeps its color through the
  burst — a pop is bright and warm.
- **Drop**: implements the lantern lifecycle drop sequence from the
  section above — flame snuffs, lantern dims to ember, falls with a
  paper flutter, splashes into the lake, fades. The "flame snuffs" cue
  is what visually distinguishes a drop from a pop.
- **Ambient**: 2–3 slow ember motes drift up the play area at all times.
  Skipped under reduced-motion.
- Cap at ~60 active particles to bound per-frame draw cost.

## What stays the same

So we don't drift into a rewrite:

- **Hex math, layout math, collision, snap logic** — exactly as they are.
- **Phase / state machine** in [js/game.js](js/game.js) — visuals are
  isolated to renderer + new scene/particles files.
- **Settings hooks**: keep honoring `reducedMotion` (skip pulses / sways /
  particles), `fontScale` (rem-based; no canvas font math changes needed),
  `handedness` (defer to M9 — easy to fold in once boatman pose is data).
- **Determinism**: any randomness in the static layer (stars, leaf positions)
  seeds from a stable derived value (e.g. `mulberry32(0)`) so it's reproducible
  across reloads.

## Open trade-offs

- **Pole flex on bouncing shots** — purely tangent rotation, or actually
  bend the pole? Tangent rotation is simpler and reads fine; literal bend
  is fancier but couples to the trajectory more tightly. Default to tangent
  rotation; revisit if it looks wrong.
- **Reduced-motion floor** — under reduced-motion, the boatman is still and
  the pole snaps directly to the aim angle; the projectile flight is the
  only motion. Confirm this matches what you want before shipping Phase 5.
- **Asset budget** — if total bitmap weight exceeds ~200 KB after generation,
  consider dropping the boatman sprite sheet and going procedural for him,
  since the silhouette is simple.
