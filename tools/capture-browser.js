/* global document, EventTarget, Event */
// Development-only capture harness. No debug handle is installed on the page.
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "../src/game.ts";
import * as C from "../src/constants.ts";

export async function capture() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100vw;height:100vh;display:block";
  document.body.replaceChildren(canvas);
  const events = new EventTarget();
  const e = createEngine({
    canvas,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 30),
    surface: {
      cssWidth: () => 1280,
      cssHeight: () => 720,
      dpr: () => 1,
      events: () => events,
    },
  });
  await e.initialize();
  const d = e.debug;
  const pose = (f) => e.apply(f);
  const key = (code, down) => {
    const event = new Event(down ? "keydown" : "keyup");
    Object.assign(event, { code, repeat: false });
    events.dispatchEvent(event);
  };
  pose((s) => d.setScreen(s, "in-mine"));
  pose((s) => d.generateMine(s));
  await e.advance(1);
  const surface = canvas.toDataURL("image/png");
  pose((s) => d.setTier(s, "fuel", 3));
  pose((s) => d.setFuel(s, 260));
  pose((s) => d.setTier(s, "hull", 3));
  pose((s) => d.setHull(s, 220));
  pose((s) => d.setTier(s, "drill", 3));
  pose((s) => d.setTier(s, "scanner", 3));
  for (let row = 156; row <= 166; row++)
    pose((s) => d.setTile(s, 16, row, "tunnel"));
  for (let col = 13; col <= 19; col++)
    pose((s) => d.setTile(s, col, 166, "tunnel"));
  for (let row = 167; row <= 180; row++) {
    pose((s) => d.setTile(s, 16, row, "rock"));
    if (row % 2 === 1) pose((s) => d.setOreTile(s, 16, row, "argenite"));
  }
  pose((s) => d.setMaterialTile(s, 19, 169, "resonite"));
  pose((s) => d.setOreTile(s, 14, 168, "verdite"));
  pose((s) => d.setOreTile(s, 18, 167, "cobaltine"));
  pose((s) => d.setOreTile(s, 19, 167, "cobaltine"));
  pose((s) =>
    d.setMinerPosition(s, 16 * C.TILE + 12, 167 * C.TILE - C.MINER_H),
  );
  pose((s) => d.setCredits(s, 1840));
  pose((s) => d.setCargo(s, "cuprite", 5));
  pose((s) => d.setCargo(s, "argenite", 4));
  pose((s) => d.setElapsed(s, 247));
  await e.advance(1);
  e.startRecording();
  key("KeyS", true);
  await e.advance(27);
  const mine = canvas.toDataURL("image/png");
  await e.advance(63);
  key("KeyS", false);
  key("KeyW", true);
  await e.advance(90);
  key("KeyW", false);
  await e.advance(10);
  const replay = e.stopRecording();
  pose((s) => d.setMinerPosition(s, 16 * C.TILE, 8));
  pose((s) => d.setMinerVelocity(s, 0, 0));
  pose((s) => d.setPanel(s, "launch-pad"));
  pose((s) => d.setRocketInstalled(s, 4));
  pose((s) => d.setCredits(s, 6800));
  await e.advance(1);
  const rocket = canvas.toDataURL("image/png");
  e.destroy();
  return { surface, mine, rocket, replay };
}
