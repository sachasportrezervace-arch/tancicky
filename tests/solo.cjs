// Trénink proti robotovi (#solo): celá partie v Chromiu desktop 1440×900 a ve WebKitu iPhone 13.
//   node tests/solo.cjs [URL]      (výchozí http://127.0.0.1:8802/)
// Ověřuje: tlačítko „Zkusit sám“ i adresu #solo, robot táhne sám s pauzou, žádný požadavek na sync (mantledb),
// „Trénink“ ve hře, na konci „Znovu“ + „Vyzvat soupeře“, série se nepočítá, „Znovu“ spustí novou partii.
const path = require("path");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
const BASE = ((process.argv.slice(2).find(a => /^https?:/.test(a))) || "http://127.0.0.1:8802/").replace(/#.*$/, "");

let pass = 0, fail = 0;
function check(name, ok, extra = "") { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(tag, bt, ctxOpts, viaButton) {
  const b = await bt.launch();
  const ctx = await b.newContext(ctxOpts), p = await ctx.newPage();
  const sync = [], errors = [];
  p.on("request", r => { if (/mantledb/i.test(r.url())) sync.push(r.method() + " " + r.url()); });
  p.on("pageerror", e => errors.push(String(e))); p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  try {
    if (viaButton) {
      await p.goto(BASE); await p.waitForSelector("#soloBtn");
      check(`[${tag}] úvod: tlačítko „Zkusit sám“ je vidět`, await p.locator("#soloBtn").isVisible());
      await (ctxOpts.hasTouch ? p.locator("#soloBtn").tap() : p.locator("#soloBtn").click());
    } else await p.goto(BASE + "#solo");
    await p.waitForSelector("body[data-view=play]", { timeout: 20000 });
    check(`[${tag}] adresa je #solo a běží trénink`, (await p.evaluate(() => location.hash)) === "#solo" && await p.evaluate(() => window.__tanc.solo()));
    check(`[${tag}] ve hře je vidět „Trénink“`, (await p.locator("#seriesTxt").innerText()).trim() === "Trénink");
    const st0 = await p.evaluate(() => window.__tanc.state());
    check(`[${tag}] mapa a modifikátor se losují (${st0.map}/${st0.mod})`, !!st0.map && !!st0.mod);

    let botMoves = 0, myMoves = 0, botPaused = true, guard = 0;
    const t0 = Date.now();
    while (guard++ < 400 && Date.now() - t0 < 240000) {
      const s = await p.evaluate(() => ({ st: window.__tanc.state(), anim: window.__tanc.animating(), busy: window.__tanc.busy(), view: window.__tanc.view(), n: window.__tanc.inputs().length }));
      if (s.view === "end" || (s.st && s.st.matchOver)) break;
      if (s.anim) { await p.evaluate(() => window.__tanc.skip()); await sleep(60); continue; }
      if (s.busy) { await sleep(60); continue; }
      if (s.st.cur === 1) { // robot: musí táhnout sám, ale ne okamžitě
        const n0 = s.n; await sleep(250);
        if ((await p.evaluate(() => window.__tanc.inputs().length)) !== n0) botPaused = false;
        const moved = await p.waitForFunction(n => window.__tanc.inputs().length > n, n0, { timeout: 15000 }).then(() => true, () => false);
        if (!moved) { check(`[${tag}] robot táhne sám`, false, "robot nezahrál do 15 s"); break; }
        botMoves++; continue;
      }
      // hráč: zavřít obchod, zahrát tah (nejlepší střela enginu)
      if (await p.locator("#shop:not([hidden])").count()) { await p.evaluate(() => document.getElementById("shopDone").click()); await sleep(150); }
      const ok = await p.evaluate(async () => window.__tanc.play(TankEngine.suggestShot(window.__tanc.state())));
      if (ok) myMoves++; else await sleep(150);
    }
    await p.waitForSelector("body[data-view=end]", { timeout: 20000 }).catch(() => {});
    check(`[${tag}] celá partie dohraná do konce`, (await p.evaluate(() => window.__tanc.view())) === "end", `tahů ${myMoves}+${botMoves}`);
    check(`[${tag}] robot táhl sám (${botMoves}×) a s pauzou`, botMoves > 0 && botPaused);
    check(`[${tag}] konec: „Znovu“ a „Vyzvat soupeře“`, (await p.locator("#rematchBtn").innerText()).trim() === "Znovu" && await p.locator("#challengeBtn").isVisible());
    check(`[${tag}] konec: série se nepočítá, nic se neodemyká`, JSON.stringify(await p.evaluate(() => window.__tanc.series())) === "[0,0]" && await p.locator("#endUnlock").isHidden());
    await p.screenshot({ path: path.join(__dirname, "shots", `solo-${tag}-end.png`) });
    await (ctxOpts.hasTouch ? p.locator("#rematchBtn").tap() : p.locator("#rematchBtn").click());
    await p.waitForSelector("body[data-view=play]", { timeout: 10000 });
    check(`[${tag}] „Znovu“ spustí novou partii (pořád trénink, série 0:0)`, await p.evaluate(() => window.__tanc.solo() && window.__tanc.inputs().length <= 1 && JSON.stringify(window.__tanc.series()) === "[0,0]"));
    check(`[${tag}] žádný síťový požadavek na sync`, sync.length === 0, sync.slice(0, 3).join(" | "));
    check(`[${tag}] žádné chyby konzole / pageerror`, errors.length === 0, errors.slice(0, 3).join(" | "));
  } catch (e) { check(`[${tag}] scénář proběhl bez výjimky`, false, String(e).slice(0, 200)); }
  await b.close();
}

(async () => {
  require("fs").mkdirSync(path.join(__dirname, "shots"), { recursive: true });
  await run("chromium-desktop", chromium, { viewport: { width: 1440, height: 900 } }, true);
  await run("webkit-iphone13", webkit, { ...devices["iPhone 13"] }, false);
  console.log(`\n${pass}/${pass + fail} PASS${fail ? " · " + fail + " FAIL" : ""} · ${BASE}`);
  process.exit(fail ? 1 : 0);
})();
