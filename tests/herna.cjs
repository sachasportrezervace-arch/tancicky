// Napojení na Hernu (protokol react-apps/HERNA-PROTOKOL.md, verze 1): hra v iframe vlastního malého rodiče, který
// emuluje Hernu (lišta 51 px (jako v ostré Herně) + iframe, naslouchá jen zprávám ze svého iframe). Dva nezávislé prohlížeče, živá synchronizace.
//   node tests/herna.cjs [URL] [--rounds 1|2]     (výchozí http://127.0.0.1:8802/)
//   běh 1: Mark (seat 0, zaklada=1) = Chromium desktop 1440×900, Radka (seat 1, zaklada=0) = WebKit iPhone 13, partie + odveta
//   běh 2: role prohozené: Radka (seat 1, zaklada=1) = WebKit iPhone 13 zakládá, Mark (seat 0) = Chromium se posadí, jedna partie
// Ověřuje: meta herna-protokol, oba sednou bez výzvy a bez setupu, skryté sdílení / „Zkusit sám“ / odkazy ven, jména podle
// sedadel, rodič dostane pripraveno + stav (ceka → hraje → konec) + vysledek (partie r:gi, vitez = seat) od obou jednou,
// „Jiná hra“ pošle jina-hra, odveta = nová partie r:2, bez #herna se hra chová postaru.
const path = require("path");
const PW = process.env.PW || path.join(process.env.APPDATA || "", "npm/node_modules/playwright");
const { chromium, webkit, devices } = require(PW);
const argv = process.argv.slice(2);
const BASE = ((argv.find(a => /^https?:/.test(a))) || "http://127.0.0.1:8802/").replace(/#.*$/, "");
const ONLY = (() => { const i = argv.indexOf("--run"); return i >= 0 ? argv[i + 1] : "both"; })();
const SHOTS = path.join(__dirname, "shots");
require("fs").mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
function check(name, ok, extra = "") { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = () => Array.from({ length: 12 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");
const errors = [];

const PARENT = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#222}#bar{height:51px;background:#444}
iframe{border:0;display:block;width:100%;height:calc(100% - 51px)}</style><div id=bar></div><iframe id=g allow="fullscreen"></iframe>
<script>window.__msgs=[];addEventListener("message",function(e){var f=document.getElementById("g");
if(e.source===f.contentWindow&&e.data&&typeof e.data==="object"&&e.data.herna===1)window.__msgs.push(e.data);});</script>`;

async function open(lib, ctxOpts, tag, hash) {
  const b = await lib.launch();
  const ctx = await b.newContext(ctxOpts), page = await ctx.newPage();
  page.on("pageerror", e => errors.push(`${tag}: pageerror ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/favicon|fonts\.g(oogleapis|static)/i.test(m.text() + (m.location().url || "")) && !(/404/.test(m.text()) && /mantledb/.test(m.location().url || ""))) errors.push(`${tag}: ${m.text().slice(0, 160)}`); });
  await page.setContent(PARENT);
  await page.evaluate(src => { document.getElementById("g").src = src; }, BASE + hash);
  const handle = await page.waitForSelector("iframe#g");
  let fr = await handle.contentFrame();
  const w = { b, ctx, page, tag, touch: !!ctxOpts.hasTouch, get fr() { return fr; } };
  w.frame = async () => { fr = await (await page.$("iframe#g")).contentFrame(); return fr; };
  w.msgs = () => page.evaluate(() => window.__msgs.slice());
  w.click = sel => (w.touch ? fr.locator(sel).first().tap() : fr.locator(sel).first().click());
  w.snap = () => fr.evaluate(() => { const t = window.__tanc; if (!t) return null; const s = t.state(); return s ? { cur: s.cur, me: t.me(), over: !!s.matchOver, winner: s.winner, anim: t.animating(), busy: t.busy(), view: document.body.dataset.view, n: t.inputs().length, gi: (t.series() || [0, 0]).join(":") } : { view: document.body.dataset.view, me: t.me(), none: true }; });
  return w;
}

async function fastTurn(w) {
  for (let k = 0; k < 4; k++) {
    const ok = await w.fr.evaluate(async () => {
      try {
        const sh = document.getElementById("shop"); if (sh && !sh.hidden) document.getElementById("shopDone").click();
        return await window.__tanc.play(window.TankEngine.suggestShot(window.__tanc.state()));
      } catch (e) { return "err:" + e.message; }
    });
    if (ok === true) return;
    await sleep(1500);
  }
  throw new Error(w.tag + ": play() odmítl tah 4×");
}
// zahraje partii do konce na obou stranách
async function playOut(A, B, maxMs) {
  const t0 = Date.now(); let turns = 0;
  while (Date.now() - t0 < maxMs) {
    const [a, b] = await Promise.all([A.snap(), B.snap()]);
    for (const [w, s] of [[A, a], [B, b]]) if (s && s.anim) await w.fr.evaluate(() => window.__tanc.skip());
    if (a && b && a.over && b.over && !a.anim && !b.anim && !a.busy && !b.busy) return turns;
    for (const [w, s] of [[A, a], [B, b]]) if (s && !s.none && !s.over && !s.anim && !s.busy && s.cur === s.me) { await fastTurn(w); turns++; }
    await sleep(250);
  }
  throw new Error("partie nedohrána do " + maxMs + " ms: " + JSON.stringify({ a: await A.snap(), b: await B.snap() }));
}
async function waitMsg(w, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const m = await w.msgs(); const f = m.find(pred); if (f) return f; await sleep(200); }
  return null;
}
// konec zápasu se vejde do rámu: každé viditelné tlačítko v .actions je celé nad spodní hranou iframe a pod horní (iPhone 13: iframe 390×613)
async function endFit(w, label, exp) {
  const m = await w.fr.evaluate(() => {
    const out = { ih: innerHeight, iw: innerWidth, btns: [] };
    document.querySelectorAll("#v-end .actions button").forEach(b => { if (!b.getClientRects().length) return; const r = b.getBoundingClientRect(); out.btns.push({ id: b.id, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }); });
    return out;
  });
  const ok = m.btns.length >= 2 && m.btns.every(b => b.bottom <= m.ih && b.top >= 0 && b.h >= 44) && (!exp || (m.iw === exp[0] && m.ih === exp[1]));
  check(label, ok, JSON.stringify({ iframe: m.iw + "x" + m.ih, btns: m.btns.map(b => b.id + " " + b.top + "-" + b.bottom) }));
}
const fazeSeq = ms => ms.filter(m => m.typ === "stav").map(m => m.faze).join(">");

async function run(name, cfg) {
  console.log(`\n=== ${name} · ${BASE} ===`);
  const r = rid(), names = "Mark,Radka";
  const hash = (seat, zaklada) => `#herna=1&m=test000000&r=${r}&seat=${seat}&names=${names}&zaklada=${zaklada}`;
  const { F, J } = cfg; // F = zakladatel, J = pozvaný
  // pozvaný přijde dřív než dokument: čeká a polluje
  const j = await open(J.lib, J.ctx, "J", hash(J.seat, 0));
  await j.frame();
  await j.fr.waitForSelector("body[data-view=info]", { timeout: 20000 });
  const waitTxt = await j.fr.locator("#infoTitle").innerText();
  check(`[${name}] pozvaný před založením: „Čeká se, až hra naskočí“`, /Čeká se, až hra naskočí/.test(waitTxt), waitTxt);
  const jm0 = await j.msgs();
  check(`[${name}] pozvaný: pripraveno + stav ceka`, jm0.some(m => m.typ === "pripraveno") && jm0.some(m => m.typ === "stav" && m.faze === "ceka"), JSON.stringify(jm0));
  // zakladatel
  const a = await open(F.lib, F.ctx, "F", hash(F.seat, 1));
  await a.frame();
  await Promise.all([a, j].map(w => w.fr.waitForSelector("body[data-view=play]", { timeout: 40000 }).then(() => true, () => false)))
    .then(res => check(`[${name}] oba rovnou ve hře (data-view=play), bez výzvy a setupu`, res[0] && res[1], JSON.stringify(res)));
  for (const w of [a, j]) await w.frame();
  const seats = await Promise.all([a.snap(), j.snap()]);
  check(`[${name}] místa odpovídají seat z adresy (${F.seat}/${J.seat})`, seats[0].me === F.seat && seats[1].me === J.seat, JSON.stringify(seats.map(s => s.me)));
  for (const w of [a, j]) {
    const vis = await w.fr.evaluate(() => {
      const shown = id => { const e = document.getElementById(id); return !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
      return { accept: shown("acceptBtn"), setup: shown("setupForm"), solo: shown("soloBtn"), copyTop: shown("copyTopBtn"), leave: shown("leaveBtn"), fs: shown("fullscreenBtn"), a2: shown("a2hs"), hash: location.hash };
    });
    check(`[${name}] ${w.tag}: bez výzvy / setupu / „Zkusit sám“ / kopírování odkazu / domů / celé obrazovky`, !vis.accept && !vis.setup && !vis.solo && !vis.copyTop && !vis.leave && !vis.fs && !vis.a2, JSON.stringify(vis));
    check(`[${name}] ${w.tag}: adresa iframe zůstala #herna=…`, vis.hash.startsWith("#herna=1&") && vis.hash.includes("r=" + r), vis.hash);
  }
  await new Promise(res => setTimeout(res, 800));
  const doc = await a.fr.evaluate(id => window.TankNet.load(id), r);
  check(`[${name}] dokument tancicky-${r}/hra: jména Mark,Radka, obě místa obsazená zařízeními`, doc && doc.app === "tancicky" && doc.g.n[0] === "Mark" && doc.g.n[1] === "Radka" && !!doc.s0 && !!doc.s1 && doc.s0 !== doc.s1, JSON.stringify(doc && { n: doc.g.n, v: doc.v }));
  const txt = await Promise.all([a, j].map(w => w.fr.evaluate(() => document.body.innerText)));
  check(`[${name}] jména hráčů jsou ve hře vidět (Mark i Radka)`, txt.every(t => t.includes("Mark") && t.includes("Radka")), "");
  await a.page.screenshot({ path: path.join(SHOTS, `herna-${name}-F.png`) }).catch(() => {});
  await j.page.screenshot({ path: path.join(SHOTS, `herna-${name}-J.png`) }).catch(() => {});
  const mA = await waitMsg(a, m => m.typ === "stav" && m.faze === "hraje", 20000), mJ = await waitMsg(j, m => m.typ === "stav" && m.faze === "hraje", 20000);
  check(`[${name}] oba rodiče dostali stav hraje`, !!mA && !!mJ);
  const am = await a.msgs(), jm = await j.msgs();
  check(`[${name}] zakladatel: pripraveno, stav ceka → hraje`, am.some(m => m.typ === "pripraveno") && /^ceka>hraje/.test(fazeSeq(am)), fazeSeq(am));
  check(`[${name}] pozvaný: stav ceka → hraje`, /^ceka>hraje/.test(fazeSeq(jm)), fazeSeq(jm));

  // partie 1
  const parties = cfg.parties || 1;
  let turns = await playOut(a, j, 420000);
  const sA = await a.fr.evaluate(() => window.__tanc.state().winner);
  check(`[${name}] partie 1 dohrána (${turns} tahů)`, true, `winner=${sA}`);
  const expV = sA === 0 || sA === 1 ? sA : null;
  const [va, vj] = await Promise.all([waitMsg(a, m => m.typ === "vysledek", 30000), waitMsg(j, m => m.typ === "vysledek", 30000)]);
  check(`[${name}] vysledek na obou: partie ${r}:1, vitez = seat vítěze (${expV})`, !!va && !!vj && va.partie === `${r}:1` && vj.partie === `${r}:1` && va.vitez === expV && vj.vitez === expV, JSON.stringify([va, vj]));
  await sleep(1500);
  const am2 = await a.msgs(), jm2 = await j.msgs();
  check(`[${name}] vysledek přesně jednou na rodiče, stav konec`, am2.filter(m => m.typ === "vysledek").length === 1 && jm2.filter(m => m.typ === "vysledek").length === 1 && fazeSeq(am2).endsWith("konec") && fazeSeq(jm2).endsWith("konec"), `${fazeSeq(am2)} | ${fazeSeq(jm2)}`);
  check(`[${name}] všechny zprávy mají herna:1 a jen známé typy`, [...am2, ...jm2].every(m => m.herna === 1 && ["pripraveno", "stav", "vysledek", "jina-hra"].includes(m.typ)), "");
  await Promise.all([a, j].map(w => w.fr.waitForSelector("body[data-view=end]", { timeout: 30000 }))).catch(() => {});
  const endVis = await Promise.all([a, j].map(w => w.fr.evaluate(() => {
    const shown = id => { const e = document.getElementById(id); return !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
    return { other: shown("otherGameBtn"), rematch: shown("rematchBtn"), copy: shown("copyEndBtn"), menu: shown("menuBtn"), challenge: shown("challengeBtn") };
  })));
  check(`[${name}] konec: „Jiná hra“ + Odveta vidět, kopírování odkazu a Do menu skryté`, endVis.every(v => v.other && v.rematch && !v.copy && !v.menu && !v.challenge), JSON.stringify(endVis));
  for (const w of [a, j]) {
    const phone = w.touch;
    await endFit(w, `[${name}] konec ${w.tag}: tlačítka celá v rámu (${phone ? "iPhone 13, iframe 390×613" : "desktop"})`, phone ? [390, 613] : null);
    if (phone) { // ležato v rámu (844×300) a nízký rám (390×480): ilustrace se zmenší, tlačítka zůstanou vidět
      for (const [iw, ih] of [[844, 300], [390, 480]]) {
        await w.page.evaluate(([x, y]) => { const f = document.getElementById("g"); f.style.width = x + "px"; f.style.height = y + "px"; }, [iw, ih]);
        await sleep(500);
        await endFit(w, `[${name}] konec ${w.tag}: tlačítka celá v rámu ${iw}×${ih}`, [iw, ih]);
      }
      await w.page.screenshot({ path: path.join(SHOTS, `herna-${name}-konec-${w.tag}-nizky.png`) }).catch(() => {});
      await w.page.evaluate(() => { const f = document.getElementById("g"); f.style.width = ""; f.style.height = ""; });
      await sleep(400);
    }
  }
  await a.page.screenshot({ path: path.join(SHOTS, `herna-${name}-konec-F.png`) }).catch(() => {});
  await j.page.screenshot({ path: path.join(SHOTS, `herna-${name}-konec-J.png`) }).catch(() => {});
  await j.fr.evaluate(() => { window.__c = []; ["pointerdown", "touchstart", "touchend", "click"].forEach(t => window.addEventListener(t, e => window.__c.push(t + ":" + (e.target.id || e.target.tagName)), true)); });
  await j.click("#otherGameBtn");
  const jj = await waitMsg(j, m => m.typ === "jina-hra", 5000);
  check(`[${name}] „Jiná hra“ pošle jina-hra rodiči`, !!jj, jj ? "" : JSON.stringify({ msgs: (await j.msgs()).map(m => m.typ + (m.faze || "")), view: await j.snap(), ev: await j.fr.evaluate(() => window.__c) }));

  if (parties >= 2) {
    await a.click("#rematchBtn");
    await Promise.all([a, j].map(w => w.fr.waitForFunction(() => document.body.dataset.view === "play" && window.__tanc.inputs().length === 0 && !window.__tanc.state().matchOver, null, { timeout: 40000 }).then(() => true, () => false)))
      .then(res => check(`[${name}] odveta: nová partie ve hře u obou`, res[0] && res[1], JSON.stringify(res)));
    await sleep(1200);
    const h2 = await waitMsg(a, m => m.typ === "stav" && m.faze === "hraje" && true, 100);
    void h2;
    const f2 = fazeSeq(await a.msgs());
    check(`[${name}] po odvetě stav zase hraje`, /konec>hraje$/.test(f2), f2);
    turns = await playOut(a, j, 420000);
    const w2 = await a.fr.evaluate(() => window.__tanc.state().winner), e2 = w2 === 0 || w2 === 1 ? w2 : null;
    const [v2a, v2j] = await Promise.all([waitMsg(a, m => m.typ === "vysledek" && m.partie === `${r}:2`, 30000), waitMsg(j, m => m.typ === "vysledek" && m.partie === `${r}:2`, 30000)]);
    check(`[${name}] odveta (${turns} tahů): vysledek ${r}:2, vitez=${e2} na obou`, !!v2a && !!v2j && v2a.vitez === e2 && v2j.vitez === e2, JSON.stringify([v2a, v2j]));
  }
  // reload pozvaného: nový iframe, sedne si zpět na své místo bez výzvy a výsledek se neposílá znovu jinak než se stejným klíčem
  await j.page.evaluate(() => { window.__msgs = []; });
  await j.fr.evaluate(() => location.reload()).catch(() => {});
  await sleep(1000);
  await (await j.frame()).waitForFunction(() => window.__tanc && ["play", "end"].includes(document.body.dataset.view), null, { timeout: 40000 });
  const rs = await j.snap();
  check(`[${name}] reload pozvaného: stále jeho místo (${J.seat}), žádná výzva`, rs.me === J.seat && !(await j.fr.locator("#acceptBtn").isVisible()), JSON.stringify(rs));
  await sleep(500);
  const jmr = await j.msgs();
  check(`[${name}] reload: pripraveno znovu a výsledek stejné partie se znovu hlásí se stejným klíčem`, jmr.some(m => m.typ === "pripraveno") && jmr.filter(m => m.typ === "vysledek").every(m => m.partie.startsWith(r + ":")), JSON.stringify(jmr.map(m => m.typ + (m.partie || ""))));
  await Promise.all([a, j].map(w => w.b.close().catch(() => {})));
}

async function plain() {
  console.log(`\n=== bez #herna se hra chová postaru · ${BASE} ===`);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const posts = [];
  await p.exposeFunction("__post", m => posts.push(m));
  await p.addInitScript(() => { window.addEventListener("message", e => window.__post && e.data && window.__post(e.data)); });
  p.on("pageerror", e => errors.push("plain: " + e.message));
  await p.goto(BASE); await p.waitForSelector("body[data-view=setup]", { timeout: 20000 });
  const v = await p.evaluate(() => {
    const shown = id => { const e = document.getElementById(id); return !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
    return { solo: shown("soloBtn"), create: shown("createBtn"), other: shown("otherGameBtn"), herna: document.body.hasAttribute("data-herna") };
  });
  check("bez #herna: úvod s „Vyzvat odkazem“ a „Zkusit sám“, bez „Jiná hra“", v.solo && v.create && !v.other && !v.herna, JSON.stringify(v));
  await p.goto(BASE + "#herna=1&r=abcdefabcdef&seat=2&names=A,B"); await sleep(600);
  check("neplatné #herna (seat=2): chová se jako dřív (úvod)", (await p.evaluate(() => document.body.dataset.view)) === "setup" && !(await p.evaluate(() => document.body.hasAttribute("data-herna"))));
  await p.goto(BASE + "#solo"); await p.waitForSelector("body[data-view=play]", { timeout: 20000 });
  check("bez #herna: #solo dál spouští trénink", await p.evaluate(() => window.__tanc.solo()));
  const html = await (await fetch(BASE)).text();
  check("index.html obsahuje <meta name=\"herna-protokol\" content=\"1\">", /<meta name="herna-protokol" content="1">/.test(html));
  await b.close();
}

(async () => {
  try {
    await plain();
    if (ONLY === "both" || ONLY === "1")
      await run("run1-Mark-chromium-zaklada", {
        parties: process.env.ONE ? 1 : 2,
        F: { lib: chromium, ctx: { viewport: { width: 1440, height: 900 } }, seat: 0 },
        J: { lib: webkit, ctx: { ...devices["iPhone 13"] }, seat: 1 },
      });
    if (ONLY === "both" || ONLY === "2")
      await run("run2-Radka-iphone-zaklada", {
        parties: 1,
        F: { lib: webkit, ctx: { ...devices["iPhone 13"] }, seat: 1 },
        J: { lib: chromium, ctx: { viewport: { width: 1440, height: 900 } }, seat: 0 },
      });
  } catch (e) { check("test doběhl bez výjimky", false, e.message.slice(0, 400)); }
  check("žádné pageerror ani console.error", errors.length === 0, errors.slice(0, 4).join(" | "));
  console.log(`\n${fail ? "FAIL" : "PASS"}: ${pass} ok, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
