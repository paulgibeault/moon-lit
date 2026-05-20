# Moon-Lit — Design Concept v2

A bubble-shooter for Paul's Arcade. Two modes share one engine: a faithful
1:1 *Bust-A-Move* called **Classic**, and a signature **Festival** mode that
adds rotating gravity, ripening lanterns, and wall-tint color shifts under a
night-festival aesthetic.

> *"Float a lantern. Steady the moon. Don't let the trellis touch the water."*

---

## 1. Vision

**One-liner:** A lantern-festival bubble shooter where a boatman launches paper
lanterns up into a festival trellis, matching colors to release them on the
night breeze before they burn out.

**Tone:** Quiet, deliberate, beautiful. Negative space. Animation is restrained
and purposeful — no constant particle storms. The feeling we want is *Animal
Crossing at midnight*, not *Candy Crush*. Tension comes from the trellis
descending and lanterns dimming, not from kinetic chaos.

**Pillars (in priority order):**
1. **Readable.** Every shot's outcome is predictable from the visible board.
2. **Calm.** Idle states are still and pretty; players can stop to look.
3. **Deterministic.** Same seed + same inputs always produce the same board.
4. **Faithful.** Classic mode honors the Taito original without "improvements."
5. **Distinct.** Festival mode has one moment per chapter you can't get anywhere else.

---

## 2. Variants

| Variant       | What it is                                                                 | Leaderboard category | Unlocked |
| ------------- | -------------------------------------------------------------------------- | -------------------- | -------- |
| **Classic**   | 1:1 Taito *Bust-A-Move*. Six colors, hex grid, ceiling drop, branching map. | `classic`            | Always   |
| **Festival**  | Signature mode. Eight chapters, each introduces one twist mechanic.         | `festival`           | Always   |
| **Endless**   | Procedural board, infinite descent, increasing speed. One score chase.      | `endless`            | After Festival Ch. 1 |
| **Daily**     | One seed per day. Same board for everyone. Single attempt; score posts to a daily leaderboard. | `daily-YYYY-MM-DD` | Always   |
| **Master**    | Replay any completed Festival chapter with **all** twists active.           | `master-{chapter}`   | Per-chapter, after clearing it |

**Why these five:** Classic is the comfort food. Festival is the headline.
Endless and Daily give the leaderboard something to chase between Festival
runs. Master gives veterans a reason to come back after the campaign.

Multiplayer (Vs. Mode garbage-routing) is **out of scope for v1** but the
score schema, shot-resolution, and seed system are designed to support it
later — see §10.

---

## 3. Core mechanics (shared between Classic and Festival)

### 3.1 The board

- **Hex grid**, ~8 columns × 13 rows visible. Festival uses the same dimensions.
- **Six colors.** In Classic these are abstract glossy spheres; in Festival
  they're paper lanterns in red, orange, yellow, jade, indigo, and white.
- **Ceiling.** The top edge supports the cluster. In Classic it's a steel bar;
  in Festival it's a bamboo trellis with character.
- **Dead line.** A horizontal line near the bottom. Any lantern crossing it
  ends the run.

### 3.2 The shot

- **Launcher** at bottom-center, rotates 180°.
- **Aim line** is a faint dotted arc showing the predicted path including one
  wall bounce. (Toggle to "no aim assist" in settings for purists; default on.)
- **Shot queue.** The current and next color are both visible. Players can
  *swap* current and next with a tap (a single iconic Bust-A-Move feature
  worth keeping — it makes terrible shots fixable and rewards forward planning).
- **Snap-to-grid.** Fired lanterns travel straight (or one bounce off side
  walls) and snap to the nearest empty hex on first contact.

### 3.3 Match & drop

- **Match.** Three or more same-color contiguous lanterns pop on placement.
- **Drop.** Any lantern no longer connected (transitively) to the ceiling
  *falls.* In Classic, falls = points. In Festival, the lantern drifts down
  in the gravity direction and lands in the river where the boatman waits;
  larger drop clusters earn exponentially more.
- **Drop scoring** is the primary score driver in both modes. Pure pops are
  fine; drops are how you climb the leaderboard.

### 3.4 Pressure

- **Trellis descent.** Every N shots without a pop (N = 6 default, scales by
  level), the trellis lowers one row. Popping at least one lantern resets
  the counter.
- **Visual warning.** At N-2, the trellis creaks (audio cue + slight wobble).
  At N-1 it dims. At N it descends with a soft thud.

### 3.5 Specials (shared)

| Special      | Classic name | Festival name | Effect                                        |
| ------------ | ------------ | ------------- | --------------------------------------------- |
| Star         | Star Bubble  | Wishing Star  | Pops every lantern matching the color it lands on. |
| Bomb         | Flame        | Festival Cracker | Pops a 7-hex radius regardless of color.   |
| Bolt         | Thunder      | Lightning Eel | Clears a full row in the gravity direction.    |
| Blocker      | Iron         | Stone Lantern  | Indestructible, only removable by drop.       |

Specials are rare drops in the shot queue — never the current shot, always
the next-or-later. Players see them coming and plan around them.

---

## 4. Festival mode — the signature twists

Each Festival chapter introduces exactly one new mechanic and uses it for
~8 levels. Chapters compose: by Chapter 8 every mechanic is in play.

### 4.1 The Moon (rotating gravity)

A glowing moon icon hangs in the upper-right corner of the play field. Its
position **defines gravity.** In a standard level the moon is in the upper-right
and gravity points "up-right" — i.e. lanterns released from the cluster fall
toward the moon and drift offscreen up-and-right.

Wait — that flips the genre. Let's anchor it:

- **The moon is "up,"** opposite of "down."
- The trellis is anchored against the moon. Lanterns fall *away* from the moon
  into the river opposite.
- In a standard level, moon is above, river is below. Identical to Classic gravity.

**The twist** (Chapter 3 onward): the moon **drifts** during play. It can
travel along the screen edge — slowly enough to plan around, with a 3-second
"about to anchor here" preview before it commits. When the moon settles in a
new position, the trellis rotates with it, and the river/dead-line flips to
the opposite edge.

- Chapter 3: moon shifts once mid-level (90°).
- Chapter 5: moon shifts twice (90° each, may reverse).
- Chapter 7: moon orbits continuously at low speed.

**Readability:** The moon is a constant, large, glowing visual that always
tells you which way is up. Its movement is broadcast (it slides smoothly,
never teleports), and the dead-line is always rendered as a faintly glowing
string of paper offerings on the river surface, regardless of orientation.

**Determinism:** Moon movement is scripted per-level (or seeded for Endless).
Players can learn a level's moon-pattern across replays.

### 4.2 Ripening (lanterns burn down)

Every lantern has a flame, visible as a small glow inside it. The flame burns
over **shot count**, not real time (this preserves determinism and avoids
punishing thoughtful players).

- **Bright** (0–20 shots since placement): full color, full match value.
- **Dim** (20–35 shots): visibly darker, still color-matchable.
- **Flickering** (35–40 shots): rapid pulse, last warning.
- **Ember** (40+ shots): black, indestructible by color match. Behaves like
  a Stone Lantern. Worth +50% bonus on drop.

**Implications:**
- Players are pushed to clear color matches before they over-age.
- Aging into ember is *not always bad* — strategically letting a lantern ember
  out can set up a huge gravity drop. This is the Festival skill ceiling.

Introduced in **Chapter 2**. Disabled in Classic.

### 4.3 Wall-tint shift

In Festival levels with explicitly colored bamboo walls, a lantern that
bounces off a wall **takes on that wall's color** mid-flight. The shift is
permanent for that shot.

- Walls are visibly colored (red bamboo, jade bamboo, etc.) so the mechanic
  is legible at a glance.
- Each wall in a level can have a different color — left vs right — opening
  up bank-shot puzzles where reaching a region requires the right wall color.

Introduced in **Chapter 4**. Walls in Chapters 1–3 and Classic are neutral.

### 4.4 Twin Lanterns (two-cannon power-up)

A consumable, not a mode. **Earned by chains:** every drop of 6+ lanterns
grants one Wind Token. Tokens are visible as small paper fans on the
boatman's hat.

- **Spending a token:** before firing, tap the fan icon. Your next shot
  fires from *both* the primary launcher and a mirrored launcher across the
  field, simultaneously, at mirrored angles. Both shots are the same color.
- **Handedness:** primary launcher position is determined by
  `Arcade.settings.handedness()` — right-handed boatmen launch from left of
  center (so the dominant hand pulls the slingshot), left-handed mirrors.
  The Twin launcher mirrors across the screen midline.

Introduced in **Chapter 6**.

### 4.5 The boatman

The launcher is a **boatman** (or a stylized silhouette of one) standing in
a punt below the trellis, on the river. He has idle animations (looks up at
the moon, glances at the queue, lights the next lantern) and reacts to
events (cheers a big drop, ducks when a stone falls). He is the personality
anchor of the mode.

- Wears different cosmetics by chapter (festival-of-the-month hat, kimono).
- Cosmetics are unlocked with chapter completion and are saved as
  `Arcade.state.set('boatman.unlocked', [...])`.

---

## 5. Game flow

The whole game's UX, screen by screen. Designed for *one finger of friction
between launch and a shot fired.*

### 5.1 Cold launch

Boatman is alone in his punt on a still river. A single lantern hangs from
a bamboo pole he holds. The moon is full overhead. **No menu chrome.** Tap
anywhere → the boatman lights the lantern, releases it, and the camera
follows it up into the title: **MOON-GLOW** in paper-cut letters.

If the player has a save in progress, the title is replaced by a single
soft button: **Continue**. Tapping anywhere else shows a small **New** /
**Continue** pair.

Settings, profile, leaderboard, and quit are accessible from a single small
moon-icon menu in the top corner. The launcher's overall menu (Save / Load
to file, font scale, theme, etc.) is reachable through Arcade conventions —
this game does not duplicate them.

### 5.2 Mode select

Tap "New" → a parchment scroll unrolls horizontally across the river. Five
ink stamps (Classic, Festival, Endless, Daily, Master) appear in sequence.
Locked variants are stamped in faded ink with a hint ("Clear Festival Ch. 1").
Tap a stamp → the scroll furls and the camera drifts toward that mode's
opening scene.

Mode select is **never modal over gameplay.** Quit during a level returns
the user to the title (with Continue option), not to mode select.

### 5.3 Festival pre-level

A scroll-style **festival map** of the journey: an ink-painting route
across a stylized landscape (rivers, mountains, villages). Completed
chapters and levels are inked; current location is the lit lantern; future
ones are ghosted. **No level select within a chapter** — you progress
linearly through 8 stages, then choose the next chapter. (See §6 for the
full chapter tree.)

Tap the lit lantern → the boat drifts toward the next festival, fade
through black, brief title card:

> *Chapter 3 — The Moon Dance*
> *Stage 4*

Title card holds for 1.5 seconds, dissolves into the level. The trellis
appears, lanterns string themselves on (left to right), the moon settles
into position, the boatman lights his first lantern, and the queue shows.
First shot is fired by the player. **No "GO!" prompt.** The world is
ready when you are.

### 5.4 In-game HUD

Minimal, diegetic where possible.

- **Score:** paper-cutout numerals in the top corner (handedness-flipped),
  small. Updates with a soft chime on chains.
- **Trellis-descent counter:** *the trellis itself.* No separate UI bar.
  The trellis visibly creaks at N-2 and the rope visibly tightens at N-1.
- **Ripening:** *the lanterns themselves.* Their flames dim. No external bar.
- **Shot queue:** the current lantern is held by the boatman; the next is
  in his other hand or hangs from a hook on the punt. A subtle queue line
  shows up to 3 ahead in Festival/Endless, 2 in Classic.
- **Moon:** always visible, large, beautiful. Doubles as the gravity
  indicator and the up/down compass.
- **Wind Tokens (Festival only):** paper fans tucked into the boatman's hat.
- **Pause:** small lantern icon in the corner. Tapping it slows the world
  to a stop; the moon dims slightly; a parchment menu unrolls (Resume /
  Restart / Quit).

### 5.5 The shot moment

This is the experience. Hold to aim, drag to adjust, release to fire.

- **Aim line** is paper string with a tiny ink dot at the snap target. The
  bounce point on the wall flashes faintly when the line passes through it.
- **Color preview at snap target:** the snap hex briefly shows a ghost of
  the incoming lantern's color, so you see the match potential before
  committing. (This is a kindness to new players. Toggleable off.)
- **Release:** the lantern flies. The world's ambient sound dims. Travel
  is fast (~200ms total) but readable.
- **Snap:** soft "tak" sound. The lantern joins the cluster.
- **Match:** if 3+ same-color contiguous, a quarter-second beat passes (long
  enough to register), then they fade with a chime — pitch rises with chain
  size — and the dropped cluster begins falling toward the river.
- **Drop animation:** lanterns drift in the gravity direction, gently
  spinning, with a faint trail. They land on the river and float away as
  the score number increments. **This is the most satisfying moment in the
  game and deserves its own audio/visual budget.**
- **No hit shakes.** No screen flashes. No combo banners. The world tells
  you what happened by *being* what happened.

### 5.6 Win / loss

**Win** (board cleared):
- The trellis releases all remaining ropes. Lanterns float upward toward the
  moon en masse. Camera pans up. The moon brightens. Score tallies as soft
  gold-dust numerals. Holds for 3 seconds. Tap to continue.

**Loss** (lantern crosses the dead line):
- The dead-line lanterns touch the river. The flames extinguish in a wave
  outward. The world quiets. The boatman lowers his head. A small parchment
  appears: "Try again?" with **Restart** / **Map**. No "GAME OVER" stamp.
  The game accepts your loss the way the moon accepts a cloudy night.

### 5.7 Idle / suspend

If the user navigates away (browser tab hidden, launcher iframe suspended),
the game pauses **silently** — no big "PAUSED" overlay. The moon dims, the
boatman exhales, and the world holds. Returning resumes seamlessly.

---

## 6. Progression

### 6.1 The Festival journey (campaign)

Eight chapters, each 8 stages. Each chapter introduces one mechanic and
ends with a **Lantern Finale** — a single longer stage that uses all
mechanics introduced so far in concert.

| Chapter | Title                  | Mechanic introduced     | Aesthetic                |
| ------- | ---------------------- | ----------------------- | ------------------------ |
| 1       | The Quiet River        | Core mechanics only     | Lone boat, full moon     |
| 2       | The Burning Hour       | Ripening                | Autumn, falling leaves   |
| 3       | The Moon Dance         | Single moon shift       | Crowded festival square  |
| 4       | The Bamboo Forest      | Wall-tint shift         | Tinted bamboo grove      |
| 5       | The Two Moons          | Double moon shift       | Twin temples mirrored    |
| 6       | The Wind Festival      | Twin Lanterns power-up  | Open shoreline, kites    |
| 7       | The Orbit              | Continuous moon orbit   | Mountain peak, vertigo   |
| 8       | The Grand Festival     | Everything composed     | All previous combined    |

**Level design within a chapter** progresses on three axes:
1. **Density** — more starting lanterns, more colors-per-cluster.
2. **Mechanic intensity** — Chapter 3 stages 1-2 have a single moon shift
   at the midpoint; stages 7-8 have shifts triggered by player actions.
3. **Drop demand** — early stages clearable by pure popping; late stages
   require chain drops to clear in the available time/space.

**Branching is intentionally absent** in v1. Linear chapters keep narrative
clean and reduce content surface area; branching can be a v2 feature
(festival circuit *choice* as a meta-progression).

### 6.2 What progression unlocks

| Unlock                          | How                                |
| ------------------------------- | ---------------------------------- |
| Endless mode                    | Clear Festival Chapter 1           |
| Master mode (per chapter)       | Clear that chapter                 |
| Boatman cosmetics               | Clear each chapter                 |
| Trail effect cosmetics          | Earn 3 stars in a chapter (see below) |
| Music tracks (replayable)       | Clear each chapter                 |

**Star rating per stage:** 1 star = clear it, 2 stars = clear without the
trellis dropping more than 3 rows, 3 stars = clear in under N shots (N
varies). Stars are visible as ink dots beside the stage on the festival
map. Stars accumulate per chapter and gate cosmetic unlocks, never gate
progression itself.

### 6.3 No paywalls, no daily timers (other than the Daily challenge)

Moon-Lit is a single-payment / free-to-play-without-traps game. Daily
challenge is a *single seed shared by everyone today*; missing a day is
fine; old daily seeds are replayable but don't post to that day's
leaderboard.

---

## 7. Visual design

### 7.1 Palette

**Festival (mandatory night):**
- Background: deep indigo `#0E1538` to soft navy `#1B274D` gradient.
- Moon: warm white `#F5E9C9` with a faint amber halo `#E8B770` at 20% opacity.
- Lanterns (the six match colors):
  - Red `#D9434A`
  - Orange `#E89B4F`
  - Yellow `#F2D26A`
  - Jade `#7AB89C`
  - Indigo `#5A7AC9`
  - White `#F4ECDA` (warm, not stark)
- Trellis: bamboo `#8C6B3A` with darker `#5C4322` knots.
- River: midnight `#0A0F22` with subtle ripple highlights `#3D5681`.
- Ember: charcoal `#2A2A2A` with a barely-visible `#5C2010` ring.

**Classic (theme-aware):** abstract glossy spheres, neutral palette, full
support for `data-theme="light"` and `data-theme="dark"`.

### 7.2 Texture & line

- Paper-grain texture overlay on all UI panels (extremely subtle, 5-8%
  opacity, fixed at world scale).
- Ink-line edges on parchment elements (mode-select scroll, festival map,
  pause menu).
- Lanterns are *paper*, not glass. They glow from inside, not from a CSS
  gloss highlight. A faint inner-shadow + radial gradient gets the effect.

### 7.3 Motion principles

- **No bouncing.** Easing is `ease-out` or `ease-in-out`, never elastic.
- **No bloom or screen flash.** Glow is local to the lantern.
- **All animations gated on `Arcade.settings.reducedMotion()`:** when
  reduced, the moon teleports between positions instead of drifting; ripening
  state changes are stepped, not blended; drop animations are 50% shorter.
- **Trail effect on shots** is a thin ink line that fades over ~150ms. Not
  a particle stream.

### 7.4 Theme handling

- Festival mode: opts out of theme. Always night. Documented in README per
  §5 of [GAME_INTEGRATION.md](../../paulgibeault.github.io/GAME_INTEGRATION.md).
- Classic mode: full theme support. Light theme = "morning festival market"
  pastels; dark theme = the main palette above.
- Splash, mode-select, festival map: render in a fixed midnight palette
  regardless of theme — these are pre-game framing screens, not gameplay.

### 7.5 Typography

- One serif (paper-cut style) for game titles and chapter cards.
- One clean sans for HUD numerals (legibility at small sizes).
- All sizing in `rem` so `Arcade.settings.fontScale()` flows through for free.
- For canvas-rendered text (score numerals if drawn on canvas), multiply
  font sizes by `fontMult` cached from `onSettingsChange`.

---

## 8. Audio direction

- **Ambient bed:** soft river water, distant taiko at irregular intervals
  (every ~30s), occasional koto note. No melody, no loop seam.
- **Lantern release:** soft "shh" (paper).
- **Snap:** woody "tak."
- **Match (chain pitch):** 3-match = base note; 4 = +major third;
  5 = +fifth; 6+ = +octave. Chain 10+ adds a temple-bell harmonic.
- **Drop:** cascading water-droplet sounds, one per lantern.
- **Trellis descent:** rope creak.
- **Ember formation:** soft fizz.
- **Win:** single low temple bell, holds for ~3 seconds with overtones.
- **Loss:** koto detuning slowly downward.

All audio gated by `Arcade.settings.audioVolume()` (read in JS, multiply
gain). Audio context suspended on `onSuspend`, resumed on `onResume`.

---

## 9. Determinism & seeds

**Yes, use seeds. Universally.** Every board state in every mode is the
deterministic product of a 32-bit seed plus the player's shot list. This
unlocks:

1. **Daily Challenge.** One seed per day, derived from the date
   (`moon-lit-daily-2026-05-05` → hash → seed). Everyone plays the same board.
2. **Endless reproducibility.** Endless seeds itself from
   `Date.now() ^ playerName.hashCode()` at run start. The seed is shown
   on the game-over screen ("Your run: `4729183`") so players can share
   memorable runs and friends can play the same one.
3. **Save/resume across iframe eviction.** We save `(seed, level, shotList)`
   instead of serializing every lantern position. Resume replays the shots
   silently and the board reappears bit-for-bit identical. Tiny payload
   (~few KB even for long runs).
4. **Replays.** Same `(seed, shotList)` is a complete replay. We can offer
   replay sharing later as a v2 feature. (Festival levels are also seeded —
   each level has a designer-chosen seed baked in, so the "Stage 4 of
   Chapter 3" board is the same for every player every time. Designer-set
   seeds are stored in a static level manifest; we never roll them on the
   client.)
5. **Bug reports.** "Seed `4729183`, level 12, shot 17" reproduces exactly.
6. **Multiplayer-ready.** When Vs. Mode lands, deterministic shot resolution
   means each peer can simulate locally and verify. We don't need to ship
   the full board state across the wire — only the seed and shot deltas.

### 9.1 PRNG

- Use **mulberry32** (12 lines, well-distributed enough for board generation).
- **Never call `Math.random()`** anywhere in gameplay code. Lint rule + code
  review. Tests assert determinism: same seed + same shotList → byte-equal
  board state.

### 9.2 What the seed determines

- Initial board layout (Endless / Daily / generated levels).
- Color sequence in the shot queue (Festival levels included — designer
  seeds reach into chapter manifests for hand-tuned queue rhythms).
- Special-shot drop schedule (when a Star/Bomb/Bolt enters the queue).
- Ripening shot-count thresholds (which lantern starts at which age in
  pre-set boards is part of the level data, not the seed; in Endless they
  start fresh).
- Moon orbit pattern (in chapters where it's procedural; chapters 3–7 are
  designer-scripted).

### 9.3 What the seed does NOT determine

- Player input. The shotList is what the player did, recorded in real time.
- UI animations, idle character animations, ambient audio. These are
  decorative and non-determining.

### 9.4 State schema (saved via SDK)

```js
// arcade.v1.moon-lit.run
{
    mode: 'festival' | 'classic' | 'endless' | 'daily' | 'master',
    chapter: 3,           // festival/master only
    stage: 4,
    seed: 4729183,
    shotList: [           // each entry is one fired shot, ordered
        { angle: 1.234, swap: false },
        { angle: 0.987, swap: true },
        // ...
    ],
    score: 28140,
    startedAt: '2026-05-05T20:14:22.000Z'
}

// arcade.v1.moon-lit.progress
{
    festivalCleared: { 1: 3, 2: 2, 3: 1, /* chapter: stars */ },
    masterUnlocked: [1, 2],
    cosmeticsUnlocked: ['hat-fox', 'kimono-blue', 'trail-ink'],
    cosmeticsEquipped: { hat: 'hat-fox', kimono: 'kimono-blue', trail: 'trail-ink' }
}

// arcade.v1.moon-lit.settings
{
    aimAssist: true,
    snapPreview: true,
    queueDepth: 'standard' | 'minimal' | 'extended'
}

// (other state lives in arcade.v1.moon-lit.* via Arcade.scores / Arcade.stats)
```

`shotList` grows during a run; we coalesce writes (debounce 250ms, flush
on `onSuspend`) so we don't thrash localStorage on every shot.

---

## 10. Arcade SDK integration plan

### 10.1 Identity & boot

```html
<script src="/arcade-sdk.js"></script>
<script>Arcade.init({ gameId: 'moon-lit' });</script>
```

```js
await Arcade.ready;
const run = Arcade.state.get('run');
if (run) showContinuePrompt(run);
```

### 10.2 State keys (all under `arcade.v1.moon-lit.*`)

| Key                  | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `run`                | Current in-progress run (resume payload) |
| `progress`           | Persistent progression (chapters, stars, cosmetics) |
| `settings`           | Game-specific preferences                |

### 10.3 Leaderboards (`Arcade.scores.add` / `.list`)

| Category             | Meta payload                            |
| -------------------- | --------------------------------------- |
| `classic`            | `{ levelReached }`                      |
| `festival`           | `{ chapter, stage, stars }`             |
| `endless`            | `{ seed, shotsFired }`                  |
| `daily-YYYY-MM-DD`   | `{ seed }` (one entry per player per day) |
| `master-{chapter}`   | `{ stars }`                             |

### 10.4 Stats (`Arcade.stats.update`)

```js
// arcade.v1.moon-lit.stats.lifetime
{
    runs: 0,
    pops: 0,
    drops: 0,
    longestChain: 0,
    embersRescued: 0,    // dropped while still glowing
    totalScore: 0,
    daysPlayed: []       // ISO date list
}
```

Use `Arcade.stats.getOrInit('lifetime', DEFAULTS)` so adding new fields
later doesn't require a migration.

### 10.5 Lifecycle

- `Arcade.onSuspend(...)`: pause the rAF loop, suspend the AudioContext,
  flush pending state writes, cancel any in-flight network requests (none
  in v1).
- `Arcade.onResume(...)`: reset the frame-time accumulator, resume audio,
  re-request rAF.
- `Arcade.onStateReplaced(...)`: reload progress and run from
  `Arcade.state.get(...)`. If a run is in progress, prompt the player
  before discarding (an import is destructive).
- `Arcade.session.start({ persistKey: 'sessionElapsed' })` for the
  in-game elapsed timer.

### 10.6 Settings

- `Arcade.settings.fontScale()` → flows through `rem` automatically; cache
  a `fontMult` for canvas-drawn text.
- `Arcade.settings.theme()` → applied to Classic only; Festival forces
  night palette and is documented as theme-opt-out.
- `Arcade.settings.reducedMotion()` → see §7.3.
- `Arcade.settings.audioVolume()` → multiplied into the master gain node.
- `Arcade.settings.handedness()` → flips HUD corners, boatman primary
  position, Twin Lanterns mirror axis.

Subscribe via `Arcade.onSettingsChange(snap => ...)` and re-cache.

### 10.7 Toasts

`Arcade.ui.toast('Saved!', { kind: 'success' })` for transient feedback —
e.g. on cosmetic unlock outside of a dedicated celebration screen.

### 10.8 Standalone

- The game must work end-to-end at `https://paulgibeault.github.io/moon-lit/`
  with no console errors and `Arcade.context.framed === false`.
- All Festival features should function standalone — peer multiplayer is
  the only thing that gates on framed mode (and it's out of scope for v1).

### 10.9 Iframe sandbox & PWA

- No top-level navigation. No `window.open`.
- `manifest.json`: `"scope": "/moon-lit/"`, `"start_url": "/moon-lit/"`.
- Service worker registered with `{ scope: '/moon-lit/' }` if used; never
  caches `/arcade-sdk.js` or anything outside `/moon-lit/`.

### 10.10 Card assets

- 512×512 `images/moon-lit.png` PR'd against `paulgibeault/paulgibeault.github.io`.
- Subtitle ≤ 20 chars: **"Lantern Shooter"**.
- Update both `#games` and `#view-launcher` sections in
  [index.html](../../paulgibeault.github.io/index.html).

---

## 11. Acceptance for v1

Before we call v1 done, the game should pass every item in §13 of
[GAME_INTEGRATION.md](../../paulgibeault.github.io/GAME_INTEGRATION.md), plus
these game-specific checks:

- [ ] A new player can launch the game and fire their first shot in under
      10 seconds without reading any text.
- [ ] Same `(seed, shotList)` produces byte-equal board state across two
      independent runs (determinism test).
- [ ] Resuming a Festival run after iframe eviction restores score, level,
      board state, and Wind Token count exactly.
- [ ] Switching `reducedMotion` mid-level immediately mutes orbit
      animations and shortens drop animations without a reload.
- [ ] Switching `handedness` flips HUD corners and Twin Lantern mirror
      axis without a reload.
- [ ] Daily challenge URL `?daily=2026-05-05` produces the same board for
      every test profile.
- [ ] Lifetime stats survive a launcher Save → Load round-trip.

---

## 12. Resolved decisions

1. **Hex grid orientation** — pointy-top with offset rows (odd-r offset).
   Matches Bust-A-Move convention; gravity rotation works cleanly because
   the same offset-coords logic transposes 90° with a coordinate swap.
2. **Moon-shift trigger in late chapters** — **shot-count based.** Stays
   consistent with ripening (also shot-count based), preserves determinism,
   and is easy to telegraph (a small shot-counter ring around the moon
   fills as the next shift approaches).
3. **Daily challenge** — **endless retries** allowed; per-day-best posts
   to the leaderboard. Friendly default; players can keep trying until
   bedtime.
4. **Endless difficulty curve** — **adaptive, but deterministic.** The
   curve is a function of the player's *score* and *shots fired so far*,
   both of which are deterministic from `(seed, shotList)`. The seed
   determines the *shape* of the escalation (which colors come in waves,
   when special-shot droughts occur); current score determines *where*
   along that shape we are. No RNG-based adaptation — same inputs, same
   board, every time.
5. **License & monetization** — **MIT licensed, free, no monetization,
   no ads, no telemetry.** Cosmetics are unlocked through play only.
6. **Render target** — **Canvas2D, 30fps animation target.** Battery is
   the priority. Specific commitments:
   - Canvas2D, no WebGL (avoids the per-page WebGL context cap and the
     GPU power draw on mobile).
   - **30fps target** for ambient/idle animations; **60fps** only during
     active aim (the dotted aim line) and shot travel. Detect input idle
     for 500ms → drop to 30fps; any pointer/key event → bump to 60fps for
     1 second.
   - Dirty-region rendering: split the canvas into a static background
     layer (board + trellis + moon, redraw only on state change) and a
     dynamic layer (in-flight shot, drop animations). Redraw the static
     layer only when something on it actually changed.
   - `Arcade.onSuspend` cancels rAF and calls `audioContext.suspend()`
     immediately. The hidden iframe must draw zero CPU.
   - When `Arcade.settings.reducedMotion()` is true, drop ambient
     animation frame rate further (~10fps) and skip the moon's drift
     interpolation entirely.
   - No bloom, no shaders, no continuous particle systems. Drop trails
     are a single fading line, not a particle stream.
   - Audio decoding is lazy — only the next chapter's clips live in
     memory; clips for unloaded chapters are released.

---

## 13. What v1 does **not** include

- Vs. Mode multiplayer.
- Replay sharing UI.
- Branching campaign.
- Custom level editor.
- IndexedDB-backed history.
- Cosmetic store / shop UI.
- Social features beyond the Arcade-provided leaderboards.

These are good follow-on candidates after v1 ships.
