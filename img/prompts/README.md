# Asset prompts & SVG sources

This folder holds the **source-of-truth design instructions** for the
background art used by `js/renderer/world.js` — the bamboo scenery and the
lantern / ember SVG markup.

The prompts here were used with image-generation tools to produce the
black-on-white silhouette PNGs in `../`. The SVG snippets here are the
hand-authored markup that `js/lantern-svg.js` re-renders at runtime.

If you ever need to regenerate or replace an asset, start from the prompt
here, run it through the generator, drop the result into `img/`, and the
existing pipeline in `js/assets.js` will bake it into a tinted silhouette
sprite automatically (white→transparent, dark→opaque, RGBA-aware).

---

## Bamboo prompts → sprites

The renderer composes scenery by layering sprites from a few categories
declared in `js/assets.js` (`BAMBOO_SOURCES`). One prompt usually produces
multiple variants (e.g. `-a`, `-b`, `-c`) which the renderer picks from at
random per-level for variety.

| Prompt | Final sprites in `img/` | `BAMBOO_SOURCES` key |
| --- | --- | --- |
| [bamboo-tall-stalk.md](bamboo-tall-stalk.md) | `bamboo-tall-a.png`, `bamboo-tall-b.png` | `tall` |
| [bamboo-cane-tileable.md](bamboo-cane-tileable.md) | `bamboo-cane-tall.png`, `bamboo-cane-short.png` | `cane` |
| [bamboo-root-base.md](bamboo-root-base.md) | `bamboo-base-a.png`, `bamboo-base-b.png` | `base` |
| [bamboo-culm-tip.md](bamboo-culm-tip.md) | `bamboo-tip-a.png`, `bamboo-tip-b.png`, `bamboo-tip-c.png` | `tip` |

Two more categories — `stalk` (small leafy branches), `cluster` (detached
leaf clusters), and `leaf` (single leaf) — were generated ad-hoc without
formal prompts and live as `bamboo-stalk-*.png`, `bamboo-cluster-*.png`,
and `bamboo-leaf-single.png`.

### Tile compatibility rules

Several sprites are designed to stack seamlessly:

- **cane** segments tile vertically — top and bottom edges are identical
  in horizontal position, width, and ink density, with no node ring at
  either edge.
- **base** matches the bottom of a cane (continues cleanly off the top
  edge of the base canvas).
- **tip** matches the top of a cane (continues cleanly off the bottom
  edge of the tip canvas).

The renderer stacks these as `base + N×cane + tip` to build a full-height
trunk of arbitrary length.

---

## SVG sources

- [lantern-svg-source.html](lantern-svg-source.html) — the original
  lantern frame markup (paper-glow gradients, internal reflections,
  thread detail). Ported into `js/lantern-svg.js` so `loadLanterns()`
  can rasterize each color variant at startup. **Edit `lantern-svg.js`
  for live changes**; this file is kept as a readable reference.
- [ember-svg-source.html](ember-svg-source.html) — ember/extinguished-
  flame markup used as a visual reference for `PALETTE.ember` color
  decisions in `js/constants.js`. Not loaded at runtime.

---

## Asset pipeline summary

1. Drop a black-on-white silhouette PNG (or transparent-bg RGBA PNG) into
   `img/` with a `bamboo-*.png` name.
2. Add the path to the correct array in `BAMBOO_SOURCES` (`js/assets.js`).
3. `loadBambooSprites()` runs at startup:
   - detects RGB vs RGBA source,
   - converts white pixels to transparent (or trusts source alpha),
   - tints the silhouette to deep night-indigo (`BAMBOO_TINT`),
   - measures the alpha bounding box so the renderer can draw by anchor
     without guessing margins.
4. `js/renderer/world.js` reads `BAMBOO_PARAMS` (live-tunable via the
   admin panel — backtick toggle, or `?admin=1`) and composes the scene
   from the loaded pools.
