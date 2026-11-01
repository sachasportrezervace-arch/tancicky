// Akceptační E2E Tančíků: celý zápas ve 2 nezávislých prohlížečích přes ŽIVOU synchronizaci (mantledb.sh).
//   node tests/duel.cjs [URL] [--variant 1|2|both]      (výchozí http://127.0.0.1:8794/, varianta 1)
//   varianta 1: A = Chromium desktop 1280×800 (myš),  B = WebKit iPhone 13 (dotyk)
//   varianta 2: A = WebKit desktop 1280×800 (myš),    B = Chromium Pixel 7 (dotyk)
//   env: VARIANT, PW (cesta k playwright), SHOTS (složka screenshotů), HEADED=1, MAXTURNS
// Proti nasazené hře: node tests/duel.cjs https://sachasportrezervace-arch.github.io/tancicky/ --variant both
// Poznámka k dotyku: Chromium dostává skutečné dotyky přes CDP (Input.dispatchTouchEvent); WebKit nemá API pro tažení
// prstem, tam se na canvas posílají syntetické PointerEvent(pointerType "touch") + TouchEvent a pro syntetické pointery se
// na canvasu vypne setPointerCapture (jinak by hodil NotFoundError, to by byla chyba testu, ne hry).
const path = require("path"), fs = require("fs"), vm = require("vm");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);

const args = process.argv.slice(2);
let URLARG = null, VARIANT = process.env.VARIANT || "1";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--variant") VARIANT = args[++i];
  else if (args[i].startsWith("--variant=")) VARIANT = args[i].slice(10);
  else if (!URLARG && /^https?:/.test(args[i])) URLARG = args[i];
}
const BASE = (URLARG || "http://127.0.0.1:8794/").replace(/#.*$/, "");
const SHOTS = process.env.SHOTS || path.join(__dirname, "shots");
const MAXTURNS = parseInt(process.env.MAXTURNS || "260", 10);
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
let tag = "";
function check(name, ok, extra = "") {
  if (ok) pass++; else fail++;
  const line = `${ok ? "PASS" : "FAIL"}  ${tag}${name}${extra ? "  (" + extra + ")" : ""}`;
  results.push(line); console.log(line);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fnv = arr => { let h = 0x811c9dc5; for (const v of arr) { h ^= (v | 0) & 0xffff; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };

// ---------- engine ze servírovaného index.html (to, co opravdu poběží u hráčů) ----------
async function loadEngine() {
  const html = await (await fetch(BASE)).text();
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].replace(/<\\\/script/gi, "</script"));
  for (const code of blocks) {
    if (!/newMatch/.test(code) || !/replay/.test(code)) continue;
    const ctx = { console }; ctx.window = ctx; ctx.module = { exports: {} };
    vm.createContext(ctx);
    try { vm.runInContext(code, ctx, { filename: "index.html<engine>" }); } catch { continue; }
    const E = ctx.TankEngine || ctx.window.TankEngine || (ctx.module.exports && ctx.module.exports.replay ? ctx.module.exports : null);
    if (E && typeof E.replay === "function") return { E, from: "index.html" };
  }
  const E = require(path.join(__dirname, "..", "src", "engine.js"));
  return { E, from: "src/engine.js (v index.html engine nenalezen)" };
}

// ---------- dotyk a myš na canvasu ----------
async function canvasBox(p) {
  const cv = p.locator("canvas#cv");
  await cv.scrollIntoViewIfNeeded();
  return cv.boundingBox();
}
// vektor tažení: od tanku `me` směrem k soupeři a nahoru; v pixelech stránky
async function dragVector(p) {
  const box = await canvasBox(p);
  const st = await p.evaluate(() => window.__tanc.state()), me = await p.evaluate(() => window.__tanc.me());
  const a = st.tanks[me], b = st.tanks[1 - me], dir = b.x >= a.x ? 1 : -1;
  const x0 = box.x + (a.x / 960) * box.width, y0 = box.y + ((a.y - 8) / 540) * box.height;
  const dx = Math.min(box.width * 0.30, dir > 0 ? box.x + box.width - 8 - x0 : x0 - box.x - 8) * dir;
  return { x0, y0, x1: x0 + dx, y1: Math.max(box.y + 6, y0 - box.height * 0.22), dir };
}
async function mouseDrag(p, v) {
  await p.mouse.move(v.x0, v.y0); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(v.x0 + (v.x1 - v.x0) * i / 10, v.y0 + (v.y1 - v.y0) * i / 10); await sleep(16); }
  await p.mouse.up();
}
async function touchDrag(p, v, engine) {
  if (engine === "chromium") {
    const cdp = await p.context().newCDPSession(p);
    const pt = (x, y) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(v.x0, v.y0) });
    for (let i = 1; i <= 10; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(v.x0 + (v.x1 - v.x0) * i / 10, v.y0 + (v.y1 - v.y0) * i / 10) }); await sleep(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach().catch(() => {});
    return "cdp";
  }
  return p.evaluate(async v => {
    const cv = document.getElementById("cv");
    cv.setPointerCapture = () => {}; cv.releasePointerCapture = () => {}; cv.hasPointerCapture = () => true;
    // TouchEvent: moderní konstruktor, jinak starší iOS API (createTouch + initTouchEvent), jinak jen pointer události
    const mkTouchEvent = (type, x, y, end) => {
      try {
        const t = new Touch({ identifier: 7, target: cv, clientX: x, clientY: y, pageX: x + scrollX, pageY: y + scrollY, screenX: x, screenY: y, radiusX: 2, radiusY: 2, force: 1 });
        return new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: end ? [] : [t], targetTouches: end ? [] : [t], changedTouches: [t] });
      } catch (e1) {
        try {
          const t = document.createTouch(window, cv, 7, x, y, x, y);
          const list = document.createTouchList(t), none = document.createTouchList();
          const ev = document.createEvent("TouchEvent");
          ev.initTouchEvent(type, true, true, window, 0, x, y, x, y, false, false, false, false, end ? none : list, end ? none : list, list, 1, 0);
          return ev;
        } catch (e2) { return null; }
      }
    };
    let touchKind = "pointer";
    const T = (type, x, y, end) => { const ev = mkTouchEvent(type, x, y, end); if (ev) { touchKind = "pointer+touch"; cv.dispatchEvent(ev); } };
    const P = (type, x, y, down) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, buttons: down ? 1 : 0, button: type === "pointermove" ? -1 : 0, width: 2, height: 2, pressure: down ? 0.5 : 0 }));
    P("pointerdown", v.x0, v.y0, true); T("touchstart", v.x0, v.y0);
    for (let i = 1; i <= 10; i++) {
      const x = v.x0 + (v.x1 - v.x0) * i / 10, y = v.y0 + (v.y1 - v.y0) * i / 10;
      P("pointermove", x, y, true); T("touchmove", x, y); await new Promise(r => setTimeout(r, 16));
    }
    P("pointerup", v.x1, v.y1, false); T("touchend", v.x1, v.y1, true);
    return "synthetic " + touchKind;
  }, v);
}

// ---------- jeden pár prohlížečů ----------
async function runVariant(n, engineLib) {
  const cfg = n === "2"
    ? { A: { lib: webkit, name: "webkit", ctx: { viewport: { width: 1280, height: 800 } }, label: "WebKit desktop" }, B: { lib: chromium, name: "chromium", ctx: { ...devices["Pixel 7"] }, label: "Chromium Pixel 7" } }
    : { A: { lib: chromium, name: "chromium", ctx: { viewport: { width: 1280, height: 800 } }, label: "Chromium desktop" }, B: { lib: webkit, name: "webkit", ctx: { ...devices["iPhone 13"] }, label: "WebKit iPhone 13" } };
  tag = `[v${n}] `;
  console.log(`\n=== Varianta ${n}: A = ${cfg.A.label} (myš), B = ${cfg.B.label} (dotyk) · ${BASE} ===`);
  const headless = !process.env.HEADED;
  const bA = await cfg.A.lib.launch({ headless }), bB = await cfg.B.lib.launch({ headless });
  const errs = [];
  const watch = (name, page) => {
    page.on("pageerror", e => errs.push(`${name}: pageerror ${e.message}`));
    page.on("console", m => {
      if (m.type() !== "error") return;
      const u = (m.location() && m.location().url) || "";
      if (/favicon|fonts\.g(oogleapis|static)/i.test(u + m.text())) return;
      errs.push(`${name}: console.error ${m.text().slice(0, 200)}`);
    });
    page.on("dialog", d => d.accept().catch(() => {}));
  };
  const ctxA = await bA.newContext(cfg.A.ctx), ctxB = await bB.newContext(cfg.B.ctx);
  const pa = await ctxA.newPage(), pb = await ctxB.newPage();
  watch("A", pa); watch("B", pb);
  const P = { A: pa, B: pb }, other = w => (w === "A" ? "B" : "A");
  const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, `v${n}-${name}.png`) }).catch(() => {});
  const snap = p => p.evaluate(() => {
    const t = window.__tanc; if (!t) return null; const s = t.state();
    return { title: document.title, view: document.body.dataset.view, anim: t.animating(), busy: t.busy(), over: !!s.matchOver, n: t.inputs().length, hash: t.hash(), me: t.me() };
  });
  const press = async (p, w, sel) => { const l = p.locator(sel).first(); if (w === "B") await l.tap(); else await l.click(); };
  let spectCtx = null;
  try {
    // 1) zalozeni vyzvy
    await pa.goto(BASE, { waitUntil: "domcontentloaded" });
    await pa.waitForSelector("body[data-view=setup]", { timeout: 20000 });
    await shot(pa, "01-setup");
    await pa.fill("#nameMe", "Mark"); await pa.fill("#nameOpp", "Radka");
    await pa.selectOption("#stakeSel", "1");
    await pa.click("#createBtn");
    await pa.waitForSelector("body[data-view=share]", { timeout: 30000 });
    const msg = await pa.inputValue("#shareMsg");
    const idm = /#r\.([0-9a-z]{12})\b/.exec(msg);
    const id = idm && idm[1];
    check("výzva: #shareMsg obsahuje odkaz #r.<id> (12 znaků) a jména", !!id && msg.includes("Mark") && msg.includes("Radka"), msg.replace(/\s+/g, " ").slice(0, 90));
    await shot(pa, "02-share");
    if (!id) throw new Error("bez id místnosti nejde pokračovat");
    const link = BASE + "#r." + id;
    await pa.click("#shareGo");
    await pa.waitForSelector("body[data-view=play]", { timeout: 20000 });
    check("zakladatel po #shareGo ve hře, má místo 0", (await snap(pa)).me === 0);

    // 2) soupeřka otevře odkaz a přijme
    await pb.goto(link, { waitUntil: "domcontentloaded" });
    await pb.waitForSelector("body[data-view=intro]", { timeout: 30000 });
    await shot(pb, "03-intro-B");
    check("soupeř: intro s #acceptBtn", await pb.locator("#acceptBtn").isVisible());
    await press(pb, "B", "#acceptBtn");
    await pb.waitForSelector("body[data-view=play]", { timeout: 30000 });
    const sB = await snap(pb);
    check("soupeř po přijetí: ve hře, místo 1", sB.me === 1);
    const doc0 = await pa.evaluate(id => window.TankNet.load(id), id);
    check("doc na mantledb: app, s0 ≠ s1, obě místa obsazená", doc0 && doc0.app === "tancicky" && !!doc0.s0 && !!doc0.s1 && doc0.s0 !== doc0.s1, JSON.stringify({ v: doc0 && doc0.v }));
    check("doc: g.n = Mark/Radka, g.seed číslo, g.t prázdné", doc0 && doc0.g.n[0] === "Mark" && doc0.g.n[1] === "Radka" && Number.isInteger(doc0.g.seed) && doc0.g.t.length === 0);
    await sleep(1500);
    const s0A = await snap(pa), s0B = await snap(pb);
    check("start: hash shodný na obou stránkách", s0A.hash === s0B.hash && s0A.n === 0 && s0B.n === 0, `${s0A.hash}/${s0B.hash}`);
    check("start: právě jeden má titul „Jsi na tahu“", s0A.title.startsWith("Jsi na tahu") !== s0B.title.startsWith("Jsi na tahu"), `A="${s0A.title}" B="${s0B.title}"`);

    // pomocné funkce zápasu
    const real = { A: false, B: false };
    const latencies = []; let titleBad = 0, hashBad = 0, turns = 0, noteCheck = null, shopChecks = {};
    const diag = async () => JSON.stringify({ A: await snap(pa).catch(() => null), B: await snap(pb).catch(() => null) });
    async function whoseTurn(timeout, skipAnim) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const [a, b] = await Promise.all([snap(pa), snap(pb)]);
        if (skipAnim) { if (a.anim) await pa.evaluate(() => window.__tanc.skip()); if (b.anim) await pb.evaluate(() => window.__tanc.skip()); }
        if (a.over && b.over && !a.anim && !b.anim) return null;
        const okA = a.title.startsWith("Jsi na tahu") && !a.anim && !a.busy && !a.over;
        const okB = b.title.startsWith("Jsi na tahu") && !b.anim && !b.busy && !b.over;
        if (okA && okB) { titleBad++; return "A"; }
        if (okA) return "A"; if (okB) return "B";
        await sleep(200);
      }
      throw new Error("nikdo není na tahu do " + timeout + " ms: " + await diag());
    }
    async function settle(nExp, skipAnim, timeout) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const [a, b] = await Promise.all([snap(pa), snap(pb)]);
        if (skipAnim) { if (a.anim) await pa.evaluate(() => window.__tanc.skip()); if (b.anim) await pb.evaluate(() => window.__tanc.skip()); }
        if (a.n === nExp && b.n === nExp && !a.anim && !b.anim && !a.busy && !b.busy) return [a, b];
        await sleep(200);
      }
      throw new Error(`tah ${nExp} nedorazil/nedoběhl na obě stránky do ${timeout} ms: ` + await diag());
    }
    async function noteSeen(p, text, timeout) {
      const t0 = Date.now(); let where = null;
      while (Date.now() - t0 < timeout && !where) {
        where = await p.evaluate(t => (document.body.innerText || "").includes(t) ? "viditelný text" : null, text).catch(() => null);
        if (!where) await sleep(100);
      }
      return where;
    }
    // 3) tahy: nejdřív „ručně“ přes UI, zbytek přes __tanc.play(suggestShot)
    async function realTurn(w, nBefore) {
      const p = P[w], st = await p.evaluate(() => window.__tanc.state()), me = await p.evaluate(() => window.__tanc.me());
      const info = { bought: null, ability: null, note: null };
      if (st.tanks[me].shop) {
        let open;
        if (st.round === 1) { // 1. kolo: obchod se sám neotevírá, je v nabídce „…“
          await sleep(1500);
          shopChecks[w + "auto1"] = await p.locator("#shop:not([hidden])").count() === 0;
          if (await p.locator("#roundIntro:not([hidden])").count()) await p.evaluate(() => document.getElementById("roundIntro").hidden = true);
          await press(p, w, "#moreBtn"); await sleep(250); await press(p, w, "#shopBtn");
          open = await p.waitForSelector("#shop:not([hidden])", { timeout: 8000 }).then(() => true, () => false);
        } else open = await p.waitForSelector("#shop:not([hidden])", { timeout: 8000 }).then(() => true, () => false);
        shopChecks[w + "open"] = open;
        if (open) {
          await shot(p, `${w}-shop`);
          if (w === "A") {
            const btn = p.locator("[data-buy]:not([disabled]):not([aria-disabled=true])");
            if (await btn.count()) {
              info.bought = await btn.first().getAttribute("data-buy");
              const before = (await p.locator("#shopCoins").first().innerText()).trim();
              await btn.first().click(); await sleep(400);
              const after = (await p.locator("#shopCoins").first().innerText()).trim();
              shopChecks.coins = before !== after ? "" : `mince beze změny (${before})`;
            }
          }
          await press(p, w, "#shopDone");
          shopChecks[w + "closed"] = await p.waitForSelector("#shop", { state: "hidden", timeout: 8000 }).then(() => true, () => false);
        }
      }
      // míření tažením
      const v = await dragVector(p);
      let how;
      if (w === "A") { await mouseDrag(p, v); how = "myš"; } else { how = await touchDrag(p, v, cfg.B.name); }
      info.how = how; info.dir = v.dir; info.opp = st.tanks[1 - me].x - st.tanks[me].x;
      if (w === "A") { info.note = "Tohle bylo těsné!"; await p.fill("#noteInput", info.note); }
      if (w === "B") {
        const ab = ["shield", "calm", "repair", "magnet", "antigrav"];
        for (const id of ab) {
          const l = p.locator(`[data-a="${id}"]`).first();
          if (await l.count() && await l.isVisible() && await l.isEnabled()) { await l.tap(); info.ability = id; break; }
        }
      }
      await shot(p, `${w}-pred-palbou`);
      const noteP = w === "A" ? noteSeen(P.B, info.note, 40000) : Promise.resolve(null);
      await press(p, w, "#fireBtn");
      await p.waitForFunction(k => window.__tanc.inputs().length > k, nBefore, { timeout: 30000 });
      info.last = await p.evaluate(() => { const a = window.__tanc.inputs(); return a[a.length - 1]; });
      info.noteWhere = await noteP;
      return info;
    }
    async function fastTurn(w) {
      const p = P[w];
      if (await p.locator("#shop:not([hidden])").count()) { await press(p, w, "#shopDone").catch(() => {}); await sleep(200); }
      for (let k = 0; k < 4; k++) {
        const ok = await p.evaluate(async () => {
          try { const inp = window.TankEngine.suggestShot(window.__tanc.state()); return await window.__tanc.play(inp); } catch (e) { return "err:" + e.message; }
        });
        if (ok === true) return;
        await sleep(1500);
      }
      throw new Error("play() odmítl tah 4×: " + await diag());
    }

    let matchOver = false, lastN = 0;
    for (let i = 0; i < MAXTURNS && !matchOver; i++) {
      const w = await whoseTurn(60000, !(!real.A || !real.B));
      if (w === null) { matchOver = true; break; }
      const r = other(w), nBefore = (await snap(P[w])).n;
      const isReal = !real[w]; real[w] = true;
      let info = null;
      if (isReal) info = await realTurn(w, nBefore); else await fastTurn(w);
      const t0 = Date.now();
      await P[r].waitForFunction(k => window.__tanc.inputs().length >= k, nBefore + 1, { timeout: 40000, polling: 100 });
      latencies.push(Date.now() - t0);
      const [a, b] = await settle(nBefore + 1, !isReal, 60000);
      turns++; lastN = nBefore + 1;
      if (a.hash !== b.hash) { hashBad++; check(`tah ${lastN}: hash shodný (${w} hrál)`, false, `A=${a.hash} B=${b.hash}`); }
      if (isReal) {
        const L = info.last;
        check(`reálný tah ${w}: zapsán v/w/vx/vy`, L && typeof L.weapon === "string" && Number.isInteger(L.vx) && Number.isInteger(L.vy) && (L.vx !== 0 || L.vy !== 0), JSON.stringify(L));
        check(`reálný tah ${w}: tažení (${info.how}) míří směrem k soupeři`, L && Math.sign(L.vx) === Math.sign(info.opp), `vx=${L && L.vx}, soupeř ${info.opp > 0 ? "vpravo" : "vlevo"}`);
        if (w === "A") {
          check("obchod: otevřel se a po #shopDone zavřel", shopChecks.Aopen === true && shopChecks.Aclosed === true, JSON.stringify(shopChecks));
          check("obchod: v 1. kole se sám neotevře (je v nabídce „…“)", shopChecks.Aauto1 !== false && shopChecks.Bauto1 !== false, JSON.stringify(shopChecks));
          check("obchod: nákup [data-buy] snížil mince a je ve vstupu tahu", !!info.bought && shopChecks.coins === "" && Array.isArray(L.buy) && L.buy.includes(info.bought), `${info.bought} ${shopChecks.coins || ""} buy=${JSON.stringify(L.buy)}`);
          check("vzkaz: #noteInput uložen do vstupu tahu", L.note === info.note, JSON.stringify(L.note));
          noteCheck = info.noteWhere;
          check("vzkaz: soupeř ho vidí v DOM (viditelný text)", !!info.noteWhere, String(info.noteWhere));
          await shot(pb, "A-vzkaz-u-B");
        } else {
          check("reálný tah B: aktivka [data-a] zapsána ve vstupu", !!info.ability && L.ability === info.ability, `${info.ability} → ${JSON.stringify(L.ability)}`);
        }
        await shot(P[w], `${w}-po-tahu`); await shot(P[r], `${r}-po-tahu-souperem`);
        const rep = await P[r].evaluate(() => window.__tanc.state().turnNo);
        void rep;
      }
      const st = await P.A.evaluate(() => window.__tanc.state());
      matchOver = !!st.matchOver && (await snap(pb)).over;
    }
    check(`zápas dohrán až do matchOver (${turns} tahů, kola ${await pa.evaluate(() => window.__tanc.state().round)})`, matchOver, matchOver ? "" : await diag());
    check("hash shodný po každém tahu na obou stránkách", hashBad === 0, `rozdílů: ${hashBad}`);
    check("vždy jen jeden hráč „Jsi na tahu“", titleBad === 0, `souběhů: ${titleBad}`);
    const maxLat = Math.max(0, ...latencies), avgLat = latencies.length ? Math.round(latencies.reduce((x, y) => x + y, 0) / latencies.length) : 0;
    check("tah dorazí k soupeři přirozeným pollingem (max ≤ 15 s)", maxLat <= 15000, `průměr ${avgLat} ms, max ${maxLat} ms, tahů ${latencies.length}`);

    // 4) determinismus: Node přehraje zápas z inputs() a musí vyjít stejně jako obě stránky
    await sleep(500);
    const [fa, fb] = await Promise.all([P.A, P.B].map(p => p.evaluate(() => ({ st: window.__tanc.state(), inputs: window.__tanc.inputs(), hash: window.__tanc.hash(), ver: window.TankEngine.VERSION }))));
    check("konec: stav a vstupy shodné na obou stránkách", fa.hash === fb.hash && JSON.stringify(fa.inputs) === JSON.stringify(fb.inputs) && fa.st.seed === fb.st.seed, `${fa.hash}/${fb.hash}`);
    const E = engineLib.E;
    const rp = E.replay(fa.st.seed, fa.st.start, fa.inputs);
    check(`engine (${engineLib.from}): Node replay(seed,start,inputs) = hash obou stránek`, E.hash(rp) === fa.hash && E.hash(rp) === fb.hash, `node=${E.hash(rp)} A=${fa.hash} B=${fb.hash}`);
    check("height-mapa h[] z Node replaye = h[] obou stránek", fnv(rp.h) === fnv(fa.st.h) && fnv(rp.h) === fnv(fb.st.h), `${fnv(rp.h)} / ${fnv(fa.st.h)} / ${fnv(fb.st.h)}`);
    check("HP obou tanků z Node replaye = obě stránky", rp.tanks.every((t, i) => t.hp === fa.st.tanks[i].hp && t.hp === fb.st.tanks[i].hp), JSON.stringify(rp.tanks.map(t => t.hp)));
    check("matchOver i vítěz z Node replaye = obě stránky", !!rp.matchOver && rp.winner === fa.st.winner && rp.winner === fb.st.winner, `winner=${rp.winner}, kola ${JSON.stringify(rp.wins)}`);
    const docEnd = await pa.evaluate(id => window.TankNet.load(id), id);
    check("živý dokument: g.t = všechny tahy zápasu, seed sedí", docEnd.g.t.length === fa.inputs.length && docEnd.g.seed === fa.st.seed && JSON.stringify(docEnd.g.t.map(t => [t.vx, t.vy, t.weapon])) === JSON.stringify(fa.inputs.map(t => [t.vx, t.vy, t.weapon])), `v=${docEnd.v}, tahů ${docEnd.g.t.length}/${fa.inputs.length}`);

    // 5) konec zápasu na obou stranách
    for (const w of ["A", "B"]) await P[w].evaluate(() => window.__tanc.skip());
    await Promise.all(["A", "B"].map(w => P[w].waitForSelector("body[data-view=end]", { timeout: 40000 }).then(() => true, () => false))).then(r => check("obrazovka konce (data-view=end) na obou stránkách", r[0] && r[1], JSON.stringify(r)));
    const [tA, tB] = await Promise.all([pa.locator("#endTitle").first().innerText().catch(() => ""), pb.locator("#endTitle").first().innerText().catch(() => "")]);
    check("#endTitle viditelný a neprázdný na obou", tA.trim().length > 0 && tB.trim().length > 0 && await pa.locator("#endTitle").first().isVisible() && await pb.locator("#endTitle").first().isVisible(), `A="${tA.trim()}" B="${tB.trim()}"`);
    await shot(pa, "05-konec-A"); await shot(pb, "05-konec-B");

    // 6) odveta: série 1:0 / 0:1
    const rw = (await pb.locator("#rematchBtn").first().isVisible()) ? "B" : "A";
    check("#rematchBtn je vidět aspoň na jedné straně", await P.A.locator("#rematchBtn").first().isVisible() || await P.B.locator("#rematchBtn").first().isVisible());
    await press(P[rw], rw, "#rematchBtn");
    const ro = other(rw);
    await Promise.all(["A", "B"].map(w => P[w].waitForFunction(() => document.body.dataset.view === "play" && window.__tanc.inputs().length === 0 && !window.__tanc.state().matchOver, null, { timeout: 40000 }).then(() => true, () => false)))
      .then(r => check(`odveta (zahájil ${rw}): nový zápas ve hře u obou, 0 tahů`, r[0] && r[1], JSON.stringify(r)));
    await sleep(1500);
    const docR = await pa.evaluate(id => window.TankNet.load(id), id);
    const wsum = docR.g.w[0] + docR.g.w[1];
    check("série po odvetě 1:0 nebo 0:1, gi = 2", wsum === 1 && docR.g.gi === 2 && docR.g.t.length === 0, `w=${JSON.stringify(docR.g.w)} gi=${docR.g.gi} seed ${docR.g.seed}`);
    const [r0a, r0b] = await Promise.all([snap(pa), snap(pb)]);
    check("odveta: nový seed a stejný hash obou stránek", r0a.hash === r0b.hash && docR.g.seed !== fa.st.seed, `${r0a.hash}/${r0b.hash}`);
    await shot(pa, "06-odveta-A"); await shot(pb, "06-odveta-B");

    // 7) 2 tahy v 2. zápase a reload B uprostřed
    for (let i = 0; i < 3; i++) {
      const w = await whoseTurn(60000, true);
      if (w === null) break;
      const k = (await snap(P[w])).n;
      await fastTurn(w);
      await settle(k + 1, true, 60000);
    }
    const [preA, preB] = await Promise.all([snap(pa), snap(pb)]);
    await pb.reload({ waitUntil: "domcontentloaded" });
    await pb.waitForFunction(() => window.__tanc && ["play", "end"].includes(document.body.dataset.view), null, { timeout: 40000 });
    await sleep(1500); await pb.evaluate(() => window.__tanc.skip());
    await pb.waitForFunction(() => !window.__tanc.animating() && !window.__tanc.busy(), null, { timeout: 30000 });
    const [postA, postB] = await Promise.all([snap(pa), snap(pb)]);
    check("reload B uprostřed zápasu: stále místo 1, žádné intro", postB.me === 1 && postB.view !== "intro" && !(await pb.locator("#acceptBtn").isVisible()), `me=${postB.me} view=${postB.view}`);
    check("reload B: stav a počet tahů se vrátily (hash = A = před reloadem)", postB.hash === postA.hash && postB.hash === preB.hash && postB.n === preA.n && preA.n >= 1, `před ${preB.hash}/${preB.n}, po ${postB.hash}/${postB.n}, A ${postA.hash}/${postA.n}`);
    check("reload B: titul „Jsi na tahu“ odpovídá tomu, kdo je na tahu", postB.title.startsWith("Jsi na tahu") !== postA.title.startsWith("Jsi na tahu"), `A="${postA.title}" B="${postB.title}"`);
    await shot(pb, "07-po-reloadu-B");
    // po reloadu se dá dál hrát
    {
      const w = await whoseTurn(60000, true);
      if (w) { const k = (await snap(P[w])).n; await fastTurn(w); const [a, b] = await settle(k + 1, true, 60000); check("po reloadu se dá hrát dál a hash drží", a.hash === b.hash, `${a.hash}/${b.hash}`); }
    }

    // 8) přihlížející
    spectCtx = await bA.newContext({ viewport: { width: 1280, height: 800 } });
    const ps = await spectCtx.newPage(); watch("S", ps);
    await ps.goto(link, { waitUntil: "domcontentloaded" });
    await ps.waitForFunction(() => window.__tanc && ["intro", "play", "end"].includes(document.body.dataset.view), null, { timeout: 40000 });
    await sleep(1200);
    const sv = await ps.evaluate(() => ({ view: document.body.dataset.view, me: window.__tanc.me(), title: document.title }));
    const accVisible = await ps.locator("#acceptBtn").first().isVisible().catch(() => false);
    check("přihlížející: žádné #acceptBtn, nemá místo, titul není „Jsi na tahu“", !accVisible && sv.me === null && !sv.title.startsWith("Jsi na tahu"), JSON.stringify({ ...sv, accVisible }));
    const claimVisible = sv.view === "intro" ? (await ps.locator("#claim0").first().isVisible() && await ps.locator("#claim1").first().isVisible()) : true;
    check("přihlížející: v intro jsou tlačítka #claim0/#claim1", claimVisible, `view=${sv.view}`);
    await shot(ps, "08-prihlizejici");
    const dBefore = await ps.evaluate(id => window.TankNet.load(id), id);
    const pr = await ps.evaluate(async () => { try { return await window.__tanc.play({ weapon: "grenade", vx: 300, vy: -300, move: 0, ability: null }); } catch (e) { return "err:" + e.message; } });
    if (await ps.locator("#fireBtn").first().isVisible().catch(() => false)) await ps.locator("#fireBtn").first().click({ force: true, timeout: 3000 }).catch(() => {});
    await sleep(2500);
    const dAfter = await ps.evaluate(id => window.TankNet.load(id), id);
    check("přihlížející nemůže hrát: play() odmítnut a dokument beze změny", pr !== true && dAfter.v === dBefore.v && dAfter.g.t.length === dBefore.g.t.length, `play=${JSON.stringify(pr)} v ${dBefore.v}→${dAfter.v}, tahů ${dBefore.g.t.length}→${dAfter.g.t.length}`);
    if (sv.view === "intro") {
      await ps.locator("#claim1").first().click();
      const ok = await ps.waitForFunction(() => window.__tanc.me() === 1 && document.body.dataset.view !== "intro", null, { timeout: 15000 }).then(() => true, () => false);
      check("„jsem hráč 2 v jiném prohlížeči“ (#claim1) přiřadí místo", ok);
    }
    await spectCtx.close(); spectCtx = null;

    check("žádné chyby konzole / pageerror na žádné stránce", errs.length === 0, errs.slice(0, 4).join(" | "));
  } catch (e) {
    check("scénář proběhl bez výjimky", false, String(e && e.message || e).slice(0, 600));
    for (const [nm, p] of [["A", pa], ["B", pb]]) await p.screenshot({ path: path.join(SHOTS, `v${n}-CHYBA-${nm}.png`) }).catch(() => {});
    if (errs.length) check("chyby konzole při pádu scénáře", false, errs.slice(0, 4).join(" | "));
  } finally {
    if (spectCtx) await spectCtx.close().catch(() => {});
    await bA.close().catch(() => {}); await bB.close().catch(() => {});
  }
}

(async () => {
  const lib = await loadEngine().catch(e => { console.error("engine nenačten:", e.message); return null; });
  if (!lib) { console.log("FAIL  engine k determinismu nenalezen (ani v index.html, ani src/engine.js)"); process.exit(2); }
  const variants = VARIANT === "both" ? ["1", "2"] : [VARIANT === "2" ? "2" : "1"];
  for (const v of variants) await runVariant(v, lib);
  const total = pass + fail;
  console.log(`\n${pass}/${total} PASS` + (fail ? ` · ${fail} FAIL` : "") + ` · ${BASE}`);
  fs.writeFileSync(path.join(SHOTS, `duel-vysledek-v${variants.join("")}.txt`), results.join("\n") + `\n${pass}/${total} PASS\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
