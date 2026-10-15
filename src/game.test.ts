/// <reference types="node" />
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import {
  game,
  BACKGROUND,
  type DeepcoreState,
  type DeepcoreDebugApi,
} from "./game";
import * as C from "./constants";
import { initial, snapshot, type ReadState } from "./state";
import { debugApi as d } from "./debug";
import { startExpedition } from "./simulation";
import {
  menuItemRect,
  controls,
  controlRect,
  upgradeEffect,
} from "./interface";

type TestEngine = Engine<DeepcoreState, DeepcoreDebugApi>;
const engines: TestEngine[] = [];
const storage = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        await readFile(new URL("../" + url.split("?")[0]!, import.meta.url)),
      ),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData() {
        return { duration: 1 };
      }
    },
  );
});
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
  storage.clear();
});
afterAll(() => vi.unstubAllGlobals());
async function setup(stepMs = 1000 / 60) {
  const events = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.STAGE_W, C.STAGE_H) as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, down = true) => {
    const e = new Event(down ? "keydown" : "keyup");
    Object.assign(e, { code, repeat: false });
    events.dispatchEvent(e);
  };
  const pose = (f: (s: ReadState) => DeepcoreState) => engine.apply(f);
  const press = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, false);
  };
  const pointer = (
    type: string,
    x: number,
    y: number,
    id = 1,
    device = "mouse",
  ) => {
    const event = new Event(`pointer${type}`);
    Object.assign(event, {
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType: device,
      isPrimary: true,
      button: 0,
      buttons: type === "up" ? 0 : 1,
    });
    events.dispatchEvent(event);
  };
  return {
    engine,
    key,
    pose,
    press,
    pointer,
    events,
    snap: () => d.snapshot(engine.state),
  };
}
async function live(stepMs = 1000 / 60) {
  const t = await setup(stepMs);
  t.pose((s) => startExpedition(s));
  return t;
}
function arrangeCut(
  t: Awaited<ReturnType<typeof setup>>,
  kind: C.TileKind = "rock",
  row = 10,
) {
  t.pose((s) => d.clearMine(s));
  t.pose((s) =>
    d.setMinerPosition(s, 10 * C.TILE + 12, row * C.TILE - C.MINER_H),
  );
  t.pose((s) =>
    d.setTile(s, 10, row, kind as Exclude<C.TileKind, "ore" | "material">),
  );
  t.pose((s) => d.setTile(s, 10, row + 1, "rock"));
  t.pose((s) => d.setMinerVelocity(s, 0, 0));
}

describe("engine contract and menus", () => {
  it("loads genuine assets, registers diagnostics and returns a complete resting snapshot", async () => {
    const t = await setup(),
      s = t.snap();
    expect(s.version).toBe(C.DEEPCORE_DEBUG_VERSION);
    expect(s.screen).toBe("title");
    expect(s.miner.maxFuel).toBe(C.FUEL_TIERS[0]);
    expect(s.miner.grounded).toBe(true);
    expect(s.summary).toBe(null);
    expect(Object.keys(t.engine.state.assets.images).length).toBeGreaterThan(
      90,
    );
    expect(Object.keys(t.engine.state.assets.systems)).toHaveLength(12);
    expect(t.engine.diagnostics().length).toBeGreaterThanOrEqual(14);
    expect(t.engine.diagnostics().every((x) => !x.error)).toBe(true);
    await t.engine.advance(1);
    expect(t.snap().simTime).toBeCloseTo(1 / 60);
  });
  it("navigates forward and backward with the selected-entry contract", async () => {
    const t = await setup();
    await t.press("ArrowDown");
    await t.press("Enter");
    expect(t.snap().screen).toBe("how-to-play");
    await t.press("Escape");
    expect(t.snap().menuIndex).toBe(1);
    await t.press("ArrowUp");
    await t.press("Enter");
    await t.press("ArrowDown");
    await t.press("Enter");
    expect(t.snap().mode).toBe("hardcore");
    expect(t.snap().screen).toBe("size-select");
    await t.press("Escape");
    expect(t.snap().screen).toBe("mode-select");
    expect(t.snap().menuIndex).toBe(1);
    await t.press("Enter");
    await t.press("Enter");
    expect(t.snap().screen).toBe("in-mine");
    expect(t.snap().worldSize).toBe("quick");
  });
  it("requires both pointer edges in one menu region and supports touch", async () => {
    const t = await setup(),
      r = menuItemRect(t.engine.state, 0)!;
    t.pointer("down", r.x + 10, r.y + 10);
    t.pointer("up", 1200, 600);
    await t.engine.advance(1);
    expect(t.snap().screen).toBe("title");
    t.pointer("down", r.x + 10, r.y + 10, 4, "touch");
    t.pointer("up", r.x + 10, r.y + 10, 4, "touch");
    await t.engine.advance(1);
    expect(t.snap().screen).toBe("mode-select");
  });
  it("opens camp panels and inventory, closes before pausing, and mirrors mute", async () => {
    const t = await live();
    await t.press("KeyE");
    expect(t.snap().panel).toBe("fuel-depot");
    await t.press("Escape");
    expect(t.snap().panel).toBe(null);
    expect(t.snap().screen).toBe("in-mine");
    await t.press("KeyI");
    expect(t.snap().panel).toBe("inventory");
    await t.press("KeyI");
    await t.press("KeyP");
    expect(t.snap().screen).toBe("paused");
    const time = t.snap().elapsedSeconds;
    await t.engine.advance(60);
    expect(t.snap().elapsedSeconds).toBe(time);
    await t.press("KeyP");
    await t.press("KeyM");
    expect(t.snap().muted).toBe(true);
  });
  it("reports visible hit regions for every panel control", async () => {
    const t = await live();
    for (const panel of C.PANELS) {
      t.pose((s) => d.setPanel(s, panel));
      for (const c of controls(t.engine.state)) {
        if (c.action === "close") continue;
        expect(controlRect(t.engine.state, c.action, c.subject)).toEqual(
          c.rect,
        );
      }
      await t.engine.advance(1);
    }
    expect(d.menuItemRect(t.engine.state, 0)).toBe(null);
    expect(d.controlRect(t.engine.state, "fabricate", null)).toBe(null);
  });
});

describe("drilling, movement and fuel", () => {
  it("cuts in timed hits, persists health, and never mutates the previous state", async () => {
    const t = await live();
    arrangeCut(t);
    const old = t.engine.state;
    t.key("KeyS");
    await t.engine.advance(15);
    expect(d.tileAt(t.engine.state, 10, 10).health).toBe(2);
    expect(d.tileAt(old, 10, 10).health).toBe(4);
    expect(t.snap().miner.fuel).toBeCloseTo(
      100 - 2 * C.DRILL_HIT_FUEL - 0.25 * C.LIFE_SUPPORT_BURN,
      2,
    );
    t.key("KeyS", false);
    await t.engine.advance(1);
    expect(d.tileAt(t.engine.state, 10, 10).health).toBe(2);
    t.key("KeyS");
    await t.engine.advance(15);
    expect(d.tileAt(t.engine.state, 10, 10).kind).toBe("tunnel");
  });
  it("banks ore only while there is a free slot and materials use the satchel", async () => {
    const t = await live();
    arrangeCut(t);
    t.pose((s) => d.setOreTile(s, 10, 10, "cuprite"));
    t.key("KeyS");
    await t.engine.advance(30);
    expect(t.snap().cargo.ore.cuprite).toBe(1);
    expect(t.snap().cargo.loadKg).toBe(18);
    arrangeCut(t);
    t.pose((s) => d.setCargo(s, "ferron", C.CARGO_TIERS[0]!));
    t.pose((s) => d.setOreTile(s, 10, 10, "cuprite"));
    await t.engine.advance(30);
    expect(t.snap().cargo.ore.cuprite).toBe(1);
    arrangeCut(t);
    t.pose((s) => d.setMaterialTile(s, 10, 10, "resonite"));
    await t.engine.advance(30);
    expect(t.snap().satchel.resonite).toBe(1);
  });
  it("respects travel and drill gates independently", async () => {
    const t = await live();
    arrangeCut(t);
    t.pose((s) => d.setMinerTravel(s, false));
    const y = t.snap().miner.y;
    t.key("KeyS");
    await t.engine.advance(30);
    expect(d.tileAt(t.engine.state, 10, 10).kind).toBe("tunnel");
    expect(t.snap().miner.y).toBe(y);
    arrangeCut(t);
    t.pose((s) => d.setMinerDrill(s, false));
    await t.engine.advance(60);
    expect(d.tileAt(t.engine.state, 10, 10).health).toBe(4);
    expect(t.snap().miner.drilling).toBe(null);
  });
  it("cannot drill bedrock, boulders, upward or while airborne", async () => {
    const t = await live();
    arrangeCut(t, "stone");
    t.key("KeyS");
    await t.engine.advance(45);
    expect(d.tileAt(t.engine.state, 10, 10).kind).toBe("stone");
    expect(t.snap().miner.drilling).toBe(null);
    t.pose((s) => d.setTile(s, 10, 10, "bedrock"));
    await t.engine.advance(30);
    expect(t.snap().miner.drilling).toBe(null);
    t.key("KeyS", false);
    t.key("KeyW");
    await t.engine.advance(10);
    expect(t.snap().miner.state).toBe("jetpack");
    expect(t.snap().miner.y).toBeLessThan(10 * C.TILE - C.MINER_H);
  });
  it("starts a side cut only flush with a wall and facing follows lateral input", async () => {
    const t = await live();
    t.pose((s) => d.clearMine(s));
    t.pose((s) =>
      d.setMinerPosition(s, 10 * C.TILE + 12, 10 * C.TILE - C.MINER_H),
    );
    t.pose((s) => d.setTile(s, 10, 10, "rock"));
    t.pose((s) => d.setTile(s, 11, 9, "rock"));
    t.key("KeyD");
    await t.engine.advance(2);
    expect(d.tileAt(t.engine.state, 11, 9).health).toBe(4);
    await t.engine.advance(40);
    expect(d.tileAt(t.engine.state, 11, 9).kind).toBe("tunnel");
    expect(t.snap().miner.facing).toBe("east");
    t.key("KeyD", false);
    t.key("KeyA");
    await t.engine.advance(1);
    expect(t.snap().miner.facing).toBe("west");
  });
  it("overload prevents liftoff and dropping ore restores lift", async () => {
    const t = await live();
    t.pose((s) => d.setCargo(s, "aurite", 4));
    t.key("KeyW");
    await t.engine.advance(30);
    expect(t.snap().miner.overloaded).toBe(true);
    expect(t.snap().miner.y).toBe(C.SURFACE_Y - C.MINER_H);
    t.pose((s) => d.dropOre(s, "aurite"));
    t.pose((s) => d.dropOre(s, "aurite"));
    await t.engine.advance(30);
    expect(t.snap().miner.overloaded).toBe(false);
    expect(t.snap().miner.y).toBeLessThan(0);
  });
  it("reaches the same simulation under different display step patterns", async () => {
    const a = await live(1000 / 30),
      b = await live();
    a.pose((s) => d.clearMine(s));
    b.pose((s) => d.clearMine(s));
    a.pose((s) => d.setMinerPosition(s, 1000, 500));
    b.pose((s) => d.setMinerPosition(s, 1000, 500));
    b.engine.setClock(new SequenceClock([10, 40, 20, 30]));
    a.key("KeyW");
    b.key("KeyW");
    await a.engine.advance(30);
    await b.engine.advance(40);
    expect(a.snap().miner.y).toBeCloseTo(b.snap().miner.y, 6);
    expect(a.snap().miner.fuel).toBeCloseTo(b.snap().miner.fuel, 6);
    expect(a.snap().camera.lead).toBeCloseTo(b.snap().camera.lead, 6);
  });
  it("applies exact life support when travel is held and kills on zero fuel underground", async () => {
    const t = await live();
    t.pose((s) => d.clearMine(s));
    t.pose((s) => d.setMinerPosition(s, 900, 900));
    t.pose((s) => d.setMinerTravel(s, false));
    await t.engine.advance(60);
    expect(t.snap().miner.fuel).toBeCloseTo(100 - C.LIFE_SUPPORT_BURN, 6);
    t.pose((s) => d.setFuel(s, 0));
    await t.engine.advance(1);
    expect(t.snap().summary?.deathCause).toBe("fuel-out");
  });
});

describe("economy, supplies and escape", () => {
  it("sells by mineral value, partially fills, and preserves cargo on refuel", async () => {
    const t = await live();
    t.pose((s) => d.setCargo(s, "adamite", 2));
    t.pose((s) => d.setCargo(s, "ferron", 3));
    t.pose((s) => d.sell(s));
    expect(t.snap().credits).toBe(2 * 1900 + 3 * 28);
    expect(t.snap().creditsEarned).toBe(t.snap().credits);
    expect(t.snap().cargo.slotsUsed).toBe(0);
    t.pose((s) => d.setFuel(s, 30));
    t.pose((s) => d.setCredits(s, 12));
    t.pose((s) => d.fillFuel(s));
    expect(t.snap().miner.fuel).toBe(42);
    expect(t.snap().credits).toBe(0);
    t.pose((s) => d.setHull(s, 30));
    t.pose((s) => d.setCredits(s, 7));
    t.pose((s) => d.repairFull(s));
    expect(t.snap().miner.hull).toBe(33.5);
  });
  it("buys each upgrade in order and adds only the increase in tank/hull maximum", async () => {
    const t = await live();
    t.pose((s) => d.setCredits(s, 100000));
    t.pose((s) => d.setFuel(s, 30));
    t.pose((s) => d.buyUpgrade(s, "fuel"));
    expect(t.snap().miner.fuel).toBe(105);
    expect(t.snap().miner.maxFuel).toBe(175);
    for (const track of C.TRACKS) {
      for (let i = 1; i < C.MAX_TIER[track]; i++)
        t.pose((s) => d.buyUpgrade(s, track));
      expect(t.snap().tiers[track]).toBe(C.MAX_TIER[track]);
      expect(upgradeEffect(t.engine.state, track)).toBeTypeOf("string");
    }
    const balance = t.snap().credits;
    t.pose((s) => d.buyUpgrade(s, "drill"));
    expect(t.snap().credits).toBe(balance);
  });
  it("keeps unaffordable transactions and useless supplies as no-ops", async () => {
    const t = await live();
    t.pose((s) => d.buyUpgrade(s, "hull"));
    t.pose((s) => d.buyItem(s, "dynamite"));
    expect(t.snap().credits).toBe(0);
    expect(t.snap().items.dynamite).toBe(0);
    t.pose((s) => d.setItemCount(s, "emergency-fuel", 1));
    t.pose((s) => d.useItem(s, "emergency-fuel"));
    expect(t.snap().items["emergency-fuel"]).toBe(1);
    t.pose((s) => d.setFuel(s, 20));
    t.pose((s) => d.useItem(s, "emergency-fuel"));
    expect(t.snap().miner.fuel).toBe(50);
    expect(t.snap().items["emergency-fuel"]).toBe(0);
    t.pose((s) => d.setCredits(s, 12));
    t.pose((s) => d.buyFuel(s));
    expect(t.snap().miner.fuel).toBe(50);
    expect(t.snap().credits).toBe(12);
    t.pose((s) => d.setItemCount(s, "matter-transmitter", 1));
    t.pose((s) => d.useItem(s, "matter-transmitter"));
    expect(t.snap().items["matter-transmitter"]).toBe(1);
  });
  it("blasts boulders and ore but preserves material nodes and bedrock", async () => {
    const t = await live();
    arrangeCut(t);
    t.pose((s) => d.setTile(s, 9, 9, "stone"));
    t.pose((s) => d.setOreTile(s, 10, 9, "ferron"));
    t.pose((s) => d.setMaterialTile(s, 11, 9, "resonite"));
    t.pose((s) => d.setItemCount(s, "dynamite", 1));
    t.pose((s) => d.useItem(s, "dynamite"));
    expect(d.tileAt(t.engine.state, 9, 9).kind).toBe("tunnel");
    expect(d.tileAt(t.engine.state, 10, 9).kind).toBe("tunnel");
    expect(d.tileAt(t.engine.state, 11, 9).kind).toBe("material");
    expect(t.snap().cargo.slotsUsed).toBe(0);
  });
  it("consumes independently posed teleport draws and performs a safe transmitter return", async () => {
    const t = await live();
    t.pose((s) => d.setItemCount(s, "quantum-teleporter", 1));
    t.pose((s) => d.setNextTeleportHeight(s, 4));
    t.pose((s) => d.setNextTeleportSpeed(s, 333));
    t.pose((s) => d.useItem(s, "quantum-teleporter"));
    expect(t.snap().miner.y + C.MINER_H).toBe(C.SURFACE_Y - 4 * C.TILE);
    expect(t.snap().miner.vy).toBe(333);
    expect(t.snap().nextTeleportHeight).toBe(null);
    expect(t.snap().nextTeleportSpeed).toBe(null);
    t.pose((s) => d.setItemCount(s, "matter-transmitter", 1));
    t.pose((s) => d.useItem(s, "matter-transmitter"));
    expect(t.snap().miner.y + C.MINER_H).toBe(C.SURFACE_Y);
    expect(t.snap().miner.vy).toBe(0);
  });
  it("fabricates five components with exact requirements and launches to victory", async () => {
    const t = await live();
    t.pose((s) => d.setCredits(s, C.ROCKET_TOTAL_CREDITS));
    t.pose((s) => d.fabricate(s));
    t.pose((s) => d.fabricate(s));
    t.pose((s) => d.fabricate(s));
    expect(t.snap().rocket.installed).toHaveLength(2);
    t.pose((s) => d.setMaterial(s, "resonite", 1));
    t.pose((s) => d.setMaterial(s, "cryenite", 1));
    t.pose((s) => d.fabricate(s));
    t.pose((s) => d.fabricate(s));
    t.pose((s) => d.setCoreCarried(s, true));
    t.pose((s) => d.fabricate(s));
    expect(t.snap().credits).toBe(0);
    expect(t.snap().coreTimer).toBe(null);
    expect(t.snap().satchel.coreSample).toBe(false);
    t.pose((s) => d.launch(s));
    await t.engine.advance(190);
    expect(t.snap().screen).toBe("victory");
    expect(t.snap().summary?.componentsInstalled).toBe(5);
  });
});

describe("hazards and saving", () => {
  it("extracts a single live Sample by drilling the inexhaustible Core", async () => {
    const t = await live();
    t.pose((s) => d.clearMine(s));
    t.pose((s) =>
      d.setMinerPosition(
        s,
        C.CORE_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
        s.coreRow * C.TILE - C.MINER_H,
      ),
    );
    t.key("KeyS");
    await t.engine.advance(1);
    expect(t.snap().satchel.coreSample).toBe(true);
    expect(t.snap().coreTimer).toBeCloseTo(C.CORE_TIMER, 1);
    expect(d.tileAt(t.engine.state, C.CORE_COL, t.snap().coreRow).kind).toBe(
      "core",
    );
    await t.engine.advance(15);
    expect(t.snap().coreTimer).toBeLessThan(C.CORE_TIMER - 0.2);
    t.pose((s) => d.jettison(s));
    await t.engine.advance(1);
    expect(t.snap().satchel.coreSample).toBe(false);
    expect(t.snap().coreGround).not.toBe(null);
  });
  it("gas damage uses depth and triggers a delayed, dismissible notice", async () => {
    const t = await live(1000 / 30);
    arrangeCut(t, "gas", 130);
    t.pose((s) => d.setMinerTravel(s, false));
    t.pose((s) => d.setHull(s, 1000));
    t.key("KeyS");
    await t.engine.advance(30);
    expect(t.snap().miner.hull).toBeLessThan(1000);
    expect(t.snap().notice?.shown).toBe(false);
    t.key("KeyS", false);
    await t.engine.advance(45);
    expect(t.snap().notice?.shown).toBe(true);
    t.pose((s) => d.dismissNotice(s));
    expect(t.snap().notice).toBe(null);
    expect(t.snap().noticesFired.gas).toBe(true);
  });
  it("radiators reduce drilling and contact heat but do not shield gas", async () => {
    const t = await live();
    arrangeCut(t, "lava", 280);
    t.pose((s) => d.setTier(s, "drill", 5));
    t.pose((s) => d.setTier(s, "radiator", 5));
    t.pose((s) => d.setHull(s, 1000));
    t.pose((s) => d.setMinerTravel(s, false));
    t.key("KeyS");
    await t.engine.advance(23);
    expect(t.snap().miner.hull).toBeCloseTo(
      1000 - C.LAVA_DRILL_DEEPSTONE * (1 - C.RADIATOR_TIERS[4]!),
      5,
    );
    expect(t.snap().noticesFired.lava).toBe(true);
  });
  it("a hard landing damages the hull and produces impact dust", async () => {
    const t = await live();
    t.pose((s) => d.clearMine(s));
    t.pose((s) => d.setMinerPosition(s, 812, 600));
    t.pose((s) => d.setMinerVelocity(s, 0, 950));
    t.pose((s) => d.setTile(s, 10, 10, "rock"));
    await t.engine.advance(15);
    expect(t.snap().miner.hull).toBeLessThan(100);
    expect(t.engine.state.effects.some((e) => e.name === "impact-dust")).toBe(
      true,
    );
  });
  it("Core time runs inside inventory, freezes on pause, and detonation is location-aware", async () => {
    const t = await live();
    t.pose((s) => d.setCoreCarried(s, true));
    t.pose((s) => d.setPanel(s, "inventory"));
    await t.engine.advance(60);
    expect(t.snap().coreTimer).toBeCloseTo(89, 6);
    t.pose((s) => d.setScreen(s, "paused"));
    await t.engine.advance(60);
    expect(t.snap().coreTimer).toBeCloseTo(89, 6);
    t.pose((s) => d.setScreen(s, "in-mine"));
    t.pose((s) => d.setCoreTimer(s, 0.1));
    await t.engine.advance(7);
    expect(t.snap().summary?.deathCause).toBe("core-detonation");
  });
  it("leaves a jettisoned sample on the ground, with no pickup and a safe distant blast", async () => {
    const t = await live();
    t.pose((s) => d.clearMine(s));
    t.pose((s) => d.setMinerPosition(s, 812, 800));
    t.pose((s) => d.setCoreCarried(s, true));
    t.pose((s) => d.jettison(s));
    const ground = t.snap().coreGround;
    expect(ground).not.toBe(null);
    t.pose((s) => d.setCoreTimer(s, 0.2));
    t.pose((s) => d.setMinerPosition(s, 1600, 800));
    t.pose((s) => d.setMinerTravel(s, false));
    await t.engine.advance(15);
    expect(t.snap().screen).toBe("in-mine");
    expect(t.snap().coreGround).toBe(null);
    expect(t.snap().coreTimer).toBe(null);
  });
  it("saves only through the pad control, rejects live samples, and resumes exact holdings", async () => {
    const t = await live();
    t.pose((s) => d.setCargo(s, "marlite", 3));
    t.pose((s) => d.setFuel(s, 35));
    t.pose((s) => d.setCredits(s, 400));
    t.pose((s) => d.save(s));
    expect(t.snap().hasSave).toBe(true);
    t.pose((s) => d.setCredits(s, 999));
    t.pose((s) => d.setCoreCarried(s, true));
    t.pose((s) => d.save(s));
    t.pose((s) => d.setHull(s, 0));
    await t.engine.advance(1);
    expect(t.snap().screen).toBe("game-over");
    expect(t.snap().hasSave).toBe(true);
    await t.press("Enter");
    expect(t.snap().credits).toBe(400);
    expect(t.snap().miner.fuel).toBe(35);
    expect(t.snap().cargo.ore.marlite).toBe(3);
  });
  it("Hardcore applies the save loss immediately when death occurs under an overlay", async () => {
    const t = await live();
    t.pose((s) => d.setMode(s, "hardcore"));
    t.pose((s) => d.save(s));
    expect(t.snap().hasSave).toBe(true);
    t.pose((s) => d.setPanel(s, "inventory"));
    t.pose((s) => d.setHull(s, 0));
    await t.engine.advance(1);
    expect(t.snap().screen).toBe("game-over");
    expect(t.snap().hasSave).toBe(false);
    expect(storage.size).toBe(0);
  });
});

describe("generation and debug poses", () => {
  it.each(C.WORLD_SIZES)(
    "generates the %s mine with exact materials and a reachable Core",
    (size) => {
      const s = startExpedition(d.setWorldSize(initial(), size));
      expect(s.coreRow).toBe(
        Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
      );
      expect(d.tileAt(s, C.CAVE_MOUTH_COL, 1).kind).toBe("tunnel");
      expect(d.tileAt(s, C.CORE_COL, s.coreRow).kind).toBe("core");
      for (const material of C.MATERIALS) {
        const found = s.grid.flat().filter((t) => t.material === material);
        expect(found).toHaveLength(1);
        expect(found[0]!.band).toBe(C.MATERIAL_BAND[material]);
      }
      for (let row = 1; row < s.coreRow; row++) {
        expect(["lava", "stone"]).not.toContain(
          s.grid[row]![C.CAVE_MOUTH_COL]!.kind,
        );
        expect(s.grid[row]![0]!.kind).toBe("bedrock");
      }
      for (const band of C.BANDS) {
        const cells = s.grid
          .flat()
          .filter((t) => t.band === band && t.kind !== "bedrock");
        const density =
          cells.filter((t) => t.kind === "ore").length / cells.length;
        expect(Math.abs(density - C.ORE_DENSITY) / C.ORE_DENSITY).toBeLessThan(
          C.DENSITY_TOLERANCE,
        );
      }
    },
  );
  it("resizes while preserving existing cells and their original band and health", () => {
    let s = initial();
    s = d.setOreTile(s, 12, 200, "roselite");
    s = d.setTileHealth(s, 12, 200, 3);
    const before = d.tileAt(s, 12, 200);
    s = d.setWorldSize(s, "marathon");
    expect(d.tileAt(s, 12, 200)).toEqual(before);
    expect(d.tileAt(s, C.CORE_COL, C.STANDARD_ROWS).kind).toBe("tunnel");
    expect(d.tileAt(s, C.CORE_COL, 1000).kind).toBe("core");
    s = d.setWorldSize(s, "quick");
    expect(d.tileAt(s, 12, 200)).toEqual(before);
    expect(d.tileAt(s, 12, 900)).toEqual({
      kind: "bedrock",
      band: null,
      ore: null,
      material: null,
      health: null,
      maxHealth: null,
    });
  });
  it("poses do not advance clocks or reconcile by moving the miner", () => {
    let s = d.setMinerPosition(initial(), 1000, 12000);
    s = d.setFuel(s, 900);
    s = d.setElapsed(s, 77);
    s = d.setCameraLead(s, 120);
    s = d.setCargo(s, "aurite", 4);
    const before = JSON.stringify(snapshot(s));
    s = d.reconcile(s);
    expect(JSON.stringify(snapshot(s))).toBe(before);
    expect(snapshot(s).deepestDepthMeters).toBe(0);
    expect(snapshot(s).miner.overloaded).toBe(true);
  });
  it("scanner locks only onto missing material within range", () => {
    let s = initial();
    s = d.setMinerPosition(s, 10 * C.TILE + 12, 10 * C.TILE);
    s = d.setMaterialTile(s, 12, 10, "resonite");
    expect(snapshot(s).scanner.locked).toBe(false);
    s = d.setTier(s, "scanner", 2);
    expect(snapshot(s).scanner.target).toBe("resonite");
    s = d.setMaterial(s, "resonite", 1);
    expect(snapshot(s).scanner.locked).toBe(false);
  });
  it("rejects invalid arguments loudly and resets all expedition faculties", () => {
    const s = initial();
    expect(() => d.setTile(s, -1, 1, "rock")).toThrow();
    expect(() => d.setTier(s, "fuel", 6)).toThrow();
    expect(() => d.setCoreTimer(s, 3)).toThrow();
    expect(() => d.setNextTeleportHeight(s, 9)).toThrow();
    expect(() => d.setCredits(s, -1)).toThrow();
    expect(() => d.setMenuIndex(s, 100)).toThrow();
    expect(() => d.setTileHealth(s, 2, 2, 0)).toThrow();
    let n = d.setFuel(s, 3);
    n = d.setMinerTravel(n, false);
    n = d.setMinerDrill(n, false);
    n = d.reset(n);
    expect(snapshot(n).miner.fuel).toBe(100);
    expect(snapshot(n).miner.travel).toBe(true);
    expect(snapshot(n).miner.drill).toBe(true);
    expect(snapshot(n).simTime).toBe(0);
  });
});
