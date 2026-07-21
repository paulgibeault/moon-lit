// Managed WebAudio SFX for moon-lit, via the launcher SDK's `Arcade.audio`
// (SDK >= 3.5.0). This is the game's single audio module.
//
// Conventions (fleet Arcade.audio conventions, see the launcher's
// GAME_INTEGRATION.md §5):
//   A1 — cues are registered ONCE here at module load. Audio is purely local,
//        so no `await Arcade.ready` is needed; the SDK's classic <script> +
//        `Arcade.init(...)` in index.html have already run by the time this
//        ES module evaluates, so `window.Arcade.audio` is present.
//   A2 — every play-site in the game goes through the one `sfx()` wrapper
//        below, which feature-detects `Arcade.audio` (also R5). moon-lit has
//        NO in-game sound setting, so the wrapper is a pure feature detect.
//   A3 — the launcher owns volume + the global mute button; this module adds
//        no volume slider and no mute of its own. `play()` is free + silent
//        when the user has muted.
//   A4 — cue names are lowercase-kebab and event-shaped.
//   A5 — conservative, gentle sound design. moon-lit is a calm lantern-festival
//        game, so the palette is short (<=0.25s, except the win/loss jingles),
//        low-gain (<=0.35) sine/triangle voices.
//
// Sound design follows docs/design-concept.md §8, adapted to the synth-only
// palette Arcade.audio provides: the doc's sample-based textures (paper "shh",
// woody "tak", rope creak, cascading water droplets, temple bell, koto) are
// APPROXIMATED with short noise/sine/triangle voices — they are gestures in the
// right register, not the sampled instruments the doc imagines. Sound
// aesthetics need a human ear pass (the implementing agent cannot listen).

const audio = () =>
  (typeof window !== 'undefined' && window.Arcade && window.Arcade.audio)
    ? window.Arcade.audio
    : null;

// A2 — the single play-site wrapper. Silent no-op when Arcade.audio is absent
// (e.g. standalone against a pre-3.5.0 cached SDK) or when the launcher has
// muted (the SDK short-circuits before touching the AudioContext).
export function sfx(name, opts) {
  const a = audio();
  if (a) a.play(name, opts);
}

// Match cue pitch rises with the size of the cluster that popped, per the
// design's chain-pitch ladder (3 = base note, 4 = +major third, 5 = +fifth,
// 6+ = +octave). Passed as a per-play `freq` override to the 'match' cue.
const MATCH_BASE_HZ = 523.25; // C5
export function matchFreq(count) {
  if (count >= 6) return MATCH_BASE_HZ * 2;     // +octave
  if (count === 5) return MATCH_BASE_HZ * 1.5;  // +perfect fifth
  if (count === 4) return MATCH_BASE_HZ * 1.25; // +major third
  return MATCH_BASE_HZ;                          // 3-match base note
}

// A1 — single registration site. Runs once at module load; skips silently if
// the SDK audio surface is unavailable.
(function registerCues() {
  const a = audio();
  if (!a) return;

  a
    // Lantern release — soft paper "shh". Noise, very low gain: this fires on
    // every shot, so it must sit low in the mix (A7).
    .cue('lantern-launch', { type: 'noise', dur: 0.12, gain: 0.10, attack: 0.01, release: 0.10 })
    // Match / clear — gentle chime. The caller overrides `freq` per cluster
    // size via matchFreq() so the pitch rises with the chain.
    .cue('match', { type: 'triangle', freq: MATCH_BASE_HZ, dur: 0.16, gain: 0.22, attack: 0.005, release: 0.14 })
    // Chain-drop — a soft falling water-droplet blip as lanterns cut loose and
    // fall toward the river.
    .cue('drop', { type: 'sine', freq: 880, toFreq: 440, dur: 0.10, gain: 0.13, release: 0.08 })
    // Trellis advance — low rope creak when the trellis descends a row.
    .cue('trellis', { type: 'triangle', freq: 130, toFreq: 98, dur: 0.18, gain: 0.14, attack: 0.02, release: 0.14 })
    // Dead-line warning — a tenser, slightly higher creak when a descent is
    // imminent (the design's "trellis creaks at N-2" cue).
    .cue('dead-line-warning', { type: 'triangle', freq: 165, toFreq: 120, dur: 0.20, gain: 0.16, attack: 0.01, release: 0.16 })
    // Menu / UI click — soft woody "tak".
    .cue('menu-click', { type: 'triangle', freq: 360, dur: 0.05, gain: 0.12, release: 0.04 })
    // Win — a single low temple bell with quiet overtones (a chord: all voices
    // start together, delay 0). The design asks for a ~3s hold with overtones;
    // kept to ~1.4s to stay conservative (A5).
    .cue('win', [
      { type: 'sine', freq: 196, dur: 1.4, gain: 0.20, attack: 0.005, release: 1.2, delay: 0 },
      { type: 'sine', freq: 392, dur: 1.1, gain: 0.10, attack: 0.005, release: 1.0, delay: 0 },
      { type: 'sine', freq: 587, dur: 0.8, gain: 0.06, attack: 0.005, release: 0.7, delay: 0 },
    ])
    // Loss — "koto detuning slowly downward": three triangle voices, each
    // gliding down in pitch, played back-to-back into a low resolve.
    .cue('game-over', [
      { type: 'triangle', freq: 392, toFreq: 370, dur: 0.20, gain: 0.16, release: 0.16 },
      { type: 'triangle', freq: 330, toFreq: 300, dur: 0.20, gain: 0.16, release: 0.16 },
      { type: 'triangle', freq: 262, toFreq: 210, dur: 0.40, gain: 0.18, release: 0.34 },
    ]);
})();
