/* Tančíky – sdílená místnost na mantledb.sh (bez účtu). Publikuje window.TankNet, viz SPEC.md.
   Dokument: https://mantledb.sh/v2/tancicky-<id>/hra  =  { app, v, s0, s1, u, g }
   Zápis = čti, ověř (v se nezměnilo, check(g) sedí), zapiš v+1. Polling 3 s / 10 s po 5 min / 30 s po 30 min klidu. */
(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const DEFAULT_API = "https://mantledb.sh/v2/";
  const APP = "tancicky";
  const NET_MSG = "Spojení vázne, zkouším to znovu…";
  const attempt = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };

  // ---------- bezpečné úložiště ----------
  const store = {
    get: k => attempt(() => root.localStorage.getItem(k), null),
    set: (k, v) => attempt(() => root.localStorage.setItem(k, v)),
  };
  const randId = n => {
    const c = root.crypto;
    if (c && c.getRandomValues) return [...c.getRandomValues(new Uint8Array(n))].map(b => (b % 36).toString(36)).join("");
    let s = ""; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 36).toString(36);
    return s;
  };
  let device = store.get("tanc-dev");
  if (!device) { device = randId(16); store.set("tanc-dev", device); }

  // ---------- HTTP ----------
  const TankNet = {
    API: (typeof root.TANK_API === "string" && root.TANK_API) || DEFAULT_API,
    device, store, randId, netState: "", onNet: null,
  };
  const base = () => TankNet.API.endsWith("/") ? TankNet.API : TankNet.API + "/";
  TankNet.setBase = url => { TankNet.API = url; };
  TankNet.docUrl = id => `${base()}${APP}-${id}/hra`;

  async function req(url, opt) {
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 10000);
    try { return await root.fetch(url, { ...(opt || {}), cache: "no-store", signal: ac.signal }); }
    finally { clearTimeout(timer); }
  }
  async function loadDoc(id) {
    const r = await req(TankNet.docUrl(id));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("load " + r.status);
    return r.json();
  }
  async function saveDoc(id, d) {
    const r = await req(TankNet.docUrl(id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, u: Date.now() }) });
    if (!r.ok) throw new Error("save " + r.status);
  }
  TankNet.load = loadDoc;

  // ---------- polling ----------
  let W = null, pollT = null, pollSeq = 0, lastChange = Date.now(), fails = 0, busy = 0;
  const isHidden = () => !!(root.document && root.document.hidden);
  function interval() {
    const idle = Date.now() - lastChange;
    // 1 s right after a move (the other side is usually watching), then 3 s / 10 s / 30 s
    const ms = idle < 90e3 ? 1000 : idle < 5 * 60e3 ? 3000 : idle < 30 * 60e3 ? 10000 : 30000;
    return fails ? Math.min(60000, Math.max(ms, 3000) * 2 ** Math.min(fails, 4)) : ms;
  }
  function schedule(ms) { clearTimeout(pollT); pollT = setTimeout(() => poll(false), ms); }
  function setNet(state) {
    if (TankNet.netState === state) return;
    TankNet.netState = state;
    const w = W, cb = (w && w.onNet) || TankNet.onNet;
    if (typeof cb === "function") attempt(() => cb(state));
  }
  async function poll(force) {
    clearTimeout(pollT); pollT = null;
    const w = W;
    if (!w || (!force && isHidden())) return;      // skrytá stránka nepolluje, probudí ji wake()
    if (busy) { schedule(1500); return; }
    const seq = ++pollSeq;
    let d;
    try { d = await loadDoc(w.id); }
    catch (e) {
      if (W !== w) return;
      if (seq !== pollSeq) { schedule(interval()); return; }
      fails++;
      if (fails >= 2) setNet(NET_MSG);
      schedule(interval());
      return;
    }
    if (W !== w) return;
    if (seq !== pollSeq || busy) { schedule(interval()); return; }
    fails = 0; setNet("");
    const known = typeof w.getV === "function" ? w.getV() : -1;
    if (d && d.v > known) {
      lastChange = Date.now();
      try { w.onDoc(d); } catch (e) { if (root.console) root.console.error(e); }
    }
    if (W === w) schedule(interval());
  }
  function wake() { if (W && !isHidden()) { lastChange = Date.now(); poll(false); } }

  TankNet.watch = (id, onDoc, getV, onNet) => {
    TankNet.unwatch();
    W = { id, onDoc, getV, onNet: onNet || null };
    fails = 0; lastChange = Date.now();
    schedule(3000);
  };
  TankNet.unwatch = () => {
    clearTimeout(pollT); pollT = null; pollSeq++; W = null; fails = 0;
    if (TankNet.netState) { TankNet.netState = ""; if (typeof TankNet.onNet === "function") attempt(() => TankNet.onNet("")); }
  };
  // hned načíst (UI to volá po vlastním zápisu)
  TankNet.poke = () => { if (W) { lastChange = Date.now(); poll(true); } };

  if (root.document && root.document.addEventListener) root.document.addEventListener("visibilitychange", wake);
  if (root.addEventListener) {
    root.addEventListener("pageshow", e => { if (!e || e.persisted) wake(); });
    root.addEventListener("online", wake);
    root.addEventListener("focus", wake);
  }

  // zápisy: po dobu zápisu polling stojí a po něm se obnoví
  async function exclusive(fn) {
    busy++; pollSeq++;
    try { return await fn(); }
    finally { busy--; if (W && !busy) schedule(interval()); }
  }

  // ---------- místnost ----------
  TankNet.create = async (g, seat) => {
    seat = seat === 1 ? 1 : 0;
    const id = randId(12);
    const doc = { app: APP, v: 1, s0: seat === 0 ? device : "", s1: seat === 1 ? device : "", u: Date.now(), g };
    await saveDoc(id, doc);
    TankNet.setSeat(id, seat);
    return { id, doc };
  };

  // čti-ověř-zapiš; reason: "conflict" (někdo byl rychlejší / check nesedí) | "net"
  TankNet.commit = (id, knownV, check, nextG) => exclusive(async () => {
    let d;
    try { d = await loadDoc(id); } catch (e) { return { ok: false, doc: null, reason: "net" }; }
    let okCheck = false;
    try { okCheck = !!d && d.v === knownV && (typeof check !== "function" || !!check(d.g)); } catch (e) { okCheck = false; }
    if (!okCheck) return { ok: false, doc: d, reason: "conflict" };
    const nd = { ...d, g: nextG, v: d.v + 1 };
    try { await saveDoc(id, nd); } catch (e) { return { ok: false, doc: d, reason: "net" }; }
    nd.u = Date.now(); lastChange = Date.now();
    return { ok: true, doc: nd, reason: "" };
  });

  // zabere volné místo tokenem zařízení; seat null = obsazeno (nebo hra neexistuje)
  TankNet.accept = id => exclusive(async () => {
    const d = await loadDoc(id);
    if (!d) return { seat: null, doc: null };
    if (d.s0 === device) { TankNet.setSeat(id, 0); return { seat: 0, doc: d }; }
    if (d.s1 === device) { TankNet.setSeat(id, 1); return { seat: 1, doc: d }; }
    const seat = !d.s0 ? 0 : !d.s1 ? 1 : null;
    if (seat === null) return { seat: null, doc: d };
    const nd = { ...d, v: d.v + 1, ["s" + seat]: device };
    await saveDoc(id, nd);
    // dva současně přijmuté výzvy: platí poslední zápis, kdo ho neudržel, má smůlu
    const chk = await loadDoc(id);
    if (!chk || chk["s" + seat] !== device) return { seat: null, doc: chk || d };
    TankNet.setSeat(id, seat); lastChange = Date.now();
    return { seat, doc: chk };
  });

  // ---------- identita a poslední hry ----------
  TankNet.mySeat = id => { const v = store.get("tanc-r-" + id); return v === "0" ? 0 : v === "1" ? 1 : null; };
  TankNet.setSeat = (id, seat) => store.set("tanc-r-" + id, seat === 0 || seat === 1 ? String(seat) : "");
  TankNet.recent = () => {
    const list = attempt(() => JSON.parse(store.get("tanc-rooms") || "[]"), []);
    return (Array.isArray(list) ? list : []).filter(r => r && /^[0-9a-z]{6,24}$/.test(r.id));
  };
  TankNet.remember = (id, info) => {
    const list = TankNet.recent().filter(r => r.id !== id);
    list.unshift({ ...(info || {}), id, t: Date.now() });
    store.set("tanc-rooms", JSON.stringify(list.slice(0, 5)));
  };

  root.TankNet = TankNet;
})();
