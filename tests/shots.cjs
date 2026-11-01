// Snímky pro design-eye: sólo partie v Chromiu 1440×900, WebKit iPhone 13 na výšku a na šířku.
//   node tests/shots.cjs [URL] [složka]     (výchozí http://127.0.0.1:8802/, tests/shots/de-<čas>)
// Pořizuje: úvodní karta kola, míření, let střely, sekvence výbuchu (8 snímků), 2. kolo s obchodem, konec zápasu,
// a nebe každého modifikátoru (sólo se načítá znovu, dokud se nevylosuje).
const path = require("path"), fs = require("fs");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
const args = process.argv.slice(2);
const BASE = (args.find(a => /^https?:/.test(a)) || "http://127.0.0.1:8802/").replace(/#.*$/, "");
const OUT = args.find(a => !/^https?:/.test(a)) || path.join(__dirname, "shots", "de-" + new Date().toISOString().replace(/[:.]/g, "").slice(0, 15));
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iph = devices["iPhone 13"];
const CFG = [
  { tag: "d", bt: chromium, opts: { viewport: { width: 1440, height: 900 } } },
  { tag: "m", bt: webkit, opts: { ...iph } },
  { tag: "l", bt: webkit, opts: { ...iph, viewport: { width: 844, height: 390 } } }
];
const MODS = ["vichr", "mesic", "tezko", "zrcadlo", "bohaci", "kratery"];

async function settle(p) { for (let i = 0; i < 200; i++) { const s = await p.evaluate(() => ({ a: window.__tanc.animating(), b: window.__tanc.busy() })); if (!s.a && !s.b) return; await sleep(80); } }
async function myTurn(p) { for (let i = 0; i < 300; i++) { const s = await p.evaluate(() => { const st = window.__tanc.state(); return { cur: st && st.cur, a: window.__tanc.animating(), b: window.__tanc.busy(), v: window.__tanc.view() }; }); if (s.v === "end") return false; if (s.cur === 0 && !s.a && !s.b) return true; await sleep(100); } return false; }
async function closeOverlays(p) { await p.evaluate(() => { const r = document.getElementById("roundIntro"); if (r) r.hidden = true; const h = document.getElementById("hintOk"); if (h && h.offsetParent) h.click(); const s = document.getElementById("shop"); if (s && !s.hidden) document.getElementById("shopDone").click(); }); await sleep(250); }

async function run(c) {
  const b = await c.bt.launch(), ctx = await b.newContext(c.opts), p = await ctx.newPage();
  const snap = async n => { await p.screenshot({ path: path.join(OUT, `${c.tag}-${n}.png`) }); };
  await p.goto(BASE + "#solo"); await p.waitForSelector("body[data-view=play]");
  await p.evaluate(() => document.fonts.ready);
  console.log(c.tag, "Fredoka načtená:", await p.evaluate(() => document.fonts.check('700 20px "Fredoka"') && [...document.fonts].some(f => f.family.replace(/"/g, "") === "Fredoka" && f.status === "loaded")));
  await sleep(700); await snap("01-kolo");
  await closeOverlays(p); await myTurn(p); await closeOverlays(p); await sleep(400); await snap("02-mireni");
  // let a výbuch: nejlepší střela enginu, snímky během animace
  const st = await p.evaluate(() => window.__tanc.state());
  p.evaluate(() => window.__tanc.play(TankEngine.suggestShot(window.__tanc.state())));
  await sleep(700); await snap("03-let");
  for (let i = 0; i < 8; i++) { await sleep(140); await snap("04-vybuch-" + i); }
  await settle(p); await sleep(500); await snap("05-po");
  // dohrát zápas, cestou snímek 2. kola (obchod)
  let shop2 = false;
  for (let g = 0; g < 200; g++) {
    if (!(await myTurn(p))) break;
    const s = await p.evaluate(() => window.__tanc.state());
    if (!shop2 && s.round >= 2) { await sleep(900); if (await p.locator("#shop:not([hidden])").count()) { await snap("06-obchod-kolo2"); shop2 = true; } }
    await closeOverlays(p);
    await p.evaluate(() => window.__tanc.play(TankEngine.suggestShot(window.__tanc.state())));
    await sleep(120); await p.evaluate(() => window.__tanc.skip());
  }
  await p.waitForSelector("body[data-view=end]", { timeout: 30000 }).catch(() => {});
  await sleep(900); await snap("07-konec");
  // nebe modifikátorů
  if (c.tag !== "l") {
    const seen = new Set();
    for (let k = 0; k < 40 && seen.size < MODS.length; k++) {
      await p.goto("about:blank"); await p.goto(BASE + "#solo"); await p.waitForSelector("body[data-view=play]");
      const m = await p.evaluate(() => window.__tanc.state().mod);
      if (MODS.includes(m) && !seen.has(m)) { seen.add(m); await sleep(1600); await closeOverlays(p); await sleep(900); await snap("08-mod-" + m); }
    }
  }
  await b.close();
}
(async () => { for (const c of CFG) { await run(c); console.log("hotovo", c.tag); } console.log("OUT", OUT); })().catch(e => { console.error(e); process.exit(1); });
