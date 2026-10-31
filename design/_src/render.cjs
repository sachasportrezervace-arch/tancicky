// Render SVG mockups to PNG via global Playwright Chromium.
// usage: node render.cjs <dir> A-mobile A-desktop ...
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(process.env.APPDATA, "npm/node_modules/playwright"));
const dir = process.argv[2];
const files = process.argv.slice(3);
(async () => {
  const b = await chromium.launch();
  for (const f of files) {
    const file = path.join(dir, f + ".svg");
    const svg = fs.readFileSync(file, "utf8");
    const m = svg.match(/width="(\d+)" height="(\d+)"/);
    const w = +m[1], h = +m[2];
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: f.includes("mobile") ? 2 : 1 });
    await p.goto("file:///" + file.replace(/\\/g, "/"));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(dir, f + ".png") });
    await p.close();
  }
  await b.close();
})();
