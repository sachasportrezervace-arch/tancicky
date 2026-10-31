/* Tančíky: ovládání, obrazovky, lokální režim, online tok přes TankNet, přehrávka tahů, obchod, konec a odveta.
   Stav zápasu = seed + vstupy (g.t). Všechno ostatní se z toho přehraje enginem. */
(function () {
  "use strict";
  var E = window.TankEngine, NET = window.TankNet, TR = window.TankRender;
  var $ = function (id) { return document.getElementById(id); };
  var W = 960, H = 540;
  var attempt = function (f, fb) { try { return f(); } catch (e) { return fb; } };
  var store = (NET && NET.store) || { get: function (k) { return attempt(function () { return localStorage.getItem(k); }, null); }, set: function (k, v) { attempt(function () { localStorage.setItem(k, v); }); } };
  var calm = function () { return attempt(function () { return matchMedia("(prefers-reduced-motion: reduce)").matches; }, false); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var icon = function (n) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rnd31 = function () { var a = new Uint32Array(1); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : (a[0] = Math.random() * 4294967296); return a[0] & 0x7fffffff; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  if (!E || !TR) { document.body.dataset.view = "info"; $("infoTitle").textContent = "Hra se nenačetla."; $("infoMeta").textContent = "Chybí část kódu. Zkus stránku obnovit."; return; }

  var WEAPON_ICON = { grenade: "bomb", triple: "triple", mirv: "mirv", roller: "roller", drill: "drill", napalm: "napalm", dirt: "dirt", bouncer: "bouncer", spray: "spray", nuke: "nuke", leaper: "leaper" };
  var wIcon = function (id) { return WEAPON_ICON[id] || "bomb"; };
  var TARGETED = { teleport: true, airstrike: true };
  var STAKES = {
    "1": { text: "Kdo prohraje, platí kafe.", third: function (w, l) { return l + " platí kafe."; }, win: function (w, l) { return l + " ti platí kafe."; }, lose: function () { return "Kafe platíš ty."; } },
    "2": { text: "Vítěz vybírá místo na rande.", third: function (w) { return w + " vybírá místo na rande."; }, win: function () { return "Místo na rande vybíráš ty."; }, lose: function (w) { return w + " vybírá místo na rande."; } },
    "3": { text: "Kdo prohraje, zve na zmrzlinu.", third: function (w, l) { return l + " zve na zmrzlinu."; }, win: function (w, l) { return l + " tě zve na zmrzlinu."; }, lose: function () { return "Na zmrzlinu zveš ty."; } },
    "4": { text: "Vítěz vybírá film na večer.", third: function (w) { return w + " vybírá film na večer."; }, win: function () { return "Film na večer vybíráš ty."; }, lose: function (w) { return w + " vybírá film na večer."; } },
    "5": { text: "Kdo prohraje, pravdivě odpoví na jednu otázku.", third: function (w, l) { return l + " pravdivě odpoví na jednu otázku."; }, win: function (w, l) { return l + " ti pravdivě odpoví na jednu otázku."; }, lose: function () { return "Odpovídáš na jednu otázku. Pravdivě."; } },
    "6": { text: "Jen o čest.", third: function (w) { return "Čest patří: " + w + "."; }, win: function () { return "Čest je tvoje."; }, lose: function (w) { return "Čest patří: " + w + "."; } }
  };
  function stakeOf(g) {
    if (!g) return null;
    if (STAKES[g.k]) return STAKES[g.k];
    if (g.k === "c" && g.kc) { var t = g.kc; return { text: t, third: function (w) { return w + " vyhrává sázku: " + t; }, win: function () { return "Vyhráváš sázku: " + t; }, lose: function (w) { return w + " vyhrává sázku: " + t; } }; }
    return null;
  }

  /* ---------------- stav ---------------- */
  var S = { mode: null, id: null, v: -1, g: null, doc: null, s0: "", s1: "", seat: null, free: null, shown: null, state: null, turn: null, pumping: false, pumpP: Promise.resolve(), committing: false, fast: false, animDone: null, corrupt: false, localKey: 0 };
  var C = { angle: 55, power: 60, weapon: "grenade", move: 0, ability: null, ax: null, cart: [], mem: [{ angle: 55, power: 60 }, { angle: 125, power: 60 }], wmem: ["grenade", "grenade"], key: "", shopDone: "", previewDirty: true, preview: null };
  var view = "setup";
  var R = null; // renderer
  var bubble = { idx: -1, text: "", until: 0 };
  var Snd = window.TankSound || null;
  var sfx = function (n, a) { if (Snd) Snd.play(n, a); };
  var buzz = function (p) { if (Snd) Snd.buzz(p); };
  var cc = { manual: false, has: false, fx: 0, fy: 0, impactUntil: 0, ix: 0, iy: 0 }; // kamera: rucni rezim, sledovani strely, dojezd na dopad
  var touchy = attempt(function () { return matchMedia("(pointer: coarse)").matches; }, false);

  var names = function () { return (S.g && S.g.n) || ["Hráč 1", "Hráč 2"]; };
  var nameOf = function (i) { return names()[i] || "Hráč"; };
  var cur = function () { return S.state ? S.state.cur : 0; };
  var curTank = function () { return S.state && S.state.tanks[S.state.cur]; };
  var myTurnOnline = function () { return S.mode === "online" && S.seat != null && S.state && S.seat === S.state.cur; };
  function canAct() {
    if (!S.state || S.state.matchOver || S.turn || S.pumping || S.committing || S.corrupt) return false;
    if (S.shown && S.g && S.shown.t.length !== S.g.t.length) return false;
    if (S.mode === "local") return true;
    if (S.mode === "online") return S.seat != null && S.seat === S.state.cur;
    return false;
  }
  var spectating = function () { return S.mode === "online" && S.seat == null; };

  /* ---------------- zobrazení ---------------- */
  function setView(v) {
    view = v; document.body.dataset.view = v;
    if (v === "play") { layout(); }
    updateTitle();
    var sc = document.querySelector("#v-" + v + " .scroll"); if (sc) sc.scrollTop = 0;
  }
  function updateTitle() {
    var mine = view === "play" && S.mode === "online" && myTurnOnline() && !S.state.matchOver && !S.pumping && !S.turn && !S.committing;
    document.title = mine ? "Jsi na tahu · Tančíky" : "Tančíky";
  }
  function toast(text) {
    var t = $("toast"); t.textContent = text; t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3000);
  }
  async function copyText(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch (e) { var ta = $("shareMsg"); if (view === "share") { ta.focus(); ta.select(); toast("Označeno, zkopíruj to ručně."); } else window.prompt("Zkopíruj si to:", text); }
  }
  var linkFor = function (id) { return location.href.split("#")[0] + "#r." + id; };

  function layout() {
    var wrap = $("stageWrap"), st = $("stage"); if (!wrap || view !== "play") return;
    var r = wrap.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return;
    var w = Math.min(r.width, r.height * 1.9), h = r.height; // sirsi nez 1.9:1 by ukazalo okraj sveta
    if (r.width > 560) h = Math.min(h, w / 1.5); // na siroke obrazovce nechceme pul plochy prazdneho nebe
    st.style.width = Math.floor(w) + "px"; st.style.height = Math.floor(h) + "px";
    if (R && R.resize()) camRefresh();
  }

  /* ---------------- HUD ---------------- */
  var hudSig = "";
  function updateHud(st) {
    if (!st) return;
    var sig = JSON.stringify([st.tanks.map(function (t) { return [t.hp, t.maxHp, t.coins, t.shield, t.alive]; }), st.wins, st.round, st.wind, st.cur, st.matchOver, S.g && S.g.n, S.g && S.g.gi, S.g && S.g.w, !!S.turn]);
    if (sig === hudSig) return; hudSig = sig;
    var need = (E.RULES && E.RULES.winRounds) || 2;
    for (var i = 0; i < 2; i++) {
      var t = st.tanks[i], card = $("pc" + i), pct = clamp(t.hp / (t.maxHp || 100), 0, 1);
      card.querySelector(".pname").textContent = nameOf(i);
      var bar = card.querySelector(".hpbar"); bar.firstElementChild.style.width = Math.round(pct * 100) + "%";
      bar.classList.toggle("low", pct < .55 && pct >= .3); bar.classList.toggle("crit", pct < .3);
      card.querySelector(".hptxt").textContent = Math.max(0, t.hp);
      card.querySelector(".coins b").textContent = t.coins;
      var sh = card.querySelector(".shieldtag"); sh.hidden = !(t.shield > 0);
      var pips = card.querySelector(".pips"); var html = "";
      for (var k = 0; k < need; k++) html += '<svg class="pip' + (k < st.wins[i] ? " on" : "") + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-star"/></svg>';
      pips.innerHTML = html;
      card.classList.toggle("active", st.cur === i && !st.matchOver);
      card.classList.toggle("dead", !t.alive);
    }
    $("roundTxt").textContent = "Kolo " + st.round;
    var wd = st.wind || 0, aw = Math.abs(wd), box = $("windBox");
    box.dataset.dir = wd < 0 ? "-1" : "1"; box.dataset.n = aw === 0 ? "0" : String(Math.min(4, Math.ceil(aw / 4)));
    $("windTxt").textContent = aw; box.title = aw === 0 ? "Bezvětří" : "Vítr " + aw + (wd < 0 ? " doleva" : " doprava");
    var g = S.g, ser = "";
    if (g && (g.gi > 1 || (g.w && (g.w[0] || g.w[1])))) ser = "odveta " + (g.gi - 1) + " · série " + g.w[0] + ":" + g.w[1];
    $("seriesTxt").textContent = ser;
  }

  /* ---------------- obchod: stejné počty jako engine ---------------- */
  function simTank(t, cart) {
    var sim = { coins: t.coins, up: Object.assign({}, t.up), ammo: Object.assign({}, t.ammo), ch: Object.assign({}, t.ch || {}) };
    var why = null;
    for (var i = 0; i < cart.length && !why; i++) why = applyBuyUI(sim, cart[i]);
    return { sim: sim, why: why };
  }
  function applyBuyUI(t, item) {
    var p = item.indexOf(":"), kind = item.slice(0, p), id = item.slice(p + 1), cap = 4 + 2 * (t.up.slots | 0), i, o;
    if (kind === "up") { o = E.UPGRADES.filter(function (u) { return u.id === id; })[0]; if (!o) return "Neznámý upgrade."; var lv = t.up[id] | 0; if (lv >= o.max) return "Už je na maximu."; if (t.coins < o.prices[lv]) return "Nemáš dost mincí."; t.coins -= o.prices[lv]; t.up[id] = lv + 1; return null; }
    if (kind === "w") { o = E.WEAPONS.filter(function (w) { return w.id === id; })[0]; if (!o || o.unlimited) return "Tohle koupit nejde."; if (t.coins < o.price) return "Nemáš dost mincí."; if ((t.ammo[id] | 0) + o.pack > cap) return "Sklad je plný."; t.coins -= o.price; t.ammo[id] = (t.ammo[id] | 0) + o.pack; return null; }
    if (kind === "a") { o = E.ABILITIES.filter(function (a) { return a.id === id; })[0]; if (!o) return "Neznámá schopnost."; if (t.coins < o.price) return "Nemáš dost mincí."; if ((t.ch[id] | 0) >= 3) return "Víc nabití se nevejde."; t.coins -= o.price; t.ch[id] = (t.ch[id] | 0) + 1; return null; }
    void i; return "Neznámá položka.";
  }
  function effTank() { var t = curTank(); return t ? simTank(t, C.cart).sim : null; }

  function renderShop() {
    var st = S.state, t = curTank(); if (!st || !t) return;
    var res = simTank(t, C.cart), sim = res.sim, cap = 4 + 2 * (sim.up.slots | 0), html = "";
    $("shopWho").textContent = S.mode === "local" ? nameOf(st.cur) + " nakupuje" : "Před kolem " + st.round;
    $("shopCoins").textContent = sim.coins;
    var cnt = function (item) { return C.cart.filter(function (x) { return x === item; }).length; };
    html += "<h3>Upgrady</h3>";
    E.UPGRADES.forEach(function (u) {
      var lv = t.up[u.id] | 0, nl = sim.up[u.id] | 0, maxed = nl >= u.max, price = maxed ? 0 : u.prices[nl], dis = maxed || sim.coins < price;
      var pips = ""; for (var i = 0; i < u.max; i++) pips += '<i class="' + (i < lv ? "on" : i < nl ? "new" : "") + '"></i>';
      html += '<button type="button" class="srow" data-buy="up:' + u.id + '"' + (dis ? " disabled" : "") + '><span class="medal rose">' + icon(u.id) + '</span><span><span class="nm">' + esc(u.name) + ' <span class="lvl">' + pips + '</span></span><span class="ds">' + esc(u.desc) + '</span></span>' + priceChip(maxed ? null : price) + "</button>";
    });
    html += "<h3>Zbraně</h3>";
    E.WEAPONS.forEach(function (w) {
      if (w.unlimited) return;
      var have = sim.ammo[w.id] | 0, full = have + w.pack > cap, dis = full || sim.coins < w.price, n = cnt("w:" + w.id);
      html += '<button type="button" class="srow" data-buy="w:' + w.id + '"' + (dis ? " disabled" : "") + '>' + (n ? '<span class="in">+' + n * w.pack + "</span>" : "") + '<span class="medal">' + icon(wIcon(w.id)) + '</span><span><span class="nm">' + esc(w.name) + '</span><span class="ds">' + esc(w.desc) + " Balíček " + w.pack + " ks, ve skladu " + have + " z " + cap + ".</span></span>" + priceChip(w.price) + "</button>";
    });
    html += "<h3>Schopnosti</h3>";
    E.ABILITIES.forEach(function (a) {
      var ch = sim.ch[a.id] | 0, dis = ch >= 3 || sim.coins < a.price, n = cnt("a:" + a.id);
      html += '<button type="button" class="srow" data-buy="a:' + a.id + '"' + (dis ? " disabled" : "") + '>' + (n ? '<span class="in">+' + n + "</span>" : "") + '<span class="medal teal">' + icon(a.id) + '</span><span><span class="nm">' + esc(a.name) + '</span><span class="ds">' + esc(a.desc) + " Koupíš nabití: příště se nespustí čekání." + (ch ? " Máš " + ch + "×." : "") + "</span></span>" + priceChip(a.price) + "</button>";
    });
    $("shopBody").innerHTML = html;
    $("shopUndo").hidden = !C.cart.length;
    $("shopCart").textContent = C.cart.length ? "V košíku: " + C.cart.length + (C.cart.length === 1 ? " věc" : C.cart.length < 5 ? " věci" : " věcí") : "Nic v košíku. Můžeš i nenakupovat.";
  }
  function priceChip(p) { return p == null ? '<span class="price max">Max</span>' : '<span class="price">' + icon("coin") + p + "</span>"; }
  function openShop() { if (!S.state || !curTank()) return; renderShop(); $("shop").hidden = false; var b = $("shopBody"); b.scrollTop = 0; }
  function closeShop() { $("shop").hidden = true; C.shopDone = shopKey(); updateCtrl(); }
  var shopKey = function () { return S.shown ? S.shown.seed + ":" + S.state.turnNo : ""; };
  $("shopBody").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-buy]"); if (!b || b.disabled) return;
    var item = b.getAttribute("data-buy"), t = curTank();
    var test = simTank(t, C.cart.concat(item)); if (test.why) { toast(test.why); return; }
    C.cart.push(item); sfx("coin"); var sc = $("shopBody").scrollTop; renderShop(); $("shopBody").scrollTop = sc; updateCtrl(); C.previewDirty = true;
  });
  $("shopUndo").addEventListener("click", function () { C.cart = []; var sc = $("shopBody").scrollTop; renderShop(); $("shopBody").scrollTop = sc; updateCtrl(); });
  $("shopDone").addEventListener("click", closeShop);
  $("shopBtn").addEventListener("click", openShop);

  /* ---------------- ovládání: úhel, síla, zbraň, pohyb, schopnosti ---------------- */
  function weaponAmmo(id) { var w = E.WEAPONS.filter(function (x) { return x.id === id; })[0], sim = effTank(); if (!w || !sim) return 0; return w.unlimited ? Infinity : (sim.ammo[id] | 0); }
  function availableWeapons() { var sim = effTank(); return E.WEAPONS.filter(function (w) { return w.unlimited || (sim && (sim.ammo[w.id] | 0) > 0); }); }
  function fixWeapon() { var ok = availableWeapons(); if (!ok.some(function (w) { return w.id === C.weapon; })) C.weapon = ok.length ? ok[0].id : "grenade"; }
  var lastTick = 0;
  function setAim(angle, power) {
    var oa = C.angle, op = C.power;
    C.angle = clamp(Math.round(angle), 0, 180); C.power = clamp(Math.round(power), 0, 100);
    C.mem[cur()] = { angle: C.angle, power: C.power }; C.previewDirty = true; syncAim();
    if ((oa !== C.angle || op !== C.power) && performance.now() - lastTick > 55) { lastTick = performance.now(); sfx("tick"); }
  }
  function syncAim() { $("angleVal").textContent = C.angle + "°"; $("powerVal").textContent = C.power; }
  function reach(want) {
    var st = S.state, t = curTank(), o = st.tanks[1 - st.cur], dir = Math.sign(want), x = t.x, y = t.y, n = 0, lim = Math.min(Math.abs(want), t.fuel);
    for (var i = 0; i < lim; i++) {
      var nx = x + dir; if (nx < 12 || nx > W - 13) break; if (o.alive && Math.abs(nx - o.x) < 24) break;
      var ny = E.surfaceY(st, nx); if (y - ny > 2 || ny - y > 4) break; x = nx; y = ny; n++;
    }
    return n * dir;
  }
  function stepMove(delta) {
    if (!canAct()) return; var want = C.move + delta, got = reach(want);
    if (C.ability === "teleport") { toast("Při teleportu se nejede."); return; }
    if (got === C.move && delta !== 0) { var t = curTank(); if (t.fuel <= Math.abs(C.move)) toast("Došlo palivo."); return; }
    C.move = got; C.previewDirty = true; updateCtrl();
  }
  function ghostX() {
    var st = S.state, t = curTank(); if (!st || !t) return null;
    if (C.ability === "teleport" && C.ax != null) return C.ax;
    return C.move ? t.x + C.move : null;
  }
  function pivotWorld() {
    var t = curTank(), gx = ghostX(), x = gx == null ? t.x : gx;
    return { x: x, y: (gx == null ? t.y : H - S.state.h[clamp(Math.round(gx), 0, W - 1)]) - 14 };
  }
  function selectAbility(id) {
    if (!canAct()) return;
    if (C.ability === id) { C.ability = null; C.ax = null; C.previewDirty = true; updateCtrl(); return; }
    var st = S.state, t = curTank(), o = st.tanks[1 - st.cur];
    if ((t.cd[id] | 0) > 0) { toast("Ještě se nabíjí."); return; }
    C.ability = id;
    if (TARGETED[id]) {
      if (id === "airstrike") C.ax = o.x; else { var dir = o.x >= t.x ? 1 : -1; C.ax = clamp(t.x + dir * 110, 14, W - 15); if (Math.abs(C.ax - o.x) < 30) C.ax = clamp(t.x - dir * 110, 14, W - 15); C.move = 0; }
      toast(id === "airstrike" ? "Klepni na bojiště: kam padne nálet?" : "Klepni na bojiště: kam se přeneseš?");
    } else C.ax = null;
    C.previewDirty = true; updateCtrl();
  }
  function buildInput() {
    var t = curTank(), v = E.aimToVel(C.angle, C.power);
    var inp = { weapon: C.weapon, vx: v.vx, vy: v.vy, move: C.move | 0, ability: C.ability || null, note: ($("noteInput").value || "").trim().slice(0, 40), at: Date.now() };
    if (C.ability && TARGETED[C.ability]) inp.ax = Math.round(C.ax == null ? t.x : C.ax);
    if (t.shop && C.cart.length) inp.buy = C.cart.slice();
    return inp;
  }

  // tlačítka s opakováním při držení
  function hold(el, fn) {
    var t0 = null, iv = null, n = 0, lastUp = 0, downAt = 0;
    var stop = function () { clearTimeout(t0); clearInterval(iv); el.classList.remove("held"); };
    el.addEventListener("pointerdown", function (e) {
      if (el.disabled) return; e.preventDefault(); downAt = performance.now(); n = 0; fn(1, true); el.classList.add("held");
      t0 = setTimeout(function () { iv = setInterval(function () { n++; fn(n > 22 ? 3 : n > 10 ? 2 : 1, false); }, 62); }, 380);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (k) { el.addEventListener(k, function () { if (k === "pointerup") lastUp = performance.now(); stop(); }); });
    el.addEventListener("click", function () { if (performance.now() - lastUp < 120 && downAt) { downAt = 0; return; } fn(1, true); });
  }
  hold($("angleDown"), function (n) { if (canAct()) setAim(C.angle - n, C.power); });
  hold($("angleUp"), function (n) { if (canAct()) setAim(C.angle + n, C.power); });
  hold($("powerDown"), function (n) { if (canAct()) setAim(C.angle, C.power - n); });
  hold($("powerUp"), function (n) { if (canAct()) setAim(C.angle, C.power + n); });
  hold($("moveL"), function (n, first) { stepMove(-(first ? 6 : 3 * n)); });
  hold($("moveR"), function (n, first) { stepMove(first ? 6 : 3 * n); });

  $("abilRow").addEventListener("click", function (ev) { var b = ev.target.closest("[data-a]"); if (b && !b.disabled) selectAbility(b.getAttribute("data-a")); });

  // zbraně
  function openWeapons() {
    if (!canAct()) return; var sim = effTank(), html = "";
    availableWeapons().forEach(function (w) {
      var am = w.unlimited ? '<span class="am inf">∞</span>' : '<span class="am">' + (sim.ammo[w.id] | 0) + "</span>";
      html += '<button type="button" role="option" class="witem' + (w.id === C.weapon ? " sel" : "") + '" data-w="' + w.id + '" aria-selected="' + (w.id === C.weapon) + '"><span class="medal">' + icon(wIcon(w.id)) + '</span><span><span class="nm">' + esc(w.name) + '</span><span class="ds">' + esc(w.desc) + "</span></span>" + am + "</button>";
    });
    $("weaponList").innerHTML = html; $("weaponSheet").hidden = false; $("weaponBtn").setAttribute("aria-expanded", "true");
    var sel = $("weaponList").querySelector(".sel"); if (sel) sel.focus({ preventScroll: false });
  }
  function closeWeapons() { $("weaponSheet").hidden = true; $("weaponBtn").setAttribute("aria-expanded", "false"); }
  $("weaponBtn").addEventListener("click", function () { if ($("weaponSheet").hidden) openWeapons(); else closeWeapons(); });
  $("weaponBg").addEventListener("click", closeWeapons);
  $("weaponList").addEventListener("click", function (ev) { var b = ev.target.closest("[data-w]"); if (!b) return; C.weapon = b.getAttribute("data-w"); C.wmem[cur()] = C.weapon; C.previewDirty = true; closeWeapons(); updateCtrl(); });

  // gesta na bojisti: miri se tahem od tanku, mapa se posouva tahem jinde, pribliziji dva prsty nebo kolecko
  var cv = $("cv"), ptrs = new Map(), gest = null, lastTouchPtr = 0, AIM_ZONE_PX = 96;
  var rel = function (cx, cy) { var r = cv.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };
  var hintDone = function () { return store.get("tanc-hint") === "1"; };
  function hideHint(done) { var h = $("aimHint"); if (!h.hidden) h.hidden = true; if (done && !hintDone()) store.set("tanc-hint", "1"); }
  $("hintOk").addEventListener("click", function () { hideHint(true); });
  function startPinch() {
    var pts = Array.from(ptrs.values()), a = pts[0], b = pts[1], m = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
    gest = { type: "pinch", d: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)), mx: m.x, my: m.y }; cc.manual = true; hideHint(true);
  }
  function gDown(id, cx, cy, btn) {
    if (!R) return;
    ptrs.set(id, { x: cx, y: cy });
    if (ptrs.size >= 2) { startPinch(); return; }
    var w = R.toWorld(cx, cy), act = canAct(), pn = R.pannable(), p = act ? pivotWorld() : null;
    var d = p ? Math.hypot(w.x - p.x, w.y - p.y) : 1e9, zone = AIM_ZONE_PX / R.camera().scale;
    if (act && btn !== 1 && btn !== 2 && (!pn || d < zone)) {
      var direct = pn || d < 140;
      gest = { type: "aim", id: id, sx: cx, sy: cy, t0: performance.now(), moved: false, ax: direct ? p.x : w.x, ay: direct ? p.y : w.y };
    } else gest = { type: "pan", id: id, sx: cx, sy: cy, lx: cx, ly: cy, t0: performance.now(), moved: false };
  }
  function gMove(id, cx, cy) {
    var q = ptrs.get(id); if (!q) return; q.x = cx; q.y = cy;
    var g = gest; if (!g || !R) return;
    if (g.type === "pinch") {
      if (ptrs.size < 2) return;
      var pts = Array.from(ptrs.values()), a = pts[0], b = pts[1], dist = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)), m = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
      R.zoomAt(m.x, m.y, dist / g.d); R.nudge(m.x - g.mx, m.y - g.my); g.d = dist; g.mx = m.x; g.my = m.y; cc.manual = true;
    } else if (g.type === "aim") {
      if (g.id !== id || !canAct()) return;
      if (!g.moved && Math.hypot(cx - g.sx, cy - g.sy) < 7) return; g.moved = true; hideHint(true);
      var w = R.toWorld(cx, cy), dx = w.x - g.ax, dy = w.y - g.ay, len = Math.hypot(dx, dy); if (len < 6) return;
      var ang = Math.atan2(-dy, dx) * 180 / Math.PI; if (ang < 0) ang = dx >= 0 ? 0 : 180;
      setAim(ang, len / 2.6);
    } else if (g.type === "pan") {
      if (g.id !== id) return;
      if (!g.moved && Math.hypot(cx - g.sx, cy - g.sy) < 6) return;
      if (!g.moved) { g.moved = true; g.lx = cx; g.ly = cy; return; }
      R.nudge(cx - g.lx, cy - g.ly); g.lx = cx; g.ly = cy; cc.manual = true;
    }
  }
  function gUp(id, cx, cy, cancel) {
    ptrs.delete(id);
    var g = gest;
    if (g && g.type === "pinch") { if (ptrs.size < 2) gest = ptrs.size ? { type: "none" } : null; return; }
    if (!ptrs.size && (!g || g.id !== id)) { gest = null; return; }
    if (!g || g.id !== id) return;
    gest = null;
    if (!cancel && !g.moved && performance.now() - g.t0 < 600 && canAct() && C.ability && TARGETED[C.ability]) {
      var w = R.toWorld(cx, cy); C.ax = clamp(Math.round(w.x), C.ability === "teleport" ? 14 : 0, C.ability === "teleport" ? W - 15 : W - 1); C.previewDirty = true; updateCtrl();
    }
  }
  cv.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch") lastTouchPtr = performance.now();
    e.preventDefault(); attempt(function () { cv.setPointerCapture(e.pointerId); });
    gDown(e.pointerId, e.clientX, e.clientY, e.pointerType === "mouse" ? e.button : 0);
  });
  cv.addEventListener("pointermove", function (e) { gMove(e.pointerId, e.clientX, e.clientY); });
  cv.addEventListener("pointerup", function (e) { gUp(e.pointerId, e.clientX, e.clientY, false); });
  cv.addEventListener("pointercancel", function (e) { gUp(e.pointerId, e.clientX, e.clientY, true); });
  // nouzova cesta pro prohlizece bez pointer events a pro syntetické dotyky (testy); skutecne dotyky uz zpracovaly pointer events
  var touchEach = function (e, fn) { for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; fn("t" + t.identifier, t.clientX, t.clientY); } };
  cv.addEventListener("touchstart", function (e) { if (performance.now() - lastTouchPtr < 600) return; if (e.cancelable) e.preventDefault(); touchEach(e, function (id, x, y) { gDown(id, x, y, 0); }); }, { passive: false });
  cv.addEventListener("touchmove", function (e) { if (performance.now() - lastTouchPtr < 600) return; if (e.cancelable) e.preventDefault(); touchEach(e, gMove); }, { passive: false });
  cv.addEventListener("touchend", function (e) { if (performance.now() - lastTouchPtr < 600) return; touchEach(e, function (id, x, y) { gUp(id, x, y, false); }); });
  cv.addEventListener("touchcancel", function (e) { if (performance.now() - lastTouchPtr < 600) return; touchEach(e, function (id, x, y) { gUp(id, x, y, true); }); });
  cv.addEventListener("wheel", function (e) {
    if (!R) return; e.preventDefault();
    var p = rel(e.clientX, e.clientY), dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    R.zoomAt(p.x, p.y, Math.exp(-clamp(dy, -240, 240) * 0.0018)); cc.manual = true; hideHint(true);
  }, { passive: false });
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // kamera
  function camHome(st, snap) {
    if (!R || !st) return; var t = st.tanks[st.cur], o = st.tanks[1 - st.cur]; if (!t) return;
    var z = R.homeZoom(), lim = R.limits(), vw = lim.cw / (lim.fit * z);
    var bias = o && o.alive !== false ? Math.sign(o.x - t.x) * Math.min(Math.abs(o.x - t.x) / 2, vw * 0.22) : 0;
    R.setView(t.x + bias, t.y - 60, z, { rate: 2.4, snap: !!snap });
  }
  function camRefresh() { if (R && S.state && !cc.manual && !S.turn) camHome(S.state, true); }
  function camLoop(st) {
    if (!R) return;
    var now = performance.now();
    if (S.turn || now < cc.impactUntil) {
      var pr = st.proj && st.proj[0];
      if (pr) { cc.fx = pr.x / 100; cc.fy = pr.y / 100; cc.has = true; }
      var tx, ty;
      if (pr) { tx = cc.fx; ty = cc.fy; }
      else if (now < cc.impactUntil) { tx = cc.ix; ty = cc.iy; }
      else if (cc.has) { tx = cc.fx; ty = cc.fy; }
      else { var ct = st.tanks[st.cur]; tx = ct ? ct.x : W / 2; ty = ct ? ct.y : H / 2; }
      R.setView(tx, ty - 20, R.homeZoom(), { rate: S.fast ? 14 : 4.2 });
    } else if (!cc.manual) camHome(st, false);
  }
  function toggleFit() {
    if (!R) return; var cm = R.camera(), st = S.turn ? S.turn.state : S.state;
    if (cm.zoom > 1.04) { R.fitAll(); R.setView(R.camera().tx, R.camera().ty, 1, { rate: 9 }); cc.manual = true; }
    else if (st && st.tanks[st.cur]) { var t = st.tanks[st.cur], z = Math.min(R.limits().zMax, Math.max(R.homeZoom(), 1.9)); R.setView(t.x, t.y - 60, z, { rate: 9 }); cc.manual = true; }
    lastFitIcon = "";
  }
  var lastFitIcon = "";
  function syncCamUi() {
    if (!R) return; var cm = R.camera(), key = cm.zoom < 1.04 ? "focus" : "fit";
    if (key !== lastFitIcon) {
      lastFitIcon = key; var b = $("zoomFit"), lab = key === "focus" ? "Přiblížit na tank" : "Celé bojiště";
      b.querySelector("use").setAttribute("href", "#i-" + key); b.title = lab; b.setAttribute("aria-label", lab);
    }
    if (touchy && !hintDone() && canAct() && R.pannable() && view === "play" && $("aimHint").hidden) { $("aimHint").hidden = false; setTimeout(function () { hideHint(true); }, 9000); }
  }
  $("zoomFit").addEventListener("click", toggleFit);

  // klávesnice
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (!$("weaponSheet").hidden) closeWeapons(); else if (!$("shop").hidden) closeShop(); return; }
    if (view !== "play" || !$("shop").hidden || !$("weaponSheet").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT") { if (e.key === "Enter") { e.preventDefault(); fire(); } return; }
    if (tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA") return;
    var big = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft") { e.preventDefault(); if (canAct()) setAim(C.angle + big, C.power); }
    else if (e.key === "ArrowRight") { e.preventDefault(); if (canAct()) setAim(C.angle - big, C.power); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (canAct()) setAim(C.angle, C.power + big); }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (canAct()) setAim(C.angle, C.power - big); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); fire(); }
  });

  /* ---------------- stav ovládání na obrazovce ---------------- */
  function updateCtrl() {
    var st = S.state; if (!st) return;
    var act = canAct(), spec = spectating(), t = curTank();
    $("ctrl").classList.toggle("locked", !act && !spec); $("ctrl").classList.toggle("spectator", spec);
    $("claimBar").hidden = !spec;
    if (spec) { $("claimTxt").textContent = "Přihlížíš. Jsi jeden z hráčů?"; $("claimTop0").textContent = "Jsem " + nameOf(0); $("claimTop1").textContent = "Jsem " + nameOf(1); }
    var fb = $("fireBtn"); fb.disabled = !act;
    fb.textContent = act ? "Pal!" : (S.turn ? "Střílí se…" : S.committing ? "Odesílám…" : st.matchOver ? "Konec" : "Čekej…");
    if (!t) return;
    if (act) fixWeapon();
    var wdef = E.WEAPONS.filter(function (w) { return w.id === C.weapon; })[0] || E.WEAPONS[0], sim = effTank() || t;
    $("weaponBtn").querySelector(".wico").innerHTML = icon(wIcon(wdef.id));
    $("weaponBtn").querySelector(".wname").textContent = wdef.name;
    $("weaponBtn").querySelector(".wammo").textContent = wdef.unlimited ? "bez omezení" : (sim.ammo[wdef.id] | 0) + " ks";
    syncAim();
    // palivo
    var left = Math.max(0, t.fuel - Math.abs(C.move)), mf = t.maxFuel || 160;
    $("fuelBar").style.width = Math.round(clamp(left / mf, 0, 1) * 100) + "%";
    $("fuelTxt").textContent = C.move ? (C.move > 0 ? "→ " : "← ") + Math.abs(C.move) + " px · zbývá " + left : "palivo " + left;
    $("moveL").disabled = !act || t.fuel <= 0; $("moveR").disabled = !act || t.fuel <= 0;
    // schopnosti
    var html = "";
    E.ABILITIES.forEach(function (a) {
      if (!(a.id in (t.cd || {}))) return;
      var cd = t.cd[a.id] | 0, ch = (sim.ch && sim.ch[a.id]) | 0, sel = C.ability === a.id;
      html += '<button type="button" class="abtn' + (sel ? " sel" : "") + '" data-a="' + a.id + '"' + (cd > 0 ? " disabled" : "") + ' title="' + esc(a.name + ": " + a.desc) + '" aria-pressed="' + sel + '" aria-label="' + esc(a.name) + '">' + icon(a.id) + "<span>" + esc(a.name) + "</span>" + (cd > 0 ? '<i class="cd">' + cd + "</i>" : "") + "</button>";
    });
    var row = $("abilRow"); if (row.dataset.sig !== html) { row.dataset.sig = html; row.innerHTML = html; }
    $("shopBtn").hidden = !(act && t.shop);
    // stav
    var sp = $("statusPill"), txt, mine = false;
    if (st.matchOver) txt = "Zápas skončil";
    else if (S.turn) txt = nameOf(S.turn.state.cur) + " střílí…";
    else if (S.mode === "local") txt = nameOf(st.cur) + " je na tahu";
    else if (spec) txt = "Na tahu: " + nameOf(st.cur);
    else if (myTurnOnline()) { txt = "Jsi na tahu"; mine = true; }
    else txt = nameOf(st.cur) + " míří…";
    sp.textContent = txt; sp.classList.toggle("mine", mine || (S.mode === "local" && !S.turn));
    $("skipReplay").hidden = !S.turn;
    updateWait();
    updateTitle();
  }
  function updateWait() {
    var el = $("waitPill"), show = S.mode === "online" && view === "play" && (!S.s0 || !S.s1) && S.seat != null;
    el.hidden = !show; if (show) { var other = S.seat === 0 ? 1 : 0; el.textContent = "Čekáme, až " + nameOf(other) + " přijme výzvu. Odkaz zkopíruješ tlačítkem nahoře."; }
  }

  /* ---------------- bublina se vzkazem (DOM, aby šla přečíst i čtečkou) ---------------- */
  function setBubble(idx, text) {
    var b = $("bubble");
    if (!text) { b.hidden = true; bubble.idx = -1; return; }
    b.innerHTML = '<small>' + esc(nameOf(idx)) + '</small><span></span>'; b.lastChild.textContent = text;
    b.hidden = false; bubble.idx = idx; bubble.until = performance.now() + 9000;
  }
  function placeBubble(st) {
    var b = $("bubble"); if (b.hidden || bubble.idx < 0 || !R) return;
    if (performance.now() > bubble.until && !S.turn) { b.hidden = true; return; }
    var t = st.tanks[bubble.idx]; if (!t) return; var p = R.toScreen(t.x, R.tankTop(t)), sz = R.size();
    var bw = b.offsetWidth || 120, bh = b.offsetHeight || 40;
    var x = clamp(p.x - bw / 2, 6, sz.w - bw - 6), y = Math.max(6, p.y - bh - 8);
    b.style.transform = "translate(" + x + "px," + y + "px)"; b.style.setProperty("--tail", clamp(p.x - x, 14, bw - 14) + "px");
  }

  /* ---------------- banner ---------------- */
  var bannerT = 0;
  function banner(title, sub, ms) {
    var b = $("banner"); b.firstElementChild.textContent = title; b.lastElementChild.textContent = sub || ""; b.lastElementChild.hidden = !sub;
    b.hidden = false; b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
    clearTimeout(bannerT); bannerT = setTimeout(function () { b.hidden = true; }, ms || 1800);
  }

  /* ---------------- přehrávka tahu ---------------- */
  var lastSeenKey = function () { return "tanc-seen-" + S.id; };
  function saveSeen() { if (S.mode === "online" && S.id && S.shown) { store.set(lastSeenKey(), String(S.shown.t.length)); store.set("tanc-seeng-" + S.id, String(S.shown.gi)); } }
  var sameInput = function (a, b) { return a === b || JSON.stringify(a) === JSON.stringify(b); };
  var isPrefix = function (a, b) { if (a.length > b.length) return false; for (var i = 0; i < a.length; i++) if (!sameInput(a[i], b[i])) return false; return true; };

  function faceMem(st) { for (var i = 0; i < 2; i++) C.mem[i] = { angle: st.tanks[i].x <= st.tanks[1 - i].x ? 55 : 125, power: 60 }; }
  function initShown(g) {
    var k = 0;
    if (S.mode === "online" && S.id) {
      var seen = parseInt(store.get(lastSeenKey()) || "0", 10) || 0, sg = store.get("tanc-seeng-" + S.id);
      k = sg === String(g.gi) ? Math.min(seen, g.t.length) : 0;
      if (g.t.length - k > 3) k = g.t.length - 1;
    }
    S.shown = { seed: g.seed, gi: g.gi, t: g.t.slice(0, k) };
    S.state = E.replay(g.seed, g.start, S.shown.t); S.turn = null; S.corrupt = false;
    if (R) { R.reset(); R.invalidate(); }
    cc.manual = false; cc.has = false; cc.impactUntil = 0;
    faceMem(S.state); camHome(S.state, true); C.cart = []; C.move = 0; C.ability = null; C.ax = null; C.key = ""; C.shopDone = ""; hudSig = "";
    setBubble(0, ""); saveSeen();
    // naposledy vidět míření posledního tahu
    if (S.shown.t.length) { var last = S.shown.t[S.shown.t.length - 1]; if (last && last.vx != null) { /* barel drží směr z posledního výstřelu jen u střelce */ } }
  }
  function animateTurn(inp) {
    return new Promise(function (resolve) {
      var st = S.state, turn;
      try { turn = E.startTurn(st, inp); } catch (e) { console.error(e); S.corrupt = true; toast("Tah v dokumentu je neplatný."); resolve(false); return; }
      S.turn = turn; cc.manual = false; cc.has = false; cc.impactUntil = 0; hideHint(true);
      if (inp.ability !== "airstrike" && inp.vx != null) { var a = E.velToAim(inp.vx, inp.vy); C.mem[st.cur] = { angle: clamp(a.angle, 0, 180), power: clamp(a.power, 0, 100) }; }
      setBubble(st.cur, typeof inp.note === "string" ? inp.note.slice(0, 40) : "");
      closeWeapons(); if (!$("shop").hidden) $("shop").hidden = true;
      S.animDone = function () { S.state = turn.state; S.turn = null; S.animDone = null; resolve(true); };
      updateCtrl();
    });
  }
  async function pumpLoop() {
    for (;;) {
      var g = S.g; if (!g) return;
      if (!S.shown || S.shown.seed !== g.seed || S.shown.gi !== g.gi || !isPrefix(S.shown.t, g.t)) initShown(g);
      if (S.shown.t.length >= g.t.length) return;
      var inp = g.t[S.shown.t.length], prevRound = S.state.round;
      var ok = await animateTurn(inp); if (!ok) return;
      S.shown.t.push(inp); saveSeen(); hudSig = "";
      var s = S.state;
      if (s.matchOver) { await sleep(S.fast ? 250 : 1700); }
      else if (s.roundOver || s.round !== prevRound) {
        var w = s.lastRound ? s.lastRound.winner : -1;
        banner(w === 0 || w === 1 ? "Kolo bere " + nameOf(w) : "Kolo skončilo remízou", w === 0 || w === 1 ? "Další kolo, nový terén" : "Nikdo nepovolil", S.fast ? 500 : 1900);
        await sleep(S.fast ? 350 : 1900);
      }
      var wasLast = S.shown.t.length >= g.t.length; void wasLast;
    }
  }
  function pump() {
    if (S.pumping) return S.pumpP;
    S.pumping = true; updateTitle();
    S.pumpP = (async function () {
      try { await pumpLoop(); } catch (e) { console.error(e); } finally { S.pumping = false; S.fast = false; afterSettled(); }
    })();
    return S.pumpP;
  }
  function loadControlsFor(st) {
    var key = S.shown ? S.shown.seed + ":" + st.turnNo : ""; if (key === C.key) return; C.key = key; cc.manual = false;
    if (st.roundTurn === 0) faceMem(st);
    var m = C.mem[st.cur]; C.angle = m.angle; C.power = m.power; C.weapon = C.wmem[st.cur] || "grenade";
    C.move = 0; C.ability = null; C.ax = null; C.cart = []; C.previewDirty = true;
    $("noteInput").value = "";
    fixWeapon();
  }
  function afterSettled() {
    var st = S.state; if (!st) return;
    if (st.matchOver) { if (view === "play") { renderEnd(); setView("end"); } }
    else if (view === "end") setView("play");
    if (!st.matchOver) loadControlsFor(st);
    hudSig = ""; updateHud(st); updateCtrl(); layout();
    var mineNow = view === "play" && S.mode === "online" && canAct();
    if (mineNow && !wasMine) { sfx("turn"); buzz([22, 70, 22]); }
    wasMine = mineNow;
    if (view === "play" && canAct() && curTank().shop && C.shopDone !== shopKey() && $("shop").hidden) {
      var sk = shopKey(), wait = (S.fast || !(S.g && S.g.t && S.g.t.length)) ? 0 : 1000; // chvili si prohlednout, co se stalo
      setTimeout(function () { if (view === "play" && canAct() && C.shopDone !== shopKey() && shopKey() === sk && $("shop").hidden) openShop(); }, wait);
    }
    // mezitím mohl dorazit další tah
    if (S.g && S.shown && S.shown.t.length < S.g.t.length && !S.pumping) pump();
  }

  /* ---------------- vystřelení ---------------- */
  async function submit(inp) {
    if (!canAct()) return false;
    var why = E.validate(S.state, inp); if (why) { toast(why); return false; }
    if (S.mode === "local") {
      S.g = Object.assign({}, S.g, { t: S.g.t.concat([inp]) }); $("noteInput").value = ""; C.cart = [];
      pump(); return true;
    }
    var len = S.g.t.length, seed = S.g.seed, gi = S.g.gi, nextG = Object.assign({}, S.g, { t: S.g.t.concat([inp]) });
    S.committing = true; updateCtrl();
    var res; try { res = await NET.commit(S.id, S.v, function (g) { return g.t.length === len && g.seed === seed && g.gi === gi; }, nextG); } catch (e) { res = { ok: false, reason: "net" }; }
    S.committing = false;
    if (res.ok) {
      S.doc = res.doc; S.v = res.doc.v; S.g = res.doc.g; S.s0 = res.doc.s0 || ""; S.s1 = res.doc.s1 || "";
      $("noteInput").value = ""; C.cart = []; pump(); return true;
    }
    if (res.reason === "conflict") { toast("Mezitím se hra změnila, tah se nezapsal."); if (res.doc) onDoc(res.doc, true); }
    else toast("Spojení nevyšlo, tah se neodeslal. Zkus to znovu.");
    updateCtrl(); return false;
  }
  function fire() { if (!canAct()) { if (spectating()) toast("Přihlížíš, nehraješ."); return false; } return submit(buildInput()); }
  $("fireBtn").addEventListener("click", fire);

  $("skipReplay").addEventListener("click", function () { S.fast = true; });
  function skipNow() { if (S.turn && S.animDone) { S.turn.finish(); S.animDone(); } S.fast = true; }

  /* ---------------- hlavní smyčka ---------------- */
  var lastTs = 0, uiTick = 0, wasMine = false;
  function onEvent(ev) {
    if (ev.type === "explode") { cc.ix = ev.x; cc.iy = ev.y; cc.impactUntil = performance.now() + (S.fast ? 0 : 1100); }
    if (!Snd) return;
    var mine = function (i) { return S.mode === "local" || (S.seat != null && S.seat === i); };
    switch (ev.type) {
      case "fire": sfx("fire"); if (mine(ev.tank)) buzz(16); break;
      case "explode": sfx(ev.kind === "small" ? "small" : ev.kind === "dirt" ? "dirt" : ev.kind === "fire" ? "fireburst" : "boom", ev.r); break;
      case "damage": if (ev.shielded) sfx("shieldhit"); else if (ev.amount > 0) { sfx("hit"); if (mine(ev.tank)) buzz([30, 40, 70]); } break;
      case "die": sfx("die"); if (mine(ev.tank)) buzz([80, 50, 160]); break;
      case "coins": if (ev.amount > 0) sfx("coin"); break;
      case "bounce": sfx("bounce"); break;
      case "split": sfx("split"); break;
      case "ability": sfx(ev.id === "shield" ? "shield" : ev.id === "repair" ? "repair" : ev.id === "airstrike" ? "plane" : "teleport"); break;
      case "roundEnd": case "matchEnd":
        if (ev.type === "roundEnd" && S.turn && S.turn.state && S.turn.state.matchOver) break;
        if (ev.winner === 0 || ev.winner === 1) sfx(S.mode === "local" || S.seat == null || S.seat === ev.winner ? "win" : "lose");
        break;
    }
  }
  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016); lastTs = ts;
    if (view !== "play" || !R || !S.state) { if (Snd && view !== "play") Snd.whistleOff(); return; }
    if (S.turn) {
      var ticks = S.fast ? 22 : 2;
      for (var i = 0; i < ticks && !S.turn.done; i++) { var evs = S.turn.step(); for (var j = 0; j < evs.length; j++) { R.event(evs[j], S.turn.state); onEvent(evs[j]); } }
      if (S.turn.done && S.animDone) { var done = S.animDone; done(); }
    }
    var st = S.turn ? S.turn.state : S.state;
    if (Snd) { var pr0 = S.turn && !S.fast && st.proj && st.proj[0]; if (pr0) Snd.whistleOn(pr0.vy / 700); else Snd.whistleOff(); }
    camLoop(st);
    var act = canAct(), scene = { state: st, wind: st.wind, active: act || (S.mode === "local" && !S.turn && !st.matchOver) ? st.cur : null, angles: [C.mem[0].angle, C.mem[1].angle], names: [nameOf(0), nameOf(1)] };
    if (act) {
      scene.aim = { idx: st.cur, angle: C.angle, power: C.power };
      if (R.pannable()) scene.zone = { r: AIM_ZONE_PX / R.camera().scale };
      var gx = ghostX(); if (gx != null) scene.ghost = { idx: st.cur, x: gx };
      if (C.ability && TARGETED[C.ability] && C.ax != null) scene.target = { x: C.ax, kind: C.ability };
      if (C.previewDirty) { C.previewDirty = false; var inp = { weapon: C.weapon, vx: 0, vy: 0, move: C.move, ability: C.ability, ax: C.ax == null ? 0 : Math.round(C.ax) }; var v = E.aimToVel(C.angle, C.power); inp.vx = v.vx; inp.vy = v.vy; C.preview = attempt(function () { return E.previewPath(S.state, inp); }, null); }
      scene.preview = C.preview;
    }
    R.frame(scene, dt);
    updateHud(st); placeBubble(st);
    uiTick += dt; if (uiTick > 0.25) { uiTick = 0; syncCamUi(); }
  }

  /* ---------------- konec zápasu ---------------- */
  var seriesAfter = function (g, st) { var w = (g.w || [0, 0]).slice(); if (st.winner === 0 || st.winner === 1) w[st.winner]++; return w; };
  function renderEnd() {
    var st = S.state, g = S.g, w = st.winner, sw = seriesAfter(g, st), pal = TR.PAL;
    var pc = w === 0 || w === 1 ? pal[w] : { body: "#f6c76a", dark: "#c98a3a" };
    $("endArt").style.setProperty("--wc", pc.body); $("endArt").style.setProperty("--wc2", pc.dark);
    $("endTitle").textContent = w === 0 || w === 1 ? nameOf(w) + " bere zápas!" : "Remíza. Nikdo necouvl.";
    var sub;
    if (S.mode === "online" && S.seat != null) sub = w === -1 ? "Zápas skončil nerozhodně." : w === S.seat ? "Tenhle zápas je tvůj." : "Tenhle zápas ti utekl. Odveta?";
    else sub = w === -1 ? "Zápas skončil nerozhodně." : "Vyhraná kola: " + st.wins[0] + " : " + st.wins[1];
    $("endSub").textContent = sub;
    var html = "";
    [0, 1].forEach(function (i) {
      if (i === 1) html += '<span class="dash">:</span>';
      html += '<div class="side' + (w === i ? " win" : "") + '" style="--c:' + pal[i].light + '"><b>' + esc(nameOf(i)) + '</b><span class="n">' + st.wins[i] + "</span><small>" + (sw[0] + sw[1] > 0 ? "série " + sw[i] : "kol vyhráno") + "</small></div>";
    });
    $("endScore").innerHTML = html;
    var stk = stakeOf(g), line = "";
    if (stk && (w === 0 || w === 1)) { var W_ = nameOf(w), L_ = nameOf(1 - w); line = S.mode === "online" && S.seat != null ? (w === S.seat ? stk.win(W_, L_) : stk.lose(W_, L_)) : stk.third(W_, L_); }
    else if (stk) line = stk.text;
    $("endStake").hidden = !line; $("endStake").textContent = line;
    $("rematchBtn").hidden = spectating(); $("copyEndBtn").hidden = S.mode !== "online";
  }
  async function rematch() {
    var st = S.state, g = S.g; if (!st || !st.matchOver) return;
    if (spectating()) return;
    var w = st.winner, nextG = { n: g.n, k: g.k || "", kc: g.kc || "", w: seriesAfter(g, st), gi: g.gi + 1, seed: rnd31(), start: w === 0 || w === 1 ? 1 - w : 1 - g.start, t: [] };
    if (S.mode === "local") { S.g = nextG; S.shown = null; pump(); setView("play"); return; }
    if (S.committing) return; S.committing = true;
    var seed = g.seed, gi = g.gi, res;
    try { res = await NET.commit(S.id, S.v, function (cg) { return cg.seed === seed && cg.gi === gi; }, nextG); } catch (e) { res = { ok: false, reason: "net" }; }
    S.committing = false;
    if (res.ok) { S.doc = res.doc; S.v = res.doc.v; S.g = res.doc.g; pump(); setView("play"); }
    else if (res.reason === "conflict") { toast("Odvetu už mezitím založil soupeř."); if (res.doc) onDoc(res.doc, true); }
    else toast("Spojení nevyšlo, zkus to znovu.");
  }
  $("rematchBtn").addEventListener("click", rematch);
  $("copyEndBtn").addEventListener("click", function () { if (S.id) copyText(linkFor(S.id), "Odkaz je zkopírovaný."); });
  $("copyTopBtn").addEventListener("click", function () { if (S.id) copyText(linkFor(S.id), "Odkaz je zkopírovaný."); else toast("Hra na jednom zařízení odkaz nemá."); });
  $("menuBtn").addEventListener("click", leave);
  var leaveArmed = 0;
  $("leaveBtn").addEventListener("click", function () {
    if (S.mode === "local" && S.state && !S.state.matchOver && Date.now() - leaveArmed > 3500) { leaveArmed = Date.now(); toast("Zápas na jednom zařízení se neukládá. Klepni ještě jednou pro odchod."); return; }
    leave();
  });
  function leave() {
    if (NET && NET.unwatch) NET.unwatch();
    resetSession(); history.pushState(null, "", location.pathname + location.search); showSetup();
  }
  function resetSession() { S.mode = null; S.id = null; S.v = -1; S.g = null; S.doc = null; S.s0 = ""; S.s1 = ""; S.seat = null; S.free = null; S.shown = null; S.state = null; S.turn = null; S.animDone = null; S.pumping = false; S.committing = false; S.fast = false; S.corrupt = false; C.key = ""; C.cart = []; hudSig = ""; setBubble(0, ""); $("banner").hidden = true; closeWeapons(); $("shop").hidden = true; }

  /* ---------------- online ---------------- */
  function onNet(state) { $("netPill").hidden = !state; if (state) $("netPill").textContent = state; }
  function onDoc(doc, force) {
    if (!doc || !doc.g || (!force && doc.v <= S.v)) return;
    S.doc = doc; S.v = doc.v; S.s0 = doc.s0 || ""; S.s1 = doc.s1 || ""; S.g = doc.g;
    remember();
    if (view === "intro" || view === "setup" || view === "info") { if (view === "intro") renderIntro(); return; }
    pump(); updateWait();
  }
  function remember() { if (S.id && S.g) NET.remember(S.id, { n: S.g.n, me: S.seat, gi: S.g.gi }); }
  function startWatch() { NET.watch(S.id, onDoc, function () { return S.v; }, onNet); }
  function enterGame() { setView("play"); pump(); layout(); if (S.state) { updateHud(S.state); updateCtrl(); } }

  function info(title, meta, retry, kind) {
    $("infoArt").dataset.kind = kind || (retry ? "error" : "missing"); $("v-info").setAttribute("aria-busy", kind === "loading" ? "true" : "false");
    $("infoTitle").textContent = title; $("infoMeta").textContent = meta || ""; $("infoMeta").hidden = !meta;
    $("infoRetry").hidden = !retry; setView("info");
  }
  async function openRoom(id) {
    resetSession(); S.mode = "online"; S.id = id; info("Otevírám hru…", "", false, "loading");
    var doc; try { doc = await NET.load(id); } catch (e) { info("Hru se nepodařilo načíst.", "Zkontroluj připojení a zkus to znovu.", true, "error"); return; }
    if (!doc || !doc.g || !Array.isArray(doc.g.t)) { S.mode = null; info("Tahle hra tu není.", "Odkaz je špatně zkopírovaný, nebo hra vypršela.", false, "missing"); return; }
    if (location.hash !== "#r." + id) return; // mezitím odešel jinam
    S.doc = doc; S.v = doc.v; S.g = doc.g; S.s0 = doc.s0 || ""; S.s1 = doc.s1 || "";
    var seat = NET.mySeat(id); if (seat == null) seat = doc.s0 === NET.device ? 0 : doc.s1 === NET.device ? 1 : null;
    S.seat = seat; if (seat != null) NET.setSeat(id, seat);
    S.free = !doc.s0 ? 0 : !doc.s1 ? 1 : null;
    startWatch(); remember();
    if (seat == null) { renderIntro(); setView("intro"); return; }
    enterGame();
  }
  function renderIntro() {
    var g = S.g, f = S.free, stk = stakeOf(g), host = nameOf(f === 1 || f == null ? 0 : 1);
    $("introTitle").textContent = f != null ? host + " tě vyzývá na tančíky." : "Hra už běží.";
    $("introStake").textContent = f != null ? (stk ? "O co hrajeme: " + stk.text : "Hrajeme bez sázky.") : "Obě místa jsou obsazená. Můžeš přihlížet, nebo pokračovat jako jeden z hráčů.";
    $("acceptBtn").hidden = f == null; $("acceptBtn").textContent = f != null ? "Přijímám výzvu jako " + nameOf(f) : "Přijímám výzvu";
    $("claim0").textContent = "Jsem " + nameOf(0); $("claim1").textContent = "Jsem " + nameOf(1);
  }
  $("acceptBtn").addEventListener("click", async function () {
    if (S.committing) return; S.committing = true; $("acceptBtn").disabled = true;
    var r; try { r = await NET.accept(S.id); } catch (e) { S.committing = false; $("acceptBtn").disabled = false; toast("Spojení nevyšlo, zkus to znovu."); return; }
    S.committing = false; $("acceptBtn").disabled = false;
    if (r.doc) onDoc(r.doc, true);
    if (r.seat == null) { toast("Výzvu už přijal někdo jiný. Můžeš přihlížet."); S.free = null; S.seat = null; enterGame(); return; }
    S.seat = r.seat; if (r.doc) { S.s0 = r.doc.s0 || ""; S.s1 = r.doc.s1 || ""; } remember(); enterGame();
  });
  function claim(seat) { if (!S.id) return; NET.setSeat(S.id, seat); S.seat = seat; remember(); if (S.state) S.state = S.state; enterGame(); updateCtrl(); }
  $("claim0").addEventListener("click", function () { claim(0); }); $("claim1").addEventListener("click", function () { claim(1); });
  $("claimTop0").addEventListener("click", function () { claim(0); }); $("claimTop1").addEventListener("click", function () { claim(1); });
  $("watchBtn").addEventListener("click", function () { S.seat = null; enterGame(); });

  /* ---------------- zakládání ---------------- */
  var stakeSel = $("stakeSel");
  function syncCustom() { $("customWrap").hidden = stakeSel.value !== "c"; }
  stakeSel.addEventListener("change", syncCustom);
  function readSetup() {
    var me = $("nameMe").value.trim().slice(0, 16), opp = $("nameOpp").value.trim().slice(0, 16);
    if (!me || !opp) { toast("Vyplň obě jména."); return null; }
    store.set("tanc-name", me);
    var k = stakeSel.value, kc = ""; if (k === "c") { kc = $("stakeCustom").value.trim().slice(0, 32); if (!kc) k = ""; }
    return { n: [me, opp], k: k, kc: kc, w: [0, 0], gi: 1, seed: rnd31(), start: 0, t: [] };
  }
  $("setupForm").addEventListener("submit", async function (ev) {
    ev.preventDefault(); var g = readSetup(); if (!g || S.committing) return;
    var btn = $("createBtn"); btn.disabled = true; S.committing = true;
    var r; try { r = await NET.create(g, 0); } catch (e) { S.committing = false; btn.disabled = false; toast("Hru se nepodařilo založit. Zkontroluj připojení."); return; }
    S.committing = false; btn.disabled = false;
    resetSession(); S.mode = "online"; S.id = r.id; S.doc = r.doc; S.v = r.doc.v; S.g = r.doc.g; S.s0 = r.doc.s0 || ""; S.s1 = r.doc.s1 || ""; S.seat = 0; S.free = 1;
    history.replaceState(null, "", location.pathname + location.search + "#r." + r.id);
    NET.setSeat(r.id, 0); remember(); startWatch(); pump();
    renderShare(); setView("share");
  });
  function renderShare() {
    var g = S.g, stk = stakeOf(g), link = linkFor(S.id);
    $("shareMsg").value = "Tančíky: " + g.n[0] + " × " + g.n[1] + ". " + g.n[0] + " tě vyzývá na tankovou přestřelku." + (stk ? " O co hrajeme: " + stk.text : "") + " Střílíme po jednom tahu a na tah máš klidně celý den: " + link;
    $("shareMeta").textContent = "Odkaz stačí poslat jednou, tahy se na něm pak objevují samy." + (stk ? " Sázka: " + stk.text : "");
  }
  $("copyBtn").addEventListener("click", function () { copyText($("shareMsg").value, "Zpráva je zkopírovaná, vlož ji do chatu."); });
  $("shareGo").addEventListener("click", function () { enterGame(); });

  $("localBtn").addEventListener("click", function () {
    var a = $("nameMe").value.trim().slice(0, 16) || "Hráč 1", b = $("nameOpp").value.trim().slice(0, 16) || "Hráč 2";
    var k = stakeSel.value, kc = ""; if (k === "c") { kc = $("stakeCustom").value.trim().slice(0, 32); if (!kc) k = ""; }
    if ($("nameMe").value.trim()) store.set("tanc-name", a);
    if (NET && NET.unwatch) NET.unwatch(); resetSession();
    S.mode = "local"; S.g = { n: [a, b], k: k, kc: kc, w: [0, 0], gi: 1, seed: rnd31(), start: 0, t: [] };
    history.replaceState(null, "", location.pathname + location.search);
    enterGame();
  });

  /* ---------------- úvodní obrazovka a poslední hry ---------------- */
  function showRecent() {
    var list = (NET && NET.recent) ? NET.recent() : [], wrap = $("recentWrap"), box = $("recentList");
    wrap.hidden = !list.length; box.innerHTML = "";
    list.forEach(function (r) {
      var b = document.createElement("button"); b.type = "button"; b.className = "rr";
      var n = Array.isArray(r.n) ? r.n : ["?", "?"], seat = r.me === 0 || r.me === 1 ? r.me : null;
      b.innerHTML = '<span class="vsdot" style="--c:' + TR.PAL[0].body + '"></span><b>' + esc(n[0]) + '</b><span class="vsdot" style="--c:' + TR.PAL[1].body + ';margin-left:6px"></span><b>' + esc(n[1]) + "</b>" + (seat != null ? "<span>hraješ jako " + esc(n[seat]) + "</span>" : "<span>přihlížíš</span>");
      b.addEventListener("click", function () { location.hash = "#r." + r.id; });
      box.appendChild(b);
    });
  }
  function showSetup() {
    if (!$("nameMe").value) $("nameMe").value = store.get("tanc-name") || "";
    syncCustom(); showRecent(); setView("setup");
  }
  $("infoRetry").addEventListener("click", boot); $("infoNew").addEventListener("click", leave);

  function boot() {
    if (NET && NET.unwatch) NET.unwatch();
    var m = /^#r\.([0-9a-z]{6,24})$/.exec(location.hash || "");
    if (m) { openRoom(m[1]); return; }
    resetSession(); showSetup();
  }
  window.addEventListener("hashchange", boot);

  /* ---------------- nastroje: cela obrazovka, zvuk, instalace na plochu ---------------- */
  var root = document.documentElement;
  var fsReq = root.requestFullscreen || root.webkitRequestFullscreen, fsExit = document.exitFullscreen || document.webkitExitFullscreen;
  var standalone = !!(attempt(function () { return matchMedia("(display-mode: standalone)").matches; }, false) || navigator.standalone === true);
  var fsOk = !!(fsReq && fsExit && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) && !standalone;
  var isFs = function () { return !!(document.fullscreenElement || document.webkitFullscreenElement); };
  function syncFs() {
    var b = $("fullscreenBtn"), on = isFs(), lab = on ? "Opustit celou obrazovku" : "Celá obrazovka";
    b.querySelector("use").setAttribute("href", on ? "#i-fullscreen-exit" : "#i-fullscreen"); b.title = lab; b.setAttribute("aria-label", lab);
    setTimeout(layout, 120);
  }
  if (fsOk) {
    $("fullscreenBtn").hidden = false;
    $("fullscreenBtn").addEventListener("click", function () {
      try { var p = isFs() ? fsExit.call(document) : fsReq.call(root); if (p && p.catch) p.catch(function () { toast("Prohlížeč celou obrazovku nepovolil."); }); }
      catch (e) { toast("Prohlížeč celou obrazovku nepovolil."); }
    });
    document.addEventListener("fullscreenchange", syncFs); document.addEventListener("webkitfullscreenchange", syncFs);
  }
  function syncMute() {
    var m = Snd ? Snd.isMuted() : true, b = $("muteBtn");
    b.setAttribute("aria-pressed", m ? "true" : "false"); b.querySelector("use").setAttribute("href", m ? "#i-mute" : "#i-sound");
    b.title = m ? "Zapnout zvuk a vibrace" : "Ztlumit zvuk a vibrace"; b.setAttribute("aria-label", b.title);
  }
  if (Snd) { Snd.onMute(syncMute); $("muteBtn").addEventListener("click", function () { Snd.setMuted(!Snd.isMuted()); if (!Snd.isMuted()) { Snd.unlock(); sfx("click"); } }); }
  else $("muteBtn").hidden = true;
  syncMute();
  // jemny zvuk na tlacitka (palba a kroky miru maji vlastni)
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button"); if (b && !b.disabled && b.id !== "fireBtn" && b.id !== "muteBtn" && !b.closest(".stepper") && !b.classList.contains("mv")) sfx("click"); }, true);

  // aplikace na plochu: manifest a ikona se skladaji za behu, aby hra zustala v jednom souboru
  (function setupPwa() {
    try {
      var c = document.createElement("canvas"); c.width = c.height = 192; var g = c.getContext("2d");
      g.fillStyle = "#2a1a2e"; g.fillRect(0, 0, 192, 192);
      g.fillStyle = "#f6c76a"; g.beginPath(); g.arc(138, 58, 28, 0, 7); g.fill(); g.fillStyle = "#f2a85a"; g.beginPath(); g.arc(138, 58, 16, 0, 7); g.fill();
      g.fillStyle = "#7a4a63"; g.beginPath(); g.moveTo(0, 126); g.quadraticCurveTo(70, 96, 192, 124); g.lineTo(192, 192); g.lineTo(0, 192); g.fill();
      g.fillStyle = "#5a8a4a"; g.fillRect(0, 156, 192, 36);
      g.fillStyle = "#f6c76a"; g.save(); g.translate(112, 98); g.rotate(-0.5); g.fillRect(0, -7, 62, 14); g.restore();
      g.fillStyle = "#4a2f45"; g.fillRect(34, 120, 124, 34); g.fillStyle = "#e8543c"; g.beginPath(); g.roundRect ? g.roundRect(46, 92, 100, 40, 16) : g.rect(46, 92, 100, 40); g.fill();
      g.fillStyle = "#f2795f"; g.beginPath(); g.arc(96, 96, 26, 0, 7); g.fill();
      g.fillStyle = "#fff6e4"; g.beginPath(); g.arc(85, 92, 8, 0, 7); g.arc(107, 92, 8, 0, 7); g.fill(); g.fillStyle = "#2a1a2e"; g.beginPath(); g.arc(88, 93, 4, 0, 7); g.arc(110, 93, 4, 0, 7); g.fill();
      g.fillStyle = "#f3dcb2"; [52, 96, 140].forEach(function (x) { g.beginPath(); g.arc(x, 137, 9, 0, 7); g.fill(); });
      var png = c.toDataURL("image/png");
      var ti = document.createElement("link"); ti.rel = "apple-touch-icon"; ti.href = png; document.head.appendChild(ti);
      var man = { name: "Tančíky", short_name: "Tančíky", description: "Tahová tanková přestřelka pro dva.", lang: "cs", start_url: new URL(location.pathname, location.href).href, scope: new URL(".", location.href).href, display: "standalone", orientation: "any", background_color: "#2a1a2e", theme_color: "#2a1a2e", icons: [{ src: png, sizes: "192x192", type: "image/png", purpose: "any" }] };
      var ml = document.createElement("link"); ml.rel = "manifest"; ml.href = URL.createObjectURL(new Blob([JSON.stringify(man)], { type: "application/manifest+json" })); document.head.appendChild(ml);
    } catch (e) { /* bez manifestu hra funguje dal */ }
  })();
  // napoveda "Pridat na plochu" jen na iOS Safari mimo nainstalovanou aplikaci
  (function a2hs() {
    var ua = navigator.userAgent || "", ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var safari = !/crios|fxios|edgios|opios|duckduckgo/i.test(ua);
    var forced = /[?&]a2hs=1/.test(location.search), last = parseInt(store.get("tanc-a2hs") || "0", 10) || 0;
    if (!forced && (!ios || !safari || standalone || Date.now() - last < 14 * 864e5)) return;
    var box = $("a2hs");
    setTimeout(function () { box.hidden = false; document.body.classList.add("has-a2hs"); }, 1800);
    $("a2hsClose").addEventListener("click", function () { box.hidden = true; document.body.classList.remove("has-a2hs"); store.set("tanc-a2hs", String(Date.now())); });
  })();
  window.addEventListener("offline", function () { onNet("Jsi offline, tahy se odešlou po připojení."); });
  window.addEventListener("online", function () { onNet(""); });

  /* ---------------- start ---------------- */
  R = TR.create(cv);
  window.addEventListener("resize", layout); window.addEventListener("orientationchange", function () { setTimeout(layout, 120); });
  if (window.ResizeObserver) new ResizeObserver(layout).observe($("stageWrap"));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (R) R.invalidate(); });
  requestAnimationFrame(loop);

  window.__tanc = {
    state: function () { return S.state ? E.clone(S.state) : null; },
    hash: function () { return S.state ? E.hash(S.state) : null; },
    view: function () { return view; },
    me: function () { return S.mode === "online" ? S.seat : S.mode === "local" && S.state ? S.state.cur : null; },
    busy: function () { return !!(S.pumping || S.committing); },
    animating: function () { return !!S.turn; },
    inputs: function () { return S.g ? S.g.t.slice() : []; },
    play: async function (input) {
      var t0 = Date.now(); while ((S.pumping || S.committing) && Date.now() - t0 < 90000) await sleep(40);
      if (!canAct()) return false;
      return submit(input);
    },
    skip: function () { skipNow(); },
    camera: function () { return R ? R.camera() : null; },
    cameraManual: function () { return cc.manual; }
  };
  boot();
})();
