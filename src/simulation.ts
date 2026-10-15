import * as C from "./constants";
import {
  BUILDING_RECTS,
  cargoValue,
  cell,
  clamp,
  copy,
  depth,
  eraseSave,
  fraction,
  grounded,
  initial,
  jetpack,
  loadKg,
  maxFuel,
  maxHull,
  minable,
  minerCell,
  readSave,
  slotCap,
  slots,
  storeSave,
  tileAt,
  writeCell,
  type DeepcoreState,
  type ReadState,
} from "./state";
import { generate } from "./world";

export function note(s: DeepcoreState, text: string): void {
  s.note = text;
  s.noteUntil = s.simTime + 3.5;
}
export function effect(
  s: DeepcoreState,
  name: string,
  x = s.miner.x + C.MINER_W / 2,
  y = s.miner.y + C.MINER_H / 2,
): void {
  s.effects.push({
    name,
    x,
    y,
    time: s.elapsedSeconds,
    seed: Math.floor(Math.random() * 100000),
  });
}
function cue(s: DeepcoreState, name: C.CueName): void {
  s.pendingCues.push(name);
}
function shake(s: DeepcoreState, strength: number): void {
  s.shake = { at: s.elapsedSeconds, strength: Math.max(2, strength) };
}
export function end(s: DeepcoreState, cause: C.DeathCause | null): void {
  if (s.summary) return;
  s.endedAt = s.simTime;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
  s.screen = cause ? "game-over" : "victory";
  s.menuIndex = 0;
  s.panel = null;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  if (cause) {
    effect(s, "death-burst");
    cue(s, C.CUES.death);
  }
  if (!cause || s.mode === "hardcore") {
    eraseSave();
    s.hasSave = false;
  }
}
export function checkDeath(s: DeepcoreState): void {
  if (s.screen !== "in-mine" || s.launchAt !== null) return;
  if (s.miner.hull <= 0) {
    s.miner.hull = 0;
    end(s, "hull-destroyed");
  } else if (s.miner.fuel <= 0 && s.miner.y + C.MINER_H > C.SURFACE_Y + 0.1) {
    s.miner.fuel = 0;
    s.miner.state = "fuel-out";
    end(s, "fuel-out");
  }
}
export function damage(
  s: DeepcoreState,
  amount: number,
  hazard?: C.NoticeHazard,
): void {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.hurtUntil = s.elapsedSeconds + C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, at: s.elapsedSeconds };
  }
}
export function gasBlast(s: DeepcoreState, col: number, row: number): void {
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  effect(s, "gas-explosion", x, y);
  cue(s, C.CUES.gasExplosion);
  shake(s, 16);
  const dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y,
    d = Math.hypot(dx, dy);
  if (d <= C.GAS_BLAST_TILES * C.TILE) {
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, fraction(row, s.coreRow) - 0.25)) /
          0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (d ? dx / d : 0) * C.GAS_KNOCKBACK;
      s.miner.vy = (d ? dy / d : -1) * C.GAS_KNOCKBACK;
    }
  }
}
function breakCell(s: DeepcoreState, col: number, row: number): void {
  const t = tileAt(s, col, row);
  writeCell(s, col, row, cell("tunnel", t.band));
  if (t.ore) {
    if (slots(s) < slotCap(s)) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      effect(s, "ore-sparkle", (col + 0.5) * C.TILE, (row + 0.5) * C.TILE);
      cue(s, C.CUES.orePickup);
      note(s, `+ ${C.MINERALS.find((m) => m.id === t.ore)!.name}`);
    } else note(s, "Cargo full — mineral left behind");
  }
  if (t.material) {
    s.satchel[t.material]++;
    effect(s, "material-shimmer", (col + 0.5) * C.TILE, (row + 0.5) * C.TILE);
    cue(s, C.CUES.materialChime);
    note(s, `${t.material.toUpperCase()} secured in satchel`);
  }
  if (t.kind === "gas") gasBlast(s, col, row);
  if (t.kind === "lava") {
    damage(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]!),
      "lava",
    );
    effect(s, "lava-embers");
    cue(s, C.CUES.lavaSizzle);
  }
}
export function startExpedition(s: ReadState): DeepcoreState {
  const n = initial(s.assets as DeepcoreState["assets"]);
  n.mode = s.mode;
  n.worldSize = s.worldSize;
  n.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[n.worldSize]);
  n.screen = "in-mine";
  n.muted = s.muted;
  n.simTime = s.simTime;
  n.hasSave = false;
  eraseSave();
  generate(n);
  camera(n, 0);
  note(
    n,
    "Make every descent worth the climb. A / D move · S drill · W thrust",
  );
  return n;
}
export function resumeSave(s: ReadState): DeepcoreState {
  const saved = readSave();
  if (!saved) return copy(s);
  const n = copy(saved);
  n.assets = s.assets as DeepcoreState["assets"];
  n.simTime = s.simTime;
  n.screen = "in-mine";
  n.panel = null;
  n.menuIndex = 0;
  n.hasSave = true;
  n.summary = null;
  n.muted = s.muted;
  n.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
  n.miner.y = C.SURFACE_Y - C.MINER_H;
  n.miner.vx = 0;
  n.miner.vy = 0;
  n.miner.drilling = null;
  n.camera.lead = 0;
  camera(n, 0);
  note(n, "Expedition restored at the surface");
  return n;
}
export type Transaction =
  | "drop-ore"
  | "sell"
  | "buy-fuel"
  | "fill-fuel"
  | "buy-repair"
  | "repair-full"
  | "buy-upgrade"
  | "buy-item"
  | "use-item"
  | "jettison"
  | "fabricate"
  | "launch"
  | "save"
  | "dismiss-notice"
  | "inventory"
  | "pause"
  | "mute";
export function usableItem(s: ReadState, id: C.ItemId): boolean {
  if (!s.items[id]) return false;
  if (id === "nanobots") return s.miner.hull < maxHull(s);
  if (id === "emergency-fuel") return s.miner.fuel < maxFuel(s);
  if (id === "matter-transmitter")
    return (
      s.miner.x !== C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2 ||
      s.miner.y !== C.SURFACE_Y - C.MINER_H ||
      s.miner.vx !== 0 ||
      s.miner.vy !== 0
    );
  if (id === "dynamite" || id === "plastic-explosives") {
    const p = minerCell(s),
      r = id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
    for (let row = Math.max(1, p.row - r); row <= p.row + r; row++)
      for (let col = p.col - r; col <= p.col + r; col++)
        if (
          !["bedrock", "material", "core", "tunnel"].includes(
            tileAt(s, col, row).kind,
          )
        )
          return true;
    return false;
  }
  return true;
}
export function transact(
  state: ReadState,
  action: Transaction,
  subject: string | null = null,
): DeepcoreState {
  const s = copy(state),
    m = s.miner;
  const success = (text: string) => {
    note(s, text);
    cue(s, C.CUES.fabricate);
  };
  const cannot = (text = "Insufficient Credits") => note(s, text);
  if (action === "sell") {
    const value = cargoValue(s);
    s.credits += value;
    s.creditsEarned += value;
    s.cargo = {};
    success(value ? `Cargo sold · +${value} Credits` : "Cargo bay is empty");
  } else if (
    ["buy-fuel", "fill-fuel", "buy-repair", "repair-full"].includes(action)
  ) {
    const fuel = action.includes("fuel"),
      price = fuel ? C.FUEL_PRICE : C.REPAIR_PRICE,
      maximum = fuel ? maxFuel(s) : maxHull(s),
      current = fuel ? m.fuel : m.hull;
    const increment =
      action === "buy-fuel"
        ? C.FUEL_BUY_INCREMENT
        : action === "buy-repair"
          ? C.REPAIR_BUY_INCREMENT
          : Infinity;
    const wanted = Math.max(0, Math.min(maximum - current, increment));
    const amount =
      Number.isFinite(increment) && s.credits < wanted * price
        ? 0
        : Math.max(
            0,
            Math.min(maximum - current, increment, s.credits / price),
          );
    if (amount > 0) {
      s.credits -= amount * price;
      if (fuel) m.fuel += amount;
      else m.hull += amount;
      success(fuel ? "Fuel purchased" : "Hull repaired");
    } else cannot(current >= maximum ? "Already at full capacity" : undefined);
  } else if (action === "drop-ore") {
    if (!C.MINERALS.some((o) => o.id === subject))
      throw new RangeError("Unknown ore");
    const id = subject as C.OreId;
    if (s.cargo[id]) {
      s.cargo[id]!--;
      if (!s.cargo[id]) delete s.cargo[id];
      note(s, `${subject} discarded`);
    }
  } else if (action === "buy-upgrade") {
    if (!C.TRACKS.includes(subject as C.TrackName))
      throw new RangeError("Unknown upgrade");
    const t = subject as C.TrackName,
      tier = s.tiers[t];
    if (tier >= C.MAX_TIER[t]) cannot("Track already at maximum");
    else if (s.credits < C.UPGRADE_PRICES[tier - 1]!) cannot();
    else {
      const fuelBefore = maxFuel(s),
        hullBefore = maxHull(s);
      s.credits -= C.UPGRADE_PRICES[tier - 1]!;
      s.tiers[t]++;
      m.fuel += maxFuel(s) - fuelBefore;
      m.hull += maxHull(s) - hullBefore;
      success(`${t.toUpperCase()} upgraded to tier ${tier + 1}`);
    }
  } else if (action === "buy-item") {
    const item = C.ITEMS.find((i) => i.id === subject);
    if (!item) throw new RangeError("Unknown supply");
    if (s.credits < item.price) cannot();
    else {
      s.credits -= item.price;
      s.items[item.id]++;
      success(`${item.name} purchased`);
    }
  } else if (action === "use-item") {
    const id = subject as C.ItemId;
    if (!C.ITEM_IDS.includes(id)) throw new RangeError("Unknown supply");
    if (!s.items[id]) cannot("No supply of this type held");
    else if (
      (id === "nanobots" && m.hull >= maxHull(s)) ||
      (id === "emergency-fuel" && m.fuel >= maxFuel(s))
    )
      cannot("Already full — supply retained");
    else if (
      id === "matter-transmitter" &&
      m.x === C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2 &&
      m.y === C.SURFACE_Y - C.MINER_H &&
      m.vx === 0 &&
      m.vy === 0
    )
      cannot("Already at the camp — supply retained");
    else if (id === "dynamite" || id === "plastic-explosives") {
      const p = minerCell(s),
        r = id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
      const cells: { col: number; row: number }[] = [];
      for (let y = p.row - r; y <= p.row + r; y++)
        for (let x = p.col - r; x <= p.col + r; x++) {
          const t = tileAt(s, x, y);
          if (
            y >= 1 &&
            !["bedrock", "material", "core", "tunnel"].includes(t.kind)
          )
            cells.push({ col: x, row: y });
        }
      if (!cells.length) cannot("Nothing here to blast — supply retained");
      else {
        s.items[id]--;
        for (const p of cells) {
          if (tileAt(s, p.col, p.row).kind === "gas") gasBlast(s, p.col, p.row);
          writeCell(
            s,
            p.col,
            p.row,
            cell("tunnel", tileAt(s, p.col, p.row).band),
          );
        }
        m.drilling = null;
        effect(s, "gas-explosion");
        cue(s, C.CUES.gasExplosion);
        shake(s, 18);
        note(s, "Blast cleared. Ore in the blast was destroyed.");
      }
    } else {
      s.items[id]--;
      if (id === "nanobots")
        m.hull = Math.min(maxHull(s), m.hull + C.NANOBOT_HULL);
      if (id === "emergency-fuel")
        m.fuel = Math.min(maxFuel(s), m.fuel + C.EMERGENCY_FUEL);
      if (id === "matter-transmitter" || id === "quantum-teleporter") {
        effect(s, "core-extract");
        m.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
        m.y = C.SURFACE_Y - C.MINER_H;
        m.vx = 0;
        m.vy = 0;
        m.drilling = null;
        if (id === "quantum-teleporter") {
          const height =
            s.nextTeleportHeight ??
            C.TELEPORT_HEIGHT_TILES_MIN +
              Math.random() *
                (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN);
          m.y -= height * C.TILE;
          m.vy =
            s.nextTeleportSpeed ??
            C.TELEPORT_SPEED_MIN +
              Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN);
          s.nextTeleportHeight = null;
          s.nextTeleportSpeed = null;
        }
        s.camera.lead = 0;
        camera(s, 0);
      }
      effect(s, "material-shimmer");
      success(`${C.ITEMS.find((i) => i.id === id)!.name} used`);
    }
  } else if (action === "jettison") {
    if (s.satchel.coreSample) {
      s.satchel.coreSample = false;
      s.coreGround = minerCell(s);
      note(s, "Core Sample jettisoned. Get clear of the blast radius.");
    }
  } else if (action === "fabricate") {
    const component = C.ROCKET_COMPONENTS[s.installed];
    if (!component) cannot("Rocket already complete");
    else if (s.credits < component.credits) cannot();
    else if (
      component.material === "core-sample"
        ? !s.satchel.coreSample
        : component.material
          ? !s.satchel[component.material]
          : false
    )
      cannot(`Missing ${component.material}`);
    else {
      s.credits -= component.credits;
      s.installed++;
      if (component.material === "core-sample") {
        s.satchel.coreSample = false;
        s.coreTimer = null;
      } else if (component.material) s.satchel[component.material]--;
      success(`${component.name} installed · ${s.installed}/5`);
    }
  } else if (action === "launch") {
    if (s.installed !== C.ROCKET_COMPONENTS.length)
      cannot("Install all five components first");
    else if (s.launchAt === null) {
      s.launchAt = s.elapsedSeconds;
      s.panel = null;
      const b = BUILDING_RECTS.find((b) => b.id === "launch-pad")!;
      effect(s, "launch-exhaust", b.x + b.w / 2, C.SURFACE_Y);
      cue(s, C.CUES.launch);
      eraseSave();
      s.hasSave = false;
    }
  } else if (action === "save") {
    if (s.coreTimer !== null) cannot("Save refused: a Core Sample is unstable");
    else {
      s.hasSave = storeSave(s);
      note(
        s,
        s.hasSave
          ? "Expedition saved at the pad"
          : "Browser storage unavailable — expedition not saved",
      );
      if (s.hasSave) cue(s, C.CUES.fabricate);
    }
  } else if (action === "dismiss-notice") s.notice = null;
  else if (action === "inventory") {
    s.panel = s.panel === "inventory" ? null : "inventory";
    s.panelIndex = 0;
  } else if (action === "pause") {
    if (s.panel) s.panel = null;
    else {
      s.screen = s.screen === "paused" ? "in-mine" : "paused";
      s.menuIndex = 0;
    }
  }
  checkDeath(s);
  return s;
}

export interface Held {
  left: boolean;
  right: boolean;
  down: boolean;
  up: boolean;
}
function solid(s: ReadState, col: number, row: number): boolean {
  return row >= 1 && tileAt(s, col, row).kind !== "tunnel";
}
export function camera(s: DeepcoreState, dt: number): void {
  const target =
    Math.abs(s.miner.vy) <= C.CAM_STILL_SPEED
      ? 0
      : Math.sign(s.miner.vy) * C.CAM_LEAD_MAX;
  const unwind =
    Math.sign(target) !== Math.sign(s.camera.lead) ||
    Math.abs(target) < Math.abs(s.camera.lead);
  const step =
    (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) * (unwind ? C.CAM_UNWIND_MULT : 1) * dt;
  s.camera.lead += clamp(target - s.camera.lead, -step, step);
  s.camera.x = clamp(
    s.miner.x + C.MINER_W / 2 - C.VIEW_W / 2,
    0,
    C.WORLD_W - C.VIEW_W,
  );
  s.camera.y = Math.min(
    s.miner.y + C.MINER_H / 2 - C.VIEW_H / 2 + s.camera.lead,
    (s.coreRow + 1) * C.TILE - C.VIEW_H,
  );
}
function collisionX(s: DeepcoreState, dx: number): void {
  const m = s.miner;
  m.x += dx;
  m.x = clamp(m.x, C.TILE, C.WORLD_W - C.TILE - C.MINER_W);
  const col = Math.floor((dx > 0 ? m.x + C.MINER_W - 0.001 : m.x) / C.TILE);
  for (
    let row = Math.max(1, Math.floor((m.y + 0.1) / C.TILE));
    row <= Math.floor((m.y + C.MINER_H - 0.1) / C.TILE);
    row++
  ) {
    if (solid(s, col, row)) {
      m.x = dx > 0 ? col * C.TILE - C.MINER_W : (col + 1) * C.TILE;
      m.vx = 0;
      break;
    }
  }
}
function collisionY(s: DeepcoreState, dy: number, previousFeet: number): void {
  const m = s.miner;
  m.y += dy;
  const row = Math.floor((dy > 0 ? m.y + C.MINER_H - 0.001 : m.y) / C.TILE);
  for (
    let col = Math.floor((m.x + 0.1) / C.TILE);
    col <= Math.floor((m.x + C.MINER_W - 0.1) / C.TILE);
    col++
  ) {
    if (solid(s, col, row)) {
      const speed = m.vy;
      m.y = dy > 0 ? row * C.TILE - C.MINER_H : (row + 1) * C.TILE;
      m.vy = 0;
      if (dy > 0 && speed > C.IMPACT_SAFE_SPEED) {
        const amount = (speed - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
        damage(s, amount);
        effect(s, "impact-dust", m.x + C.MINER_W / 2, m.y + C.MINER_H);
        cue(s, C.CUES.impact);
        shake(s, Math.min(22, amount * 0.3));
      }
      break;
    }
  }
  // Row zero is continuous camp ground except at the cave mouth.
  if (dy > 0 && previousFeet <= C.SURFACE_Y && m.y + C.MINER_H >= C.SURFACE_Y) {
    const col = Math.floor((m.x + C.MINER_W / 2) / C.TILE);
    if (tileAt(s, col, 1).kind !== "tunnel") {
      const speed = m.vy;
      m.y = C.SURFACE_Y - C.MINER_H;
      m.vy = 0;
      if (speed > C.IMPACT_SAFE_SPEED) {
        damage(s, (speed - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE);
        effect(s, "impact-dust");
        cue(s, C.CUES.impact);
        shake(s, 10);
      }
    }
  }
}
function drill(s: DeepcoreState, held: Held, dt: number): void {
  const m = s.miner;
  if (!m.drill || held.up || m.fuel < C.DRILL_HIT_FUEL) {
    m.drilling = null;
    s.hitTime = 0;
    return;
  }
  const existing = m.drilling;
  let target: DeepcoreState["miner"]["drilling"] = null;
  if (grounded(s)) {
    const p = minerCell(s);
    if (held.down) {
      target =
        existing?.dir === "down"
          ? { ...existing }
          : {
              col: p.col,
              row: Math.max(1, Math.floor((m.y + C.MINER_H + 0.01) / C.TILE)),
              dir: "down",
            };
    } else if (held.left || held.right) {
      const right = held.right,
        col = Math.floor(
          (right ? m.x + C.MINER_W + 0.01 : m.x - 0.01) / C.TILE,
        );
      const edge = right
        ? col * C.TILE - (m.x + C.MINER_W)
        : m.x - (col + 1) * C.TILE;
      if (Math.abs(edge) < 0.1)
        target = {
          col,
          row: Math.floor((m.y + C.MINER_H / 2) / C.TILE),
          dir: right ? "right" : "left",
        };
    }
  }
  if (!target) {
    m.drilling = null;
    s.hitTime = 0;
    return;
  }
  const t = tileAt(s, target.col, target.row);
  if (t.kind === "core" && target.dir === "down") {
    m.drilling = null;
    if (s.coreTimer === null) {
      s.satchel.coreSample = true;
      s.coreTimer = C.CORE_TIMER;
      effect(s, "core-extract");
      cue(s, C.CUES.materialChime);
      note(s, "CORE SAMPLE EXTRACTED · 90 seconds. Return to the launch pad.");
    }
    return;
  }
  if (!minable(t.kind)) {
    m.drilling = null;
    s.hitTime = 0;
    return;
  }
  if (!existing || existing.col !== target.col || existing.row !== target.row)
    s.hitTime = 0;
  m.drilling = target;
  s.hitTime += dt;
  while (
    s.hitTime + 1e-9 >= C.DRILL_HIT_INTERVAL &&
    m.fuel >= C.DRILL_HIT_FUEL
  ) {
    s.hitTime -= C.DRILL_HIT_INTERVAL;
    m.fuel -= C.DRILL_HIT_FUEL;
    const current = tileAt(s, target.col, target.row),
      health = current.health! - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]!;
    effect(
      s,
      "drill-debris",
      target.dir === "down"
        ? m.x + C.MINER_W / 2
        : target.dir === "right"
          ? m.x + C.MINER_W
          : m.x,
      target.dir === "down" ? m.y + C.MINER_H : m.y + C.MINER_H / 2,
    );
    const below = tileAt(s, target.col, target.row + 1),
      sink =
        target.dir === "down" &&
        below.kind !== "tunnel" &&
        below.kind !== "lava";
    if (health <= 0) {
      breakCell(s, target.col, target.row);
      if (sink && m.travel) {
        m.y = (target.row + 1) * C.TILE - C.MINER_H;
        m.vy = 0;
      }
      m.drilling = null;
      s.hitTime = 0;
      break;
    }
    writeCell(s, target.col, target.row, { ...current, health });
    if (sink && m.travel) {
      m.y =
        target.row * C.TILE +
        C.TILE * (1 - health / current.maxHealth!) -
        C.MINER_H;
      m.vy = 0;
    }
  }
}
export function step(s: DeepcoreState, held: Held, dt: number): void {
  s.elapsedSeconds += dt;
  s.effects = s.effects
    .filter((e) => s.elapsedSeconds - e.time < 1.8)
    .slice(-100);
  if (
    s.notice &&
    s.elapsedSeconds > s.notice.at + C.NOTICE_DELAY + C.NOTICE_FADE
  )
    s.notice = null;
  if (s.coreTimer !== null) {
    s.coreTimer = Math.max(0, s.coreTimer - dt);
    if (s.coreTimer <= 1e-8) {
      const p = s.coreGround;
      effect(
        s,
        "core-detonation",
        p ? (p.col + 0.5) * C.TILE : undefined,
        p ? (p.row + 0.5) * C.TILE : undefined,
      );
      shake(s, 35);
      cue(s, C.CUES.gasExplosion);
      const lethal =
        s.satchel.coreSample ||
        (!!p &&
          Math.hypot(
            (p.col + 0.5) * C.TILE - (s.miner.x + C.MINER_W / 2),
            (p.row + 0.5) * C.TILE - (s.miner.y + C.MINER_H / 2),
          ) <=
            C.CORE_BLAST_TILES * C.TILE);
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (lethal) {
        end(s, "core-detonation");
        return;
      }
    }
  }
  if (s.launchAt !== null) {
    if (s.elapsedSeconds - s.launchAt > 3) end(s, null);
    return;
  }
  checkDeath(s);
  if (s.screen !== "in-mine") return;
  if (!s.panel) {
    const m = s.miner,
      wasGrounded = grounded(s),
      direction = Number(held.right) - Number(held.left);
    if (direction) m.facing = direction > 0 ? "east" : "west";
    const thrust = held.up && m.fuel > 0;
    if (m.travel) {
      const load = loadKg(s) / jetpack(s).liftLimitKg,
        pack = jetpack(s);
      if (s.elapsedSeconds >= s.hurtUntil) m.vx = direction * C.WALK_SPEED;
      if (thrust) {
        m.drilling = null;
        m.vy = Math.max(
          -pack.emptyClimb * (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
          m.vy - pack.emptyAccel * Math.max(0, 1 - load) * dt,
        );
      } else if (!m.drilling)
        m.vy = Math.min(
          C.FALL_TERMINAL_EMPTY +
            (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) *
              Math.min(1, load),
          m.vy + C.GRAVITY * dt,
        );
      if (m.vx) collisionX(s, m.vx * dt);
      if (!m.drilling || m.drilling.dir !== "down" || thrust)
        collisionY(s, m.vy * dt, m.y + C.MINER_H);
    }
    if (thrust) {
      const burn =
        C.THRUST_BURN_MAX +
        (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
          Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED);
      m.fuel -= burn * C.THRUST_BURN_SIZE_MULT[s.worldSize] * dt;
    }
    if (direction && !wasGrounded) m.fuel -= C.AIR_BURN * dt;
    if (m.y + C.MINER_H > C.SURFACE_Y + 0.1) m.fuel -= C.LIFE_SUPPORT_BURN * dt;
    drill(s, held, dt);
    // Contact heat includes flush contact, excluding the cell being drilled.
    let lava = false;
    for (
      let row = Math.max(1, Math.floor((m.y - 0.1) / C.TILE));
      row <= Math.floor((m.y + C.MINER_H + 0.1) / C.TILE);
      row++
    )
      for (
        let col = Math.floor((m.x - 0.1) / C.TILE);
        col <= Math.floor((m.x + C.MINER_W + 0.1) / C.TILE);
        col++
      ) {
        if (
          tileAt(s, col, row).kind === "lava" &&
          !(m.drilling?.col === col && m.drilling.row === row)
        )
          lava = true;
      }
    if (lava) {
      damage(
        s,
        C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]!) * dt,
        "lava",
      );
      if (
        Math.floor(s.elapsedSeconds * 5) !==
        Math.floor((s.elapsedSeconds - dt) * 5)
      ) {
        effect(s, "lava-embers");
        cue(s, C.CUES.lavaSizzle);
      }
    }
    m.fuel = Math.max(0, m.fuel);
    const state: C.MinerState = m.drilling
      ? m.drilling.dir === "down"
        ? "drill-down"
        : "drill-side"
      : s.elapsedSeconds < s.hurtUntil
        ? "hurt"
        : m.fuel <= 0 && depth(s) > 0
          ? "fuel-out"
          : thrust
            ? "jetpack"
            : !grounded(s)
              ? "fall"
              : direction
                ? "walk"
                : "idle";
    s.animationTime = state === m.state ? s.animationTime + dt : 0;
    m.state = state;
  }
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  camera(s, dt);
  checkDeath(s);
}
