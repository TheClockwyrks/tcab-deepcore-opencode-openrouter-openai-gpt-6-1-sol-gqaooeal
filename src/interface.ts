import * as C from "./constants";
import {
  BUILDING_RECTS,
  cargoValue,
  jetpack,
  loadKg,
  maxFuel,
  maxHull,
  type ReadState,
  type Rect,
} from "./state";
import { usableItem, type Transaction } from "./simulation";

export function menuItems(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuItemRect(s: ReadState, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  if (s.screen === "how-to-play") return { x: 92, y: 620, w: 310, h: 48 };
  const start =
    s.screen === "title" ? 385 : s.screen === "size-select" ? 320 : 350;
  return { x: 96, y: start + index * 66, w: 420, h: 52 };
}
export interface Control {
  id: string;
  action: Transaction | "close";
  subject: string | null;
  rect: Rect;
  label: string;
  enabled: boolean;
}
const button = (
  action: Control["action"],
  subject: string | null,
  x: number,
  y: number,
  w: number,
  label: string,
  enabled = true,
): Control => ({
  id: `${action}:${subject ?? ""}`,
  action,
  subject,
  rect: { x, y, w, h: 34 },
  label,
  enabled,
});
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine" && s.screen !== "paused") return [];
  const out: Control[] = [
    button("inventory", null, 1060, 10, 78, "I · BAY"),
    button("pause", null, 1147, 10, 48, "Ⅱ"),
    button("mute", null, 1204, 10, 56, s.muted ? "OFF" : "SND"),
  ];
  if (s.screen === "paused") return out;
  if (s.notice && s.elapsedSeconds >= s.notice.at + C.NOTICE_DELAY)
    out.push(button("dismiss-notice", null, 344, 604, 592, "Dismiss"));
  if (!s.panel) return out;
  out.push(button("close", null, 1050, 120, 42, "×"));
  switch (s.panel) {
    case "fuel-depot":
      out.push(
        button(
          "buy-fuel",
          null,
          750,
          256,
          130,
          `+${C.FUEL_BUY_INCREMENT} FUEL`,
          s.miner.fuel < maxFuel(s) &&
            s.credits >=
              Math.min(C.FUEL_BUY_INCREMENT, maxFuel(s) - s.miner.fuel) *
                C.FUEL_PRICE,
        ),
        button(
          "fill-fuel",
          null,
          900,
          256,
          138,
          "FILL TANK",
          s.credits > 0 && s.miner.fuel < maxFuel(s),
        ),
        button(
          "buy-repair",
          null,
          750,
          375,
          130,
          `+${C.REPAIR_BUY_INCREMENT} HULL`,
          s.miner.hull < maxHull(s) &&
            s.credits >=
              Math.min(C.REPAIR_BUY_INCREMENT, maxHull(s) - s.miner.hull) *
                C.REPAIR_PRICE,
        ),
        button(
          "repair-full",
          null,
          900,
          375,
          138,
          "FULL REPAIR",
          s.credits > 0 && s.miner.hull < maxHull(s),
        ),
      );
      break;
    case "ore-market":
      out.push(
        button(
          "sell",
          null,
          845,
          578,
          190,
          `${C.SELL} · ${cargoValue(s)} CR`,
          cargoValue(s) > 0,
        ),
      );
      break;
    case "upgrade-shop":
      C.TRACKS.forEach((t, i) =>
        out.push(
          button(
            "buy-upgrade",
            t,
            862,
            208 + i * 53,
            174,
            s.tiers[t] >= C.MAX_TIER[t]
              ? "MAX TIER"
              : `UPGRADE · ${C.UPGRADE_PRICES[s.tiers[t] - 1]} CR`,
            s.tiers[t] < C.MAX_TIER[t] &&
              s.credits >= C.UPGRADE_PRICES[s.tiers[t] - 1]!,
          ),
        ),
      );
      break;
    case "supply-depot":
      C.ITEMS.forEach((item, i) =>
        out.push(
          button(
            "buy-item",
            item.id,
            866,
            218 + i * 60,
            170,
            `BUY · ${item.price} CR`,
            s.credits >= item.price,
          ),
        ),
      );
      break;
    case "launch-pad": {
      const next = C.ROCKET_COMPONENTS[s.installed];
      if (next)
        out.push(
          button(
            "fabricate",
            null,
            835,
            576,
            200,
            C.FABRICATE,
            s.credits >= next.credits &&
              (!next.material ||
                (next.material === "core-sample"
                  ? s.satchel.coreSample
                  : s.satchel[next.material] > 0)),
          ),
        );
      else out.push(button("launch", null, 835, 576, 200, C.LAUNCH));
      break;
    }
    case "inventory": {
      C.MINERALS.filter((m) => s.cargo[m.id]).forEach((m, i) => {
        const c = button("drop-ore", m.id, 568, 227 + i * 26, 73, "DROP");
        c.rect.h = 22;
        out.push(c);
      });
      C.ITEMS.forEach((item, i) => {
        if (s.items[item.id])
          out.push(
            button(
              "use-item",
              item.id,
              963,
              235 + i * 48,
              73,
              C.USE,
              usableItem(s, item.id),
            ),
          );
      });
      if (s.satchel.coreSample)
        out.push(button("jettison", null, 833, 568, 203, C.JETTISON));
      break;
    }
  }
  return out;
}
export function controlRect(
  s: ReadState,
  action: string,
  subject: string | null,
): Rect | null {
  return (
    controls(s).find((c) => c.action === action && c.subject === subject)
      ?.rect ?? null
  );
}
export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}
export function hit(s: ReadState, x: number, y: number): string | null {
  for (let i = 0; i < menuItems(s).length; i++) {
    const r = menuItemRect(s, i)!;
    if (contains(r, x, y)) return `menu:${i}`;
  }
  for (const c of controls(s))
    if (c.enabled && contains(c.rect, x, y)) return c.id;
  if (s.screen === "in-mine" && !s.panel)
    for (const b of BUILDING_RECTS) {
      const r = { ...b, x: b.x - s.camera.x, y: b.y - s.camera.y + C.HUD_H };
      if (
        contains(r, x, y) &&
        Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) < 8 &&
        s.miner.x + C.MINER_W / 2 >= b.x &&
        s.miner.x + C.MINER_W / 2 <= b.x + b.w
      )
        return `building:${b.id}`;
    }
  return null;
}
export function upgradeEffect(s: ReadState, t: C.TrackName): string {
  const next = Math.min(s.tiers[t], C.MAX_TIER[t] - 1);
  switch (t) {
    case "fuel":
      return `${C.FUEL_TIERS[next]} fuel capacity`;
    case "drill":
      return `Power rating ${next + 1} · faster cutting`;
    case "cargo":
      return `${C.CARGO_TIERS[next]} mineral slots`;
    case "hull":
      return `${C.HULL_TIERS[next]} hull integrity`;
    case "jetpack":
      return `${C.JETPACK_TIERS[next]!.liftLimitKg.toLocaleString()} kg lift limit`;
    case "radiator":
      return `${Math.round(C.RADIATOR_TIERS[next]! * 100)}% lava protection`;
    case "scanner":
      return `${C.SCANNER_TIERS[next]} tile material detection`;
  }
}
export function loadLabel(s: ReadState): string {
  return loadKg(s) >= jetpack(s).liftLimitKg ? C.OVERLOAD : `${loadKg(s)} KG`;
}
