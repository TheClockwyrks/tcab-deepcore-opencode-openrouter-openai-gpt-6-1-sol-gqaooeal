import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
  maxHealth: number | null;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Effect {
  name: string;
  x: number;
  y: number;
  time: number;
  seed: number;
}
export interface Assets {
  images: Record<string, ImageBitmap>;
  systems: Record<string, ParticleSystem>;
}
export interface DeepcoreState {
  assets: Assets;
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  panelIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  coreTimer: number | null;
  coreGround: { col: number; row: number } | null;
  camera: { x: number; y: number; lead: number };
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
    drilling: {
      col: number;
      row: number;
      dir: "down" | "left" | "right";
    } | null;
  };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  installed: number;
  noticesFired: Record<C.NoticeHazard, boolean>;
  notice: { hazard: C.NoticeHazard; at: number } | null;
  summary: {
    deepestDepthMeters: number;
    creditsEarned: number;
    elapsedSeconds: number;
    mode: C.Mode;
    componentsInstalled: number;
    deathCause: C.DeathCause | null;
  } | null;
  grid: Cell[][];
  effects: Effect[];
  pendingCues: C.CueName[];
  hurtUntil: number;
  animationTime: number;
  hitTime: number;
  accumulator: number;
  shake: { at: number; strength: number };
  note: string;
  noteUntil: number;
  pointerDown: Record<string, string>;
  hovered: string | null;
  launchAt: number | null;
  endedAt: number;
}
export type ReadState = DeepReadonly<DeepcoreState>;
export const emptyAssets: Assets = { images: {}, systems: {} };
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export const fraction = (row: number, core: number) => (row - 1) / (core - 1);
export const bandAt = (row: number, core: number): C.BandName =>
  C.BANDS[clamp(Math.floor(4 * fraction(row, core)), 0, 3)]!;
export const minable = (kind: C.TileKind) =>
  ["rock", "ore", "material", "gas", "lava"].includes(kind);
export function cell(kind: C.TileKind, band: C.BandName | null): Cell {
  const health = minable(kind) && band ? C.BAND_HEALTH[band] : null;
  return { kind, band, health, maxHealth: health, ore: null, material: null };
}
export function emptyGrid(core: number): Cell[][] {
  return Array.from({ length: core + 1 }, (_, row) =>
    Array.from({ length: C.WORLD_COLS }, (_, col) =>
      cell(
        row === core
          ? col === C.CORE_COL
            ? "core"
            : "bedrock"
          : col === 0 || col === C.WORLD_COLS - 1
            ? "bedrock"
            : "tunnel",
        row > 0 && row < core ? bandAt(row, core) : null,
      ),
    ),
  );
}
export function tileAt(
  s: ReadState,
  col: number,
  row: number,
): DeepReadonly<Cell> {
  if (row < 1 && col >= 0 && col < C.WORLD_COLS) return cell("tunnel", null);
  return s.grid[row]?.[col] ?? cell("bedrock", null);
}
export function copy(s: ReadState): DeepcoreState {
  // Immutable terrain cells and loaded assets are shared. Only edited rows/cells
  // are replaced by writeCell; all small, mutable simulation records are copied.
  return {
    ...s,
    assets: s.assets as Assets,
    grid: [...s.grid] as Cell[][],
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    camera: { ...s.camera },
    noticesFired: { ...s.noticesFired },
    notice: s.notice ? { ...s.notice } : null,
    summary: s.summary ? { ...s.summary } : null,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    effects: s.effects.map((e) => ({ ...e })),
    pendingCues: [...s.pendingCues],
    shake: { ...s.shake },
    pointerDown: { ...s.pointerDown },
  };
}
export function writeCell(
  s: DeepcoreState,
  col: number,
  row: number,
  value: Cell,
): void {
  s.grid[row] = [...s.grid[row]!];
  s.grid[row]![col] = value;
}
const SAVE_KEY = "deepcore-expedition-v1";
export function readSave(): DeepcoreState | null {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as DeepcoreState) : null;
  } catch {
    return null;
  }
}
export function eraseSave(): void {
  try {
    globalThis.localStorage?.removeItem(SAVE_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function storeSave(s: ReadState): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        ...s,
        assets: emptyAssets,
        effects: [],
        pendingCues: [],
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export function initial(assets: Assets = emptyAssets): DeepcoreState {
  const coreRow = C.STANDARD_ROWS;
  return {
    assets,
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow,
    menuIndex: 0,
    panelIndex: 0,
    muted: false,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave: !!readSave(),
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    coreTimer: null,
    coreGround: null,
    camera: { x: 0, y: 0, lead: 0 },
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0]!,
      hull: C.HULL_TIERS[0]!,
      drilling: null,
    },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as Record<
      C.TrackName,
      number
    >,
    items: Object.fromEntries(C.ITEM_IDS.map((t) => [t, 0])) as Record<
      C.ItemId,
      number
    >,
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    installed: 0,
    noticesFired: { gas: false, lava: false },
    notice: null,
    summary: null,
    grid: emptyGrid(coreRow),
    effects: [],
    pendingCues: [],
    hurtUntil: 0,
    animationTime: 0,
    hitTime: 0,
    accumulator: 0,
    shake: { at: -10, strength: 0 },
    note: "",
    noteUntil: 0,
    pointerDown: {},
    hovered: null,
    launchAt: null,
    endedAt: 0,
  };
}
export const maxFuel = (s: ReadState) => C.FUEL_TIERS[s.tiers.fuel - 1]!;
export const maxHull = (s: ReadState) => C.HULL_TIERS[s.tiers.hull - 1]!;
export const slotCap = (s: ReadState) => C.CARGO_TIERS[s.tiers.cargo - 1]!;
export const jetpack = (s: ReadState) => C.JETPACK_TIERS[s.tiers.jetpack - 1]!;
export const slots = (s: ReadState) =>
  Object.values(s.cargo).reduce<number>((a, b) => a + (b ?? 0), 0);
export const loadKg = (s: ReadState) =>
  C.MINERALS.reduce((sum, m) => sum + m.weightKg * (s.cargo[m.id] ?? 0), 0);
export const cargoValue = (s: ReadState) =>
  C.MINERALS.reduce((sum, m) => sum + m.value * (s.cargo[m.id] ?? 0), 0);
export const minerCell = (s: ReadState) => ({
  col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
  row: Math.max(0, Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE)),
});
export const depth = (s: ReadState) =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export function grounded(s: ReadState): boolean {
  const m = s.miner;
  if (Math.abs(m.y + C.MINER_H - C.SURFACE_Y) < 0.1) return true;
  if (m.drilling?.dir === "down") return true;
  const feet = m.y + C.MINER_H;
  if (Math.abs(feet / C.TILE - Math.round(feet / C.TILE)) > 0.002) return false;
  return [m.x + 1, m.x + C.MINER_W - 1].some(
    (x) =>
      tileAt(s, Math.floor(x / C.TILE), Math.round(feet / C.TILE)).kind !==
      "tunnel",
  );
}
export const BUILDING_RECTS: (Rect & { id: C.BuildingId })[] = C.BUILDINGS.map(
  (id, i) => ({ id, x: 130 + i * 320, y: C.SURFACE_Y - 144, w: 240, h: 144 }),
);
export function nearbyBuilding(s: ReadState) {
  const m = s.miner;
  if (Math.abs(m.y + C.MINER_H - C.SURFACE_Y) > 8) return null;
  return (
    BUILDING_RECTS.find(
      (b) => m.x + C.MINER_W / 2 >= b.x && m.x + C.MINER_W / 2 <= b.x + b.w,
    ) ?? null
  );
}
export function scanner(s: ReadState) {
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1];
  const rest = {
    locked: false,
    target: null,
    dirX: 0,
    dirY: 0,
    distanceTiles: null,
  };
  if (!range) return rest;
  const p = minerCell(s);
  let best: {
    material: C.MaterialId;
    dx: number;
    dy: number;
    dist: number;
  } | null = null;
  s.grid.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c.material && !s.satchel[c.material]) {
        const dx = x - p.col,
          dy = y - p.row,
          dist = Math.hypot(dx, dy);
        if (dist <= range && (!best || dist < best.dist))
          best = { material: c.material, dx, dy, dist };
      }
    }),
  );
  const b = best as {
    material: C.MaterialId;
    dx: number;
    dy: number;
    dist: number;
  } | null;
  return b
    ? {
        locked: true,
        target: b.material,
        dirX: b.dist ? b.dx / b.dist : 0,
        dirY: b.dist ? b.dy / b.dist : 0,
        distanceTiles: b.dist,
      }
    : rest;
}
export function snapshot(s: ReadState) {
  const p = minerCell(s),
    t = s.miner.drilling
      ? tileAt(s, s.miner.drilling.col, s.miner.drilling.row)
      : null;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      ...s.miner,
      ...p,
      grounded: grounded(s),
      maxFuel: maxFuel(s),
      maxHull: maxHull(s),
      overloaded: loadKg(s) >= jetpack(s).liftLimitKg,
      drilling: s.miner.drilling
        ? {
            ...s.miner.drilling,
            progress:
              t?.health !== null && t?.maxHealth
                ? 1 - t!.health! / t.maxHealth
                : 0,
          }
        : null,
    },
    cargo: {
      slotsUsed: slots(s),
      slotCap: slotCap(s),
      loadKg: loadKg(s),
      liftLimitKg: jetpack(s).liftLimitKg,
      ore: Object.fromEntries(
        Object.entries(s.cargo).filter(([, n]) => n! > 0),
      ),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? {
          hazard: s.notice.hazard,
          shown:
            s.elapsedSeconds + 1e-9 >= s.notice.at + C.NOTICE_DELAY &&
            s.elapsedSeconds < s.notice.at + C.NOTICE_DELAY + C.NOTICE_FADE,
        }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
