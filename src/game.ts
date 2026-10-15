import type { Game, InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  copy,
  initial,
  nearbyBuilding,
  snapshot,
  type Assets,
  type DeepcoreState,
  type ReadState,
} from "./state";
import { debugApi, type DeepcoreDebugApi } from "./debug";
import { controls, hit, menuItems } from "./interface";
import {
  camera,
  checkDeath,
  effect,
  resumeSave,
  startExpedition,
  step,
  transact,
} from "./simulation";
import { render } from "./render";

export type { DeepcoreState, DeepcoreDebugApi };
export const BACKGROUND = "#101c25";

// Vite emits the committed files and rewrites these URLs. The engine still owns
// every actual load, with a relative path under its supplied assets root.
const urls = import.meta.glob<string>("../assets/**/*.{png,json,wav}", {
  query: "?url&no-inline",
  import: "default",
  eager: true,
});
function enginePath(url: string): string {
  // With a relative Vite base, production ?url imports are resolved against the
  // bundle URL and may already be absolute. Strip only the emitted assets root,
  // retaining development subdirectories, before handing the engine its path.
  const path = /^[a-z][a-z0-9+.-]*:/i.test(url) ? new URL(url).pathname : url;
  const root = path.lastIndexOf("/assets/");
  return root >= 0
    ? path.slice(root + "/assets/".length)
    : path.replace(/^\.\//, "").replace(/^assets\//, "");
}
async function loadAssets(api: InitApi<DeepcoreState>): Promise<Assets> {
  const assets: Assets = { images: {}, systems: {} };
  await Promise.all(
    Object.entries(urls).map(async ([source, url]) => {
      const name = source.replace("../assets/", ""),
        path = enginePath(url);
      if (name.endsWith(".png"))
        assets.images[name] = await api.assets.loadImage(path);
      else if (name.endsWith(".json"))
        assets.systems[name.replace("fx/", "").replace(".json", "")] =
          JSON.parse(
            await (await api.assets.load(path)).text(),
          ) as ParticleSystem;
      else
        await api.audio.load(
          name.replace("audio/", "").replace(".wav", ""),
          path,
        );
    }),
  );
  return assets;
}
function select(s: ReadState, index: number): DeepcoreState {
  let n = copy(s);
  const item = menuItems(n)[index];
  if (!item) return n;
  const go = (screen: C.ScreenName, menuIndex = 0) => {
    n.screen = screen;
    n.menuIndex = menuIndex;
    n.panel = null;
  };
  if (n.screen === "title") {
    if (item === C.TITLE_ITEMS[0]) n = resumeSave(n);
    else go(item === C.TITLE_ITEMS[1] ? "mode-select" : "how-to-play");
  } else if (n.screen === "mode-select") {
    if (index < 2) {
      n.mode = C.MODES[index]!;
      go("size-select");
    } else go("title", Number(n.hasSave));
  } else if (n.screen === "size-select") {
    if (index < 3) {
      n.worldSize = C.WORLD_SIZES[index]!;
      n = startExpedition(n);
    } else go("mode-select", C.MODES.indexOf(n.mode));
  } else if (n.screen === "how-to-play") go("title", Number(n.hasSave) + 1);
  else if (n.screen === "paused") {
    if (index === 0) go("in-mine");
    else if (index === 1) n = startExpedition(n);
    else go("title", Number(n.hasSave));
  } else if (n.screen === "victory" || n.screen === "game-over") {
    if (index === 1) go("title", Number(n.hasSave));
    else if (n.screen === "game-over" && n.mode === "standard" && n.hasSave)
      n = resumeSave(n);
    else n = startExpedition(n);
  }
  return n;
}
function activateHit(s: ReadState, id: string, api: UpdateApi): DeepcoreState {
  if (id.startsWith("menu:")) return select(s, Number(id.slice(5)));
  if (id.startsWith("building:")) {
    const building = id.slice(9) as C.BuildingId;
    if (building === "save-pad") return transact(s, "save");
    const n = copy(s);
    n.panel = building;
    n.panelIndex = 0;
    return n;
  }
  const control = controls(s).find((c) => c.id === id && c.enabled);
  if (!control) return copy(s);
  if (control.action === "mute") {
    api.audio.setMuted(!api.audio.muted());
    const n = copy(s);
    n.muted = api.audio.muted();
    return n;
  }
  if (control.action === "close") {
    const n = copy(s);
    n.panel = null;
    return n;
  }
  return transact(s, control.action, control.subject);
}
export function update(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): DeepcoreState {
  let s = copy(state);
  s.simTime += dt;
  s.muted = api.audio.muted();
  if (api.input.pressed("mute")) {
    api.audio.setMuted(!s.muted);
    s.muted = api.audio.muted();
  }
  const edges = Object.fromEntries(
    C.ACTION_NAMES.filter((a) => a !== "mute").map((a) => [
      a,
      api.input.pressed(a),
    ]),
  ) as Record<C.ActionName, boolean>;
  for (const sample of api.input.pointerSamples()) {
    const id = hit(s, sample.x, sample.y);
    if (sample.type === "move" || sample.type === "down") {
      s.hovered = id;
      if (id?.startsWith("menu:")) s.menuIndex = Number(id.slice(5));
    }
    if (sample.type === "down") {
      if (id) s.pointerDown[String(sample.id)] = id;
      if (id === "dismiss-notice:") s = transact(s, "dismiss-notice");
    }
    if (sample.type === "up") {
      const pressed = s.pointerDown[String(sample.id)];
      delete s.pointerDown[String(sample.id)];
      if (id && pressed === id) s = activateHit(s, id, api);
    }
  }
  if (s.screen !== "in-mine") {
    const items = menuItems(s);
    if (edges.up) s.menuIndex = (s.menuIndex - 1 + items.length) % items.length;
    if (edges.down) s.menuIndex = (s.menuIndex + 1) % items.length;
    if (edges.activate) s = select(s, s.menuIndex);
    else if (edges.pause) {
      if (s.screen === "paused") {
        s.screen = "in-mine";
        s.menuIndex = 0;
      } else if (s.screen === "mode-select") s = select(s, 2);
      else if (s.screen === "size-select") s = select(s, 3);
      else if (s.screen === "how-to-play") s = select(s, 0);
    }
  } else {
    checkDeath(s);
    if (s.screen === "in-mine") {
      if (edges.pause) s = transact(s, "pause");
      if (edges.inventory) s = transact(s, "inventory");
      if (edges.jettison) s = transact(s, "jettison");
      C.ITEM_IDS.forEach((id, i) => {
        if (edges[`supply${i + 1}` as C.ActionName])
          s = transact(s, "use-item", id);
      });
      if (s.panel) {
        const buttons = controls(s).filter(
          (c) =>
            c.rect.y > 56 &&
            c.action !== "close" &&
            c.action !== "dismiss-notice",
        );
        if (buttons.length) {
          if (edges.down) s.panelIndex = (s.panelIndex + 1) % buttons.length;
          if (edges.up)
            s.panelIndex = (s.panelIndex - 1 + buttons.length) % buttons.length;
          if (edges.activate) {
            const c = buttons[s.panelIndex];
            if (c?.enabled) s = activateHit(s, c.id, api);
          }
        }
      } else if (edges.activate) {
        const b = nearbyBuilding(s);
        if (b) s = activateHit(s, `building:${b.id}`, api);
      }
    }
  }
  const held = {
    left: api.input.value("left") > 0,
    right: api.input.value("right") > 0,
    down: api.input.value("down") > 0,
    up: api.input.value("up") > 0,
  };
  if (s.screen === "in-mine") {
    s.accumulator += dt;
    // A small fixed step makes collisions, impacts and drill cadence independent
    // of display refresh rate; no render or wall-clock data enters the core.
    const fixed = 1 / 120;
    while (s.accumulator + 1e-10 >= fixed) {
      s.accumulator -= fixed;
      step(s, held, fixed);
      if (s.screen !== "in-mine") {
        s.accumulator = 0;
        break;
      }
    }
    if (!dt) camera(s, 0);
    if (
      s.miner.state === "jetpack" &&
      Math.floor(s.simTime * 12) !== Math.floor((s.simTime - dt) * 12)
    )
      effect(s, "jetpack-exhaust", s.miner.x + 16, s.miner.y + 60);
  }
  for (const cue of s.pendingCues) api.audio.play(cue);
  s.pendingCues = [];
  api.audio.loop(C.CUES.music);
  const running = s.screen === "in-mine" && !s.panel && s.launchAt === null;
  for (const [cue, active] of [
    [C.CUES.drill, running && !!s.miner.drilling],
    [C.CUES.thrust, running && held.up && s.miner.fuel > 0],
    [
      C.CUES.alarmFuel,
      s.screen === "in-mine" &&
        s.miner.fuel / maxFuelFor(s) < C.LOW_FUEL_FRACTION,
    ],
  ] as const) {
    if (active) api.audio.loop(cue);
    else api.audio.stop(cue);
  }
  if (s.screen === "in-mine" && s.coreTimer !== null) {
    const frequency = s.coreTimer < 15 ? 5 : s.coreTimer < 30 ? 3 : 1;
    if (
      Math.floor(s.elapsedSeconds * frequency) !==
      Math.floor((s.elapsedSeconds - dt) * frequency)
    )
      api.audio.play(C.CUES.alarmCore);
  }
  return s;
}
function maxFuelFor(s: ReadState): number {
  return C.FUEL_TIERS[s.tiers.fuel - 1]!;
}
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTION_NAMES)
      api.input.register(name, { keys: [...C.ACTIONS[name]] });
    const assets = await loadAssets(api);
    const diagnostics: Record<
      string,
      (s: ReadState) => string | number | boolean
    > = {
      screen: (s) => `${s.screen} / ${s.panel ?? "no panel"}`,
      expedition: (s) => `${s.mode} / ${s.worldSize}`,
      position: (s) => `${s.miner.x.toFixed(1)}, ${s.miner.y.toFixed(1)}`,
      velocity: (s) => `${s.miner.vx.toFixed(1)}, ${s.miner.vy.toFixed(1)}`,
      miner: (s) =>
        `${s.miner.state} / ${s.miner.facing} / grounded ${snapshot(s).miner.grounded}`,
      fuel: (s) => `${s.miner.fuel.toFixed(2)} / ${snapshot(s).miner.maxFuel}`,
      hull: (s) => `${s.miner.hull.toFixed(2)} / ${snapshot(s).miner.maxHull}`,
      drill: (s) => {
        const d = snapshot(s).miner.drilling;
        return d
          ? `${d.col},${d.row} / ${(d.progress * 100).toFixed(0)}%`
          : "none";
      },
      credits: (s) => s.credits,
      depth: (s) => snapshot(s).depthMeters,
      cargo: (s) => {
        const d = snapshot(s);
        return `${d.cargo.slotsUsed}/${d.cargo.slotCap} / ${d.cargo.loadKg}kg / overload ${d.miner.overloaded}`;
      },
      satchel: (s) =>
        `${s.satchel.resonite} R / ${s.satchel.cryenite} C / sample ${s.satchel.coreSample}`,
      tiers: (s) => C.TRACKS.map((t) => `${t}:${s.tiers[t]}`).join(" "),
      core: (s) => s.coreTimer ?? "none",
      scanner: (s) => {
        const d = snapshot(s).scanner;
        return `${d.locked} / ${d.target ?? "none"}`;
      },
    };
    for (const [name, source] of Object.entries(diagnostics))
      api.diagnostics.register(name, source);
    const s = initial(assets);
    camera(s, 0);
    return [s, debugApi];
  },
  update,
  render,
};
