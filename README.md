# Moon Glow

A lantern-festival bubble shooter for [Paul's Arcade](https://paulgibeault.github.io/).
Match six colors of paper lanterns to drop chains from a bamboo trellis.
Festival mode adds rotating gravity (the moon moves), lanterns that ripen
into embers over time, color-shifting bamboo walls, and a Twin Lanterns
power-up.

Status: M1 skeleton. No gameplay yet.

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
