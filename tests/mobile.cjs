// Kamera, celá obrazovka a rozložení: Chromium desktop + WebKit iPhone 13, na výšku i na šířku (lokální hra, bez sítě).
//   node tests/mobile.cjs [URL]      (výchozí http://127.0.0.1:8794/)    env: PW, SHOTS, HEADED=1
// Ověřuje: #fullscreenBtn (desktop: klik → document.fullscreenElement; iPhone: skryté tlačítko NEBO nápověda
// „Přidat na plochu“), window.__tanc.camera() → {x,y,zoom}, kolečko/pinch změní zoom, tažení jedním prstem/myší po prázdné
// ploše změní camera().x, #zoomFit vrátí zoom na „celé bojiště“, žádné vodorovné scrollování, žádné chyby konzole.
const path = require("path"), fs = require("fs");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
const BASE = ((process.argv.slice(2).find(a => /^https?:/.test(a))) || "http://127.0.0.1:8794/").replace(/#.*$/, "");
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0, tag = "";
const results = [];
function check(name, ok, extra = "") {
  if (ok) pass++; else fail++;
  const line = `${ok ? "PASS" : "FAIL"}  ${tag}${name}${extra ? "  (" + extra + ")" : ""}`;
  results.push(line); console.log(line);
}

const CONFIGS = [
  { id: "chromium-desktop-landscape", lib: chromium, engine: "chromium", touch: false, ctx: { viewport: { width: 1280, height: 800 } } },
  { id: "chromium-desktop-portrait", lib: chromium, engine: "chromium", touch: false, ctx: { viewport: { width: 800, height: 1280 } } },
  { id: "webkit-iphone13-portrait", lib: webkit, engine: "webkit", touch: true, ctx: { ...devices["iPhone 13"] } },
  { id: "webkit-iphone13-landscape", lib: webkit, engine: "webkit", touch: true, ctx: { ...devices["iPhone 13 landscape"] } },
];

const cam = p => p.evaluate(() => { try { const c = window.__tanc.camera(); return c && { x: +c.x, y: +c.y, zoom: +c.zoom }; } catch (e) { return null; } });
// kamera se plynule dojíždí k cíli (tz/tx): počkej, až se usadí
async function settleCam(p, timeout = 4000) {
  const t0 = Date.now(); let c = await cam(p);
  while (Date.now() - t0 < timeout) {
    c = await p.evaluate(() => window.__tanc.camera());
    if (Math.abs(c.zoom - c.tz) < 0.004 && Math.abs(c.x - c.tx) < 0.8 && Math.abs(c.y - c.ty) < 0.8) break;
    await sleep(150);
  }
  return c && { x: c.x, y: c.y, zoom: c.zoom };
}
const tap = (p, touch, sel) => touch ? p.locator(sel).first().tap() : p.locator(sel).first().click();
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ---- vstupy ----
async function wheelZoom(p, x, y, dy) {
  await p.mouse.move(x, y);
  await p.mouse.wheel(0, dy);
  await sleep(350);
}
async function mouseDrag(p, x0, y0, x1, y1) {
  await p.mouse.move(x0, y0); await p.mouse.down();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(x0 + (x1 - x0) * i / 12, y0 + (y1 - y0) * i / 12); await sleep(16); }
  await p.mouse.up(); await sleep(250);
}
// dotyk: pts = [[x,y],...] na začátku, `steps` = pole snímků (každý pole bodů stejné délky)
async function touchGesture(p, engine, frames) {
  if (engine === "chromium") {
    const cdp = await p.context().newCDPSession(p);
    const tp = f => f.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 2, radiusY: 2, force: 1 }));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(frames[0]) });
    for (const f of frames.slice(1)) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(f) }); await sleep(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach().catch(() => {});
    await sleep(300);
    return "cdp";
  }
  const kind = await p.evaluate(async frames => {
    const cv = document.getElementById("cv");
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
    let kind = "pointer";
    const touchEv = (type, pts, changed) => {
      try {
        const mk = ([x, y], i) => new Touch({ identifier: 20 + i, target: cv, clientX: x, clientY: y, pageX: x + scrollX, pageY: y + scrollY, screenX: x, screenY: y, radiusX: 2, radiusY: 2, force: 1 });
        const all = pts.map(mk), ch = changed.map(i => all[i]);
        return new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: type === "touchend" ? [] : all, targetTouches: type === "touchend" ? [] : all, changedTouches: ch });
      } catch (e) { return null; }
    };
    const T = (type, pts, changed) => { const ev = touchEv(type, pts, changed); if (ev) { kind = "pointer+touch"; cv.dispatchEvent(ev); } };
    const P = (type, i, [x, y], down) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 20 + i, pointerType: "touch", isPrimary: i === 0, clientX: x, clientY: y, buttons: down ? 1 : 0, button: type === "pointermove" ? -1 : 0, width: 2, height: 2, pressure: down ? 0.5 : 0 }));
    const first = frames[0], last = frames[frames.length - 1];
    first.forEach((pt, i) => { P("pointerdown", i, pt, true); });
    T("touchstart", first, first.map((_, i) => i));
    for (const f of frames.slice(1)) {
      f.forEach((pt, i) => P("pointermove", i, pt, true)); T("touchmove", f, f.map((_, i) => i));
      await new Promise(r => setTimeout(r, 16));
    }
    last.forEach((pt, i) => P("pointerup", i, pt, false)); T("touchend", last, last.map((_, i) => i));
    return kind;
  }, frames);
  await sleep(300);
  return "synthetic " + kind;
}
const lerp = (a, b, t) => a + (b - a) * t;
const dragFrames = (x0, y0, x1, y1, n = 12) => Array.from({ length: n + 1 }, (_, i) => [[lerp(x0, x1, i / n), lerp(y0, y1, i / n)]]);
const pinchFrames = (cx, cy, d0, d1, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const d = lerp(d0, d1, i / n) / 2; return [[cx - d, cy], [cx + d, cy]]; });

async function runConfig(cfg) {
  tag = `[${cfg.id}] `;
  console.log(`\n=== ${cfg.id} · ${BASE} ===`);
  const browser = await cfg.lib.launch({ headless: !process.env.HEADED });
  const errs = [];
  try {
    const ctx = await browser.newContext(cfg.ctx);
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push("pageerror " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/favicon|fonts\.g(oogleapis|static)/i.test(((m.location() || {}).url || "") + m.text())) errs.push("console.error " + m.text().slice(0, 160)); });
    p.on("dialog", d => d.accept().catch(() => {}));
    const shot = name => p.screenshot({ path: path.join(SHOTS, `mobile-${cfg.id}-${name}.png`) }).catch(() => {});

    await p.goto(BASE, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("body[data-view=setup]", { timeout: 20000 });
    await p.fill("#nameMe", "Mark"); await p.fill("#nameOpp", "Radka");
    await shot("1-setup");
    check("setup: bez vodorovného scrollu", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await p.evaluate(() => `${document.documentElement.scrollWidth}>${window.innerWidth}`));
    await (cfg.touch ? p.locator("#localBtn").tap() : p.locator("#localBtn").click());
    await p.waitForSelector("body[data-view=play]", { timeout: 20000 });
    if (await p.locator("#shop:not([hidden])").count()) { await (cfg.touch ? p.locator("#shopDone").tap() : p.locator("#shopDone").click()); await sleep(300); }
    await sleep(800);
    await shot("2-hra");

    // rozložení
    const lay = await p.evaluate(() => {
      const r = document.getElementById("cv").getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, ih: window.innerHeight, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    check("hra: canvas viditelný a vejde se na šířku, bez vodorovného scrollu", lay.w > 100 && lay.h > 60 && lay.x >= -1 && lay.x + lay.w <= lay.iw + 1 && lay.sw <= lay.iw + 1, JSON.stringify(lay));
    const fb = await p.locator("#fireBtn").first().boundingBox();
    check("hra: #fireBtn je vidět bez scrollování (v zorném poli)", !!fb && fb.x >= -1 && fb.y >= -1 && fb.x + fb.width <= lay.iw + 1 && fb.y + fb.height <= lay.ih + 1, JSON.stringify(fb));

    // celá obrazovka
    const fsBtn = p.locator("#fullscreenBtn");
    const fsExists = await fsBtn.count() > 0, fsVisible = fsExists && await fsBtn.first().isVisible();
    if (!cfg.touch) {
      check("#fullscreenBtn existuje a je vidět na desktopu", fsVisible);
      if (fsVisible) {
        await fsBtn.first().click();
        const on = await p.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 }).then(() => true, () => false);
        check("#fullscreenBtn: klik nastaví document.fullscreenElement", on);
        await shot("3-fullscreen");
        await p.evaluate(() => document.fullscreenElement && document.exitFullscreen().catch(() => {})); await sleep(400);
      }
    } else {
      const hint = await p.evaluate(() => /Přidat na plochu/i.test(document.body.innerText) || /Přidat na plochu/i.test(document.body.textContent));
      check("iPhone: skryté #fullscreenBtn nebo nápověda „Přidat na plochu“ v DOM", (fsExists && !fsVisible) || fsVisible || hint, `existuje=${fsExists} vidět=${fsVisible} nápověda=${hint}`);
    }

    // kamera
    const cInit = await cam(p);
    let c0 = cInit;
    check("window.__tanc.camera() vrací {x,y,zoom}", !!c0 && [c0.x, c0.y, c0.zoom].every(Number.isFinite) && c0.zoom > 0, JSON.stringify(c0));
    if (!c0) throw new Error("camera() chybí – kamerové testy nejdou");
    const hasFit = await p.locator("#zoomFit").count() > 0;
    check("#zoomFit existuje", hasFit);
    // #zoomFit je přepínač: je-li přiblíženo (zoom > 1.04), ukáže celé bojiště (zoom 1); jinak přiblíží na tank.
    // Výchozí kamera na mobilu smí být přiblížená na akci.
    if (hasFit && cInit.zoom > 1.04) {
      await tap(p, cfg.touch, "#zoomFit"); c0 = await settleCam(p);
      check("#zoomFit z přiblíženého pohledu ukáže celé bojiště (zoom ≈ 1, menší než předtím)", c0.zoom <= 1.1 && c0.zoom < cInit.zoom, `výchozí ${cInit.zoom.toFixed(3)} → ${c0.zoom.toFixed(3)}`);
    } else {
      check("výchozí pohled = celé bojiště (zoom ≈ 1)", cInit.zoom <= 1.1, cInit.zoom.toFixed(3));
    }
    const box = await p.locator("canvas#cv").boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

    // zoom
    let how;
    if (!cfg.touch) {
      await wheelZoom(p, cx, cy, -400); how = "kolečko";
      let c = await cam(p);
      if (c.zoom <= c0.zoom * 1.02) { await p.keyboard.down("Control"); await wheelZoom(p, cx, cy, -400); await p.keyboard.up("Control"); how = "Ctrl+kolečko"; }
    } else {
      how = await touchGesture(p, cfg.engine, pinchFrames(cx, cy, box.width * 0.12, box.width * 0.45));
      how = "pinch (" + how + ")";
    }
    const c1 = await cam(p);
    check(`zoom: ${how} zvětší camera().zoom`, c1.zoom > c0.zoom * 1.05, `${c0.zoom.toFixed(3)} → ${c1.zoom.toFixed(3)}`);
    await shot("4-zoom");

    // posun jedním prstem / myší po prázdné ploše (nebe nahoře, daleko od tanků)
    const ay = box.y + box.height * 0.12, ax0 = box.x + box.width * 0.70, ax1 = box.x + box.width * 0.30;
    let h0 = await p.evaluate(() => window.__tanc.hash());
    if (cfg.touch) await touchGesture(p, cfg.engine, dragFrames(ax0, ay, ax1, ay)); else await mouseDrag(p, ax0, ay, ax1, ay);
    const c2 = await cam(p);
    check("posun: tažení po prázdné ploše změní camera().x", Math.abs(c2.x - c1.x) > 0.5, `x ${c1.x.toFixed(1)} → ${c2.x.toFixed(1)}`);
    check("posun: tažení nestřílí a nemění stav hry (hash beze změny)", (await p.evaluate(() => window.__tanc.hash())) === h0 && (await p.evaluate(() => window.__tanc.inputs().length)) === 0);
    // opačným směrem se vrátí aspoň část
    if (cfg.touch) await touchGesture(p, cfg.engine, dragFrames(ax1, ay, ax0, ay)); else await mouseDrag(p, ax1, ay, ax0, ay);
    const c3 = await cam(p);
    check("posun: opačné tažení posune kameru zpět", Math.abs(c3.x - c2.x) > 0.5, `x ${c2.x.toFixed(1)} → ${c3.x.toFixed(1)}`);
    await shot("5-posun");

    // #zoomFit po přiblížení a posunu: zpět na celé bojiště; druhé klepnutí přiblíží na tank
    if (hasFit) {
      await tap(p, cfg.touch, "#zoomFit"); const c4 = await settleCam(p);
      check("#zoomFit po zoomu a posunu vrací celé bojiště (zoom jako fit)", near(c4.zoom, c0.zoom, 0.03), `fit ${c0.zoom.toFixed(3)}, po zoomFit ${c4.zoom.toFixed(3)}`);
      check("#zoomFit: kamera zpět na střed bojiště (x jako fit)", near(c4.x, c0.x, 3), `x ${c0.x.toFixed(1)} → ${c4.x.toFixed(1)}`);
      await shot("6-zoomfit");
      await tap(p, cfg.touch, "#zoomFit"); const c5 = await settleCam(p);
      check("#zoomFit podruhé přiblíží na tank (zoom > fit)", c5.zoom > c4.zoom * 1.2, `${c4.zoom.toFixed(3)} → ${c5.zoom.toFixed(3)}`);
      await tap(p, cfg.touch, "#zoomFit"); await settleCam(p);
    }
    // po tom všem se pořád dá střílet
    const okShot = await p.evaluate(async () => { try { return await window.__tanc.play(window.TankEngine.suggestShot(window.__tanc.state())); } catch (e) { return "err:" + e.message; } });
    check("po zoomování lze normálně vystřelit (play)", okShot === true, String(okShot));
    check("žádné chyby konzole / pageerror", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    check("scénář proběhl bez výjimky", false, String(e && e.message || e).slice(0, 400));
    if (errs.length) check("chyby konzole při pádu", false, errs.slice(0, 3).join(" | "));
  } finally { await browser.close().catch(() => {}); }
}

(async () => {
  for (const c of CONFIGS) await runConfig(c);
  const total = pass + fail;
  console.log(`\n${pass}/${total} PASS` + (fail ? ` · ${fail} FAIL` : "") + ` · ${BASE}`);
  fs.writeFileSync(path.join(SHOTS, "mobile-vysledek.txt"), results.join("\n") + `\n${pass}/${total} PASS\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
