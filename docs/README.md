# docs/

Design documentation for Moon Glow. The implementation in `js/` is the
source of truth — these docs capture intent, decisions, and the broader
visual plan.

## Current

- [design-concept.md](design-concept.md) — the canonical design doc. Theme,
  mechanics, determinism rules, modes (Classic / Festival / Endless / Daily
  / Master), determinism, tech policy. **Locked decisions live here.**
- [visual-design.md](visual-design.md) — the visual-polish design plan
  for the in-canvas scene (sky / lake / bamboo framing / boatman). The
  implementation has diverged in places (individual bamboo silhouette
  sprites instead of atlases), but the scene composition and palette
  guidance remain authoritative.

For art-asset prompts (the source-of-truth instructions used to generate
the bamboo silhouettes and lantern SVG markup), see
[../img/prompts/](../img/prompts/).

## archive/

Historical reference only — these are kept so context isn't lost, but
they describe pre-implementation state and their internal cross-references
may be stale. Do not treat them as current truth.

- [archive/session-handoff-pre-m1.md](archive/session-handoff-pre-m1.md) —
  the session-pause handoff from before M1 (project skeleton). The game
  was still called "pop-em" at that point.
- [archive/bust-a-move-reference.md](archive/bust-a-move-reference.md) —
  background analysis of *Bust-A-Move* / *Puzzle Bobble* that informed the
  initial design concept.
- [archive/playthrough-feedback.md](archive/playthrough-feedback.md) —
  early playthrough notes. The feedback items have since been addressed
  in code; kept as a snapshot of what drove some tuning decisions.
