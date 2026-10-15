/* global document */
import { chromium } from "playwright";
import process from "node:process";
import console from "node:console";
import assert from "node:assert/strict";
import { URL } from "node:url";

const url = process.argv[2] ?? "http://127.0.0.1:4174/dist/";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(url);
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas");
    const pixels = c
      .getContext("2d")
      .getImageData(0, 0, c.width, c.height).data;
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 400) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 160) visible++;
    }
    return visible > 25;
  });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  }
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(1800);
  await page.keyboard.up("KeyS");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1000);
  await page.keyboard.up("KeyW");
  await page.keyboard.press("KeyI");
  await page.waitForTimeout(100);
  await page.screenshot({ path: "/tmp/opencode/production-play.png" });
  await page.setViewportSize({ width: 750, height: 900 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: "/tmp/opencode/production-fit.png" });
  const base = new URL(url);
  assert(
    requests.every((request) =>
      new URL(request).pathname.startsWith(base.pathname),
    ),
    "A request escaped the static base path",
  );
  assert.deepEqual(failures, []);
  console.log(
    `Production browser check passed: ${requests.length} requests, subdirectory hosting, keyboard play, overlays, resize, and 2× pixel density.`,
  );
} finally {
  await browser.close();
}
