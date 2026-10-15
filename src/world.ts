import * as C from "./constants";
import {
  bandAt,
  cell,
  emptyGrid,
  fraction,
  writeCell,
  type DeepcoreState,
} from "./state";

function chooseMineral(f: number): C.OreId {
  const weights = C.MINERALS.map(
    (m) => m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
  );
  let n = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    n -= weights[i]!;
    if (n <= 0) return C.MINERALS[i]!.id;
  }
  return C.ORE_IDS[0];
}
function shuffled<T>(values: T[]): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}
export function generate(s: DeepcoreState): void {
  s.grid = emptyGrid(s.coreRow);
  const byBand: { col: number; row: number }[][] = C.BANDS.map(() => []);
  for (let row = 1; row < s.coreRow; row++)
    for (let col = C.PLAYABLE_COL_MIN; col <= C.PLAYABLE_COL_MAX; col++) {
      const band = bandAt(row, s.coreRow);
      s.grid[row]![col] = cell("rock", band);
      byBand[C.BANDS.indexOf(band)]!.push({ col, row });
    }
  byBand.forEach((cells, bi) => {
    const n = cells.length;
    // Reserve a connected, diggable spine. It remains rock/ore, never a free shaft.
    const available = shuffled(
      cells.filter((p) => p.col !== C.CAVE_MOUTH_COL && p.col !== C.CORE_COL),
    );
    const mid = (bi + 0.5) / C.BANDS.length;
    const stone = bi
      ? Math.round(
          n *
            (C.STONE_DENSITY_MIN +
              ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (mid - 0.25)) /
                0.75),
        )
      : 0;
    const gas = bi
      ? Math.round(
          n *
            (C.GAS_DENSITY_MIN +
              ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (mid - 0.25)) / 0.75),
        )
      : 0;
    for (const kind of ["stone", "gas"] as const) {
      const count = kind === "stone" ? stone : gas;
      for (let i = 0; i < count; i++) {
        const p = available.pop()!;
        s.grid[p.row]![p.col] = cell(kind, bandAt(p.row, s.coreRow));
      }
    }
    if (bi >= 2) {
      const count = Math.round(
        n *
          (C.LAVA_DENSITY_MIN +
            ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (mid - 0.5)) / 0.5),
      );
      let placed = 0;
      while (placed < count) {
        const p = available.pop();
        if (!p) break;
        for (let dx = 0; dx < 3 && placed < count; dx++) {
          const col = p.col + dx,
            c = s.grid[p.row]?.[col];
          if (
            col >= C.PLAYABLE_COL_MAX ||
            col === C.CAVE_MOUTH_COL ||
            col === C.CORE_COL ||
            c?.kind !== "rock"
          )
            continue;
          s.grid[p.row]![col] = cell("lava", bandAt(p.row, s.coreRow));
          placed++;
        }
      }
    }
    const oreCells = shuffled(
      cells.filter(
        (p) => p.row >= C.ORE_MIN_ROW && s.grid[p.row]![p.col]!.kind === "rock",
      ),
    );
    for (let i = 0; i < Math.round(n * C.ORE_DENSITY); i++) {
      const p = oreCells[i];
      if (!p) break;
      const c = cell("ore", bandAt(p.row, s.coreRow));
      c.ore = chooseMineral(fraction(p.row, s.coreRow));
      s.grid[p.row]![p.col] = c;
    }
  });
  for (const material of C.MATERIALS) {
    const band = C.MATERIAL_BAND[material],
      list = byBand[C.BANDS.indexOf(band)]!;
    const p = list[Math.floor(Math.random() * list.length)]!;
    const node = cell("material", band);
    node.material = material;
    s.grid[p.row]![p.col] = node;
    // Connect the node horizontally to the protected spine, preserving resources.
    for (
      let col = Math.min(p.col, C.CAVE_MOUTH_COL);
      col <= Math.max(p.col, C.CAVE_MOUTH_COL);
      col++
    ) {
      if (["lava", "stone"].includes(s.grid[p.row]![col]!.kind))
        s.grid[p.row]![col] = cell("rock", band);
    }
  }
  const last = s.coreRow - 1;
  for (let col = C.CORE_COL; col <= C.CAVE_MOUTH_COL; col++)
    if (["lava", "stone"].includes(s.grid[last]![col]!.kind))
      s.grid[last]![col] = cell("rock", bandAt(last, s.coreRow));
  writeCell(s, C.CAVE_MOUTH_COL, 1, cell("tunnel", bandAt(1, s.coreRow)));
}
