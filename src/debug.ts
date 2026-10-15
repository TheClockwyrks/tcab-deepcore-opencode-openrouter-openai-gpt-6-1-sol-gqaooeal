import * as C from "./constants";
import {
  bandAt,
  cell,
  clamp,
  copy,
  emptyGrid,
  initial,
  maxFuel,
  maxHull,
  minable,
  minerCell,
  snapshot,
  tileAt,
  writeCell,
  BUILDING_RECTS,
  type ReadState,
} from "./state";
import { generate } from "./world";
import { transact, type Transaction } from "./simulation";
import { controlRect, menuItemRect, menuItems } from "./interface";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RangeError(`Deepcore debug: ${message}`);
}
function finite(n: number): void {
  assert(Number.isFinite(n), "expected a finite number");
}
function nonnegative(n: number): void {
  finite(n);
  assert(n >= 0, "expected a nonnegative number");
}
function count(n: number): void {
  nonnegative(n);
  assert(Number.isInteger(n), "expected an integer count");
}
function choice<T extends string>(values: readonly T[], value: T): void {
  assert(values.includes(value), "unknown identifier");
}
function position(s: ReadState, col: number, row: number): void {
  assert(
    Number.isInteger(col) &&
      Number.isInteger(row) &&
      col >= 0 &&
      col < C.WORLD_COLS &&
      row >= 1 &&
      row <= s.coreRow,
    "cell outside the mine",
  );
}
const control = (action: Transaction) => (s: ReadState) => transact(s, action);

export const debugApi = {
  version: C.DEEPCORE_DEBUG_VERSION,
  snapshot,
  tileAt: (s: ReadState, col: number, row: number) => ({
    ...tileAt(s, col, row),
  }),
  buildings: (_s: ReadState) => BUILDING_RECTS.map((b) => ({ ...b })),
  menuItemRect,
  controlRect,
  findTile(s: ReadState, kind: C.TileKind) {
    choice(C.TILE_KINDS, kind);
    const p = minerCell(s);
    let best: { col: number; row: number } | null = null,
      dist = Infinity;
    s.grid.forEach((row, y) =>
      row.forEach((t, x) => {
        const d = Math.hypot(x - p.col, y - p.row);
        if (t.kind === kind && d < dist) {
          best = { col: x, row: y };
          dist = d;
        }
      }),
    );
    return best;
  },
  reset(s: ReadState) {
    const n = initial(
      s.assets as typeof s.assets as Parameters<typeof initial>[0],
    );
    n.muted = s.muted;
    n.hasSave = s.hasSave;
    return n;
  },
  reconcile: (s: ReadState) => copy(s),
  generateMine(s: ReadState) {
    const n = copy(s);
    generate(n);
    return n;
  },
  clearMine(s: ReadState) {
    const n = copy(s);
    n.grid = s.grid.map((row, y) =>
      row.map((t, x) =>
        y >= 1 &&
        y < s.coreRow &&
        x >= C.PLAYABLE_COL_MIN &&
        x <= C.PLAYABLE_COL_MAX
          ? cell("tunnel", t.band)
          : { ...t },
      ),
    );
    return n;
  },
  clearCargo(s: ReadState) {
    const n = copy(s);
    n.cargo = {};
    return n;
  },
  clearItems(s: ReadState) {
    const n = copy(s);
    C.ITEM_IDS.forEach((i) => (n.items[i] = 0));
    return n;
  },
  setTile(
    s: ReadState,
    col: number,
    row: number,
    kind: Exclude<C.TileKind, "ore" | "material">,
  ) {
    position(s, col, row);
    choice(["rock", "gas", "lava", "stone", "bedrock", "tunnel", "core"], kind);
    const n = copy(s);
    writeCell(n, col, row, cell(kind, bandAt(row, s.coreRow)));
    return n;
  },
  setOreTile(s: ReadState, col: number, row: number, ore: C.OreId) {
    position(s, col, row);
    assert(
      C.MINERALS.some((m) => m.id === ore),
      "unknown ore",
    );
    const n = copy(s),
      t = cell("ore", bandAt(row, s.coreRow));
    t.ore = ore;
    writeCell(n, col, row, t);
    return n;
  },
  setMaterialTile(
    s: ReadState,
    col: number,
    row: number,
    material: C.MaterialId,
  ) {
    position(s, col, row);
    choice(C.MATERIALS, material);
    const n = copy(s),
      t = cell("material", bandAt(row, s.coreRow));
    t.material = material;
    writeCell(n, col, row, t);
    return n;
  },
  setTileHealth(s: ReadState, col: number, row: number, health: number) {
    position(s, col, row);
    const t = tileAt(s, col, row);
    assert(
      minable(t.kind) && health > 0 && health <= t.maxHealth!,
      "invalid tile health",
    );
    const n = copy(s);
    writeCell(n, col, row, { ...t, health });
    return n;
  },
  placeCoreSample(s: ReadState, col: number, row: number) {
    position(s, col, row);
    assert(
      tileAt(s, col, row).kind === "tunnel" && s.coreTimer === null,
      "requires open tunnel and no live sample",
    );
    const n = copy(s);
    n.coreGround = { col, row };
    n.coreTimer = C.CORE_TIMER;
    return n;
  },
  setMinerPosition(s: ReadState, x: number, y: number) {
    finite(x);
    finite(y);
    const n = copy(s);
    n.miner.x = x;
    n.miner.y = y;
    return n;
  },
  setMinerVelocity(s: ReadState, vx: number, vy: number) {
    finite(vx);
    finite(vy);
    const n = copy(s);
    n.miner.vx = vx;
    n.miner.vy = vy;
    return n;
  },
  setFacing(s: ReadState, facing: C.Facing) {
    choice(C.FACINGS, facing);
    const n = copy(s);
    n.miner.facing = facing;
    return n;
  },
  setFuel(s: ReadState, value: number) {
    nonnegative(value);
    const n = copy(s);
    n.miner.fuel = value;
    return n;
  },
  setHull(s: ReadState, value: number) {
    nonnegative(value);
    const n = copy(s);
    n.miner.hull = value;
    return n;
  },
  setMinerTravel(s: ReadState, enabled: boolean) {
    assert(typeof enabled === "boolean", "expected boolean");
    const n = copy(s);
    n.miner.travel = enabled;
    return n;
  },
  setMinerDrill(s: ReadState, enabled: boolean) {
    assert(typeof enabled === "boolean", "expected boolean");
    const n = copy(s);
    n.miner.drill = enabled;
    return n;
  },
  setScreen(s: ReadState, screen: C.ScreenName) {
    choice(C.SCREENS, screen);
    const n = copy(s);
    n.screen = screen;
    return n;
  },
  setPanel(s: ReadState, panel: C.PanelId | null) {
    if (panel !== null) choice(C.PANELS, panel);
    const n = copy(s);
    n.panel = panel;
    return n;
  },
  setMenuIndex(s: ReadState, index: number) {
    count(index);
    assert(index < menuItems(s).length, "menu item outside menu");
    const n = copy(s);
    n.menuIndex = index;
    return n;
  },
  setMode(s: ReadState, mode: C.Mode) {
    choice(C.MODES, mode);
    const n = copy(s);
    n.mode = mode;
    return n;
  },
  setWorldSize(s: ReadState, size: C.WorldSize) {
    choice(C.WORLD_SIZES, size);
    const n = copy(s),
      core = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
      grid = emptyGrid(core);
    for (let row = 1; row < Math.min(s.coreRow, core); row++)
      grid[row] = [...s.grid[row]!] as (typeof grid)[number];
    n.grid = grid;
    n.coreRow = core;
    n.worldSize = size;
    return n;
  },
  setCredits(s: ReadState, value: number) {
    nonnegative(value);
    const n = copy(s);
    n.credits = value;
    return n;
  },
  setTier(s: ReadState, track: C.TrackName, tier: number) {
    choice(C.TRACKS, track);
    count(tier);
    assert(tier >= 1 && tier <= C.MAX_TIER[track], "tier outside track");
    const n = copy(s);
    n.tiers[track] = tier;
    n.miner.fuel = clamp(n.miner.fuel, 0, maxFuel(n));
    n.miner.hull = clamp(n.miner.hull, 0, maxHull(n));
    return n;
  },
  setCargo(s: ReadState, ore: C.OreId, value: number) {
    assert(
      C.MINERALS.some((o) => o.id === ore),
      "unknown ore",
    );
    count(value);
    const n = copy(s);
    if (value) n.cargo[ore] = value;
    else delete n.cargo[ore];
    return n;
  },
  setMaterial(s: ReadState, material: C.MaterialId, value: number) {
    choice(C.MATERIALS, material);
    count(value);
    const n = copy(s);
    n.satchel[material] = value;
    return n;
  },
  setCoreCarried(s: ReadState, carried: boolean) {
    assert(typeof carried === "boolean", "expected boolean");
    if (carried) assert(s.coreTimer === null, "a sample is already live");
    const n = copy(s);
    n.satchel.coreSample = carried;
    if (carried) n.coreTimer = C.CORE_TIMER;
    else if (s.satchel.coreSample) n.coreTimer = null;
    return n;
  },
  setCoreTimer(s: ReadState, seconds: number) {
    assert(
      s.coreTimer !== null && Number.isFinite(seconds) && seconds > 0,
      "requires live sample and positive timer",
    );
    const n = copy(s);
    n.coreTimer = seconds;
    return n;
  },
  setItemCount(s: ReadState, item: C.ItemId, value: number) {
    choice(C.ITEM_IDS, item);
    count(value);
    const n = copy(s);
    n.items[item] = value;
    return n;
  },
  setRocketInstalled(s: ReadState, value: number) {
    count(value);
    assert(value <= C.ROCKET_COMPONENTS.length, "too many rocket components");
    const n = copy(s);
    n.installed = value;
    return n;
  },
  setNoticeFired(s: ReadState, hazard: C.NoticeHazard, fired: boolean) {
    choice(C.NOTICE_HAZARDS, hazard);
    assert(typeof fired === "boolean", "expected boolean");
    const n = copy(s);
    n.noticesFired[hazard] = fired;
    return n;
  },
  setCameraLead(s: ReadState, lead: number) {
    finite(lead);
    assert(Math.abs(lead) <= C.CAM_LEAD_MAX, "lead out of range");
    const n = copy(s);
    n.camera.lead = lead;
    return n;
  },
  setElapsed(s: ReadState, seconds: number) {
    nonnegative(seconds);
    const n = copy(s);
    n.elapsedSeconds = seconds;
    return n;
  },
  clearSave(s: ReadState) {
    const n = copy(s);
    try {
      globalThis.localStorage?.removeItem("deepcore-expedition-v1");
    } catch {
      /* Unavailable storage. */
    }
    n.hasSave = false;
    return n;
  },
  setNextTeleportHeight(s: ReadState, tiles: number | null) {
    if (tiles !== null) {
      finite(tiles);
      assert(
        tiles >= C.TELEPORT_HEIGHT_TILES_MIN &&
          tiles <= C.TELEPORT_HEIGHT_TILES_MAX,
        "teleport height out of range",
      );
    }
    const n = copy(s);
    n.nextTeleportHeight = tiles;
    return n;
  },
  setNextTeleportSpeed(s: ReadState, speed: number | null) {
    if (speed !== null) {
      finite(speed);
      assert(
        speed >= C.TELEPORT_SPEED_MIN && speed <= C.TELEPORT_SPEED_MAX,
        "teleport speed out of range",
      );
    }
    const n = copy(s);
    n.nextTeleportSpeed = speed;
    return n;
  },
  dropOre: (s: ReadState, ore: C.OreId) => transact(s, "drop-ore", ore),
  sell: control("sell"),
  buyFuel: control("buy-fuel"),
  fillFuel: control("fill-fuel"),
  buyRepair: control("buy-repair"),
  repairFull: control("repair-full"),
  buyUpgrade: (s: ReadState, track: C.TrackName) =>
    transact(s, "buy-upgrade", track),
  buyItem: (s: ReadState, item: C.ItemId) => transact(s, "buy-item", item),
  useItem: (s: ReadState, item: C.ItemId) => transact(s, "use-item", item),
  jettison: control("jettison"),
  fabricate: control("fabricate"),
  launch: control("launch"),
  save: control("save"),
  dismissNotice: control("dismiss-notice"),
};
export type DeepcoreDebugApi = typeof debugApi;
