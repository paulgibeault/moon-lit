# Puzzle quality rubric

A checklist for Puzzle mode boards (`js/puzzles.js`). Solvability is proven by
`tools/test-puzzles.js`; this rubric measures *how* a puzzle plays and grades it
against per-chapter targets.

```
node tools/measure-difficulty.js --rubric [from] [to]       # table + PASS/FAIL
node tools/measure-difficulty.js --rubric --json out.json   # also write JSON
node tools/measure-difficulty.js --rubric --strict          # exit 1 on any FAIL
node tools/measure-difficulty.js --rubric --regrade docs/puzzle-rubric-baseline.json
                                                            # re-grade saved metrics (instant)
node tools/measure-difficulty.js 27 --candidates            # every pocket, every step
```

The full run over all 50 puzzles takes about 3 s on 11 worker threads (about 8 s
with `--jobs 1`). The rubric is not part of `npm test`.
`tests/puzzle-metrics.test.js` covers the metric functions on synthetic data
and on puzzle 3.

Code: `tools/puzzle-metrics.js` (metrics, chapter map, `CHAPTER_TARGETS`,
`checkRubric`) and `tools/measure-difficulty.js` (CLI, worker pool).
Baseline: `docs/puzzle-rubric-baseline.json`.

## How the metrics are measured

Every metric is measured along the **solution line**. This is the solver's
first fair solution: every aim window is at least 2° wide and no shot uses more
than 1 bounce, which is the same bar as `test-puzzles.js`. Each state on that
line is a **decision point**, one per shot actually used. At each decision
point, the tool sorts every fair pocket for the current lantern into two
groups:

- **viable**: the puzzle can still be won after this shot.
- **losing**: it can't.

All metrics share one memoized win-from-here search. That search mirrors the
solver: a win is checked before any descent, and a landing past the dead line
is an immediate loss.

The search prunes **dead states**. If a lantern that the goal requires removing
is anchored (it sits in the trellis band, which sinks with descent) and no
remaining shot in the queue has its color, the state is lost. A stone counts
too: an anchored stone in clear-all can never be removed. An anchored lantern
can only leave by being popped, so this prune is exact. On puzzles 1–25, 27–36
and 38–50, a run with `--no-prune` produced identical metrics. The prune is what
made the full run fast: puzzles #26 and #37 have spare-shot queues and used to
take more than 5 minutes each. They now take about 1 s.

| Metric | Definition |
|---|---|
| **openings** | viable/total fair pockets at a decision point. |
| **luck** | The product of the openings ratios along the line: the win chance of a player who picks a uniformly random fair pocket every shot. |
| **obvious move** | The fair pocket with the largest immediate removal (popped + dropped). If several pockets tie, take the one that removes the most targets, then the one with the smallest \|aim angle\| (closest to straight up), then the one with the lowest angle. If the best pocket removes nothing, the decision has no obvious move. |
| **temptation** | The number of decision points where the obvious move **loses**. This replaces the old "greedy trap" flag; `greedyTrap` is kept as an alias of the per-step flag. |
| **bait** (reported, not graded) | Losing pockets that tie with the obvious move on removal. The tie-break hides them, but a player might still pick one. |
| **depth** | The number of tight decisions: decision points where viable/total ≤ `TIGHT_RATIO` (0.34, so 1 of 3, 2 of 6, 3 of 9). |
| **late insight** | The 1-based index of the tightest decision (lowest viable/total; on a tie, the later shot wins). A multi-shot puzzle whose tightest decision is shot 1 is **front-loaded**, shown with `*` in the table. |
| **intent** | The number of distinct winning lines from the start, counted up to 20 ("20+"). Two lines are the same if they produce the same sequence of board states after each shot. A board state is the solver's `stateKey` plus the descent phase. This merges neighbouring pockets that land in equivalent spots. In clear-all every win ends on the empty board, so all finishing pockets from one state count as one line. |

### Reconciling with the old greedy trap

The old flag took the first max-removal pocket in sweep order (the leftmost
aim). When tied pockets had different outcomes, that pick was arbitrary. The
case that matters is #38, shot 2: six yellow pockets each pop 3, two of them win
and four lose. The old rule picked a losing one at −30.5° and reported a trap.
The new tie-break picks the straightest pocket, at −12°, which wins, so #38 now
reports temptation 0 and **bait 4** at shot 2. #49 is still a true temptation
at shot 1.

### Caveats

- **Depth counts the finishing shot.** In clear-all the last pop often has only
  one or two viable pockets, so it counts as tight without needing any
  planning. Read depth together with late insight and openings.
- **Everything follows one solution line.** If the puzzle has more than one
  winning line, decision points on the other lines are not measured. Intent
  tells you when that matters.

## Per-chapter targets

The targets are defined in one place: `CHAPTER_TARGETS` in
`tools/puzzle-metrics.js`. Chapter boundaries are read from the
`// ── Chapter N · Title` headers in `js/puzzles.js`. Currently the chapters
cover ids 1–6, 7–12, 13–18, 19–24, 25–30, 31–40 and 41–50.

| Ch | Title | min shots | max luck | min depth | min temptation | max intent | not front-loaded |
|---|---|---|---|---|---|---|---|
| 1 | First Light | – | – | – | – | – | – |
| 2 | Golden Targets | – | – | – | – | – | – |
| 3 | Stone Lanterns | – | 25% | 1 | – | – | – |
| 4 | Deep Water | 2 | 20% | 2 | 1 | 3 | – |
| 5 | Night Pressure | 2 | 12% | 2 | 1 | 3 | – |
| 6 | The Weaver's Knots | 2 | 8% | 2 | 1 | 3 | yes |
| 7 | The Moonless Hour | 2 | 4% | 2 | 1 | 3 | yes |

Why these values:

- **Chapters 1–2 are tutorials** and have no targets. #7 (100% luck) is
  forgiving on purpose. Single-shot "spot the pocket" boards are fine at this
  stage.
- **Chapter 3** introduces stones. Its puzzles should have at least one real
  read (depth 1). The cap of 25% sits well above the current worst score in
  the chapter (14.3%).
- **Luck caps tighten from 20% to 12% to 8% to 4%.** The 8% and 4% caps for
  Chapters 6 and 7 are the existing targets from the `js/puzzles.js` header.
  The 20% and 12% caps for Chapters 4 and 5 continue the curve. Most puzzles
  in those chapters already sit at 1–12%; the outlier is #19 (30%). (#27 and
  #29 were 45.8% and 92.9% before the Chapter 5 rework.)
- **Depth ≥ 2 from Chapter 4 on.** Depth 1 is often only the finishing shot
  (see Caveats). Two tight decisions means the player has to plan at least one
  of them.
- **Temptation ≥ 1 from Chapter 4 on.** This is the "won the battle, lost the
  war" moment the design language aims for. Only #49 has one today, so this is
  the main rework signal (all of Chapter 5 and #49 have one).
- **Intent ≤ 3 from Chapter 4 on.** A puzzle should have one idea, with one or
  two variants at most. 20+ means spare shots or loose geometry let almost
  anything win.
- **Queue length ≥ 2 from Chapter 4 on.** With one shot, depth and temptation
  both collapse into a single pocket choice.
- **Not front-loaded in Chapters 6–7.** In the cruelty set the key insight
  should come mid-line, not on the first shot. 15 of the 39 multi-shot puzzles
  are currently front-loaded.

## Baseline (`docs/puzzle-rubric-baseline.json`)

24 of 50 puzzles pass: all of Chapters 1–3 and all of Chapter 5 (reworked
with the rubric; see Reworks below). The original baseline was 18/50.

- **Temptation is missing almost everywhere else.** It is 0 in every Chapter
  4, 6 and 7 puzzle except #49. This is the dominant failure.
- **Intent is too high:** 20+ on #37, #40 and #43; between 5 and 10 on #22,
  #24, #39 and #49.
- **Depth is too low (below 2):** #19, #20, #22, #23, #31, #34, #36, #37 and
  #43.
- **Luck is over the cap:** #19 (30%), #31 (8.3%, just over) and #43 (4.3%,
  just over).
- **Single-shot puzzles:** #2, #4, #5, #9, #10, #12, #13 and #17 are in
  Chapters 1–3, which have no minimum queue length, so they pass. #20 (Chapter
  4) and #31 (Chapter 6) fail on shots, depth and temptation, and #31 also
  fails on luck.
- **Front-loaded in Chapters 6–7:** #34, #35, #36, #38, #42, #44, #47 and #49.

## Authoring loop

1. **Draft** the board in `js/puzzles.js`, following the geometry rules in its
   header comment.
2. **Prove it:** `node tools/test-puzzles.js <id>`. It must PASS with 2° aim
   windows.
3. **Measure:** `node tools/measure-difficulty.js --rubric <id>`, then
   `node tools/measure-difficulty.js <id> --candidates` to see every pocket at
   every step, which one was played and which one is the obvious move.
4. **Tune** against the reported failures:
   - **Intent too high or luck too high:** remove slack shots from the queue,
     or make the spare colors useless.
   - **No temptation:** add anchored bait, a bigger pop that strands or seals
     something.
   - **Front-loaded:** move the narrow seat later in the queue.
5. **Regenerate the baseline** after a batch of changes:
   `node tools/measure-difficulty.js --rubric --json docs/puzzle-rubric-baseline.json`.
   To experiment with `CHAPTER_TARGETS`, use `--regrade` on the saved JSON
   instead of re-measuring.

## Reworks

All of Chapter 5 was reworked. Three trap types appear:

- **Orphan seam** (#27, #29, from #49). An anchored single can only leave
  through the one seam that joins it to a companion. The bait is a bigger pop
  that removes the companion first, so the single is stranded.
- **Anchored before hanging** (#25, #26, #28). Two groups of the shot's color:
  a big one that hangs and will fall later for free, and a smaller anchored
  one that only this shot can clear. The bait is the big hanging pop.
- **Park, don't pop** (#30). The bait pops a low pair. The right move pops
  nothing: it parks beside an anchored lantern so the next shot of that color
  clears both families at once.

- **#27 Midnight Cascade:** before: luck 45.8%, depth 0, temptation 0,
  intent 20+ (4 shots, 2 of them spare). After: queue `yellow, red, blue`
  (zero slack), luck 0.1%, depth 3, temptation 1 at shot 1 (the fat yellow
  tail, rm5, beats the wall seam, rm4), intent 1. Sunk 8 rows so the seam has
  a 3° window on a timed board. Luck is cruelty-set low, but the only real read
  is shot 1. Shots 2–3 each have one productive pocket, and a random park loses.
- **#29 Last Light:** before: luck 92.9%, depth 0, temptation 0, intent 20+
  (and `SUNK(5)` was odd, which flipped row parity). After: queue
  `blue, green`, luck 2.4%, depth 2, tightest decision at shot 2, temptation 1
  at shot 1 (the anchor pair, rm6, drops the hanging spirit, which was the
  wall spirit's only companion), intent 1. Three blue groups (veil, anchor,
  decoy). Only the low veil is right.
- **#25 The Sinking Trellis:** before: luck 3.6%, depth 1, temptation 0. After:
  queue `yellow, blue, red`, luck 3.7%, depth 3, tightest decision at shot 3,
  temptation 1 at shot 1 (the central yellows, rm6, hang and fall later; the
  anchored corner yellow, rm4, is the only win). Still 3 shots with
  `descentEvery: 2`, so the tutorial board sinks once mid-puzzle.
- **#26 Ember Rush:** before: 7-shot queue, luck 6.3%, depth 1, intent 20+.
  After: queue `red, green, blue, yellow` (zero slack), luck 2.1%, depth 2,
  tightest decision at shot 4, temptation 1 at shot 3, intent 1. Shots 1–2 are
  deliberately open, since this is the timed-mode intro.
- **#28 Stones in the River:** before: luck 6.3%, depth 1, intent 5. After:
  luck 10.3%, depth 2, temptation 1 at shot 1 (the low blues pop 3 and drop the
  stone, rm4, but hang from the red and fall later anyway), intent 1. The
  "bed the spare" idea is gone; the description changed to match.
- **#30 Moonset:** before: luck 11.7%, depth 1, intent 7. After: queue
  `paper, yellow, yellow`, luck 2.1%, depth 2, temptation 1 at shot 2, intent
  1. The description no longer says "two rows" (the board is now four).

#25, #26, #28 and #30 started from candidates found by a local mutation search
over each original board, scored on this rubric. Each was then checked by hand
for an explainable trap, and stray lanterns attached to nothing were removed.
