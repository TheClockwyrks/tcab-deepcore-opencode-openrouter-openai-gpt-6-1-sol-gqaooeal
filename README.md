# Deepcore

**Depth is cheap. Height is expensive.** A browser-based subterranean dig-and-build game. Drill through four strata, sell mineral cargo, improve your pressure suit and jetpack, find exotic materials, and fabricate a five-component escape rocket. Cargo has real weight: a rich haul can leave you unable to lift off.

Choose **Standard** (restore your last manual save after a death) or **Hardcore** (death deletes the save), and a Quick, Standard, or Marathon world. There are no enemies. Gas, heat, falling, and the fuel needed for the climb home are danger enough.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. The game starts at its title screen. Audio unlocks on your first interaction.

## Production

```sh
npm run build
npm run preview
```

`dist/` is the complete static site, with `index.html` at its root. Serve that directory at any URL prefix. All bundled assets use relative URLs; there is no server-side component, network service, or credential. The build only bundles the finished, committed assets and does not run asset-generation tools.

## Controls

| Input | Action |
| --- | --- |
| A / D or Left / Right | Walk; drill a wall when grounded and flush against it |
| S / Down | Drill downward while grounded |
| W / Up / Space | Hold to fire the jetpack |
| E / Enter | Activate a camp service; confirm a highlighted control |
| I | Open or close cargo and field kit |
| Escape / P | Close a panel; pause or resume |
| M | Toggle sound |
| J | Jettison an unstable Core Sample |
| 1–6 | Dynamite, Plastic Explosives, Quantum Teleporter, Matter Transmitter, Nanobots, Emergency Fuel |
| Up / Down on menus or panels | Select a control |
| Mouse / touch | Choose menus and panel controls; use HUD controls |
| Backtick | Toggle the engine’s read-only diagnostics |

The miner uses the keyboard. Menus and panels also accept pointer and touch input. The drill never cuts upward. Open the inventory and **DROP** ore if cargo weight exceeds your lift limit. Visit the Ore Market to sell; the Fuel Depot to purchase fuel and repairs; and the Save Pad to save manually. A live Core Sample prevents saving and keeps counting down through panels, but pauses with the game.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The simulation tests run the actual Simple 2D engine on `@napi-rs/canvas`, with controlled clocks and dispatched keyboard/pointer events. They exercise generation, collisions, drill cadence, weight and fuel, purchases, supplies, hazards, saving, death, and the escape sequence.

## Original assets and structure

- `src/game.ts`: engine integration, input, asset loading, diagnostics.
- `src/state.ts`, `src/world.ts`, `src/simulation.ts`: immutable expedition transitions and render-free fixed-step simulation.
- `src/interface.ts`, `src/render.ts`: shared hit regions and canvas presentation.
- `src/debug.ts`: complete version-1 debug API, returned through `engine.debug`; nothing is published on the page.
- `assets/`: original generated sprites, eight prospector animation cycles, particles, sound cues, and music. `draw` and `draw-sheet` rendered the pixel art; `particle-2d` authored the live effects; `sfx-synth` and `sfx-sample` produced the cues; `music` sequenced the synth-pad/vibraphone score.
- `tools/produce_assets.py`: the one-time asset authoring recipe, retained for provenance. It requires the generation tools and is **not** part of installation or build.
- `showcase/`: player description, screenshots, and a gzipped drawing replay captured with the engine recorder.

The game uses the supplied Simple 2D engine for its frame loop, fitted canvas, action input, audio, asset loading, recorder, and debug overlay. Browser storage is optional; if it is unavailable the game remains playable without saving.
