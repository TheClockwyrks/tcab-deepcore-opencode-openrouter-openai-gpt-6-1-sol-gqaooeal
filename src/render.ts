import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  BUILDING_RECTS,
  depth,
  jetpack,
  loadKg,
  maxFuel,
  maxHull,
  nearbyBuilding,
  scanner,
  slotCap,
  slots,
  tileAt,
  type ReadState,
  type Rect,
} from "./state";
import {
  controls,
  loadLabel,
  menuItemRect,
  menuItems,
  upgradeEffect,
} from "./interface";

const P = {
  bg: "#101c25",
  panel: "#142731",
  line: "#344b53",
  muted: "#8ca1a3",
  text: "#e5e7da",
  gold: "#e5bb7e",
  cyan: "#8bd3c4",
  red: "#ed947c",
};
type Context = CanvasRenderingContext2D;
function box(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = P.text,
  weight = 400,
  align: CanvasTextAlign = "left",
): void {
  ctx.font = `${weight} ${size}px ${weight >= 700 ? '"Trebuchet MS", Arial, sans-serif' : '"Courier New", monospace'}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}
function rule(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  color = P.line,
): void {
  box(ctx, x, y, w, 1, color);
}
function image(
  ctx: Context,
  s: ReadState,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const img = s.assets.images[name];
  if (img) ctx.drawImage(img as ImageBitmap, x, y, w, h);
}
function label(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  color = P.muted,
): void {
  text(ctx, value, x, y, 11, color, 600);
}
function frame(ctx: Context, r: Rect): void {
  box(ctx, r.x, r.y, r.w, r.h, "#122630ee", P.line);
  box(ctx, r.x, r.y, 40, 2, P.gold);
  box(ctx, r.x + r.w - 40, r.y + r.h - 2, 40, 2, P.gold);
}
function sprite(
  ctx: Context,
  s: ReadState,
  x: number,
  y: number,
  scale = 1,
  state = s.miner.state,
): void {
  const counts: Record<C.MinerState, number> = {
    idle: 4,
    walk: 6,
    "drill-down": 4,
    "drill-side": 4,
    jetpack: 4,
    fall: 3,
    hurt: 3,
    "fuel-out": 3,
  };
  let f = Math.floor(s.animationTime * C.ANIM_FPS);
  f = state === "hurt" ? Math.min(counts[state] - 1, f) : f % counts[state];
  ctx.save();
  ctx.translate(x + (C.MINER_W * scale) / 2, y);
  if (s.miner.facing === "west") ctx.scale(-1, 1);
  image(
    ctx,
    s,
    `miner/${state}/frame${String(f).padStart(2, "0")}.png`,
    (-C.MINER_SPRITE * scale) / 2,
    -4 * scale,
    C.MINER_SPRITE * scale,
    C.MINER_SPRITE * scale,
  );
  ctx.restore();
}
function particles(
  ctx: Context,
  s: ReadState,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
  scale = 1,
): void {
  const system = s.assets.systems[name];
  if (!system) return;
  ctx.save();
  ctx.translate(x - 128 * scale, y - 128 * scale);
  // The player fits its field to the physical backing store; compensate for
  // that fit, keeping every effect in logical world units at any pixel ratio.
  ctx.scale(
    (256 * scale) / ctx.canvas.width,
    (256 * scale) / ctx.canvas.height,
  );
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = 0;
  const player = new ParticleCanvasPlayer(system as ParticleSystem, ctx, {
    seed,
    clear: false,
    pixelRadius: 3,
    composite:
      name.includes("dust") || name.includes("debris")
        ? "source-over"
        : "lighter",
  });
  ctx.globalAlpha = alpha;
  for (let t = 0; t < age; t += 1 / 12)
    player.simulator.step(Math.min(1 / 12, age - t) * 1000);
  player.update(0);
  ctx.restore();
}
function openShape(
  ctx: Context,
  s: ReadState,
  col: number,
  row: number,
  kind: "tunnel" | "lava",
): void {
  const x = col * C.TILE,
    y = row * C.TILE,
    gap = 7;
  const connected = (dx: number, dy: number) => {
    const cut = s.miner.drilling;
    const neighbor = tileAt(s, col + dx, row + dy);
    const bore =
      kind === "tunnel" &&
      cut?.dir === "down" &&
      cut.col === col + dx &&
      cut.row === row + dy &&
      neighbor.health !== null &&
      neighbor.maxHealth !== null &&
      neighbor.health < neighbor.maxHealth &&
      !["tunnel", "lava"].includes(tileAt(s, cut.col, cut.row + 1).kind);
    return (
      neighbor.kind === kind || bore || (kind === "tunnel" && row + dy < 1)
    );
  };
  const l = connected(-1, 0),
    r = connected(1, 0),
    u = connected(0, -1),
    d = connected(0, 1);
  const xx = x + (l ? 0 : gap),
    yy = y + (u ? 0 : gap),
    ww = C.TILE - (l ? 0 : gap) - (r ? 0 : gap),
    hh = C.TILE - (u ? 0 : gap) - (d ? 0 : gap);
  ctx.beginPath();
  ctx.roundRect(xx, yy, ww, hh, [
    l || u ? 0 : 15,
    r || u ? 0 : 15,
    r || d ? 0 : 15,
    l || d ? 0 : 15,
  ]);
  ctx.clip();
}
function world(ctx: Context, s: ReadState): void {
  const visualTime = s.elapsedSeconds + (s.summary ? s.simTime - s.endedAt : 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  image(
    ctx,
    s,
    "surface/sky.png",
    -s.camera.x * 0.12,
    -Math.max(0, s.camera.y) * 0.015 + C.HUD_H,
    C.STAGE_W + 200,
    C.VIEW_H,
  );
  const shakeAge = visualTime - s.shake.at,
    shakeAmp =
      shakeAge < 1.2 ? s.shake.strength * Math.max(0, 1 - shakeAge / 1.2) : 0;
  ctx.translate(
    -s.camera.x + Math.sin(s.simTime * 103) * shakeAmp,
    -s.camera.y + C.HUD_H + Math.cos(s.simTime * 87) * shakeAmp * 0.65,
  );
  const minCol = Math.max(0, Math.floor(s.camera.x / C.TILE)),
    maxCol = Math.min(
      C.WORLD_COLS - 1,
      Math.ceil((s.camera.x + C.VIEW_W) / C.TILE),
    );
  const minRow = Math.max(1, Math.floor(s.camera.y / C.TILE)),
    maxRow = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
  for (let row = minRow; row <= maxRow; row++)
    for (let col = minCol; col <= maxCol; col++) {
      const t = tileAt(s, col, row),
        x = col * C.TILE,
        y = row * C.TILE,
        variant = Math.abs((col * 17 + row * 31) ^ row) % C.TILE_VARIANTS;
      const base =
        t.kind === "bedrock"
          ? "tiles/bedrock.png"
          : `tiles/${t.band ?? "coreshell"}-${variant}.png`;
      image(ctx, s, base, x, y, C.TILE, C.TILE);
      if (t.kind === "tunnel" || t.kind === "lava") {
        ctx.save();
        openShape(ctx, s, col, row, t.kind);
        image(
          ctx,
          s,
          t.kind === "tunnel"
            ? "tiles/tunnel.png"
            : `hazards/lava/frame${String(Math.floor(s.elapsedSeconds * 5) % 3).padStart(2, "0")}.png`,
          x,
          y,
          C.TILE,
          C.TILE,
        );
        ctx.restore();
        // Round dirt nubs at diagonal solids keep L/T junctions connected without
        // cutting a concave notch into the ground.
        if (t.kind === "tunnel")
          for (const [dx, dy] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ]) {
            if (
              tileAt(s, col + dx!, row).kind === "tunnel" &&
              tileAt(s, col, row + dy!).kind === "tunnel" &&
              tileAt(s, col + dx!, row + dy!).kind !== "tunnel"
            ) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(
                x + (dx! < 0 ? 0 : C.TILE),
                y + (dy! < 0 ? 0 : C.TILE),
                7,
                0,
                Math.PI * 2,
              );
              ctx.clip();
              image(ctx, s, base, x, y, C.TILE, C.TILE);
              ctx.restore();
            }
          }
      }
      if (t.kind === "stone")
        image(
          ctx,
          s,
          `tiles/stone-${(col + row) % 2}.png`,
          x,
          y,
          C.TILE,
          C.TILE,
        );
      if (t.ore) image(ctx, s, `ore/${t.ore}.png`, x, y, C.TILE, C.TILE);
      if (t.material)
        image(ctx, s, `materials/${t.material}.png`, x, y, C.TILE, C.TILE);
      if (t.kind === "core")
        image(
          ctx,
          s,
          "materials/core.png",
          x - 32,
          y - 32,
          C.TILE + 64,
          C.TILE + 64,
        );
      if (t.health !== null && t.maxHealth && t.health < t.maxHealth) {
        const f = Math.min(
          C.CRACK_FRAMES - 1,
          Math.floor((1 - t.health / t.maxHealth) * C.CRACK_FRAMES),
        );
        image(
          ctx,
          s,
          `tiles/crack/frame${String(f).padStart(2, "0")}.png`,
          x,
          y,
          C.TILE,
          C.TILE,
        );
        const cut = s.miner.drilling;
        if (
          cut?.dir === "down" &&
          cut.col === col &&
          cut.row === row &&
          tileAt(s, col, row + 1).kind !== "tunnel" &&
          tileAt(s, col, row + 1).kind !== "lava"
        ) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(
            x + 7,
            y - 1,
            C.TILE - 14,
            C.TILE * (1 - t.health / t.maxHealth) + 2,
            [0, 0, 9, 9],
          );
          ctx.clip();
          image(ctx, s, "tiles/tunnel.png", x, y, C.TILE, C.TILE);
          ctx.restore();
        }
      }
      if (t.kind === "gas")
        particles(
          ctx,
          s,
          "gas-seep",
          x + C.TILE / 2,
          y + C.TILE / 2,
          (s.elapsedSeconds + (col % 3) * 0.31) % C.GAS_SEEP_PERIOD,
          col * 1000 + row,
        );
      ctx.strokeStyle = "#ffffff04";
      ctx.strokeRect(x + 0.5, y + 0.5, C.TILE - 1, C.TILE - 1);
    }
  if (s.camera.y < C.SURFACE_Y) {
    for (let col = minCol; col <= maxCol; col++)
      if (tileAt(s, col, 1).kind !== "tunnel")
        image(
          ctx,
          s,
          "surface/ground.png",
          col * C.TILE,
          C.SURFACE_Y,
          C.TILE,
          18,
        );
    for (const b of BUILDING_RECTS) {
      image(ctx, s, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      if (b.id === "launch-pad") {
        const rise =
          s.launchAt === null
            ? 0
            : Math.pow(s.elapsedSeconds - s.launchAt, 2) * 160;
        image(
          ctx,
          s,
          `rocket/stage${s.installed}.png`,
          b.x + 44,
          C.SURFACE_Y - 218 - rise,
          152,
          218,
        );
      }
      label(
        ctx,
        b.id.replace(/-/g, " ").toUpperCase(),
        b.x + b.w / 2 - 52,
        b.y + 30,
        b.id === "save-pad" ? P.cyan : P.gold,
      );
      text(
        ctx,
        String(C.BUILDINGS.indexOf(b.id) + 1).padStart(2, "0"),
        b.x + 10,
        C.SURFACE_Y + 29,
        10,
        P.muted,
      );
    }
    image(
      ctx,
      s,
      "surface/cave-mouth.png",
      C.CAVE_MOUTH_COL * C.TILE - 20,
      C.SURFACE_Y - 70,
      120,
      90,
    );
    text(
      ctx,
      "↓ THE DESCENT",
      C.CAVE_MOUTH_COL * C.TILE - 15,
      C.SURFACE_Y - 89,
      13,
      P.gold,
      700,
    );
  }
  if (s.coreGround) {
    const p = s.coreGround;
    image(
      ctx,
      s,
      "materials/core-sample.png",
      p.col * C.TILE + 16,
      p.row * C.TILE + 16,
      48,
      48,
    );
    text(
      ctx,
      `${Math.ceil(s.coreTimer ?? 0)}s`,
      (p.col + 0.5) * C.TILE,
      p.row * C.TILE - 10,
      18,
      P.red,
      700,
      "center",
    );
  }
  if (s.launchAt === null) sprite(ctx, s, s.miner.x, s.miner.y);
  for (const e of s.effects.filter((e) => visualTime - e.time < 1.8))
    particles(
      ctx,
      s,
      e.name,
      e.x,
      e.y,
      visualTime - e.time,
      e.seed,
      e.name === "core-detonation" ? 2.2 : 1,
    );
  if (s.miner.state === "jetpack" && s.launchAt === null)
    particles(
      ctx,
      s,
      "jetpack-exhaust",
      s.miner.x + 14,
      s.miner.y + 56,
      s.elapsedSeconds % 0.35,
      37,
    );
  const nearby = nearbyBuilding(s);
  if (nearby && !s.panel && s.launchAt === null) {
    const x = s.miner.x + C.MINER_W / 2,
      y = s.miner.y - 24;
    box(ctx, x - 95, y - 20, 190, 29, "#0e202bea", P.line);
    text(
      ctx,
      nearby.id === "save-pad"
        ? "E · SAVE EXPEDITION"
        : `E · ${nearby.id.replace(/-/g, " ").toUpperCase()}`,
      x,
      y,
      12,
      P.gold,
      600,
      "center",
    );
  }
  ctx.restore();
  // Subtle vignette, drawn as lighting rather than replacement sprite art.
  const glow = ctx.createRadialGradient(
    C.VIEW_W / 2,
    360,
    170,
    C.VIEW_W / 2,
    360,
    780,
  );
  glow.addColorStop(0, "#07101800");
  glow.addColorStop(1, "#07101870");
  ctx.fillStyle = glow;
  ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  if (depth(s) > 0) {
    label(
      ctx,
      "SUBSURFACE / " +
        (
          tileAt(
            s,
            Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
            Math.max(1, Math.floor((s.miner.y + C.MINER_H) / C.TILE)),
          ).band ?? "CORE"
        ).toUpperCase(),
      28,
      91,
    );
    for (let y = 120; y < 680; y += 40) {
      rule(ctx, 20, y, 6);
      if (y % 80 === 40)
        label(
          ctx,
          `${Math.max(0, Math.round(((s.camera.y + y - C.HUD_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW))}`,
          32,
          y + 4,
        );
    }
  } else {
    label(ctx, "OUTPOST 07 / SURFACE CAMP", 28, 91);
    text(
      ctx,
      `${s.mode.toUpperCase()} · ${s.worldSize.toUpperCase()} EXPEDITION`,
      1250,
      91,
      11,
      P.muted,
      600,
      "right",
    );
  }
  const scan = scanner(s);
  if (scan.locked) {
    frame(ctx, { x: 967, y: 106, w: 285, h: 63 });
    ctx.save();
    ctx.translate(990, 128);
    ctx.rotate(Math.atan2(scan.dirY, scan.dirX));
    ctx.strokeStyle = P.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.lineTo(3, -5);
    ctx.moveTo(8, 0);
    ctx.lineTo(3, 5);
    ctx.stroke();
    ctx.restore();
    text(ctx, scan.target?.toUpperCase() ?? "", 1008, 132, 14, P.cyan, 700);
    label(
      ctx,
      `${scan.distanceTiles?.toFixed(1)} TILES · ${scan.dirY > 0 ? "BELOW" : "ABOVE"} / ${scan.dirX > 0 ? "EAST" : "WEST"}`,
      984,
      152,
    );
  }
  if (s.satchel.coreSample) {
    frame(ctx, { x: 441, y: 79, w: 398, h: 74 });
    text(
      ctx,
      `UNSTABLE CORE  ${Math.ceil(s.coreTimer ?? 0)}s`,
      640,
      110,
      23,
      P.red,
      700,
      "center",
    );
    text(
      ctx,
      "RETURN TO LAUNCH PAD · J TO JETTISON",
      640,
      134,
      11,
      P.gold,
      400,
      "center",
    );
  }
  if (s.notice && s.elapsedSeconds >= s.notice.at + C.NOTICE_DELAY) {
    frame(ctx, { x: 344, y: 590, w: 592, h: 88 });
    text(
      ctx,
      s.notice.hazard === "gas"
        ? "VOLATILE GAS / WATCH FOR THE SEEP"
        : "MOLTEN ROCK / KEEP YOUR DISTANCE",
      365,
      617,
      17,
      P.red,
      700,
    );
    text(
      ctx,
      s.notice.hazard === "gas"
        ? "Gas damages every hull. Watch the rock breathe before cutting."
        : "Lava burns on contact. A radiator reduces the heat damage.",
      365,
      640,
      12,
      P.text,
    );
    text(ctx, "CLICK TO DISMISS", 915, 663, 10, P.muted, 400, "right");
  }
  if (s.note && s.simTime < s.noteUntil) {
    const w = Math.min(1000, s.note.length * 8 + 48);
    box(ctx, (C.STAGE_W - w) / 2, 665, w, 34, "#0c1d27ee", P.line);
    text(ctx, s.note, C.STAGE_W / 2, 687, 12, P.gold, 400, "center");
  }
  if (!s.panel && s.launchAt === null) {
    label(
      ctx,
      "A D  MOVE     S  DRILL     W / SPACE  THRUST     E  INTERACT",
      28,
      704,
    );
    text(
      ctx,
      `ROCKET ${s.installed} / ${C.ROCKET_COMPONENTS.length}`,
      1252,
      704,
      11,
      P.gold,
      600,
      "right",
    );
  }
}
function gauge(
  ctx: Context,
  s: ReadState,
  name: string,
  x: number,
  value: number,
  max: number,
  color: string,
  alert: boolean,
): void {
  image(ctx, s, `icons/${name}.png`, x, 16, C.ICON_SIZE, C.ICON_SIZE);
  label(ctx, name.toUpperCase(), x + 32, 20, alert ? P.red : P.muted);
  text(
    ctx,
    `${Math.ceil(value)} / ${max}`,
    x + 32,
    38,
    14,
    alert ? P.red : P.text,
    700,
  );
  box(ctx, x + 32, 44, 114, 3, "#31454b");
  box(
    ctx,
    x + 32,
    44,
    114 * Math.min(1, value / max),
    3,
    alert ? P.red : color,
  );
}
function hud(ctx: Context, s: ReadState): void {
  box(ctx, 0, 0, C.STAGE_W, C.HUD_H, "#10232c");
  rule(ctx, 0, 55, C.STAGE_W, "#55635a");
  gauge(
    ctx,
    s,
    "fuel",
    22,
    s.miner.fuel,
    maxFuel(s),
    P.gold,
    s.miner.fuel / maxFuel(s) < C.LOW_FUEL_FRACTION,
  );
  gauge(
    ctx,
    s,
    "hull",
    204,
    s.miner.hull,
    maxHull(s),
    P.cyan,
    s.miner.hull / maxHull(s) < C.LOW_HULL_FRACTION,
  );
  image(ctx, s, "icons/cargo.png", 391, 16, 24, 24);
  label(ctx, "CARGO", 424, 20, slots(s) >= slotCap(s) ? P.red : P.muted);
  text(ctx, `${slots(s)} / ${slotCap(s)}`, 424, 39, 15, P.text, 700);
  text(
    ctx,
    loadLabel(s),
    500,
    39,
    11,
    loadKg(s) >= jetpack(s).liftLimitKg ? P.red : P.muted,
  );
  image(ctx, s, "icons/credits.png", 605, 16, 24, 24);
  label(ctx, "CREDITS", 638, 20);
  text(ctx, Math.floor(s.credits).toLocaleString(), 638, 39, 16, P.gold, 700);
  image(ctx, s, "icons/depth.png", 774, 16, 24, 24);
  label(ctx, "DEPTH", 805, 20);
  text(ctx, `${Math.floor(depth(s))} m`, 805, 39, 16, P.text, 700);
  image(ctx, s, "icons/resonite.png", 939, 16, 22, 22);
  text(
    ctx,
    String(s.satchel.resonite),
    965,
    34,
    13,
    s.satchel.resonite ? P.cyan : P.muted,
  );
  image(ctx, s, "icons/cryenite.png", 992, 16, 22, 22);
  text(
    ctx,
    String(s.satchel.cryenite),
    1018,
    34,
    13,
    s.satchel.cryenite ? P.cyan : P.muted,
  );
  for (const c of controls(s).filter((c) => c.rect.y < 56))
    drawButton(ctx, s, c);
}
function drawButton(
  ctx: Context,
  s: ReadState,
  c: ReturnType<typeof controls>[number],
): void {
  const r = c.rect,
    hover = s.hovered === c.id,
    selected =
      s.panel &&
      controls(s).filter((c) => c.rect.y > 56 && c.action !== "close")[
        s.panelIndex
      ]?.id === c.id;
  box(
    ctx,
    r.x,
    r.y,
    r.w,
    r.h,
    !c.enabled ? "#1b2c34" : hover || selected ? "#c7b58b" : "#263e47",
    !c.enabled ? "#2d3d43" : hover || selected ? P.gold : "#536b6b",
  );
  text(
    ctx,
    c.label,
    r.x + r.w / 2,
    r.y + r.h / 2 + 4,
    r.w < 80 ? 11 : 12,
    !c.enabled ? "#617477" : hover || selected ? "#122832" : P.text,
    600,
    "center",
  );
}
function panel(ctx: Context, s: ReadState): void {
  if (!s.panel) return;
  box(ctx, 0, C.HUD_H, C.STAGE_W, C.VIEW_H, "#07131bb8");
  frame(ctx, { x: 186, y: 109, w: 920, h: 529 });
  const title =
    s.panel === "inventory"
      ? "CARGO & FIELD KIT"
      : s.panel.replace(/-/g, " ").toUpperCase();
  label(ctx, "OUTPOST SERVICES / " + s.mode.toUpperCase(), 218, 139);
  text(ctx, title, 218, 174, 30, P.text, 700);
  text(
    ctx,
    `${Math.floor(s.credits).toLocaleString()} CR`,
    1036,
    174,
    19,
    P.gold,
    700,
    "right",
  );
  rule(ctx, 218, 192, 818);
  switch (s.panel) {
    case "fuel-depot":
      image(ctx, s, "icons/fuel.png", 230, 235, 40, 40);
      text(ctx, "JETPACK FUEL", 292, 247, 19, P.gold, 700);
      text(
        ctx,
        `${s.miner.fuel.toFixed(1)} / ${maxFuel(s)} units`,
        292,
        276,
        16,
      );
      label(
        ctx,
        `${C.FUEL_PRICE} CREDIT PER UNIT · PAY ONLY FOR WHAT FITS`,
        230,
        313,
      );
      rule(ctx, 230, 336, 806);
      image(ctx, s, "icons/hull.png", 230, 355, 40, 40);
      text(ctx, "HULL INTEGRITY", 292, 366, 19, P.cyan, 700);
      text(
        ctx,
        `${s.miner.hull.toFixed(1)} / ${maxHull(s)} points`,
        292,
        395,
        16,
      );
      label(
        ctx,
        `${C.REPAIR_PRICE} CREDITS PER POINT · NO AUTOMATIC REPAIRS`,
        230,
        433,
      );
      text(
        ctx,
        "A return to the surface is a chance to recover.",
        230,
        513,
        16,
        P.text,
      );
      text(
        ctx,
        "Fuel and hull never replenish on their own.",
        230,
        540,
        13,
        P.muted,
      );
      break;
    case "ore-market": {
      label(ctx, "MINERAL", 230, 223);
      label(ctx, "UNITS", 590, 223);
      label(ctx, "VALUE", 760, 223);
      rule(ctx, 230, 233, 806);
      let y = 258;
      for (const m of C.MINERALS)
        if (s.cargo[m.id]) {
          image(ctx, s, `ore/${m.id}.png`, 231, y - 20, 28, 28);
          text(ctx, m.name, 272, y, 14);
          text(ctx, String(s.cargo[m.id]), 606, y, 14);
          text(
            ctx,
            `${m.value * (s.cargo[m.id] ?? 0)} CR`,
            861,
            y,
            14,
            P.gold,
            600,
            "right",
          );
          y += 22;
        }
      if (!slots(s))
        text(
          ctx,
          "Empty bay. The next haul is waiting below.",
          240,
          306,
          17,
          P.muted,
        );
      rule(ctx, 230, 554, 806);
      text(ctx, "TOTAL HAUL", 230, 601, 17, P.text, 700);
      text(ctx, `${slots(s)} units · ${loadKg(s)} kg`, 430, 600, 13, P.muted);
      break;
    }
    case "upgrade-shop":
      C.TRACKS.forEach((t, i) => {
        const y = 229 + i * 53;
        text(ctx, t.toUpperCase(), 230, y, 16, P.text, 700);
        text(ctx, `T${s.tiers[t]} / ${C.MAX_TIER[t]}`, 414, y, 13, P.gold);
        text(ctx, upgradeEffect(s, t), 495, y, 12, P.muted);
        if (i < 6) rule(ctx, 230, y + 22, 806, "#263e47");
      });
      break;
    case "supply-depot":
      C.ITEMS.forEach((item, i) => {
        const y = 241 + i * 60;
        box(ctx, 230, y - 20, 28, 28, "#304b53");
        text(ctx, String(i + 1), 244, y, 15, P.gold, 700, "center");
        text(ctx, item.name, 276, y - 3, 16, P.text, 700);
        text(
          ctx,
          [
            "3×3 blast · destroys ore",
            "5×5 blast · breaks boulders",
            "Surface warp · unpredictable landing",
            "Safe return to the camp",
            "Repairs 20 hull",
            "Restores 30 fuel",
          ][i]!,
          276,
          y + 17,
          11,
          P.muted,
        );
        text(ctx, `HELD ${s.items[item.id]}`, 780, y, 12, P.cyan, 400, "right");
      });
      break;
    case "launch-pad":
      image(ctx, s, `rocket/stage${s.installed}.png`, 247, 232, 195, 273);
      C.ROCKET_COMPONENTS.forEach((part, i) => {
        const y = 233 + i * 60;
        text(
          ctx,
          i < s.installed ? "✓" : String(i + 1).padStart(2, "0"),
          498,
          y,
          18,
          i < s.installed ? P.cyan : P.muted,
          700,
        );
        text(
          ctx,
          part.name.toUpperCase(),
          541,
          y,
          16,
          i === s.installed ? P.gold : P.text,
          700,
        );
        text(
          ctx,
          `${part.credits.toLocaleString()} CR${part.material ? " + " + part.material.toUpperCase() : ""}`,
          541,
          y + 22,
          12,
          i < s.installed ? P.cyan : P.muted,
        );
      });
      text(
        ctx,
        `${s.installed} / 5 COMPONENTS INSTALLED`,
        247,
        548,
        12,
        P.gold,
      );
      text(ctx, "Your only way off this rock.", 247, 580, 14, P.muted);
      break;
    case "inventory": {
      label(
        ctx,
        `MINERALS · ${slots(s)} / ${slotCap(s)} SLOTS · ${loadLabel(s)}`,
        230,
        217,
      );
      label(ctx, "FIELD SUPPLIES", 700, 217);
      C.MINERALS.filter((m) => s.cargo[m.id]).forEach((m, i) => {
        const y = 242 + i * 26;
        image(ctx, s, `ore/${m.id}.png`, 229, y - 20, 25, 25);
        text(ctx, m.name, 263, y, 13);
        text(
          ctx,
          `×${s.cargo[m.id]}  ${(s.cargo[m.id] ?? 0) * m.weightKg} kg`,
          540,
          y,
          12,
          P.muted,
          400,
          "right",
        );
      });
      if (!slots(s)) text(ctx, "Cargo bay empty", 230, 265, 14, P.muted);
      rule(ctx, 674, 215, 1);
      C.ITEMS.forEach((item, i) => {
        text(ctx, `${i + 1}  ${item.name}`, 700, 258 + i * 48, 12);
        text(ctx, `HELD ${s.items[item.id]}`, 700, 275 + i * 48, 10, P.muted);
      });
      rule(ctx, 230, 578, 407);
      text(
        ctx,
        `SATCHEL  R:${s.satchel.resonite}  C:${s.satchel.cryenite}`,
        230,
        604,
        12,
        P.cyan,
      );
      if (s.satchel.coreSample)
        text(
          ctx,
          `CORE: ${Math.ceil(s.coreTimer ?? 0)}s`,
          700,
          597,
          17,
          P.red,
          700,
        );
      text(
        ctx,
        `Lift ${loadKg(s)} / ${jetpack(s).liftLimitKg} kg`,
        230,
        557,
        13,
        loadKg(s) >= jetpack(s).liftLimitKg ? P.red : P.muted,
      );
      break;
    }
  }
  for (const c of controls(s).filter((c) => c.rect.y >= 56))
    if (c.action !== "dismiss-notice") drawButton(ctx, s, c);
  text(ctx, "↑ ↓ SELECT   ENTER CONFIRM   ESC CLOSE", 218, 625, 10, P.muted);
}
function menuBackdrop(ctx: Context, s: ReadState): void {
  image(ctx, s, "surface/sky.png", 0, 0, C.STAGE_W, C.STAGE_H);
  // A specimen-like cross section made entirely of the produced terrain art.
  ctx.save();
  ctx.beginPath();
  ctx.rect(668, 110, 612, 610);
  ctx.clip();
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 9; col++) {
      const x = 668 + col * 76,
        y = 230 + row * 76,
        band = C.BANDS[Math.min(3, Math.floor(row / 2.5))]!;
      image(ctx, s, `tiles/${band}-${(col + row * 2) % 3}.png`, x, y, 76, 76);
      const carved =
        (col === 4 && row < 5) ||
        (row === 4 && col >= 2 && col <= 4) ||
        (row === 7 && col >= 4 && col <= 6) ||
        (col === 6 && row >= 4);
      if (carved) {
        const open = (c: number, r: number) =>
          (c === 4 && r < 5 && r >= 0) ||
          (r === 4 && c >= 2 && c <= 4) ||
          (r === 7 && c >= 4 && c <= 6) ||
          (c === 6 && r >= 4);
        const left = open(col - 1, row),
          right = open(col + 1, row),
          up = open(col, row - 1),
          down = open(col, row + 1);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(
          x + (left ? 0 : 5),
          y + (up ? 0 : 5),
          76 - (left ? 0 : 5) - (right ? 0 : 5),
          76 - (up ? 0 : 5) - (down ? 0 : 5),
          [
            left || up ? 0 : 12,
            right || up ? 0 : 12,
            right || down ? 0 : 12,
            left || down ? 0 : 12,
          ],
        );
        ctx.clip();
        image(ctx, s, "tiles/tunnel.png", x, y, 76, 76);
        ctx.restore();
      } else if ((col * 7 + row * 3) % 9 === 2)
        image(ctx, s, `ore/${C.ORE_IDS[Math.min(9, row)]}.png`, x, y, 76, 76);
      if (row === 6 && col === 2)
        image(ctx, s, "materials/resonite.png", x, y, 76, 76);
    }
  for (const [id, x] of [
    ["fuel-depot", 714],
    ["upgrade-shop", 908],
  ] as const)
    image(ctx, s, `surface/${id}.png`, x, 110, 210, 126);
  sprite(ctx, s, 668 + 4 * 76 + 10, 230 + 2 * 76, 1.1, "drill-down");
  particles(
    ctx,
    s,
    "drill-debris",
    668 + 4.5 * 76,
    230 + 3 * 76,
    s.simTime % 0.45,
    14,
  );
  ctx.restore();
  const fade = ctx.createLinearGradient(440, 0, 870, 0);
  fade.addColorStop(0, "#101e29");
  fade.addColorStop(0.6, "#101e29dd");
  fade.addColorStop(1, "#101e2900");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 880, 720);
  box(ctx, 0, 0, 650, 720, "#101e2922");
  label(ctx, "07 / EXOPLANETARY SALVAGE DIVISION", 96, 73, P.gold);
  rule(ctx, 96, 90, 420);
  text(ctx, "A LONG WAY DOWN.", 1250, 676, 11, P.gold, 400, "right");
  text(ctx, "A HARD WAY HOME.", 1250, 696, 11, P.muted, 400, "right");
  for (let i = 0; i < 4; i++) {
    box(
      ctx,
      1244,
      257 + i * 76,
      3,
      38,
      [P.gold, "#b3c1b3", "#8388a5", P.red][i]!,
    );
  }
}
function menus(ctx: Context, s: ReadState): void {
  if (
    s.screen === "paused" ||
    s.screen === "victory" ||
    s.screen === "game-over"
  ) {
    world(ctx, s);
    hud(ctx, s);
    box(ctx, 0, C.HUD_H, C.STAGE_W, C.VIEW_H, "#0b1923e8");
    label(ctx, "EXPEDITION / " + s.mode.toUpperCase(), 96, 134, P.gold);
  } else menuBackdrop(ctx, s);
  if (s.screen === "title") {
    text(ctx, C.TITLE_TEXT, 88, 238, 92, P.text, 900);
    box(ctx, 96, 262, 46, 4, P.gold);
    text(ctx, "DEPTH IS CHEAP. HEIGHT IS EXPENSIVE.", 96, 303, 17, P.gold, 700);
    text(ctx, "Dig a fortune. Build your escape.", 96, 336, 15, P.muted);
    label(ctx, "A SUBTERRANEAN DIG-AND-BUILD EXPEDITION", 96, 639);
    text(ctx, "W A S D / ARROWS  ·  ENTER TO SELECT", 96, 677, 11, P.muted);
  } else if (s.screen === "mode-select") {
    text(ctx, "CHOOSE YOUR", 94, 215, 48, P.text, 700);
    text(ctx, "CONSEQUENCE.", 94, 269, 48, P.gold, 700);
    text(ctx, "One prospector. One way off the planet.", 96, 308, 13, P.muted);
    frame(ctx, { x: 719, y: 334, w: 444, h: 205 });
    text(
      ctx,
      s.menuIndex === 1 ? "HARDCORE" : "STANDARD",
      745,
      374,
      24,
      s.menuIndex === 1 ? P.red : P.cyan,
      700,
    );
    const lines =
      s.menuIndex === 1
        ? [
            "Death deletes your save and ends",
            "the expedition. Every climb counts.",
          ]
        : [
            "Death lets you restore your expedition",
            "from the last Save Pad visit.",
          ];
    lines.forEach((v, i) => text(ctx, v, 745, 416 + i * 25, 14));
    label(ctx, "THE MINE HAS NO ENEMIES. IT DOES NOT NEED THEM.", 745, 508);
  } else if (s.screen === "size-select") {
    text(ctx, "HOW FAR", 94, 211, 52, P.text, 700);
    text(ctx, "WILL YOU GO?", 94, 269, 52, P.gold, 700);
    frame(ctx, { x: 719, y: 334, w: 444, h: 205 });
    const size = C.WORLD_SIZES[Math.min(s.menuIndex, 2)]!;
    text(
      ctx,
      `${Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size] * C.METERS_PER_ROW).toLocaleString()} m`,
      745,
      399,
      58,
      P.gold,
      700,
    );
    label(ctx, "TO THE PLANET’S CORE", 748, 434);
    text(ctx, "Four strata. Richer ore. A longer climb.", 745, 486, 13, P.text);
  } else if (s.screen === "how-to-play") {
    box(ctx, 0, 98, C.STAGE_W, 622, "#101e29f5");
    text(ctx, "THE CLIMB IS THE GAMBLE.", 92, 173, 44, P.gold, 700);
    const columns = [
      [
        [
          "01 / DIG, SELL, UPGRADE",
          "A / D or ← / → walk and drill sideways.",
          "S / ↓ drills down. Never up. W / ↑ / Space",
          "fires the jetpack through your carved tunnels.",
        ],
        [
          "02 / BRING IT HOME",
          "Ore fills cargo slots and adds weight. Heavy",
          "hauls climb slowly and burn more fuel. I opens",
          "the bay; drop ore to escape an overload.",
        ],
        [
          "03 / KEEP THE SUIT ALIVE",
          "Fuel powers drilling, thrust and life support.",
          "Gas breathes before it explodes. Lava burns.",
          "Brake with thrust before a hard landing.",
        ],
      ],
      [
        [
          "04 / BUILD YOUR ESCAPE",
          "E opens camp services. Sell at the market,",
          "buy fuel, repair, upgrade seven systems,",
          "then fabricate five rocket components.",
        ],
        [
          "05 / FIND THE IMPOSSIBLE",
          "A scanner points to Resonite and Cryenite.",
          "The Core yields an unstable Sample. You have",
          "90 seconds to bring it to the launch pad.",
        ],
        [
          "06 / LEAVE A WAY BACK",
          "E at the Save Pad writes your one save slot.",
          "Standard restores the last save after death.",
          "Hardcore deletes it. Esc pauses. M mutes.",
        ],
      ],
    ];
    columns.forEach((entries, col) =>
      entries.forEach((entry, i) => {
        const x = 94 + col * 603,
          y = 225 + i * 125;
        label(ctx, entry[0]!, x, y, P.cyan);
        entry
          .slice(1)
          .forEach((l, j) => text(ctx, l, x, y + 25 + j * 21, 13, P.text));
      }),
    );
    text(
      ctx,
      "1–6 USE FIELD SUPPLIES     J JETTISONS A CORE SAMPLE",
      695,
      648,
      11,
      P.muted,
    );
  } else {
    const title =
      s.screen === "paused"
        ? "TAKE A BREATHER."
        : s.screen === "victory"
          ? "YOU MADE IT OUT."
          : "THE MINE KEEPS IT.";
    text(
      ctx,
      title,
      92,
      225,
      s.screen === "game-over" ? 56 : 58,
      s.screen === "game-over" ? P.red : P.gold,
      700,
    );
    text(
      ctx,
      s.screen === "paused"
        ? "Everything below can wait. For now."
        : s.screen === "victory"
          ? "A world of stone behind you. A sky of possibility ahead."
          : `EXPEDITION LOST / ${s.summary?.deathCause?.replace(/-/g, " ").toUpperCase() ?? "HULL DESTROYED"}`,
      96,
      273,
      14,
      P.muted,
    );
    if (s.summary) {
      frame(ctx, { x: 710, y: 330, w: 456, h: 260 });
      const sum = s.summary;
      [
        [
          "DEEPEST DESCENT",
          `${Math.floor(sum.deepestDepthMeters).toLocaleString()} m`,
        ],
        ["CREDITS EARNED", `${sum.creditsEarned.toLocaleString()} CR`],
        [
          "TIME BELOW",
          `${Math.floor(sum.elapsedSeconds / 60)}m ${Math.floor(sum.elapsedSeconds % 60)}s`,
        ],
        ["ROCKET ASSEMBLY", `${sum.componentsInstalled} / 5`],
      ].forEach(([a, b], i) => {
        label(ctx, a!, 738, 370 + i * 56);
        text(ctx, b!, 1135, 376 + i * 56, 23, P.text, 700, "right");
        if (i < 3) rule(ctx, 738, 392 + i * 56, 398);
      });
    }
  }
  menuItems(s).forEach((item, i) => {
    const r = menuItemRect(s, i)!,
      selected = i === s.menuIndex;
    box(
      ctx,
      r.x,
      r.y,
      r.w,
      r.h,
      selected ? "#d6bd90" : "#132731dd",
      selected ? P.gold : P.line,
    );
    if (selected) box(ctx, r.x, r.y, 4, r.h, "#fcdfac");
    text(
      ctx,
      String(i + 1).padStart(2, "0"),
      r.x + 19,
      r.y + 32,
      12,
      selected ? "#58605a" : P.muted,
    );
    text(ctx, item, r.x + 60, r.y + 33, 17, selected ? "#162b35" : P.text, 700);
    if (selected)
      text(ctx, "↗", r.x + r.w - 24, r.y + 33, 22, "#253f46", 700, "right");
    if (s.screen === "size-select" && i < 3)
      text(
        ctx,
        `${Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[C.WORLD_SIZES[i]!] * C.METERS_PER_ROW)} m`,
        r.x + r.w - 53,
        r.y + 32,
        12,
        selected ? "#3d5558" : P.muted,
        400,
        "right",
      );
  });
}
export function render(s: ReadState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (s.screen === "in-mine") {
    world(ctx, s);
    hud(ctx, s);
    panel(ctx, s);
  } else menus(ctx, s);
}
