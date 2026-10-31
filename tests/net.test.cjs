// Node test src/net.js s mockem fetch / localStorage / document / časovačů (vm kontext).
// node tests/net.test.cjs      → PASS/FAIL řádky, exit 1 při selhání
const fs = require("fs"), path = require("path"), vm = require("vm");
const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "net.js"), "utf8");

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`);
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

// sdílený „server“ (mantledb) pro všechna zařízení
function makeServer() {
  const s = { docs: new Map(), down: false, status: 0, gets: 0, posts: 0, failPostOnce: false, log: [] };
  s.fetch = async (url, opt = {}) => {
    if (s.down) throw new TypeError("Failed to fetch");
    if (opt.signal && opt.signal.aborted) throw new Error("aborted");
    const m = (opt.method || "GET").toUpperCase();
    s.log.push(m + " " + url + " cache=" + opt.cache);
    if (s.status) return { status: s.status, ok: false, json: async () => ({}) };
    if (m === "POST") {
      s.posts++;
      if (s.failPostOnce) { s.failPostOnce = false; throw new TypeError("Failed to fetch"); }
      if (!/json/.test((opt.headers || {})["Content-Type"] || "")) return { status: 415, ok: false, json: async () => ({}) };
      s.docs.set(url, opt.body);
      return { status: 200, ok: true, json: async () => ({}) };
    }
    s.gets++;
    if (!s.docs.has(url)) return { status: 404, ok: false, json: async () => ({}) };
    const raw = s.docs.get(url);
    return { status: 200, ok: true, json: async () => JSON.parse(raw) };
  };
  return s;
}

// jedno „zařízení“ = vlastní vm kontext s vlastním localStorage a hodinami
function makeDevice(server, name) {
  const ls = new Map();
  const dev = { name, clock: 1_000_000, timers: [], seq: 0, hidden: false, listeners: {}, wl: {} };
  const ctx = {
    console, AbortController, Uint8Array, JSON, Math, Promise, Error, TypeError, Map, Array, Number, String, Object,
    fetch: server.fetch,
    crypto: { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } },
    localStorage: { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => { ls.set(k, String(v)); } },
    Date: { now: () => dev.clock },
    setTimeout: (fn, ms) => { const id = ++dev.seq; dev.timers.push({ id, fn, ms }); return id; },
    clearTimeout: id => { dev.timers = dev.timers.filter(t => t.id !== id); },
    document: { get hidden() { return dev.hidden; }, addEventListener: (t, f) => { (dev.listeners[t] = dev.listeners[t] || []).push(f); } },
    addEventListener: (t, f) => { (dev.wl[t] = dev.wl[t] || []).push(f); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "net.js" });
  dev.ctx = ctx; dev.ls = ls; dev.Net = ctx.TankNet;
  // živé časovače bez fetch-timeoutů (ty se po fetchi ruší, takže v poli zbývá jen poll)
  dev.next = () => dev.timers.slice().sort((a, b) => a.ms - b.ms)[0];
  dev.fire = async () => { const t = dev.timers.shift(); if (t) t.fn(); await flush(); return t; };
  dev.emit = async (t, scope = "doc", ev) => { for (const f of (scope === "doc" ? dev.listeners : dev.wl)[t] || []) f(ev); await flush(); };
  return dev;
}

(async () => {
  const server = makeServer();
  const A = makeDevice(server, "A"), B = makeDevice(server, "B"), C = makeDevice(server, "C");
  const NA = A.Net, NB = B.Net, NC = C.Net;

  // ---------- základ ----------
  check("API: výchozí základ mantledb v2", NA.API === "https://mantledb.sh/v2/");
  check("device: token zařízení se uložil do tanc-dev", typeof NA.device === "string" && NA.device.length === 16 && A.ls.get("tanc-dev") === NA.device);
  check("device: různá zařízení mají různé tokeny", NA.device !== NB.device);
  check("randId(12): jen [0-9a-z]", /^[0-9a-z]{12}$/.test(NA.randId(12)));
  check("docUrl: tancicky-<id>/hra", NA.docUrl("abc123def456") === "https://mantledb.sh/v2/tancicky-abc123def456/hra");
  NB.setBase("http://127.0.0.1:1/x");
  check("setBase: doplní lomítko", NB.docUrl("q") === "http://127.0.0.1:1/x/tancicky-q/hra");
  NB.API = "https://mantledb.sh/v2/";
  check("store.get/set: obalené try/catch", (() => { NA.store.set("k", "v"); return NA.store.get("k") === "v"; })());
  const bad = makeDevice(server, "bad");
  bad.ctx.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  check("store: výjimka localStorage se nepropustí", bad.Net.store.get("x") === null && bad.Net.store.set("x", "1") === undefined);

  // ---------- create / load ----------
  const g0 = { n: ["Mark", "Radka"], k: "1", kc: "", w: [0, 0], gi: 1, seed: 12345, start: 0, t: [] };
  const { id, doc: d0 } = await NA.create(g0, 0);
  check("create: id 12 znaků", /^[0-9a-z]{12}$/.test(id), id);
  check("create: doc app/v/s0/s1", d0.app === "tancicky" && d0.v === 1 && d0.s0 === NA.device && d0.s1 === "" && typeof d0.u === "number");
  check("create: zapsáno na správnou URL", server.docs.has(NA.docUrl(id)));
  check("create: zakladatel má místo 0", NA.mySeat(id) === 0 && A.ls.get("tanc-r-" + id) === "0");
  const l0 = await NA.load(id);
  check("load: vrátí zapsaný dokument", l0 && l0.v === 1 && l0.g.seed === 12345 && l0.g.n[1] === "Radka");
  check("load: 404 = null", (await NA.load("neexistuje99")) === null);
  check("fetch: cache no-store", server.log.every(l => l.endsWith("cache=no-store")));
  server.down = true;
  let thrown = null; try { await NA.load(id); } catch (e) { thrown = e; }
  check("load: síťová chyba = throw", !!thrown);
  server.down = false; server.status = 503;
  thrown = null; try { await NA.load(id); } catch (e) { thrown = e; }
  check("load: HTTP 503 = throw", !!thrown);
  server.status = 0;
  const c1 = await NB.create({ ...g0 }, 1);
  check("create: seat 1 zapíše s1", (await NB.load(c1.id)).s1 === NB.device && (await NB.load(c1.id)).s0 === "" && NB.mySeat(c1.id) === 1);

  // ---------- commit ----------
  const g1 = { ...g0, t: [{ weapon: "grenade", vx: 10, vy: -20 }] };
  const r1 = await NA.commit(id, 1, g => g.t.length === 0, g1);
  check("commit: ok, v 2", r1.ok === true && r1.doc.v === 2 && r1.reason === "", JSON.stringify({ ok: r1.ok, v: r1.doc && r1.doc.v }));
  const s1 = await NB.load(id);
  check("commit: server má v2, nové g, zachované s0 a app", s1.v === 2 && s1.g.t.length === 1 && s1.s0 === NA.device && s1.app === "tancicky");
  const posts = server.posts;
  const r2 = await NB.commit(id, 1, g => g.t.length === 0, { ...g0, t: [{ weapon: "mirv", vx: 1, vy: 1 }] });
  check("commit: zastaralé v je odmítnuto (conflict)", r2.ok === false && r2.reason === "conflict" && r2.doc.v === 2);
  check("commit: při konfliktu se nic nezapsalo", server.posts === posts && (await NB.load(id)).g.t[0].weapon === "grenade");
  const r3 = await NB.commit(id, 2, g => g.t.length === 0, g0);
  check("commit: check(g) false = conflict", r3.ok === false && r3.reason === "conflict" && (await NB.load(id)).v === 2);
  const r4 = await NB.commit(id, 2, () => { throw new Error("boom"); }, g0);
  check("commit: výjimka v check = conflict, ne pád", r4.ok === false && r4.reason === "conflict");
  const r5 = await NB.commit("neexistuje99", 1, () => true, g0);
  check("commit: neexistující hra = conflict (doc null)", r5.ok === false && r5.reason === "conflict" && r5.doc === null);
  server.down = true;
  const r6 = await NB.commit(id, 2, () => true, g0);
  check("commit: bez sítě = reason net", r6.ok === false && r6.reason === "net" && r6.doc === null);
  server.down = false; server.failPostOnce = true;
  const r7 = await NB.commit(id, 2, () => true, g0);
  check("commit: selhání zápisu = reason net, nic nezměněno", r7.ok === false && r7.reason === "net" && (await NB.load(id)).v === 2);
  const r8 = await NB.commit(id, 2, g => g.t.length === 1, { ...g1, t: [...g1.t, { weapon: "triple", vx: 2, vy: -3, note: "ahoj" }] });
  check("commit: po opravě znovu ok, v 3", r8.ok && r8.doc.v === 3);

  // ---------- accept ----------
  const r9 = await NB.accept(id);
  check("accept: B zabere volné místo 1", r9.seat === 1 && r9.doc.s1 === NB.device && r9.doc.v === 4 && NB.mySeat(id) === 1, JSON.stringify({ seat: r9.seat, v: r9.doc && r9.doc.v }));
  const sv = await NA.load(id);
  check("accept: na serveru s1 = token B, v 4, g beze změny", sv.s1 === NB.device && sv.v === 4 && sv.g.t.length === 2 && sv.s0 === NA.device);
  const r10 = await NC.accept(id);
  check("accept: třetí zařízení dostane null (přihlíží)", r10.seat === null && r10.doc.s1 === NB.device && NC.mySeat(id) === null);
  const pc = server.posts;
  const r11 = await NB.accept(id);
  check("accept: totéž zařízení znovu = stejné místo, bez zápisu", r11.seat === 1 && server.posts === pc);
  const r12 = await NA.accept(id);
  check("accept: zakladatel vlastním odkazem = místo 0, bez zápisu", r12.seat === 0 && server.posts === pc);
  check("accept: neexistující hra = {seat:null, doc:null}", await NC.accept("neexistuje99").then(r => r.seat === null && r.doc === null));
  // souběh: dva přijmou naráz volné místo 0 (s0 prázdné) – právě jeden uspěje
  const { id: id2 } = await NB.create({ ...g0 }, 1);       // s0 volné
  const [ra, rc] = await Promise.all([NA.accept(id2), NC.accept(id2)]);
  const winners = [ra, rc].filter(r => r.seat === 0).length;
  const finalDoc = await NA.load(id2);
  check("accept: při souběhu místo drží nejvýš jeden", winners <= 1 && [NA.device, NC.device].includes(finalDoc.s0), `vítězů ${winners}`);

  // ---------- seat / recent ----------
  NA.setSeat("room1", 1);
  check("setSeat/mySeat", NA.mySeat("room1") === 1 && NA.mySeat("nic") === null);
  for (const i of ["aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee", "ffffff", "aaaaaa"]) NA.remember(i, { n: ["Mark", "Radka"], me: 0 });
  const rec = NA.recent();
  check("remember/recent: max 5, nejnovější první, bez duplicit", rec.length === 5 && rec[0].id === "aaaaaa" && new Set(rec.map(r => r.id)).size === 5 && rec[0].n[0] === "Mark", rec.map(r => r.id).join(","));
  A.ls.set("tanc-rooms", "tohle neni json");
  check("recent: rozbitý JSON = []", NA.recent().length === 0);

  // ---------- watch ----------
  const D = makeDevice(server, "D");              // pozorovatel (jiný než A, který píše)
  const { id: wid } = await NA.create({ ...g0 }, 0);
  let known = 1; const got = [];
  D.Net.watch(wid, d => { got.push(d.v); known = d.v; }, () => known);
  check("watch: první poll naplánován na 3 s", D.timers.length === 1 && D.timers[0].ms === 3000);
  await D.fire();
  check("watch: bez novinky onDoc nevolá", got.length === 0 && D.timers.length === 1 && D.timers[0].ms === 3000);
  await NA.commit(wid, 1, () => true, { ...g0, t: [{ weapon: "grenade", vx: 1, vy: 1 }] });
  await D.fire();
  check("watch: novější v → onDoc přesně jednou", got.length === 1 && got[0] === 2);
  await D.fire();
  check("watch: stejné v podruhé onDoc nevolá", got.length === 1);
  known = 5;                                       // UI už vidí novější stav
  await D.fire();
  check("watch: doc.v <= getV() se ignoruje", got.length === 1);
  known = 2;
  // klid: po 5 min 10 s, po 30 min 30 s
  D.clock += 6 * 60e3; await D.fire();
  check("watch: po 5 min klidu interval 10 s", D.timers[0].ms === 10000, String(D.timers[0].ms));
  D.clock += 31 * 60e3; await D.fire();
  check("watch: po 30 min klidu interval 30 s", D.timers[0].ms === 30000, String(D.timers[0].ms));
  await NA.commit(wid, 2, () => true, { ...g0, t: [{ weapon: "grenade", vx: 1, vy: 1 }, { weapon: "triple", vx: 2, vy: 2 }] });
  await D.fire();
  check("watch: nový tah po klidu → onDoc a zpět na 3 s", got.length === 2 && got[1] === 3 && D.timers[0].ms === 3000, String(D.timers[0].ms));

  // poke / wake
  await NA.commit(wid, 3, () => true, { ...g0, t: [1, 2, 3].map(() => ({ weapon: "grenade", vx: 1, vy: 1 })) });
  D.Net.poke(); await flush();
  check("poke: okamžitý poll bez čekání na časovač", got.length === 3 && got[2] === 4);
  check("poke: po něm je znovu naplánován poll", D.timers.length === 1);
  await NA.commit(wid, 4, () => true, { ...g0, t: [1, 2, 3, 4].map(() => ({ weapon: "grenade", vx: 1, vy: 1 })) });
  await D.emit("focus", "win");
  check("wake: focus okna spustí poll", got.length === 4 && got[3] === 5);
  await NA.commit(wid, 5, () => true, { ...g0, t: [1, 2, 3, 4, 5].map(() => ({ weapon: "grenade", vx: 1, vy: 1 })) });
  D.hidden = true; await D.emit("visibilitychange", "doc");
  check("wake: skrytá stránka nepolluje", got.length === 4);
  D.hidden = false; await D.emit("visibilitychange", "doc");
  check("wake: visibilitychange po zviditelnění poll spustí", got.length === 5 && got[4] === 6);
  await NA.commit(wid, 6, () => true, { ...g0, t: [1, 2, 3, 4, 5, 6].map(() => ({ weapon: "grenade", vx: 1, vy: 1 })) });
  await D.emit("online", "win");
  check("wake: online spustí poll", got.length === 6 && got[5] === 7);
  await NA.commit(wid, 7, () => true, { ...g0, t: [1, 2, 3, 4, 5, 6, 7].map(() => ({ weapon: "grenade", vx: 1, vy: 1 })) });
  await D.emit("pageshow", "win", { persisted: true });
  check("wake: pageshow (bfcache) spustí poll", got.length === 7 && got[6] === 8);

  // chyby: backoff, netState, onNet, zotavení
  const nets = []; D.Net.onNet = s => nets.push(s);
  D.clock += 1; known = 8;
  server.down = true;
  const delays = [];
  for (let i = 0; i < 6; i++) { const t = await D.fire(); void t; delays.push(D.timers[0].ms); }
  check("backoff: 1. chyba 6 s, pak 12 s, 24 s, 48 s, strop 48 s", JSON.stringify(delays) === JSON.stringify([6000, 12000, 24000, 48000, 48000, 48000]), delays.join(","));
  check("netState: po 2 chybách „Spojení vázne“", D.Net.netState === "Spojení vázne, zkouším to znovu…");
  check("onNet: zavoláno jednou s hláškou", nets.length === 1 && nets[0] === "Spojení vázne, zkouším to znovu…", JSON.stringify(nets));
  D.clock += 31 * 60e3;                            // v klidu 30 min: základ 30 s → strop 60 s
  await D.fire();
  check("backoff: strop 60 s", D.timers[0].ms === 60000, String(D.timers[0].ms));
  server.down = false;
  await D.fire();
  check("zotavení: netState prázdný, onNet(\"\"), interval zpět", D.Net.netState === "" && nets.length === 2 && nets[1] === "" && D.timers[0].ms <= 30000, String(D.timers[0].ms));
  // 1 chyba ještě hlášku neukáže
  D.Net.poke(); await flush(); nets.length = 0; server.down = true;
  await D.fire();
  check("netState: jediná chyba hlášku nespustí", D.Net.netState === "" && nets.length === 0);
  server.down = false; await D.fire();

  // HTTP 5xx se chová jako síťová chyba
  server.status = 500; await D.fire(); await D.fire();
  check("backoff: HTTP 500 počítá jako chyba", D.Net.netState !== "");
  server.status = 0; await D.fire();

  // commit během pollingu: polling po dobu zápisu stojí a po zápisu se obnoví
  const before = D.timers.length;
  const cr = await D.Net.commit(wid, 8, () => true, { ...g0, t: [] });
  check("commit z pozorovatele: ok a polling dál naplánován", cr.ok && D.timers.length === 1 && before === 1);

  // unwatch
  D.Net.unwatch();
  check("unwatch: žádný časovač, netState prázdný", D.timers.length === 0 && D.Net.netState === "");
  await NA.commit(wid, 9, () => true, g0);
  const gets = server.gets; D.clock += 1e6; D.Net.poke(); await flush();
  check("unwatch: poke po unwatch nic nenačítá", server.gets === gets && D.timers.length === 0);

  // nové watch nahradí staré
  const calls = []; D.Net.watch(wid, () => calls.push("a"), () => 0); D.Net.watch(wid, () => calls.push("b"), () => 0);
  await D.fire();
  check("watch: druhé watch nahradí první", D.timers.length <= 1 && calls.join("") === "b", calls.join(""));
  D.Net.unwatch();

  console.log(`\n${pass}/${pass + fail} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
