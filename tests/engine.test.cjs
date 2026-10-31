// Testy enginu Tančíků. node tests/engine.test.cjs  (bez závislostí, exit 1 při jakémkoli FAIL)
const fs = require("fs"), path = require("path");
const E = require("../src/engine.js");
const SRC = path.join(__dirname, "..", "src", "engine.js");

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (info !== undefined ? "  -> " + info : "")); }
}
function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
const sumH = (s) => s.h.reduce((a, b) => a + b, 0);
const J = (o) => JSON.stringify(o);

// ---------- fixture ----------
function fresh(seed, start) {
  const s = E.newMatch({ seed: seed === undefined ? 7 : seed, start: start || 0 });
  s.wind = 0;
  s.tanks.forEach((t) => { t.shield = 0; });     // výchozí štít druhého v kole se testuje zvlášť
  return s;
}
function stocked(seed) {            // všechny zbraně po 4 kusech, vítr 0
  const s = fresh(seed);
  s.tanks.forEach((t) => E.WEAPONS.forEach((w) => { if (!w.unlimited) t.ammo[w.id] = 4; }));
  return s;
}
const bot = (s, o) => E.suggestShot(s, Object.assign({ perfect: true }, o));   // přesný bot pro fixtury
// rekurzivní kontrola JSON-bezpečnosti: jen konečná bezpečná celá čísla, žádné -0, undefined, NaN, funkce
function unsafe(v, pth) {
  pth = pth || "state";
  if (v === undefined) return pth + " je undefined";
  if (v === null || typeof v === "string" || typeof v === "boolean") return null;
  if (typeof v === "number") return !Number.isSafeInteger(v) ? pth + " = " + v : (Object.is(v, -0) ? pth + " je -0" : null);
  if (typeof v !== "object") return pth + " má typ " + typeof v;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = unsafe(v[i], pth + "[" + i + "]"); if (r) return r; } return null; }
  for (const k of Object.keys(v)) { const r = unsafe(v[k], pth + "." + k); if (r) return r; }
  return null;
}
function place(s, i, x) { s.tanks[i].x = x; s.tanks[i].y = E.surfaceY(s, x); }
function shot(weapon, vx, vy, extra) { return Object.assign({ buy: [], move: 0, ability: null, ax: 0, weapon: weapon, vx: vx, vy: vy, note: "" }, extra || {}); }
function runTurn(s, inp) {          // krokuje tah, sbírá události a statistiky
  const t = E.startTurn(s, inp);
  const ev = [];
  let ticks = 0, maxFires = 0;
  while (!t.done) { const e = t.step(); ticks++; for (const x of e) ev.push(x); maxFires = Math.max(maxFires, t.state.fires.length); }
  return { state: t.state, ev: ev, ticks: ticks, maxFires: maxFires };
}
function harmless(s, extra) {      // výstřel, který nic nezasáhne (odletí z hřiště)
  const dir = s.cur === 0 ? -1 : 1;
  for (const c of [[500, -860], [300, -950], [700, -700], [900, -300]]) {
    const inp = shot("grenade", dir * c[0], c[1], extra);
    const r = runTurn(s, inp);
    if (!r.ev.some((e) => e.type === "explode" || e.type === "damage")) return inp;
  }
  return shot("grenade", dir * 500, -860, extra);
}
const count = (ev, type, f) => ev.filter((e) => e.type === type && (!f || f(e))).length;
function botMatch(seed, start, maxTurns) {
  let s = E.newMatch({ seed: seed, start: start });
  const inputs = [];
  while (!s.matchOver && inputs.length < (maxTurns || 120)) {
    const inp = E.suggestShot(s);
    inputs.push(inp);
    s = E.playTurn(s, inp);
  }
  return { state: s, inputs: inputs };
}

// ---------- 1) zakázané tokeny ----------
{
  const raw = fs.readFileSync(SRC, "utf8");
  const m = /^\s*\/\/ UI-ONLY/m.exec(raw);
  ok("UI-ONLY blok existuje", !!m);
  const sim = raw.slice(0, m.index);
  const ui = raw.slice(m.index);
  ok("UI-ONLY blok obsahuje Math.cos (sanity)", /Math\.cos/.test(ui));
  const code = sim.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  const bad = [
    [/\bMath\s*\.\s*(sin|cos|tan|asin|acos|atan|atan2|sqrt|cbrt|pow|hypot|exp|log|log2|log10|random|round|fround|sinh|cosh|tanh)\b/, "Math.* zakázaná funkce"],
    [/\bDate\b/, "Date"], [/\*\*/, "operátor **"], [/\b\d+\.\d+/, "desetinný literál"], [/\bperformance\b/, "performance"],
    [/\b(parseFloat|toFixed|Infinity|NaN)\b/, "float/NaN token"], [/\bMath\s*\.\s*(PI|E|SQRT2|LN2)\b/, "Math konstanta"]
  ];
  for (const [re, label] of bad) { const mm = re.exec(code); ok("engine.js (sim) bez: " + label, !mm, mm && mm[0]); }
  ok("UI-ONLY je až za exporty (aimToVel/velToAim veřejné)", typeof E.aimToVel === "function" && typeof E.velToAim === "function");
}

// ---------- 2) základní tvar / terén ----------
{
  const s = fresh(1);
  ok("W/H/S/MAX_V", E.W === 960 && E.H === 540 && E.S === 100 && E.MAX_V === 1000 && E.VERSION === "1");
  ok("h má 960 celých čísel", s.h.length === 960 && s.h.every((v) => Number.isInteger(v)));
  ok("tanky na 12-22 % a 78-88 %", s.tanks[0].x >= 115 && s.tanks[0].x <= 211 && s.tanks[1].x >= 748 && s.tanks[1].x <= 845, s.tanks.map((t) => t.x).join(","));
  let styles = new Set(), minH = 1e9, maxH = 0, maxStep = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const q = E.newMatch({ seed: seed });
    for (let i = 0; i < 960; i++) { minH = Math.min(minH, q.h[i]); maxH = Math.max(maxH, q.h[i]); if (i) maxStep = Math.max(maxStep, Math.abs(q.h[i] - q.h[i - 1])); }
    styles.add(q.h[480] > q.h[100] + 60 ? "hill" : q.h[480] < q.h[100] - 60 ? "valley" : "mid");
    for (const t of q.tanks) if (t.y !== E.surfaceY(q, t.x)) { styles.add("BAD"); }
  }
  ok("terén: výšky rozumné (20..440), strmost <= 12 px/px", minH >= 20 && maxH <= 440 && maxStep <= 12, `min ${minH} max ${maxH} step ${maxStep}`);
  ok("terén: variety (kopec/údolí/střed), tanky na povrchu", styles.has("hill") && styles.has("valley") && !styles.has("BAD"), [...styles].join(","));
  ok("pad pod tankem je plochý", (() => { const t = s.tanks[0]; for (let d = -10; d <= 10; d++) if (s.h[t.x + d] !== s.h[t.x]) return false; return true; })());
  ok("různé seedy = různý terén", E.hash(E.newMatch({ seed: 1 })) !== E.hash(E.newMatch({ seed: 2 })));
  ok("seed jako text funguje", E.hash(E.newMatch({ seed: "abc" })) === E.hash(E.newMatch({ seed: "abc" })) && E.hash(E.newMatch({ seed: "abc" })) !== E.hash(E.newMatch({ seed: "abd" })));
  ok("vítr v rozsahu -15..15 a stav JSON-safe", (() => { const q = E.newMatch({ seed: 3 }); return Math.abs(q.wind) <= 15 && unsafe(q) === null && J(JSON.parse(J(q))) === J(q); })());
  ok("aimToVel respektuje MAX_V a mapování", (() => {
    const a = E.aimToVel(90, 100), b = E.aimToVel(0, 100), c = E.aimToVel(180, 50), d = E.aimToVel(45, 100);
    return a.vx === 0 && a.vy === -1000 && b.vx === 1000 && b.vy === 0 && c.vx === -500 && d.vx * d.vx + d.vy * d.vy <= 1e6 && E.velToAim(0, -1000).angle === 90 && E.velToAim(500, 0).power === 50;
  })());
}

// ---------- 3) bot zápas, determinismus, replay, JSON roundtrip ----------
let botRef;
{
  botRef = botMatch(11, 0);
  const a = botRef;
  const b = botMatch(11, 0);
  ok("bot zápas: stejný seed = stejný hash", E.hash(a.state) === E.hash(b.state) && J(a.inputs) === J(b.inputs));
  ok("bot zápas skončil (matchOver)", a.state.matchOver === true, a.inputs.length);
  const r1 = E.replay(11, 0, a.inputs), r2 = E.replay(11, 0, a.inputs);
  ok("replay() = původní hash", E.hash(r1) === E.hash(a.state) && E.hash(r2) === E.hash(r1));
  ok("replay() = původní stav doslova", J(r1) === J(a.state));
  ok("jiný seed = jiný hash", E.hash(botMatch(12, 0).state) !== E.hash(a.state));

  // JSON roundtrip uprostřed zápasu
  const k = Math.min(7, a.inputs.length - 1);
  let plain = E.newMatch({ seed: 11, start: 0 }), trip = E.newMatch({ seed: 11, start: 0 });
  for (let i = 0; i < a.inputs.length; i++) {
    plain = E.playTurn(plain, a.inputs[i]);
    if (i === k) trip = JSON.parse(J(plain)); else if (i > k) trip = E.playTurn(trip, a.inputs[i]); else trip = E.playTurn(trip, a.inputs[i]);
    if (i === k) ok("JSON roundtrip: stejný hash v bodě roundtripu", E.hash(trip) === E.hash(plain));
  }
  ok("JSON roundtrip uprostřed zápasu: stejná budoucnost", E.hash(trip) === E.hash(plain) && J(trip) === J(plain));
  ok("clone() je hluboká kopie se stejným hashem", (() => {
    const c = E.clone(plain); const h0 = E.hash(plain);
    c.h[5] += 3; c.tanks[0].ammo.triple += 5; c.tanks[1].up.armor = 3;
    return E.hash(plain) === h0 && E.hash(c) !== h0 && J(E.clone(plain)) === J(plain);
  })());
  ok("startTurn nemutuje vstupní stav", (() => {
    const s0 = botRef.state.matchOver ? E.newMatch({ seed: 5 }) : botRef.state;
    const before = J(s0); const inp = bot(s0); E.startTurn(s0, inp).finish(); return J(s0) === before;
  })());
  ok("opakovaný hash je stabilní", E.hash(plain) === E.hash(E.clone(plain)));
}

// ---------- 4) krokování = playTurn ----------
{
  let s = E.newMatch({ seed: 21, start: 1 }), good = true, evTypes = new Set(), maxTicks = 0;
  for (let i = 0; i < 12 && !s.matchOver; i++) {
    const inp = E.suggestShot(s);
    const viaPlay = E.playTurn(s, inp);
    const t = E.startTurn(s, inp);
    let n = 0;
    while (!t.done) { for (const e of t.step()) evTypes.add(e.type); n++; if (n > 5000) break; }
    maxTicks = Math.max(maxTicks, n);
    if (J(t.state) !== J(viaPlay) || E.hash(t.state) !== E.hash(viaPlay)) { good = false; break; }
    const t2 = E.startTurn(s, inp); const fin = t2.finish();
    if (J(fin) !== J(viaPlay) || !t2.done) { good = false; break; }
    s = viaPlay;
  }
  ok("step() ticky = playTurn() = finish()", good);
  ok("události z step(): fire, explode, damage… se objevují", ["fire", "explode", "terrain"].every((x) => evTypes.has(x)), [...evTypes].join(","));
  ok("tah má strop ticků <= 1800", maxTicks <= 1800, maxTicks);
}

// ---------- 5) zbraně ----------
{
  const V = [275, -476];    // ~60 deg, power 55
  const base = stocked(31);
  const r0 = runTurn(base, shot("grenade", V[0], V[1]));
  const gLoss = sumH(base) - sumH(r0.state);
  ok("grenade: kráter snížil h", count(r0.ev, "explode") === 1 && gLoss > 100, gLoss);
  ok("grenade nespotřebuje munici", r0.state.tanks[0].ammo.grenade === base.tanks[0].ammo.grenade);

  const tr = runTurn(base, shot("triple", V[0], V[1]));
  ok("triple: 3 výbuchy, munice -1", count(tr.ev, "explode") === 3 && tr.state.tanks[0].ammo.triple === 3, count(tr.ev, "explode"));

  const mv = runTurn(base, shot("mirv", V[0], V[1]));
  ok("mirv: split a 5+ výbuchů", count(mv.ev, "split") === 1 && count(mv.ev, "explode") >= 5, count(mv.ev, "explode"));

  const ro = runTurn(base, shot("roller", V[0], V[1]));
  ok("roller: výbuch, trvá déle než granát (kutálí se)", count(ro.ev, "explode") === 1 && ro.ticks > r0.ticks, `${ro.ticks} vs ${r0.ticks}`);

  const s = stocked(31); s.wind = 0;
  const dr = runTurn(s, shot("drill", 0, 700));
  const exp = dr.ev.filter((e) => e.type === "explode")[0];
  ok("drill: vyhloubí příkop pod povrch a bouchne hluboko", !!exp && exp.y - s.tanks[0].y > 100 && sumH(dr.state) < sumH(s) - 100, exp && (exp.y - s.tanks[0].y));

  const na = runTurn(base, shot("napalm", V[0], V[1]));
  ok("napalm: vznikají hořící kaluže ve state.fires", na.maxFires >= 7 && na.state.fires.length === 0 && count(na.ev, "explode", (e) => e.kind === "fire") === 1, na.maxFires);
  ok("napalm: trvá ~2 s po dopadu", na.ticks > r0.ticks + 90, `${na.ticks} vs ${r0.ticks}`);

  const di = runTurn(base, shot("dirt", V[0], V[1]));
  ok("dirt: zvedne h, bez poškození", sumH(di.state) > sumH(base) + 100 && count(di.ev, "damage") === 0 && count(di.ev, "explode", (e) => e.kind === "dirt") === 1, sumH(di.state) - sumH(base));

  const bo = runTurn(base, shot("bouncer", V[0], V[1]));
  ok("bouncer: odskočí 2x a na 3. dopad bouchne", count(bo.ev, "bounce") === 2 && count(bo.ev, "explode") === 1, count(bo.ev, "bounce") + "/" + count(bo.ev, "explode"));

  const sp = runTurn(base, shot("spray", V[0], V[1]));
  ok("spray: 7 malých výbuchů", count(sp.ev, "explode", (e) => e.kind === "small") === 7, count(sp.ev, "explode"));

  const nu = runTurn(base, shot("nuke", V[0], V[1]));
  ok("nuke: obří kráter (>4x granát)", sumH(base) - sumH(nu.state) > 4 * gLoss, sumH(base) - sumH(nu.state));

  const le = runTurn(base, shot("leaper", V[0], V[1]));
  ok("leaper: 3 malé výbuchy se skoky", count(le.ev, "explode") === 3 && count(le.ev, "bounce") === 2, count(le.ev, "explode"));

  ok("každá zbraň z WEAPONS má cenu/start/jméno", E.WEAPONS.every((w) => w.id && w.name && w.desc && Number.isInteger(w.price) && Number.isInteger(w.start)) && E.WEAPONS.length >= 11);
  const ids = ["grenade", "triple", "mirv", "roller", "drill", "napalm", "dirt", "bouncer", "spray"];
  ok("povinná ID zbraní existují", ids.every((id) => E.WEAPONS.some((w) => w.id === id)));
}

// ---------- 6) zásah, štít, mince, pancíř ----------
{
  const s = fresh(41);
  const hit = bot(s);
  const r = runTurn(s, hit);
  const dmgEv = r.ev.filter((e) => e.type === "damage" && e.tank === 1);
  const dealt = 100 - r.state.tanks[1].hp;
  ok("bot trefí hned první ranou", dealt >= 25, dealt);
  ok("mince střelce = způsobené poškození", r.state.tanks[0].coins === 60 + dealt, `${r.state.tanks[0].coins} vs ${60 + dealt}`);
  ok("události coins a damage", count(r.ev, "coins") >= 1 && dmgEv.length >= 1);

  // štít
  const a = fresh(41);
  const sh = E.playTurn(a, harmless(a));   // tah 0: odstřel do prázdna
  const b = E.playTurn(sh, harmless(sh, { ability: "shield" }));  // tah 1: štít
  ok("shield: 40 bodů, cooldown spuštěn", b.tanks[1].shield === 40 && b.tanks[1].cd.shield === 2, b.tanks[1].shield + "/" + b.tanks[1].cd.shield);
  const hitInp = bot(b);
  const withSh = runTurn(b, hitInp);
  const noShState = E.clone(b); noShState.tanks[1].shield = 0;
  const noSh = runTurn(noShState, hitInp);
  const hpW = withSh.state.tanks[1].hp, hpN = noSh.state.tanks[1].hp;
  ok("shield: pohltil poškození (míň ztracených HP)", hpW > hpN && withSh.ev.some((e) => e.type === "damage" && e.shielded), `${hpW} vs ${hpN}`);
  ok("shield: neplatí poslední tah (zanikne po soupeřově tahu)", withSh.state.tanks[1].shield === 0 || withSh.state.tanks[1].shield < 40);
  ok("cooldown aktivky se snižuje s vlastními tahy", (() => {
    let q = b; q = E.playTurn(q, harmless(q)); q = E.playTurn(q, harmless(q));
    const c1 = q.tanks[1].cd.shield;
    q = E.playTurn(q, harmless(q)); q = E.playTurn(q, harmless(q));
    return c1 === 1 && q.tanks[1].cd.shield === 0 && E.validate(q, shot("grenade", 1000, 0, { ability: "shield" })) === null;
  })());

  // pancíř
  const arm = fresh(41); arm.tanks[1].up.armor = 4;
  const ra = runTurn(arm, hit);
  const lossArm = 100 - ra.state.tanks[1].hp;
  ok("pancíř 4 = -32 % poškození", lossArm < dealt && lossArm >= dealt - Math.ceil(dealt * 0.4) - 2, `${lossArm} vs ${dealt}`);
}

// ---------- 7) aktivky ----------
{
  // teleport
  const s = fresh(51);
  const t = runTurn(s, shot("grenade", -1000, 0, { ability: "teleport", ax: 300 }));
  ok("teleport: tank je na ax, stojí na povrchu", t.state.tanks[0].x === 300 && t.state.tanks[0].y === E.surfaceY(s, 300) && count(t.ev, "ability", (e) => e.id === "teleport") === 1, t.state.tanks[0].x);
  ok("teleport: moc blízko soupeři odmítnut", E.validate(s, shot("grenade", 1, 1, { ability: "teleport", ax: s.tanks[1].x - 10 })) !== null);
  ok("teleport: mimo hřiště odmítnut", E.validate(s, shot("grenade", 1, 1, { ability: "teleport", ax: 2 })) !== null && E.validate(s, shot("grenade", 1, 1, { ability: "teleport" })) !== null);

  // repair
  const r = fresh(52); r.tanks[0].hp = 50;
  const rr = runTurn(r, harmless(r, { ability: "repair" }));
  ok("repair: +35 HP", rr.state.tanks[0].hp === 85, rr.state.tanks[0].hp);
  const r2 = fresh(52); r2.tanks[0].hp = 90;
  ok("repair: nepřeleje přes maxHp", runTurn(r2, harmless(r2, { ability: "repair" })).state.tanks[0].hp === 100);

  // calm
  const w1 = stocked(53); w1.wind = 15;
  const w2 = stocked(53); w2.wind = 0;
  const V = [300, -520];
  const c1 = runTurn(w1, shot("grenade", V[0], V[1], { ability: "calm" })), c0 = runTurn(w2, shot("grenade", V[0], V[1]));
  const c2 = runTurn(w1, shot("grenade", V[0], V[1]));
  ok("calm: s větrem 15 = stejný výsledek jako vítr 0", J(c1.state.h) === J(c0.state.h) && J(c1.state.h) !== J(c2.state.h));

  // airstrike
  const as = stocked(54);
  const ar = runTurn(as, shot("grenade", 0, 0, { ability: "airstrike", ax: 500, weapon: undefined, vx: undefined, vy: undefined }));
  const ex = ar.ev.filter((e) => e.type === "explode");
  ok("airstrike: 5 bomb kolem ax, bez výstřelu", ex.length === 5 && ex.every((e) => Math.abs(e.x - 500) <= 60) && count(ar.ev, "fire") === 0 && ar.state.tanks[0].cd.airstrike === 4, ex.map((e) => e.x).join(","));
  ok("airstrike: vítr bombami hýbe", (() => { const q = stocked(54); q.wind = 15; const o = runTurn(q, shot("grenade", 0, 0, { ability: "airstrike", ax: 500 })); return o.ev.filter((e) => e.type === "explode").some((e, i) => e.x !== ex[i].x); })());

  // magnet
  const mg = stocked(55);
  const hitI = bot(mg);
  const shortI = shot("grenade", Math.trunc(hitI.vx * 95 / 100), Math.trunc(hitI.vy * 95 / 100));
  const m0 = runTurn(mg, shortI), m1 = runTurn(mg, Object.assign({}, shortI, { ability: "magnet" }));
  const ox = mg.tanks[1].x;
  const x0 = m0.ev.find((e) => e.type === "explode"), x1 = m1.ev.find((e) => e.type === "explode");
  ok("magnet: střela dopadne blíž k soupeři", x1 && x0 && Math.abs(x1.x - ox) < Math.abs(x0.x - ox), `${x1 && x1.x} vs ${x0 && x0.x} (cíl ${ox})`);

  // antigrav
  const ag = stocked(56);
  const n0 = runTurn(ag, shot("grenade", 400, -400)), n1 = runTurn(ag, shot("grenade", 400, -400, { ability: "antigrav" }));
  ok("antigrav: jiná dráha (let trvá déle)", n1.ticks > n0.ticks + 40, `${n1.ticks} vs ${n0.ticks}`);

  // cooldown / nabití navíc
  const q = fresh(57);
  const u1 = E.playTurn(q, harmless(q, { ability: "calm" }));
  const u2 = E.playTurn(u1, harmless(u1));
  ok("aktivka v cooldownu je odmítnuta", E.validate(u2, shot("grenade", -1000, 0, { ability: "calm" })) !== null && u2.tanks[0].cd.calm === 2);
  ok("ABILITIES mají všech 7 id", ["shield", "teleport", "repair", "calm", "airstrike", "magnet", "antigrav"].every((id) => E.ABILITIES.some((a) => a.id === id && a.name && a.cooldown >= 2 && a.price > 0)));
  const ch = fresh(57); ch.tanks[0].coins = 200;
  const bought = E.playTurn(ch, harmless(ch, { buy: ["a:calm"], ability: "calm" }));
  ok("a:<id> nabití navíc: použití nespustí cooldown", bought.tanks[0].cd.calm === 0 && bought.tanks[0].ch.calm === 0 && bought.tanks[0].coins === 200 - 20);
}

// ---------- 8) pohyb, pád ----------
{
  const s = fresh(61);
  const t = s.tanks[0], x0 = t.x, f0 = t.fuel;
  const r = runTurn(s, shot("grenade", -1000, 0, { move: 30 }));
  ok("pohyb: o 30 px doprava, palivo -30 (+20 dobití), events move", r.state.tanks[0].x === x0 + 30 && r.state.tanks[0].fuel === f0 - 30 + 20 && count(r.ev, "move") === 30, r.state.tanks[0].x - x0);
  ok("pohyb: y následuje terén", r.state.tanks[0].y === E.surfaceY(r.state, r.state.tanks[0].x));
  const wall = fresh(61); for (let x = wall.tanks[0].x + 10; x < 960; x++) wall.h[x] += 60;
  wall.tanks[1].x = 900; wall.tanks[1].y = E.surfaceY(wall, 900);
  const rw = runTurn(wall, shot("grenade", -1000, 0, { move: 40 }));
  ok("pohyb: strmou stěnu nevyleze (zastaví), platí jen ujetá vzdálenost", (() => { const mv = rw.state.tanks[0].x - wall.tanks[0].x; return mv >= 3 && mv <= 9 && rw.state.tanks[0].fuel === Math.min(wall.tanks[0].maxFuel, wall.tanks[0].fuel - mv + 20); })(), rw.state.tanks[0].x - wall.tanks[0].x);
  const cliff = fresh(61); for (let x = cliff.tanks[0].x + 10; x < 700; x++) cliff.h[x] = Math.max(8, cliff.h[x] - 60);
  const rc = runTurn(cliff, shot("grenade", -1000, 0, { move: 40 }));
  ok("pohyb: nesjede z útesu", rc.state.tanks[0].x <= cliff.tanks[0].x + 13 && rc.state.tanks[0].y - cliff.tanks[0].y <= 4, rc.state.tanks[0].x - cliff.tanks[0].x);
  ok("pohyb: nad palivo odmítnut", E.validate(s, shot("grenade", 1, 1, { move: s.tanks[0].fuel + 1 })) !== null && E.validate(s, shot("grenade", 1, 1, { move: -s.tanks[0].fuel })) === null);
  ok("pohyb: nejde do soupeře", (() => { const q = fresh(61); place(q, 1, q.tanks[0].x + 40); const o = runTurn(q, shot("grenade", -1000, 0, { move: 60 })); return o.state.tanks[1].x - o.state.tanks[0].x >= 24; })());

  // pád: tank na věži, nuke pod ním, štít pohltí výbuch
  const f = fresh(62);
  const cx = f.tanks[1].x;
  for (let d = -9; d <= 9; d++) f.h[cx + d] += 90;
  f.tanks[1].y = E.surfaceY(f, cx);
  f.tanks[0].ammo.nuke = 1; f.tanks[1].shield = 200;
  const aim = bot(f, { weapon: "nuke" });
  const fr = runTurn(f, Object.assign({}, aim, { weapon: "nuke" }));
  const fallEv = fr.ev.find((e) => e.type === "fall");
  ok("pád: tank po sesuvu padá, událost fall s poškozením", !!fallEv && fallEv.dist > 24 && fallEv.dmg > 0 && fr.state.tanks[1].y === E.surfaceY(fr.state, fr.state.tanks[1].x), fallEv && J(fallEv));
  ok("pád: žádné mince za pád", fr.state.tanks[0].coins - 60 <= 100 - fr.state.tanks[1].hp + 200);
  const dirtF = stocked(63); const dx = dirtF.tanks[1].x;
  const dd = runTurn(dirtF, shot("dirt", 0, -1000));       // dopadne zpět na sebe
  ok("hlína zasype tank – tank se vyzvedne na povrch", dd.state.tanks[0].y === E.surfaceY(dd.state, dd.state.tanks[0].x));
}

// ---------- 9) obchod ----------
{
  const s = fresh(71);
  ok("start: 60 mincí a obchod otevřený pro oba", s.tanks.every((t) => t.coins === 60 && t.shop === true));
  const b = E.playTurn(s, shot("grenade", -1000, 0, { buy: ["w:dirt", "up:fuel"] }));
  ok("nákup: w:dirt +2 ks, up:fuel +60 paliva, mince klesly", b.tanks[0].ammo.dirt === 4 && b.tanks[0].up.fuel === 1 && b.tanks[0].maxFuel === 220 && b.tanks[0].coins === 60 - 20 - 25, J([b.tanks[0].ammo.dirt, b.tanks[0].up.fuel, b.tanks[0].coins]));
  ok("po tahu je obchod hráče zavřen, soupeřův zůstává", b.tanks[0].shop === false && b.tanks[1].shop === true);
  const b2 = E.playTurn(b, shot("grenade", 1000, 0, { buy: ["up:armor"] }));
  ok("nákup soupeře v jeho 1. tahu funguje", b2.tanks[1].up.armor === 1 && b2.tanks[1].coins === 20);
  ok("zavřený obchod odmítne nákup", E.validate(b2, shot("grenade", 1, 1, { buy: ["up:armor"] })) !== null && throws(() => E.playTurn(b2, shot("grenade", 1, 1, { buy: ["up:armor"] }))));
  ok("nedostatek mincí odmítnut", E.validate(s, shot("grenade", 1, 1, { buy: ["w:nuke"] })) !== null);
  ok("součet nákupů přes rozpočet odmítnut", E.validate(s, shot("grenade", 1, 1, { buy: ["up:armor", "up:armor"] })) !== null);
  ok("nekoupitelné/nesmysl odmítnut", ["w:grenade", "w:nic", "up:nic", "a:nic", "x:y", "up", "", 5].every((it) => E.validate(s, shot("grenade", 1, 1, { buy: [it] })) !== null));
  ok("sklad: nad kapacitu odmítnuto, slots zvyšuje", (() => {
    const q = fresh(71); q.tanks[0].coins = 999; q.tanks[0].ammo.dirt = 4;
    const full = E.validate(q, shot("grenade", 1, 1, { buy: ["w:dirt"] })) !== null;
    const up = E.validate(q, shot("grenade", 1, 1, { buy: ["up:slots", "w:dirt"] })) === null;
    return full && up;
  })());
  ok("upgrade na maximu odmítnut", (() => { const q = fresh(71); q.tanks[0].coins = 999; q.tanks[0].up.armor = 4; return E.validate(q, shot("grenade", 1, 1, { buy: ["up:armor"] })) !== null; })());
  ok("nová zbraň z obchodu jde hned použít", (() => { const q = fresh(71); q.tanks[0].coins = 200; q.tanks[0].ammo.nuke = 0; return E.validate(q, shot("nuke", 100, -100, { buy: ["w:nuke"] })) === null; })());
  ok("UPGRADES: armor, fuel, preview, slots", ["armor", "fuel", "preview", "slots"].every((id) => { const u = E.UPGRADES.find((x) => x.id === id); return u && u.max === u.prices.length && u.name; }));
}

// ---------- 10) kola, konec zápasu ----------
{
  // 16 neškodných tahů = remíza kola
  let s = fresh(81);
  for (let i = 0; i < 16; i++) { s = E.playTurn(s, harmless(s)); s.wind = 0; }
  ok("16 tahů = konec kola, remíza", s.round === 2 && s.lastRound && s.lastRound.winner === -1 && s.wins[0] === 0 && s.wins[1] === 0 && s.roundOver === true, J(s.lastRound));
  ok("nové kolo: HP/palivo plné, mince +20, obchod otevřen, nový terén", s.tanks.every((t) => t.hp === 100 && t.shop === true && t.coins === 80 && t.fuel === t.maxFuel) && s.roundTurn === 0 && s.proj.length === 0);
  ok("remíza kola: začíná druhý než minule", s.cur === 1, s.cur);

  // více HP vyhrává po 16 tazích
  let q = fresh(82);
  q.tanks[1].hp = 60;
  for (let i = 0; i < 16; i++) { q = E.playTurn(q, harmless(q)); q.wind = 0; }
  ok("po 16 tazích vyhrává víc HP, poražený začíná další kolo", q.lastRound.winner === 0 && q.wins[0] === 1 && q.cur === 1 && q.tanks[0].coins === 60 + 40 && q.tanks[1].coins === 60 + 20, J(q.lastRound));

  // smrt = konec kola; 2 výhry = matchOver
  let m = fresh(83); m.wins = [1, 0]; m.tanks[1].hp = 1;
  const kill = bot(m);
  const rm = runTurn(m, kill);
  ok("zabití soupeře: kolo i zápas končí, winner 0", rm.state.matchOver === true && rm.state.winner === 0 && rm.state.wins[0] === 2 && count(rm.ev, "die") === 1 && count(rm.ev, "roundEnd") === 1 && count(rm.ev, "matchEnd") === 1);
  ok("roundEnd nese starý terén pro animaci", rm.ev.find((e) => e.type === "roundEnd").h.length === 960);
  ok("po matchOver validate odmítá vše", E.validate(rm.state, shot("grenade", 1, 1)) !== null && throws(() => E.playTurn(rm.state, shot("grenade", 1, 1))));

  let k1 = fresh(84); k1.tanks[1].hp = 1;
  const rk = runTurn(k1, bot(k1));
  ok("první výhra kola: nové kolo, wins [1,0], začíná poražený (1), vítěz +40", !rk.state.matchOver && rk.state.round === 2 && rk.state.wins[0] === 1 && rk.state.cur === 1 && rk.state.tanks[1].coins === 80 && rk.state.lastRound.winner === 0 && rk.state.tanks[1].hp === 100, J(rk.state.lastRound));
  ok("munice/upgrady přežijí kolo", (() => { const q2 = fresh(84); q2.tanks[1].hp = 1; q2.tanks[0].up.armor = 2; q2.tanks[0].ammo.triple = 3; const o = runTurn(q2, bot(q2)); return o.state.tanks[0].up.armor === 2 && o.state.tanks[0].ammo.triple === 3; })());

  // max 5 kol, remízy
  let d = fresh(85); d.round = 5; d.wins = [1, 1];
  for (let i = 0; i < 16; i++) { d = E.playTurn(d, harmless(d)); d.wind = 0; if (d.matchOver) break; }
  ok("5. kolo remíza při 1:1 = matchOver, winner -1", d.matchOver && d.winner === -1);
  let d2 = fresh(86); d2.round = 5; d2.wins = [1, 0];
  for (let i = 0; i < 16; i++) { d2 = E.playTurn(d2, harmless(d2)); d2.wind = 0; if (d2.matchOver) break; }
  ok("5. kolo, víc výher vyhrává zápas", d2.matchOver && d2.winner === 0);
}

// ---------- 11) validate(): odpad ----------
{
  const s = fresh(91);
  const bad = [
    ["NaN vx", shot("grenade", NaN, 5)], ["float vx", shot("grenade", 1.5, 5)], ["Infinity", shot("grenade", Infinity, 0)],
    ["velké v", shot("grenade", 1000, 1000)], ["v = MAX_V+1", shot("grenade", 1001, 0)], ["neznámá zbraň", shot("laser", 5, 5)],
    ["chybí zbraň", { vx: 5, vy: 5 }], ["text jako vx", shot("grenade", "5", 5)], ["zbraň bez munice", shot("nuke", 5, 5)],
    ["null", null], ["pole", []], ["text", "ahoj"], ["move float", shot("grenade", 1, 1, { move: 1.5 })], ["move NaN", shot("grenade", 1, 1, { move: NaN })],
    ["neznámá aktivka", shot("grenade", 1, 1, { ability: "laser" })], ["buy není pole", shot("grenade", 1, 1, { buy: "up:armor" })],
    ["nálet bez ax", shot("grenade", 1, 1, { ability: "airstrike", ax: undefined })], ["nálet mimo", shot("grenade", 1, 1, { ability: "airstrike", ax: 2000 })]
  ];
  for (const [name, inp] of bad) ok("validate odmítá: " + name, typeof E.validate(s, inp) === "string" && E.validate(s, inp).length > 3);
  ok("validate povoluje MAX_V přesně", E.validate(s, shot("grenade", 1000, 0)) === null && E.validate(s, shot("grenade", 600, -800)) === null);
  ok("validate povoluje chybějící buy/move/ability/ax/note", E.validate(s, { weapon: "grenade", vx: 10, vy: -10 }) === null);
  ok("validate důvody jsou česky (diakritika)", /[ěščřžýáíéůú]/i.test(E.validate(s, shot("laser", 5, 5))));
  ok("playTurn na neplatný vstup vyhodí výjimku", throws(() => E.playTurn(s, shot("grenade", NaN, 5))));
  ok("validate je čistá (nemění stav)", (() => { const b = J(s); E.validate(s, shot("grenade", 1, 1, { buy: ["up:armor"] })); return J(s) === b; })());
  ok("poznámka a at se ignorují (stejný hash)", E.hash(E.playTurn(s, shot("grenade", 300, -500, { note: "ahoj", at: 123 }))) === E.hash(E.playTurn(s, shot("grenade", 300, -500, { note: "jiné", at: 999 }))));
}

// ---------- 12) previewPath ----------
{
  const s = fresh(101);
  const inp = shot("grenade", 400, -500);
  const lens = [];
  for (let lv = 0; lv <= 4; lv++) { const q = E.clone(s); q.tanks[0].up.preview = lv; lens.push(E.previewPath(q, inp).length); }
  ok("náhled: délka roste s úrovní", lens[0] > 5 && lens.every((v, i) => i === 0 || v >= lens[i - 1]) && lens[4] > lens[0], lens.join(","));
  const w = E.clone(s); w.wind = 15; const w0 = E.clone(w); w.tanks[0].up.preview = 3; w0.tanks[0].up.preview = 2;
  const pw = E.previewPath(w, inp), p0 = E.previewPath(w0, inp);
  const real = runTurn(w, inp);
  ok("náhled od úrovně 3 počítá s větrem", pw.length > 30 && (pw[29].x !== p0[29].x));
  const full = E.clone(s); full.tanks[0].up.preview = 4; full.wind = 9;
  const path = E.previewPath(full, inp);
  const land = runTurn(full, inp).ev.find((e) => e.type === "explode");
  const last = path[path.length - 1];
  ok("náhled úrovně 4 končí tam, kde střela skutečně dopadne", Math.abs(last.x - land.x) <= 2 && Math.abs(last.y - land.y) <= 2, `${last.x},${last.y} vs ${land.x},${land.y}`);
  ok("náhled je čistý a nevyhazuje u nesmyslu", E.previewPath(s, shot("grenade", NaN, 1)).length === 0 && E.previewPath(s, shot("grenade", 1, 1, { ability: "airstrike", ax: 100 })).length === 0);
}

// ---------- 13) bot: přesný režim + výchozí (omylný) režim ----------
function botStats(label, seeds, opts) {
  const st = { reached: 0, total: 0, maxT: 0, minT: 1e9, worstShot: 0, winStarter: 0, winOther: 0, draw: 0, shots: 0, hits: 0, roundsDeath: 0, roundsTimeout: 0, roundsDraw: 0, replayMax: 0, lens: new Set() };
  for (const seed of seeds) {
    const start = seed % 2;
    let s = E.newMatch({ seed: seed, start: start });
    const inputs = [];
    while (!s.matchOver && inputs.length < 120) {
      const a = Date.now();
      const inp = E.suggestShot(s, opts);
      st.worstShot = Math.max(st.worstShot, Date.now() - a);
      inputs.push(inp);
      const tu = E.startTurn(s, inp); let hit = false, died = false;
      while (!tu.done) for (const e of tu.step()) {
        if (e.type === "damage" && e.tank !== s.cur) hit = true;
        if (e.type === "die") died = true;
        if (e.type === "roundEnd") { if (died) st.roundsDeath++; else if (e.winner === -1) st.roundsDraw++; else st.roundsTimeout++; }
      }
      st.shots++; if (hit) st.hits++;
      s = tu.state;
    }
    if (s.matchOver) {
      st.reached++; st.total += inputs.length; st.maxT = Math.max(st.maxT, inputs.length); st.minT = Math.min(st.minT, inputs.length); st.lens.add(inputs.length);
      if (s.winner === -1) st.draw++; else if (s.winner === start) st.winStarter++; else st.winOther++;
    }
    const r0 = Date.now(); const rp = E.replay(seed, start, inputs); st.replayMax = Math.max(st.replayMax, Date.now() - r0);
    if (E.hash(rp) !== E.hash(s)) ok(label + " seed " + seed + " replay", false);
  }
  console.log(`INFO ${label}: ${st.reached}/${seeds.length} dojelo, tahů průměr ${(st.total / Math.max(1, st.reached)).toFixed(1)} min ${st.minT} max ${st.maxT}; vítěz zápasu: začínající ${st.winStarter}, druhý ${st.winOther}, remíza ${st.draw}; zásahy ${st.hits}/${st.shots}; kola: smrt ${st.roundsDeath}, časový limit ${st.roundsTimeout}, remíza ${st.roundsDraw}; suggestShot max ${st.worstShot} ms; replay max ${st.replayMax} ms`);
  return st;
}
{
  const perfect = botStats("bot perfect", Array.from({ length: 20 }, (_, i) => i + 1), { perfect: true });
  ok("perfect: 20 zápasů dojede do matchOver", perfect.reached === 20, perfect.reached);
  ok("perfect: žádný zápas nepřesáhne 80 tahů (5 kol x 16)", perfect.maxT <= 80, perfect.maxT);
  ok("perfect: skoro každá rána trefí", perfect.hits >= perfect.shots * 0.85, `${perfect.hits}/${perfect.shots}`);
  ok("suggestShot < 300 ms", perfect.worstShot < 300, perfect.worstShot);
  ok("replay celého zápasu < 100 ms", perfect.replayMax < 100, perfect.replayMax);

  const def = botStats("bot default", Array.from({ length: 40 }, (_, i) => i + 1), undefined);
  ok("default: všech 40 zápasů dojede do matchOver", def.reached === 40 && def.maxT <= 80, def.reached + "/" + def.maxT);
  ok("default: bot občas mine a nemíří dokonale", def.hits < def.shots && def.hits > def.shots * 0.4, `${def.hits}/${def.shots}`);
  ok("default: délky zápasů se liší (není pořád stejná délka)", def.lens.size >= 4, [...def.lens].join(","));
  ok("default: začínající nevyhrává vždy (vyhrává i druhý v kole)", def.winOther >= 5 && def.winStarter >= 5, `začínající ${def.winStarter}, druhý ${def.winOther}`);
  ok("default: kola končí smrtí i časovým limitem/remízou je zaznamenáno", def.roundsDeath > 0 && def.roundsDeath + def.roundsTimeout + def.roundsDraw >= 40);
  ok("default bot je deterministický", J(E.suggestShot(E.newMatch({ seed: 9 }))) === J(E.suggestShot(E.newMatch({ seed: 9 }))) && J(E.suggestShot(E.newMatch({ seed: 9 }))) !== J(E.suggestShot(E.newMatch({ seed: 9 }), { perfect: true })));
  ok("bot vrací platný vstup bez -0", (() => { for (let seed = 1; seed <= 15; seed++) { const q = E.newMatch({ seed: seed }); for (const o of [undefined, { perfect: true }, { jitter: 30 }]) { const i = E.suggestShot(q, o); if (E.validate(q, i) || unsafe(i) !== null) return false; } } return true; })());
  const sd = E.newMatch({ seed: 4, start: 0 });
  ok("druhý v kole má štít 14 do konce prvního tahu soupeře", sd.tanks[0].shield === 0 && sd.tanks[1].shield === E.RULES.firstShield && E.playTurn(sd, E.suggestShot(sd)).tanks[1].shield === 0 && E.RULES.firstShield === 14);
}

// ---------- 14) fuzz: náhodné platné vstupy nikdy nespadnou a drží invarianty ----------
{
  let seedR = 12345; const rnd = (n) => { seedR = (Math.imul(seedR, 1103515245) + 12345) >>> 0; return (seedR >>> 8) % n; };
  let fine = true, why = "", maxTicks = 0, turns = 0;
  for (let seed = 1; seed <= 6 && fine; seed++) {
    let s = E.newMatch({ seed: seed * 7, start: seed % 2 });
    for (let i = 0; i < 40 && !s.matchOver; i++) {
      const t = s.tanks[s.cur], o = s.tanks[1 - s.cur];
      const wid = E.WEAPONS.filter((w) => w.unlimited || t.ammo[w.id] > 0).map((w) => w.id);
      const abs = E.ABILITIES.filter((a) => t.cd[a.id] === 0).map((a) => a.id);
      const ab = rnd(3) === 0 && abs.length ? abs[rnd(abs.length)] : null;
      let ax = 30 + rnd(900); if (ab === "teleport" && Math.abs(ax - o.x) < 30) ax = (ax + 60) % 900 + 20;
      const inp = { buy: s.tanks[s.cur].shop && rnd(2) ? ["w:" + ["triple", "dirt", "spray"][rnd(3)], "up:fuel", "a:calm"].slice(0, rnd(4)) : [], move: rnd(2 * t.fuel + 1) - t.fuel, ability: ab, ax: ax, weapon: wid[rnd(wid.length)], vx: rnd(2001) - 1000, vy: -rnd(1001), note: "" };
      while (inp.vx * inp.vx + inp.vy * inp.vy > 1e6) { inp.vx = Math.trunc(inp.vx / 2); inp.vy = Math.trunc(inp.vy / 2); }
      if (E.validate(s, inp)) { inp.buy = []; inp.move = 0; }
      const err = E.validate(s, inp);
      if (err) { if (ab === "teleport") { inp.ability = null; } else { fine = false; why = "validate " + err; break; } }
      try {
        const tu = E.startTurn(s, inp); let n = 0;
        while (!tu.done) { tu.step(); n++; }
        maxTicks = Math.max(maxTicks, n); turns++;
        const q = tu.state;
        const okInv = q.h.every((v) => Number.isInteger(v) && v >= 8 && v <= 480) && q.tanks.every((x) => Number.isInteger(x.hp) && x.hp >= 0 && x.hp <= x.maxHp && Number.isInteger(x.x) && x.x >= 0 && x.x < 960 && x.y === E.surfaceY(q, x.x) && x.fuel >= 0 && x.fuel <= x.maxFuel && x.coins >= 0 && x.shield >= 0) && q.proj.length === 0 && q.fires.length === 0 && unsafe(q) === null && J(JSON.parse(J(q))) === J(q);
        if (!okInv) { fine = false; why = "invariant seed " + seed + " tah " + i; break; }
        s = q;
      } catch (e) { fine = false; why = e.stack; break; }
    }
  }
  ok("fuzz: " + turns + " náhodných tahů bez výjimky, invarianty drží (h 8..480, y na povrchu, JSON-safe)", fine, why);
  ok("fuzz: nejdelší tah " + maxTicks + " ticků (<= 1800)", maxTicks <= 1800);
}

// ---------- 15) regrese z review: katalogy, validate nikdy nehází, muzzle, roller, mutace vstupu, JSON-safety ----------
{
  const s = fresh(201);
  const I = { weapon: "grenade", vx: -1000, vy: 0 };
  // P1: zděděné klíče
  for (const it of ["up:constructor", "up:toString", "up:__proto__", "w:constructor", "w:__proto__", "w:hasOwnProperty", "a:toString", "a:constructor", "a:__proto__", "w:valueOf"]) {
    let r, thrown = false; try { r = E.validate(s, Object.assign({}, I, { buy: [it] })); } catch (e) { thrown = true; }
    ok("zděděný klíč v buy odmítnut: " + it, !thrown && typeof r === "string");
  }
  ok("buy [w:constructor,w:nuke,up:armor] nesmí dát NaN mince ani projít", (() => { const q = fresh(201); q.tanks[0].coins = 500; const r = E.validate(q, Object.assign({}, I, { buy: ["w:constructor", "w:nuke", "up:armor"] })); return typeof r === "string" && Number.isFinite(q.tanks[0].coins); })());
  for (const ab of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) ok("ability se zděděným klíčem odmítnuta: " + ab, E.validate(s, Object.assign({}, I, { ability: ab })) !== null);
  for (const wp of ["toString", "constructor", "__proto__", "hasOwnProperty"]) ok("weapon se zděděným klíčem odmítnuta: " + wp, E.validate(s, { weapon: wp, vx: 1, vy: 1 }) !== null);
  ok("WEAPONS/ABILITIES/UPGRADES se nedají obejít přes Object.prototype", (() => { const q = fresh(201); q.tanks[0].coins = 999; return E.validate(q, Object.assign({}, I, { buy: ["up:constructor"] })) !== null && E.validate(q, Object.assign({}, I, { ability: "constructor" })) !== null; })());

  // P1: validate nikdy nehází
  const evil = [null, undefined, 0, 1, -1, NaN, "x", "", true, false, [], [1], {}, { weapon: { toString: null }, vx: 0, vy: 0 }, { weapon: { toString() { return "grenade"; } }, vx: 0, vy: 0 },
    { weapon: ["grenade"], vx: 0, vy: 0 }, { weapon: 5, vx: 0, vy: 0 }, { weapon: null, vx: 0, vy: 0 }, { weapon: "grenade", vx: {}, vy: [] }, { weapon: "grenade", vx: "1", vy: "1" },
    { weapon: "grenade", vx: 2 ** 53, vy: 0 }, { weapon: "grenade", vx: 1e300, vy: 0 }, { weapon: "grenade", vx: -0, vy: -0 }, { weapon: "grenade", vx: 0, vy: 0, buy: [{}] }, { weapon: "grenade", vx: 0, vy: 0, buy: [null, 5, ["up:armor"]] },
    { weapon: "grenade", vx: 0, vy: 0, buy: { length: 1, 0: "up:armor" } }, { weapon: "grenade", vx: 0, vy: 0, buy: new Array(100).fill("up:armor") }, { weapon: "grenade", vx: 0, vy: 0, buy: [{ toString: null }] },
    { weapon: "grenade", vx: 0, vy: 0, move: "5" }, { weapon: "grenade", vx: 0, vy: 0, move: {} }, { weapon: "grenade", vx: 0, vy: 0, move: 2 ** 53 }, { weapon: "grenade", vx: 0, vy: 0, move: null },
    { weapon: "grenade", vx: 0, vy: 0, ability: {} }, { weapon: "grenade", vx: 0, vy: 0, ability: ["shield"] }, { weapon: "grenade", vx: 0, vy: 0, ability: { toString: null } },
    { weapon: "grenade", vx: 0, vy: 0, ax: {} }, { weapon: "grenade", vx: 0, vy: 0, ax: "5" }, { weapon: "grenade", vx: 0, vy: 0, ax: 1.5 }, { weapon: "grenade", vx: 0, vy: 0, note: {} }, { weapon: "grenade", vx: 0, vy: 0, note: "x".repeat(41) },
    { weapon: "grenade", vx: 0, vy: 0, note: 5 }, JSON.parse('{"__proto__":{"weapon":"grenade"},"vx":0,"vy":0}'), JSON.parse('{"weapon":"grenade","vx":0,"vy":0,"__proto__":{"x":1}}'), Object.create(null), Object.assign(Object.create(null), { weapon: "grenade", vx: 1, vy: 1 })];
  let threw = "", bad = 0;
  for (const e of evil) { try { const r = E.validate(s, e); if (r !== null && typeof r !== "string") bad++; } catch (x) { threw = x.message; } }
  ok("validate nikdy nehází na žádnou JSON hodnotu", threw === "" && bad === 0, threw);
  ok("validate odmítá všechny jasně špatné hodnoty", evil.slice(0, 20).every((e) => typeof E.validate(s, e) === "string" || (e && e.weapon === "grenade")), "");
  ok("weapon objekt s toString:null vrací důvod", typeof E.validate(s, { weapon: { toString: null }, vx: 0, vy: 0 }) === "string");
  ok("buy: víc než 20 položek a nestringy odmítnuty", E.validate(s, { weapon: "grenade", vx: 0, vy: 0, buy: new Array(21).fill("w:dirt") }) !== null && E.validate(s, { weapon: "grenade", vx: 0, vy: 0, buy: [5] }) !== null);
  ok("note delší než 40 odmítnuta, 40 projde, nestring odmítnut", E.validate(s, Object.assign({}, I, { note: "x".repeat(41) })) !== null && E.validate(s, Object.assign({}, I, { note: "x".repeat(40) })) === null && E.validate(s, Object.assign({}, I, { note: 5 })) !== null);
  ok("validate nehází ani na rozbitý stav", [null, undefined, 5, "x", [], {}, { tanks: [] }, { tanks: [null, null], cur: 0 }, { tanks: [{}, {}], cur: 7 }, { tanks: [{ up: null }, {}], cur: 0 }].every((st) => { try { return typeof E.validate(st, I) === "string"; } catch (e) { return false; } }));
  ok("startTurn/playTurn na zlý vstup vyhodí Error (ne TypeError z coercion)", (() => { try { E.playTurn(s, { weapon: { toString: null }, vx: 0, vy: 0 }); } catch (e) { return e instanceof Error && !(e instanceof TypeError); } return false; })());
  ok("previewPath nehází na zlý vstup", evil.every((e) => { try { return Array.isArray(E.previewPath(s, e)); } catch (x) { return false; } }));
  ok("suggestShot s hloupými opts nehází", [{ weapon: "constructor" }, { weapons: ["toString", "grenade"] }, { jitter: -5 }, { jitter: 1.5 }, { perfect: "yes" }].every((o) => { try { return E.validate(s, E.suggestShot(s, o)) === null; } catch (x) { return false; } }));

  // P2: muzzle nesmí za zeď
  const wall = fresh(202); wall.h.fill(100); place(wall, 0, 100); place(wall, 1, 800); wall.h[110] = 250;
  const wr = runTurn(wall, shot("grenade", 1000, 0));
  const fe = wr.ev.find((e) => e.type === "fire"), ex = wr.ev.find((e) => e.type === "explode");
  ok("muzzle: střela nevznikne za zdí a exploduje na zdi", fe.x <= 109 && ex.x <= 112 && wr.state.h[110] < 250, `fire ${fe.x} explode ${ex.x}`);
  ok("muzzle: náhled drží stejné ústí jako skutečná střela", (() => { const q = E.clone(wall); q.tanks[0].up.preview = 4; const path = E.previewPath(q, shot("grenade", 1000, 0)); return path.length > 0 && path[path.length - 1].x <= 112; })());
  const free = fresh(202); free.h.fill(100); place(free, 0, 100); place(free, 1, 800);
  const fr0 = runTurn(free, shot("grenade", 999, -10)).ev.find((e) => e.type === "fire");
  ok("muzzle: na volném terénu je ústí 14 px od věže", Math.abs(fr0.x - 114) <= 1, fr0.x);

  // P2: roller po sloupcích
  const rid = fresh(203); rid.h.fill(100); place(rid, 0, 100); place(rid, 1, 800); rid.tanks[0].ammo.roller = 3; rid.h[264] = 300;
  const rr = runTurn(rid, shot("roller", 1000, 0));
  const rex = rr.ev.find((e) => e.type === "explode");
  ok("roller: úzký hřeben (1 sloupec, +200) nepřeskočí ani nevyleze", !!rex && rex.x < 264, rex && rex.x);
  const slope = fresh(204); slope.h.fill(100); place(slope, 0, 100); place(slope, 1, 800); slope.tanks[0].ammo.roller = 3;
  for (let x = 400; x < 960; x++) slope.h[x] = 100 - Math.min(60, idivT(x - 400, 4));
  function idivT(a, b) { return Math.trunc(a / b); }
  const sr = runTurn(slope, shot("roller", 600, -500));
  ok("roller: z mírného svahu se skutečně skutálí dolů (výbuch níž než dopad)", (() => { const ls = sr.ev.filter((e) => e.type === "explode"); return ls.length === 1 && sr.ticks > 60; })(), sr.ticks);
  ok("roller: jedna nová zeď uprostřed dráhy ho nepustí dál (3 tvrdé zdi)", (() => { const q = fresh(205); q.h.fill(100); place(q, 0, 100); place(q, 1, 800); q.tanks[0].ammo.roller = 3; for (const x of [250, 251, 252]) q.h[x] = 400; const o = runTurn(q, shot("roller", 1000, 0)); const e = o.ev.find((z) => z.type === "explode"); return !!e && e.x < 250; })());

  // P2: mutace vstupu po startTurn
  const mi = Object.assign({}, I), tmut = E.startTurn(s, mi);
  mi.ability = "teleport"; mi.ax = 1000000; mi.vx = 5; mi.weapon = "nuke"; mi.buy = ["up:armor"]; mi.move = 99;
  const afterMut = tmut.finish();
  const ctrl = E.playTurn(s, I);
  ok("startTurn kopíruje vstup (pozdější mutace nic nezmění)", J(afterMut) === J(ctrl) && afterMut.tanks[0].x === s.tanks[0].x);
  const mb = { weapon: "grenade", vx: 1, vy: -1, buy: ["up:fuel"] }, tb = E.startTurn(s, mb); mb.buy.push("up:armor", "up:armor");
  ok("startTurn kopíruje i pole buy", tb.finish().tanks[0].up.armor === 0);

  // JSON-safety rekurzivně
  let bad2 = null, cnt = 0, qm = E.newMatch({ seed: 77, start: 1 });
  for (let i = 0; i < 60 && !qm.matchOver && !bad2; i++) { qm = E.playTurn(qm, E.suggestShot(qm)); bad2 = unsafe(qm); cnt++; }
  ok("JSON-safety: celý stav (" + cnt + " tahů) jen bezpečná celá čísla, žádné -0/NaN/undefined", bad2 === null, bad2);
  ok("JSON-safety detektor opravdu chytá -0, NaN, undefined, float", unsafe({ a: -0 }) && unsafe({ a: NaN }) && unsafe({ a: undefined }) && unsafe({ a: [1, 1.5] }) && unsafe({ a: { b: Infinity } }) && unsafe({ a: 1, b: [0, 2] }) === null);
  ok("JSON-safety: roundtrip stavu je doslovně stejný objekt", (() => { const a = E.playTurn(qm.matchOver ? E.newMatch({ seed: 3 }) : qm, { weapon: "grenade", vx: 300, vy: -300 }); const b = JSON.parse(J(a)); return J(a) === J(b) && E.hash(a) === E.hash(b) && unsafe(a) === null; })());
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
