/* global console */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (error) => {
  throw error;
});
await page.goto("http://localhost:5173");
await page.waitForTimeout(1500);
const result = await page.evaluate(async () => {
  const { capture } = await import("/tools/capture-browser.js");
  return capture();
});
for (const name of ["surface", "mine", "rocket"])
  await writeFile(
    `showcase/${name}.png`,
    Buffer.from(result[name].split(",")[1], "base64"),
  );
const recording = gzipSync(JSON.stringify(result.replay));
if (recording.byteLength >= 25 * 1024 * 1024)
  throw new Error("Replay exceeds showcase limit");
await writeFile("showcase/descent.json.gz", recording);
console.log(
  `Captured ${result.replay.frames.length} live frames; compressed replay ${recording.byteLength} bytes.`,
);
await browser.close();
