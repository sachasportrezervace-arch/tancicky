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

  var WEAPON_ICON = { grenade: "bomb", triple: "triple", mirv: "mirv", roller: "roller", drill: "drill", napalm: "napalm", dirt: "dirt", bouncer: "bouncer", spray: "spray", nuke: "nuke", leaper: "leaper", pirko: "pirko", konfety: "konfety" };
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
  var C = { angle: 55, power: 60, weapon: "grenade", move: 0, ability: null, ax: null, cart: [], mem: [{ angle: 55, power: 60 }, { angle: 125, power: 60 }], wmem: ["grenade", "grenade"], key: "", shopDone: "", previewDirty: true, preview: null, gift: null, giftBack: false, giftOpts: [] };
  var view = "setup";
  var R = null; // renderer
  var bubble = { idx: -1, text: "", until: 0 };
  var Snd = window.TankSound || null;
  var sfx = function (n, a) { if (Snd) Snd.play(n, a); };
  var buzz = function (p) { if (Snd) Snd.buzz(p); };
  var cc = { manual: false, has: false, fx: 0, fy: 0, impactUntil: 0, ix: 0, iy: 0, quietUntil: 0, z: 0 }; // kamera: rucni rezim, sledovani strely, dojezd na dopad
  var touchy = attempt(function () { return matchMedia("(pointer: coarse)").matches; }, false);

  var names = function () { return (S.g && S.g.n) || ["Hráč 1", "Hráč 2"]; };
  var nameOf = function (i) { return names()[i] || "Hráč"; };
  var cur = function () { return S.state ? S.state.cur : 0; };
  var curTank = function () { return S.state && S.state.tanks[S.state.cur]; };
  var myTurnOnline = function () { return S.mode === "online" && S.seat != null && S.state && S.seat === S.state.cur; };
  function canAct() {
    if (!S.state || S.state.matchOver || S.turn || S.pumping || S.committing || S.corrupt) return false;
    if (S.shown && S.g && S.shown.t.length !== S.g.t.length) return false;
    if (S.mode === "local") return !(S.solo && S.state.cur === BOT);
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
    var r = wrap.getBoundingClientRect(); if (r.width < 10 || r.height < 10 || !st) return;
    if (R && R.resize()) camRefresh();
  }

  /* ---------------- HUD ---------------- */
  var hudSig = "";
  /* ---- kolo: mapa, modifikátor, vztek, kosmetika série ---- */
  var MOD_SHORT = { vichr: "vítr dvakrát silnější", mesic: "gravitace slabší", tezko: "gravitace větší", zrcadlo: "vítr mění směr", bohaci: "+40 mincí pro oba", kratery: "větší výbuchy" };
  function modOf(id) { var l = E.MODS || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function mapOf(id) { var l = E.MAPS || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function tierOf(w) { return w >= 5 ? 3 : w >= 3 ? 2 : w >= 1 ? 1 : 0; }
  function titleOf(w) { return w >= 12 ? "Maršál" : w >= 8 ? "Generál" : w >= 5 ? "Kapitán" : ""; }
  var TIER_ITEM = [["", ""], ["brýle", "mašli"], ["korunku", "korunku"], ["zlatý lem", "zlatý lem"]];
  var introKey = "", introT = 0;
  function hideIntro() { var el = $("roundIntro"); if (!el.hidden) { el.hidden = true; clearTimeout(introT); } }
  document.addEventListener("pointerdown", hideIntro, true); document.addEventListener("keydown", hideIntro, true);
  function showIntro(st) {
    var el = $("roundIntro"), md = st.mod && st.mod !== "normal" ? modOf(st.mod) : null, mp = mapOf(st.map);
    el.querySelector(".ri-kolo").textContent = "Kolo " + st.round; el.querySelector(".ri-map").textContent = mp ? mp.name : "";
    var rm = el.querySelector(".ri-mod"); rm.hidden = !md;
    if (md) { rm.querySelector("use").setAttribute("href", "#i-m-" + st.mod); rm.querySelector("span").textContent = md.name + ": " + (MOD_SHORT[st.mod] || md.desc); }
    el.hidden = false; el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    clearTimeout(introT); introT = setTimeout(hideIntro, 1500);
  }
  function updateHud(st) {
    if (!st) return;
    var sig = JSON.stringify([st.tanks.map(function (t) { return [t.hp, t.maxHp, t.coins, t.shield, t.alive, t.rage]; }), st.mod, st.map, st.wins, st.round, st.wind, st.cur, st.matchOver, S.g && S.g.n, S.g && S.g.gi, S.g && S.g.w, !!S.turn]);
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
      var rg = card.querySelector(".ragetag"); rg.hidden = !(t.rage && t.alive && !st.matchOver); rg.textContent = "Vztek +" + (((E.RULES && E.RULES.ragePct) || 125) - 100) + " %";
      var pips = card.querySelector(".pips"); var html = "";
      for (var k = 0; k < need; k++) html += '<svg class="pip' + (k < st.wins[i] ? " on" : "") + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-star"/></svg>';
      pips.innerHTML = html;
      card.classList.toggle("active", st.cur === i && !st.matchOver);
      card.classList.toggle("dead", !t.alive);
    }
    $("roundTxt").innerHTML = "<small>kolo</small>" + st.round; $("stage").style.setProperty("--pc", "var(--p" + (st.cur ? 1 : 0) + ")");
    var mdc = st.mod && st.mod !== "normal" ? modOf(st.mod) : null, chip = $("modChip");
    chip.hidden = !mdc; if (mdc) { chip.querySelector("use").setAttribute("href", "#i-m-" + st.mod); chip.querySelector("span").textContent = mdc.name; chip.title = mdc.name + ": " + mdc.desc; }
    if (R && R.setCosmetics && S.g) R.setCosmetics([tierOf((S.g.w || [0, 0])[0]), tierOf((S.g.w || [0, 0])[1])]);
    var ikey = (S.id || "l") + ":" + (S.g && S.g.gi) + ":" + st.round;
    if (view === "play" && st.roundTurn === 0 && !st.matchOver && introKey !== ikey) { introKey = ikey; showIntro(st); }
    var wd = st.wind || 0, aw = Math.abs(wd), box = $("windBox");
    box.dataset.dir = wd < 0 ? "-1" : "1"; box.dataset.n = aw === 0 ? "0" : String(Math.min(4, Math.ceil(aw / 4)));
    $("windTxt").textContent = aw; box.style.setProperty("--wf", String(Math.min(1, aw / 15))); box.title = aw === 0 ? "Bezvětří" : "Vítr " + aw + (wd < 0 ? " doleva" : " doprava");
    var g = S.g, ser = "";
    if (S.solo) ser = "Trénink";
    else if (g && (g.gi > 1 || (g.w && (g.w[0] || g.w[1])))) ser = "odveta " + (g.gi - 1) + " · série " + g.w[0] + ":" + g.w[1];
    $("seriesTxt").textContent = ser;
  }

  /* ---------------- obchod: stejné počty jako engine ---------------- */
  function simTank(t, cart) {
    var sim = { coins: t.coins, up: Object.assign({}, t.up), ammo: Object.assign({}, t.ammo), ch: Object.assign({}, t.ch || {}), gb: t.gb | 0, gbx: t.gbx | 0 };
    var why = null;
    for (var i = 0; i < cart.length && !why; i++) why = applyBuyUI(sim, cart[i]);
    return { sim: sim, why: why };
  }
  function applyBuyUI(t, item) {
    var p = item.indexOf(":"), kind = item.slice(0, p), id = item.slice(p + 1), cap = 4 + 2 * (t.up.slots | 0), i, o;
    if (kind === "up") { o = E.UPGRADES.filter(function (u) { return u.id === id; })[0]; if (!o) return "Neznámý upgrade."; var lv = t.up[id] | 0; if (lv >= o.max) return "Už je na maximu."; if (t.coins < o.prices[lv]) return "Nemáš dost mincí."; t.coins -= o.prices[lv]; t.up[id] = lv + 1; return null; }
    if (kind === "w") { o = E.WEAPONS.filter(function (w) { return w.id === id; })[0]; if (!o || o.unlimited) return "Tohle koupit nejde."; if (t.coins < o.price) return "Nemáš dost mincí."; if ((t.ammo[id] | 0) + o.pack > cap) return "Sklad je plný."; t.coins -= o.price; t.ammo[id] = (t.ammo[id] | 0) + o.pack; return null; }
    if (kind === "a" && id === "giftback") { var gp = (E.RULES && E.RULES.giftBackPrice) || 0; if (t.coins < gp) return "Nemáš dost mincí."; if ((t.gbx | 0) >= 1) return "Žeton navíc už máš."; t.coins -= gp; t.gbx = 1; t.gb = (t.gb | 0) + 1; return null; }
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
      html += '<button type="button" class="srow" data-buy="up:' + u.id + '"' + (dis ? " disabled" : "") + '><span class="medal rose">' + icon(u.id) + '</span><span><span class="nm">' + esc(u.name) + ' <span class="lvl">' + pips + '</span></span><span class="ds">' + esc(nb(u.desc)) + '</span></span>' + priceChip(maxed ? null : price) + "</button>";
    });
    html += "<h3>Zbraně</h3>";
    E.WEAPONS.forEach(function (w) {
      if (w.unlimited) return;
      var have = sim.ammo[w.id] | 0, full = have + w.pack > cap, dis = full || sim.coins < w.price, n = cnt("w:" + w.id);
      html += '<button type="button" class="srow" data-buy="w:' + w.id + '"' + (dis ? " disabled" : "") + '>' + (n ? '<span class="in">+' + n * w.pack + "</span>" : "") + '<span class="medal">' + icon(wIcon(w.id)) + '</span><span><span class="nm">' + esc(w.name) + '</span><span class="ds">' + esc(nb(w.desc + " Balíček " + w.pack + " ks, ve skladu " + have + " z " + cap + ".")) + "</span></span>" + priceChip(w.price) + "</button>";
    });
    html += "<h3>Schopnosti</h3>";
    E.ABILITIES.forEach(function (a) {
      var ch = sim.ch[a.id] | 0, dis = ch >= 3 || sim.coins < a.price, n = cnt("a:" + a.id);
      html += '<button type="button" class="srow" data-buy="a:' + a.id + '"' + (dis ? " disabled" : "") + '>' + (n ? '<span class="in">+' + n + "</span>" : "") + '<span class="medal teal">' + icon(a.id) + '</span><span><span class="nm">' + esc(a.name) + '</span><span class="ds">' + esc(nb(a.desc + " Koupíš nabití: příště se nespustí čekání." + (ch ? " Máš " + ch + "×." : ""))) + "</span></span>" + priceChip(a.price) + "</button>";
    });
    (E.EXTRAS || []).forEach(function (x) {
      var dis = (sim.gbx | 0) >= 1 || sim.coins < x.price, n = cnt(x.id);
      html += '<button type="button" class="srow" data-buy="' + x.id + '"' + (dis ? " disabled" : "") + '>' + (n ? '<span class="in">+1</span>' : "") + '<span class="medal teal">' + icon("gift") + '</span><span><span class="nm">' + esc(x.name) + '</span><span class="ds">' + esc(nb(x.desc)) + "</span></span>" + priceChip((sim.gbx | 0) >= 1 ? null : x.price) + "</button>";
    });
    $("shopBody").innerHTML = html;
    $("shopUndo").hidden = !C.cart.length;
    $("shopCart").textContent = C.cart.length ? "V košíku: " + C.cart.length + (C.cart.length === 1 ? " věc" : C.cart.length < 5 ? " věci" : " věcí") : "Nic v košíku. Můžeš i nenakupovat.";
  }
  function nb(s) { return String(s).replace(/(^|s)([A-Za-zÀ-ž0-9]{1,2}) /g, "$1$2 ").replace(/ ([^ ]+)$/, " $1"); } // pevné mezery: žádná sirotčí slova na konci řádku
  function priceChip(p) { return p == null ? '<span class="price max">Max</span>' : '<span class="price">' + icon("coin") + p + "</span>"; }
  function openShop() { if (!S.state || !curTank()) return; $("a2hs").hidden = true; renderShop(); $("shop").hidden = false; var b = $("shopBody"); b.scrollTop = 0; }
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
  function weaponDef(id) { return (E.weaponInfo && E.weaponInfo(id)) || E.WEAPONS.filter(function (w) { return w.id === id; })[0] || null; }
  function forcedWeapon() { var t = curTank(); return t && t.gift && !C.giftBack ? t.gift : null; }
  function fixWeapon() { var fw = forcedWeapon(); if (fw) { C.weapon = fw; return; } var ok = availableWeapons(); if (!ok.some(function (w) { return w.id === C.weapon; })) C.weapon = ok.length ? ok[0].id : "grenade"; }
  var lastTick = 0;
  function setAim(angle, power) {
    var oa = C.angle, op = C.power;
    C.angle = clamp(Math.round(angle), 0, 180); C.power = clamp(Math.round(power * 2) / 2, 0, 100);
    C.mem[cur()] = { angle: C.angle, power: C.power }; C.previewDirty = true; syncAim();
    if ((oa !== C.angle || op !== C.power) && performance.now() - lastTick > 55) { lastTick = performance.now(); sfx("tick"); }
  }
  function syncAim() { var p = Math.round(C.power * 2) / 2; $("angleVal").textContent = C.angle + "°"; $("powerVal").textContent = p % 1 ? String(p).replace(".", ",") : p; }
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
    if (id === "airstrike" && forcedWeapon()) { toast("Dárek musíš vystřelit, nálet nejde."); return; }
    if ((t.cd[id] | 0) > 0) { toast("Ještě se nabíjí."); return; }
    C.ability = id;
    if (TARGETED[id]) {
      if (id === "airstrike") C.ax = null; else { var dir = o.x >= t.x ? 1 : -1; C.ax = clamp(t.x + dir * 110, 14, W - 15); if (Math.abs(C.ax - o.x) < 30) C.ax = clamp(t.x - dir * 110, 14, W - 15); C.move = 0; }
      toast(id === "airstrike" ? "Klepni na bojiště: kam padne nálet?" : "Klepni na bojiště: kam se přeneseš?");
    } else C.ax = null;
    C.previewDirty = true; updateCtrl();
  }
  function buildInput() {
    var t = curTank(), v = E.aimToVel(C.angle, C.power);
    var inp = { weapon: C.weapon, vx: v.vx, vy: v.vy, move: C.move | 0, ability: C.ability || null, note: ($("noteInput").value || "").trim().slice(0, 40), at: Date.now() };
    if (C.ability && TARGETED[C.ability]) inp.ax = Math.round(C.ax == null ? t.x : C.ax);
    if (t.shop && C.cart.length) inp.buy = C.cart.slice();
    if (C.giftOpts.indexOf(C.gift) < 0) C.gift = C.giftOpts[0] || null;
    if (C.gift) inp.gift = C.gift;
    if (C.giftBack && t.gift) inp.giftBack = true;
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
  hold($("powerDown"), function (n) { if (canAct()) setAim(C.angle, C.power - n * 0.5); });
  hold($("powerUp"), function (n) { if (canAct()) setAim(C.angle, C.power + n * 0.5); });
  hold($("moveL"), function (n, first) { stepMove(-(first ? 6 : 3 * n)); });
  hold($("moveR"), function (n, first) { stepMove(first ? 6 : 3 * n); });

  var abilTipT = 0, abilLong = false, abilTipHide = 0, abilTip = $("abilTip");
  function showAbilTip(b) {
    var t = b.getAttribute("title") || "", i = t.indexOf(": ");
    abilTip.innerHTML = "<b>" + esc(i > 0 ? t.slice(0, i) : t) + "</b>" + (i > 0 ? "<span>" + esc(t.slice(i + 2)) + "</span>" : "");
    abilTip.hidden = false; var r = b.getBoundingClientRect(), w = abilTip.offsetWidth, h = abilTip.offsetHeight;
    abilTip.style.left = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8) + "px"; abilTip.style.top = Math.max(8, r.top - h - 10) + "px";
    clearTimeout(abilTipHide); abilTipHide = setTimeout(function () { abilTip.hidden = true; }, 2600);
  }
  $("abilRow").addEventListener("pointerdown", function (ev) {
    var b = ev.target.closest("[data-a]"); abilLong = false; clearTimeout(abilTipT); if (!b || ev.pointerType === "mouse") return;
    abilTipT = setTimeout(function () { abilLong = true; showAbilTip(b); }, 420);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) { $("abilRow").addEventListener(n, function () { clearTimeout(abilTipT); }); });
  // úzký sloupec (ležato): řada schopností se posouvá, zprůhlednění vpravo ukazuje, že je tam další
  function abilMore() { var r = $("abilRow"); r.classList.toggle("more", r.scrollWidth > r.clientWidth + r.scrollLeft + 8); }
  $("abilRow").addEventListener("scroll", abilMore, { passive: true }); window.addEventListener("resize", abilMore);
  $("abilRow").addEventListener("click", function (ev) { if (abilLong) { abilLong = false; ev.preventDefault(); return; } var b = ev.target.closest("[data-a]"); if (b && !b.disabled) selectAbility(b.getAttribute("data-a")); });

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
  $("weaponBtn").addEventListener("click", function () {
    if (forcedWeapon()) { toast("Tohle je dárek od soupeře (" + nameOf(1 - cur()) + "). Vrátit ho můžeš tlačítkem Vrátit dárek."); return; }
    if ($("weaponSheet").hidden) openWeapons(); else closeWeapons();
  });
  $("giftOpts").addEventListener("click", function (ev) { var b = ev.target.closest("[data-g]"); if (!b || !canAct()) return; C.gift = b.getAttribute("data-g"); sfx("click"); updateCtrl(); });
  $("giftBackBtn").addEventListener("click", function () {
    if (!canAct()) return; var t = curTank(), sim = effTank();
    if (!t.gift) return;
    if (!C.giftBack && (sim.gb | 0) < 1) { toast("Žeton na vrácení dárku už nemáš."); return; }
    C.giftBack = !C.giftBack; C.previewDirty = true; fixWeapon(); updateCtrl();
  });
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
    if (!ptrs.size && R.edgeAt && S.state) {
      var ei = R.edgeAt(cx, cy);
      if (ei === 0 || ei === 1) { var et = (S.turn ? S.turn.state : S.state).tanks[ei], cm0 = R.camera(); if (et) { R.setView(et.x, et.y - 60, cm0.tz, { rate: 9 }); cc.manual = true; } return; }
    }
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
      setAim(ang, len / 3.9);
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
  // vychozi zaber: telefon drzi tank velky a soupere ukazuje minimapa a znacka; vetsi obrazovka ukaze oba tanky s okrajem
  function frameFor(st) {
    var lim = R.limits(), t = st.tanks[st.cur], o = st.tanks[1 - st.cur], both = o && o.alive !== false && t.alive !== false;
    if (lim.cw < 640 || !both) {
      var z0 = R.homeZoom(), zf = z0;
      if (lim.cw < 640 && canAct()) z0 = Math.min(lim.zMax, z0 * 1.25);
      var vw = lim.cw / (lim.fit * z0), vh = lim.ch / (lim.fit * z0);
      var bias = o && o.alive !== false ? Math.sign(o.x - t.x) * Math.min(Math.abs(o.x - t.x) / 2, vw * 0.22) : 0;
      return { x: t.x + bias, y: t.y - Math.max(40, 0.1 * vh), z: z0, zf: zf };
    }
    // desktop: aktivni tank >= 100 px (meritko 2,5), soupere ukaze okrajova bublina; oba tanky jen kdyz se vejdou s okrajem 96 px
    var zT = Math.min(lim.zMax, 2.5 / lim.fit), scl = lim.fit * zT, vw = lim.cw / scl, vh = lim.ch / scl, sepx = Math.abs(o.x - t.x), pad = 96 / scl;
    var zf = clamp(1.4 / lim.fit, 1, zT), cy = t.y - Math.max(24, 0.05 * vh);
    if (sepx + 2 * pad <= vw) return { x: (t.x + o.x) / 2, y: cy, z: zT, zf: zf };
    var bias = Math.sign(o.x - t.x) * Math.min(sepx / 2, vw * 0.2);
    return { x: t.x + bias, y: cy, z: zT, zf: zf };
  }
  function camHome(st, snap) {
    if (!R || !st) return; var t = st.tanks[st.cur], o = st.tanks[1 - st.cur]; if (!t) return;
    var f = frameFor(st); cc.z = f.zf || f.z;
    R.setView(f.x, f.y, f.z, { rate: 2.4, snap: !!snap });
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
      R.setView(tx, ty - 20, cc.z || R.homeZoom(), { rate: S.fast ? 14 : 4.2 });
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
    else if (e.key === "ArrowUp") { e.preventDefault(); if (canAct()) setAim(C.angle, C.power + (e.shiftKey ? 5 : 0.5)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (canAct()) setAim(C.angle, C.power - (e.shiftKey ? 5 : 0.5)); }
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
    var wdef = weaponDef(C.weapon) || E.WEAPONS[0], sim = effTank() || t, fw = act ? forcedWeapon() : null;
    if (fw && C.ability === "airstrike") { C.ability = null; C.ax = null; }
    $("weaponBtn").querySelector(".wico").innerHTML = icon(wIcon(wdef.id));
    $("weaponBtn").querySelector(".wname").textContent = wdef.name;
    $("weaponBtn").querySelector(".wammo").textContent = fw ? (wdef.troll ? "dárek zdarma" : "dárek · " + (sim.ammo[wdef.id] | 0) + " ks") : wdef.unlimited ? "bez omezení" : (sim.ammo[wdef.id] | 0) + " ks";
    $("weaponBtn").classList.toggle("forced", !!fw);
    var gfOn = act && !!t.gift;
    $("ctrl").classList.toggle("forced", gfOn); $("giftForced").hidden = !gfOn;
    if (fw) { var gv = 1 - st.cur; $("weaponBtn").style.setProperty("--gc", "var(--p" + gv + "-p)"); $("weaponBtn").style.setProperty("--gcd", "var(--p" + gv + ")"); $("weaponBtn").querySelector(".wammo").textContent = "Dárek · " + nameOf(gv); }
    if (gfOn) {
      var gbn = sim.gb | 0, gbb = $("giftBackBtn"); gbb.setAttribute("aria-pressed", C.giftBack ? "true" : "false");
      $("gbN").textContent = gbn; gbb.querySelector(".gtx b").textContent = C.giftBack ? "Vráceno" : "Vrátit"; gbb.disabled = !C.giftBack && gbn < 1;
      gbb.title = C.giftBack ? "Dárek vrácen, střílej čím chceš" : "Vrátit dárek: použiješ jakoukoli zbraň (žetony: " + gbn + ")";
    }
    var grOn = act && C.giftOpts.length > 0; $("giftRow").hidden = !grOn;
    if (grOn) {
      $("giftTo").textContent = nameOf(1 - st.cur); $("giftRow").style.setProperty("--gp", "var(--p" + (1 - st.cur) + ")");
      var gh = ""; C.giftOpts.forEach(function (id) {
        var gw = weaponDef(id) || { name: id, desc: "" }, sel = id === C.gift;
        gh += '<button type="button" role="radio" class="gopt' + (sel ? " sel" : "") + '" data-g="' + id + '" aria-checked="' + sel + '" title="' + esc(gw.name + ": " + (gw.desc || "")) + '">' + icon(wIcon(id)) + '<span class="gnm">' + esc(gw.name) + "</span>" + (sel ? icon("check").replace('class="ic"', 'class="ic chk"') : "") + "</button>";
      });
      var go = $("giftOpts"); if (go.dataset.sig !== gh) { go.dataset.sig = gh; go.innerHTML = gh; }
    }
    syncAim();
    // palivo
    var left = Math.max(0, t.fuel - Math.abs(C.move)), mf = t.maxFuel || 160;
    $("fuelBar").style.width = Math.round(clamp(left / mf, 0, 1) * 100) + "%";
    $("fuelTxt").textContent = C.move ? (C.move > 0 ? "→ " : "← ") + Math.abs(C.move) + " px · zbývá " + left : "palivo " + left;
    $("moveCtl").hidden = !act; $("moveL").disabled = !act || t.fuel <= 0; $("moveR").disabled = !act || t.fuel <= 0;
    // schopnosti
    var html = "";
    E.ABILITIES.forEach(function (a) {
      if (!(a.id in (t.cd || {}))) return;
      var cd = t.cd[a.id] | 0, ch = (sim.ch && sim.ch[a.id]) | 0, sel = C.ability === a.id;
      html += '<button type="button" class="abtn' + (sel ? " sel" : "") + '" data-a="' + a.id + '"' + (cd > 0 ? " disabled" : "") + ' title="' + esc(a.name + ": " + a.desc) + '" aria-pressed="' + sel + '" aria-label="' + esc(a.name + (cd > 0 ? " (nabíjí se, ještě " + cd + ")" : "")) + '">' + icon(a.id) + "<span>" + esc(a.name) + "</span>" + (cd > 0 ? '<span class="pie" style="--f:' + Math.min(1, cd / (a.cooldown || cd)).toFixed(2) + '"></span><i class="cd">' + cd + "</i>" : "") + "</button>";
    });
    var row = $("abilRow"); if (row.dataset.sig !== html) { row.dataset.sig = html; row.innerHTML = html; }
    abilMore();
    var oh = "", ot = st.tanks[1 - st.cur];
    if (ot) E.ABILITIES.forEach(function (a) { if (!(a.id in (ot.cd || {}))) return; var ocd = ot.cd[a.id] | 0; oh += '<span class="oa' + (ocd > 0 ? " cdn" : "") + '" title="' + esc(a.name) + '">' + icon(a.id) + (ocd > 0 ? '<span class="pie" style="--f:' + Math.min(1, ocd / (a.cooldown || ocd)).toFixed(2) + '"></span>' : "") + "</span>"; });
    var orow = $("oppAbil"); if (orow.dataset.sig !== oh) { orow.dataset.sig = oh; orow.innerHTML = oh; }
    $("shopBtn").hidden = !(act && t.shop);
    // stav
    var sp = $("statusPill"), txt, mine = false;
    if (st.matchOver) txt = "Zápas skončil";
    else if (S.turn) txt = nameOf(S.turn.state.cur) + " střílí…";
    else if (S.mode === "local") txt = nameOf(st.cur) + " je na tahu";
    else if (spec) txt = "Na tahu: " + nameOf(st.cur);
    else if (myTurnOnline()) { txt = "Jsi na tahu"; mine = true; }
    else txt = nameOf(st.cur) + " míří…";
    var isMine = mine || (S.mode === "local" && !S.turn && !st.matchOver && !(S.solo && st.cur === BOT));
    if (sp.textContent !== txt) { sp.textContent = txt; clearTimeout(updateCtrl.st); sp.classList.remove("gone"); if (isMine) updateCtrl.st = setTimeout(function () { sp.classList.add("gone"); }, 1500); }
    if (S.turn) sp.classList.add("gone"); // při letu střely žádný text přes plochu, mluví scéna a tlačítko Pal
    sp.classList.toggle("mine", isMine);
    $("skipReplay").hidden = !S.turn;
    updateWait();
    updateTitle();
  }
  function updateWait() {
    var el = $("waitPill"), show = S.mode === "online" && view === "play" && (!S.s0 || !S.s1) && S.seat != null;
    el.hidden = !show; if (show) { var other = S.seat === 0 ? 1 : 0; el.textContent = H ? "Čekáme, až " + nameOf(other) + " naskočí do hry." : "Čekáme, až " + nameOf(other) + " přijme výzvu. Odkaz zkopíruješ tlačítkem nahoře."; }
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
      S.turn = turn; tickAcc = 0; cc.manual = false; cc.has = false; cc.impactUntil = 0; cc.quietUntil = 0; hideHint(true);
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
    C.move = 0; C.ability = null; C.ax = null; C.cart = []; C.previewDirty = true; C.giftBack = false;
    C.giftOpts = attempt(function () { return E.giftOptions(st) || []; }, []); C.gift = C.giftOpts[0] || null;
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
    // obchod se sám otevře až od 2. kola: první kolo začíná rovnou střelbou (v 1. kole je dál v nabídce „…“)
    if (view === "play" && canAct() && curTank().shop && st.round > 1 && C.shopDone !== shopKey() && $("shop").hidden) {
      var sk = shopKey(), wait = (S.fast || !(S.g && S.g.t && S.g.t.length)) ? 0 : 250; // dopad uz byl 1,2 s k vidění
      var tryShop = function () { // obchod až po zavření úvodní karty kola, ať se nepřekrývají
        if (!$("roundIntro").hidden) { setTimeout(tryShop, 150); return; }
        if (view === "play" && canAct() && C.shopDone !== shopKey() && shopKey() === sk && $("shop").hidden) openShop();
      };
      setTimeout(tryShop, wait);
    }
    // mezitím mohl dorazit další tah
    if (S.g && S.shown && S.shown.t.length < S.g.t.length && !S.pumping) pump();
    if (S.solo && view === "play" && !st.matchOver && st.cur === BOT) botTurn();
    hernaSync();
  }

  /* ---------------- trénink: robot (jen lokálně, nic se neposílá) ---------------- */
  var BOT = 1, botT = 0;
  function botTurn() {
    clearTimeout(botT);
    var key = S.g && S.g.gi + ":" + S.g.t.length;
    botT = setTimeout(function () {
      var st = S.state;
      if (!S.solo || view !== "play" || !st || st.matchOver || st.cur !== BOT || S.turn || S.pumping || (S.g.gi + ":" + S.g.t.length) !== key) return;
      var t = st.tanks[BOT], ws = Object.keys(t.ammo || {}).filter(function (id) { return (t.ammo[id] | 0) > 0; });
      var inp = E.suggestShot(st, { weapons: ["grenade"].concat(ws.slice(0, 4)) });
      // hratelný, ne dokonalý: střelu trochu rozhodí (asi každá třetí sedí přesně)
      if (Math.random() > 0.33) {
        var f = function (v) { return Math.round(v * (1 + (Math.random() * 2 - 1) * 0.08)); };
        var rough = Object.assign({}, inp, { vx: f(inp.vx), vy: f(inp.vy) });
        if (!E.validate(st, rough)) inp = rough;
      }
      if (E.validate(st, inp)) return;
      S.g = Object.assign({}, S.g, { t: S.g.t.concat([inp]) }); pump();
    }, S.fast ? 50 : 900);
  }

  /* ---------------- vystřelení ---------------- */
  async function submit(inp) {
    if (!canAct()) return false;
    var why = E.validate(S.state, inp); if (why) { toast(why); return false; }
    store.set("tanc-gnote", "1");
    if (S.mode === "local") {
      S.g = Object.assign({}, S.g, { t: S.g.t.concat([inp]) }); $("noteInput").value = ""; C.cart = [];
      pump(); return true;
    }
    var len = S.g.t.length, seed = S.g.seed, gi = S.g.gi, prevG = S.g, nextG = Object.assign({}, S.g, { t: S.g.t.concat([inp]) });
    S.committing = true; S.g = nextG; $("noteInput").value = ""; C.cart = []; pump(); updateCtrl(); // animace startuje hned, zapis běží souběžně
    var res; try { res = await NET.commit(S.id, S.v, function (g) { return g.t.length === len && g.seed === seed && g.gi === gi; }, nextG); } catch (e) { res = { ok: false, reason: "net" }; }
    S.committing = false;
    if (res.ok) {
      S.doc = res.doc; S.v = res.doc.v; S.g = res.doc.g; S.s0 = res.doc.s0 || ""; S.s1 = res.doc.s1 || "";
      pump(); updateCtrl(); return true;
    }
    if (S.turn && S.animDone) { S.turn.finish(); S.animDone(); }
    attempt(function () { return S.pumpP; }); await S.pumpP;
    S.g = prevG; S.shown = null; pump(); await S.pumpP;
    if (res.reason === "conflict") { toast("Mezitím se hra změnila, tah se nezapsal."); if (res.doc) onDoc(res.doc, true); }
    else toast("Spojení nevyšlo, tah se neodeslal. Zkus to znovu.");
    updateCtrl(); return false;
  }
  function fire() {
    if (!canAct()) { if (spectating()) toast("Přihlížíš, nehraješ."); return false; }
    if (C.ability === "airstrike" && C.ax == null) { toast("Klepni na bojiště: kam padne nálet?"); return false; }
    return submit(buildInput());
  }
  $("fireBtn").addEventListener("click", fire);

  $("skipReplay").addEventListener("click", function () { S.fast = true; });
  function skipNow() { if (S.turn && S.animDone) { S.turn.finish(); S.animDone(); } S.fast = true; }

  /* ---------------- hlavní smyčka ---------------- */
  var lastTs = 0, uiTick = 0, wasMine = false, tickAcc = 0, faceAt = 0, spriteT = 0, spriteLast = 0;
  function onEvent(ev) {
    if (ev.type === "explode") { cc.ix = ev.x; cc.iy = ev.y; cc.impactUntil = performance.now() + (S.fast ? 0 : 1150); }
    if (ev.type === "gift" && S.turn) { giftFly(ev, S.turn.state); cc.quietUntil = Math.max(cc.quietUntil, performance.now() + (S.fast ? 0 : 1050)); }
    if (ev.type === "explode" || ev.type === "damage" || ev.type === "die") cc.quietUntil = performance.now() + (S.fast ? 0 : 1200); // dopad a cisla zraneni nikdo nesmi zakryt
    if (!Snd) return;
    var mine = function (i) { return S.mode === "local" || (S.seat != null && S.seat === i); };
    switch (ev.type) {
      case "fire": sfx("fire"); if (mine(ev.tank)) buzz(16); break;
      case "explode": sfx(ev.kind === "small" ? "small" : ev.kind === "dirt" ? "dirt" : ev.kind === "fire" ? "fireburst" : "boom", ev.r); break;
      case "damage": if (ev.shielded) sfx("shieldhit"); else if (ev.amount > 0) { sfx("hit"); if (mine(ev.tank)) buzz([30, 40, 70]); } break;
      case "die": sfx("die"); if (mine(ev.tank)) buzz([80, 50, 160]); break;
      case "coins": if (ev.amount > 0) sfx("coin"); break;
      case "gift": sfx("coin"); break;
      case "giftBack": toast(nameOf(ev.tank) + " vrací dárek."); sfx("turn"); break;
      case "bounce": sfx("bounce"); break;
      case "split": sfx("split"); break;
      case "ability": sfx(ev.id === "shield" ? "shield" : ev.id === "repair" ? "repair" : ev.id === "airstrike" ? "plane" : "teleport"); break;
      case "roundEnd": case "matchEnd":
        if (ev.type === "roundEnd" && S.turn && S.turn.state && S.turn.state.matchOver) break;
        if (ev.winner === 0 || ev.winner === 1) sfx(S.mode === "local" || S.seat == null || S.seat === ev.winner ? "win" : "lose");
        break;
    }
  }
  // dárek putuje od střelce k příjemci i s ikonou zbraně
  function giftFly(ev, st) {
    if (!R || !st) return; var a = st.tanks[ev.from], b = st.tanks[ev.to]; if (!a || !b) return;
    var sz = R.size(), cl = function (p) { return { x: clamp(p.x, 30, sz.w - 30), y: clamp(p.y, 44, sz.h - 44) }; };
    var pa = cl(R.toScreen(a.x, R.tankTop(a))), pb = cl(R.toScreen(b.x, R.tankTop(b))), mid = { x: (pa.x + pb.x) / 2, y: Math.max(40, Math.min(pa.y, pb.y) - 80) };
    var el = document.createElement("div"); el.className = "giftfly"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = icon("gift") + '<span class="gw">' + icon(wIcon(ev.weapon)) + "</span>"; $("stage").appendChild(el);
    var tf = function (p, s) { return "translate(" + Math.round(p.x - 22) + "px," + Math.round(p.y - 22) + "px) scale(" + s + ")"; };
    var an = el.animate([{ transform: tf(pa, .5), opacity: 0 }, { transform: tf(mid, 1.1), opacity: 1, offset: .5 }, { transform: tf(pb, .95), opacity: 1, offset: .86 }, { transform: tf(pb, 1.3), opacity: 0 }], { duration: S.fast ? 200 : 1000, easing: "cubic-bezier(.4,0,.3,1)", fill: "forwards" });
    an.onfinish = function () { el.remove(); };
  }
  // obličeje v HUD žijí: stejný tank oříznutý do kruhu, aktuální výraz
  function drawFaces() {
    if (!R || !R.drawFace) return; var cs = document.querySelectorAll("#hud .face"), d = Math.min(window.devicePixelRatio || 1, 3);
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], w = c.clientWidth || 46, pw = Math.round(w * d); if (!w) continue;
      if (c.width !== pw) { c.width = pw; c.height = pw; }
      var g = c.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, w); R.drawFace(g, i, w / 2, w / 2, w / 2);
    }
  }
  // sprity tanků na úvodních obrazovkách
  function drawSprites(dt) {
    spriteT += dt; if (spriteT - spriteLast < 0.04 || !R.drawTankSprite) return; spriteLast = spriteT;
    var cs = document.querySelectorAll("#v-" + view + " canvas.sprite"), d = Math.min(window.devicePixelRatio || 1, 2);
    for (var k = 0; k < cs.length; k++) {
      var c = cs[k]; if (!c.clientWidth) continue;
      if (!c._lw) { c._lw = c.width; c._lh = c.height; }
      var pw = Math.round(c.clientWidth * d), ph = Math.round(pw * c._lh / c._lw); if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
      var g = c.getContext("2d"), sc = c.width / c._lw, kind = c.dataset.sprite, T = spriteT, lw = c._lw, lh = c._lh;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(sc, 0, 0, sc, 0, 0);
      var tank = function (i, x, y, w, ex, o) { R.drawTankSprite(g, i, x, y, w, ex, Object.assign({ t: T }, o || {})); };
      var dots = function (x0, y0, x1, y1, h) { g.fillStyle = "rgba(43,34,66,.65)"; for (var q = 0; q <= 14; q++) { var u = q / 14, px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u - 4 * h * u * (1 - u); g.beginPath(); g.arc(px, py, 2.6 - u * 1.2, 0, 7); g.fill(); } };
      if (kind === "logo") { dots(138, lh - 70, 190, lh - 78, 70); tank(0, 78, lh - 14, 112, "aim", { barrel: 52 }); tank(1, lw - 78, lh - 14, 104, "scared", { flip: true }); }
      else if (kind === "share") { tank(0, 82, lh - 10, 104, "win"); tank(1, lw - 82, lh - 10, 98, "idle", { flip: true }); dots(112, lh - 62, 188, lh - 66, 52); }
      else if (kind === "vs") { tank(0, 76, lh - 10, 104, "aim"); tank(1, lw - 76, lh - 10, 98, "aim", { flip: true }); g.font = "700 34px Fredoka, sans-serif"; g.fillStyle = "#2B2440"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("VS", lw / 2, lh - 52); }
      else if (kind === "info") {
        var kd = c.dataset.kind;
        if (kd === "missing") tank(1, lw / 2, lh - 12, 120, "lose", { flip: true });
        else if (kd === "error") { tank(0, 66, lh - 12, 100, "hit"); tank(1, lw - 66, lh - 12, 94, "hit", { flip: true }); }
        else tank(0, lw / 2, lh - 12 - Math.abs(Math.sin(T * 5)) * 4, 120, "idle");
      } else if (kind === "end") {
        var ew = parseInt($("endArt").dataset.w, 10);
        if (ew === 0 || ew === 1) { tank(ew, lw * .33, lh - 12, 170, "win"); tank(1 - ew, lw * .76, lh - 12, 112, "lose", { flip: true }); }
        else { tank(0, lw * .28, lh - 12, 140, "idle"); tank(1, lw * .72, lh - 12, 130, "idle", { flip: true }); }
      }
    }
  }
  var mini = $("miniMap"), mctx = mini.getContext("2d"), miniAt = 0;
  function miniRR(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawMini(st) {
    var sz = R && R.size(), on = !!(sz && view === "play" && sz.w < 640 && sz.h >= 360 && R.pannable());
    if (mini.hidden === on) mini.hidden = !on; $("stage").classList.toggle("withmini", on);
    if (!on) return;
    var w = mini.clientWidth, h = mini.clientHeight; if (!w || !h) return;
    var d = window.devicePixelRatio || 1, pw = Math.round(w * d), ph = Math.round(h * d);
    if (mini.width !== pw || mini.height !== ph) { mini.width = pw; mini.height = ph; }
    var c = mctx; c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, w, h);
    c.fillStyle = "#FFF9EE"; miniRR(c, 0, 0, w, h, h / 2); c.fill();
    var pad = 7, iw = w - pad * 2, ih = h - pad * 2, hmax = 0; for (var q = 0; q < W; q += 8) if (st.h[q] > hmax) hmax = st.h[q];
    var ytop = Math.max(0, H - hmax - 70), sx = function (x) { return pad + x / W * iw; }, sy = function (y) { return pad + clamp((y - ytop) / (H - ytop), 0, 1) * ih; };
    c.beginPath(); c.moveTo(sx(0), pad + ih);
    for (var x = 0; x <= W; x += 6) c.lineTo(sx(x), sy(H - st.h[Math.min(W - 1, x)]));
    c.lineTo(sx(W), pad + ih); c.closePath(); c.fillStyle = "#F2B36B"; c.fill();
    var cm = R.camera(), lim = R.limits(), vw = lim.cw / (lim.fit * cm.zoom), x0 = clamp(sx(cm.x - vw / 2), pad, pad + iw), x1 = clamp(sx(cm.x + vw / 2), pad, pad + iw);
    c.strokeStyle = "#2B2440"; c.lineWidth = 2; c.lineJoin = "round"; c.strokeRect(x0, pad + .8, Math.max(4, x1 - x0), ih - 1.6);
    st.tanks.forEach(function (t, i) {
      if (!t || t.alive === false || t.hp <= 0) return;
      c.beginPath(); c.arc(sx(t.x), sy(t.y - 8), i === st.cur ? 5.2 : 4.4, 0, Math.PI * 2); c.fillStyle = i === 0 ? "#F25A45" : "#7B61F2"; c.fill(); c.lineWidth = 1.8; c.strokeStyle = "#2B2440"; c.stroke();
    });
  }
  function miniGo(ev) {
    if (!R) return; var rc = mini.getBoundingClientRect(), wx = clamp((ev.clientX - rc.left - 7) / Math.max(1, rc.width - 14), 0, 1) * W, cm = R.camera();
    R.setView(wx, cm.ty, cm.tz, { rate: 12 }); cc.manual = true;
  }
  mini.addEventListener("pointerdown", function (ev) { ev.preventDefault(); attempt(function () { mini.setPointerCapture(ev.pointerId); }); mini._down = true; miniGo(ev); });
  mini.addEventListener("pointermove", function (ev) { if (mini._down) miniGo(ev); });
  ["pointerup", "pointercancel"].forEach(function (n) { mini.addEventListener(n, function () { mini._down = false; }); });
  var more = $("moreBtn"), toolMenu = $("toolMenu");
  function closeToolMenu() { toolMenu.classList.remove("open"); more.setAttribute("aria-expanded", "false"); }
  more.addEventListener("click", function () { var open = !toolMenu.classList.contains("open"); toolMenu.classList.toggle("open", open); more.setAttribute("aria-expanded", open ? "true" : "false"); });
  document.addEventListener("click", function (e) { if (!toolMenu.classList.contains("open")) return; if (e.target.closest("#moreBtn") || e.target.closest("#muteBtn") || e.target.closest("#noteRow")) return; closeToolMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeToolMenu(); });
  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016); lastTs = ts;
    if (view !== "play" || !R || !S.state) { if (Snd && view !== "play") Snd.whistleOff(); if (view !== "play" && R) drawSprites(dt); return; }
    if (S.turn) {
      tickAcc = Math.min(tickAcc + dt * (S.fast ? 320 : 80), S.fast ? 80 : 10); var ticks = Math.floor(tickAcc); tickAcc -= ticks;
      for (var i = 0; i < ticks && !S.turn.done; i++) { var evs = S.turn.step(); for (var j = 0; j < evs.length; j++) { R.event(evs[j], S.turn.state); onEvent(evs[j]); } }
      if (S.turn.done && S.animDone && (S.fast || performance.now() >= cc.quietUntil)) { var done = S.animDone; done(); }
    }
    var st = S.turn ? S.turn.state : S.state;
    if (Snd) { var pr0 = S.turn && !S.fast && st.proj && st.proj[0]; if (pr0) Snd.whistleOn(pr0.vy / 700); else Snd.whistleOff(); }
    camLoop(st);
    var act = canAct(), scene = { state: st, wind: st.wind, active: act || (S.mode === "local" && !S.solo && !S.turn && !st.matchOver) ? st.cur : null, angles: [C.mem[0].angle, C.mem[1].angle], names: [nameOf(0), nameOf(1)] };
    if (act) {
      scene.aim = { idx: st.cur, angle: C.angle, power: Math.round(C.power * 2) / 2, dragging: !!(gest && gest.type === "aim" && gest.moved) };
      if (R.pannable()) scene.zone = { r: AIM_ZONE_PX / R.camera().scale };
      var gx = ghostX(); if (gx != null) scene.ghost = { idx: st.cur, x: gx };
      if (C.ability && TARGETED[C.ability]) scene.target = { x: C.ax != null ? C.ax : R.camera().x, kind: C.ability, pending: C.ax == null };
      if (C.previewDirty) { C.previewDirty = false; if (C.ability === "airstrike" && C.ax == null) C.preview = null; else { var inp = { weapon: C.weapon, vx: 0, vy: 0, move: C.move, ability: C.ability, ax: C.ax == null ? 0 : Math.round(C.ax) }; var v = E.aimToVel(C.angle, C.power); inp.vx = v.vx; inp.vy = v.vy; C.preview = attempt(function () { return E.previewPath(S.state, inp); }, null); } }
      scene.preview = C.preview;
    }
    if (st.matchOver) scene.over = { winner: st.winner };
    R.frame(scene, dt);
    updateHud(st); placeBubble(st);
    uiTick += dt; if (uiTick > 0.25) { uiTick = 0; syncCamUi(); }
    miniAt += dt; if (miniAt > 0.06) { miniAt = 0; drawMini(st); }
    faceAt += dt; if (faceAt > 0.1) { faceAt = 0; drawFaces(); }
  }

  /* ---------------- konec zápasu ---------------- */
  var seriesAfter = function (g, st) { var w = (g.w || [0, 0]).slice(); if (!S.solo && (st.winner === 0 || st.winner === 1)) w[st.winner]++; return w; }; // trénink se do série nepočítá
  function renderEnd() {
    $("toast").hidden = true; clearTimeout(toast.t);
    var st = S.state, g = S.g, w = st.winner, sw = seriesAfter(g, st), pal = TR.PAL;
    $("endArt").dataset.w = String(w);
    $("endTitle").textContent = w === 0 || w === 1 ? nameOf(w) + " bere zápas!" : "Remíza. Nikdo necouvl.";
    var sub;
    if (S.mode === "online" && S.seat != null) sub = w === -1 ? "Zápas skončil nerozhodně." : w === S.seat ? "Tenhle zápas je tvůj." : "Tenhle zápas ti utekl. Odveta?";
    else if (S.solo) sub = "Trénink se nepočítá do série. " + (w === BOT ? "Robot tentokrát vyhrál." : w === -1 ? "Remíza s robotem." : "Robot to nezvládl.");
    else sub = w === -1 ? "Zápas skončil nerozhodně." : "";
    $("endSub").textContent = sub; $("endSub").hidden = !sub;
    var html = "";
    [0, 1].forEach(function (i) {
      if (i === 1) html += '<span class="dash">:</span>';
      html += '<div class="side' + (w === i ? " win" : "") + '" style="--c:' + pal[i].body + '"><b>' + esc(nameOf(i)) + '</b><span class="n">' + st.wins[i] + "</span><small>" + (sw[0] + sw[1] > 0 ? "série " + sw[i] + (titleOf(sw[i]) ? " · " + titleOf(sw[i]) : "") : "kol vyhráno") + "</small></div>";
    });
    if (R && R.setCosmetics) R.setCosmetics([tierOf(sw[0]), tierOf(sw[1])]);
    var un = "", gw = g.w || [0, 0];
    if (w === 0 || w === 1) {
      var tb = tierOf(gw[w]), ta = tierOf(sw[w]), ttb = titleOf(gw[w]), tta = titleOf(sw[w]);
      // sloveso bez rodu (jméno může být mužské i ženské)
      if (ta > tb) un = nameOf(w) + " odemyká " + TIER_ITEM[ta][w] + (tta && tta !== ttb ? " a titul " + tta : "");
      else if (tta && tta !== ttb) un = nameOf(w) + " odemyká titul " + tta;
    }
    $("endUnlock").hidden = !un; $("endUnlock").textContent = un;
    $("endScore").innerHTML = html;
    var stk = stakeOf(g), line = "";
    if (stk && (w === 0 || w === 1)) { var W_ = nameOf(w), L_ = nameOf(1 - w); line = S.mode === "online" && S.seat != null ? (w === S.seat ? stk.win(W_, L_) : stk.lose(W_, L_)) : stk.third(W_, L_); }
    else if (stk) line = stk.text;
    $("endStake").hidden = !line; $("endStake").textContent = line;
    $("rematchBtn").hidden = spectating(); $("copyEndBtn").hidden = S.mode !== "online";
    $("rematchBtn").textContent = S.solo ? "Znovu" : "Odveta!"; $("challengeBtn").hidden = !S.solo;
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
  $("challengeBtn").addEventListener("click", function () { leave(); var n = $("nameMe"); if (n && !n.value) n.focus(); });
  $("copyEndBtn").addEventListener("click", function () { if (S.id) copyText(linkFor(S.id), "Odkaz je zkopírovaný."); });
  $("copyTopBtn").addEventListener("click", function () { if (S.id) copyText(linkFor(S.id), "Odkaz je zkopírovaný."); else toast("Hra na jednom zařízení odkaz nemá."); });
  $("menuBtn").addEventListener("click", leave);
  var leaveArmed = 0;
  $("leaveBtn").addEventListener("click", function () {
    if (S.mode === "local" && S.state && !S.state.matchOver && Date.now() - leaveArmed > 3500) { leaveArmed = Date.now(); toast("Zápas na jednom zařízení se neukládá. Klepni ještě jednou pro odchod."); return; }
    leave();
  });
  function leave() {
    if (H) { boot(); return; } // v Herně se z hry neodchází, zpět vede lišta Herny
    if (NET && NET.unwatch) NET.unwatch();
    resetSession(); history.pushState(null, "", location.pathname + location.search); showSetup();
  }
  function resetSession() { clearTimeout(botT); S.solo = false; S.mode = null; S.id = null; S.v = -1; S.g = null; S.doc = null; S.s0 = ""; S.s1 = ""; S.seat = null; S.free = null; S.shown = null; S.state = null; S.turn = null; S.animDone = null; S.pumping = false; S.committing = false; S.fast = false; S.corrupt = false; C.key = ""; C.cart = []; hudSig = ""; setBubble(0, ""); $("banner").hidden = true; closeWeapons(); $("shop").hidden = true; }

  /* ---------------- online ---------------- */
  function onNet(state) { $("netPill").hidden = !state; if (state) $("netPill").textContent = state; }
  function onDoc(doc, force) {
    if (!doc || !doc.g || (!force && doc.v <= S.v)) return;
    S.doc = doc; S.v = doc.v; S.s0 = doc.s0 || ""; S.s1 = doc.s1 || ""; S.g = doc.g;
    remember(); hernaSync();
    if (view === "intro" || view === "setup" || view === "info") { if (view === "intro") renderIntro(); return; }
    pump(); updateWait();
  }
  function remember() { if (!H && S.id && S.g) NET.remember(S.id, { n: S.g.n, me: S.seat, gi: S.g.gi }); }
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
  // trénink proti robotovi: stejné losování map a modifikátorů, bez synchronizace, odkazu a série
  function startSolo() {
    var a = $("nameMe").value.trim().slice(0, 16) || store.get("tanc-name") || "Hráč";
    if (NET && NET.unwatch) NET.unwatch(); resetSession();
    S.mode = "local"; S.solo = true; S.g = { n: [a, "Robot"], k: "", kc: "", w: [0, 0], gi: 1, seed: rnd31(), start: 0, t: [] };
    history.replaceState(null, "", location.pathname + location.search + "#solo");
    enterGame();
  }
  $("soloBtn").addEventListener("click", startSolo);

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

  /* ---------------- Herna (protokol verze 1, viz react-apps/HERNA-PROTOKOL.md) ---------------- */
  var H = null, hernaTok = 0, hernaFaze = "", hernaDone = {};
  function parseHerna() {
    var raw = (location.hash || "").replace(/^#/, ""), o = {};
    if (raw.indexOf("herna=1") < 0) return null;
    raw.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); });
    if (o.herna !== "1" || !/^[0-9a-z]{6,24}$/.test(o.r || "") || (o.seat !== "0" && o.seat !== "1")) return null;
    var nm = (o.names || "").split(",").map(function (s) { var d = s; try { d = decodeURIComponent(s); } catch (e) { /* nechat syrové */ } return d.trim().slice(0, 16); });
    return { m: o.m || "", r: o.r, seat: o.seat === "1" ? 1 : 0, names: [nm[0] || "Hráč 1", nm[1] || "Hráč 2"], zaklada: o.zaklada === "1" };
  }
  function doHerny(z) { if (H && window.parent !== window) attempt(function () { window.parent.postMessage(Object.assign({ herna: 1 }, z), "*"); }); }
  function hernaPhase(f) { if (f !== hernaFaze) { hernaFaze = f; doHerny({ typ: "stav", faze: f }); } }
  // fáze podle dokumentu a přehrané partie; výsledek jednou za partii (r:gi), Herna duplicity sama zahodí
  function hernaSync() {
    if (!H || !S.id || !S.g) return;
    var over = !!(S.state && S.state.matchOver && S.shown);
    hernaPhase(!S.s0 || !S.s1 ? "ceka" : over ? "konec" : "hraje");
    if (over && S.s0 && S.s1) {
      var key = S.id + ":" + S.shown.gi;
      if (!hernaDone[key]) { hernaDone[key] = 1; var w = S.state.winner; doHerny({ typ: "vysledek", partie: key, vitez: w === 0 || w === 1 ? w : null }); }
    }
  }
  $("otherGameBtn").addEventListener("click", function () { doHerny({ typ: "jina-hra" }); });
  async function hernaBoot(h) {
    var tok = ++hernaTok;
    resetSession(); H = h; document.body.dataset.herna = "1";
    S.mode = "online"; S.id = h.r;
    doHerny({ typ: "pripraveno" }); hernaFaze = ""; hernaPhase("ceka");
    info(h.zaklada ? "Otevírám hru…" : "Čeká se, až hra naskočí…", "", false, "loading");
    var doc;
    for (;;) {
      var d, failed = false;
      try { d = await NET.load(h.r); } catch (e) { failed = true; }
      if (tok !== hernaTok) return;
      if (!failed && d) { doc = d; break; }
      if (!failed && h.zaklada) { // dokument ještě není a tenhle hráč hru vybral: založí ho rovnou se jmény z Herny
        var g = { n: h.names.slice(), k: "6", kc: "", w: [0, 0], gi: 1, seed: rnd31(), start: 0, t: [] };
        try { var cr = await NET.create(g, h.seat, h.r); if (tok !== hernaTok) return; doc = cr.doc; break; } catch (e) { if (tok !== hernaTok) return; }
      }
      await sleep(1000); if (tok !== hernaTok) return;
    }
    if (!doc.g || !Array.isArray(doc.g.t)) { S.mode = null; info("Tahle hra tu není.", "Herna ji otevřela se špatným odkazem.", true, "error"); return; }
    S.doc = doc; S.v = doc.v; S.g = doc.g; S.s0 = doc.s0 || ""; S.s1 = doc.s1 || "";
    var seat = NET.mySeat(h.r); if (seat == null) seat = doc.s0 === NET.device ? 0 : doc.s1 === NET.device ? 1 : null;
    while (seat == null) { // sednout na volné místo jako „Přijmout výzvu“, jen bez tlačítka a bez introMine
      var a; try { a = await NET.accept(h.r); } catch (e) { a = undefined; }
      if (tok !== hernaTok) return;
      if (a === undefined) { await sleep(1000); if (tok !== hernaTok) return; continue; }
      if (a.doc) { S.doc = a.doc; S.v = a.doc.v; S.g = a.doc.g; S.s0 = a.doc.s0 || ""; S.s1 = a.doc.s1 || ""; }
      seat = a.seat != null ? a.seat : h.seat; // obě místa cizí (smazané úložiště): kdo je kdo, ručí Herna
      NET.setSeat(h.r, seat);
    }
    S.seat = seat; S.free = !S.s0 ? 0 : !S.s1 ? 1 : null;
    startWatch(); enterGame(); updateWait(); hernaSync();
  }

  function boot() {
    if (NET && NET.unwatch) NET.unwatch();
    var hh = parseHerna();
    if (hh) { hernaBoot(hh); return; }
    hernaTok++; H = null; document.body.removeAttribute("data-herna");
    var m = /^#r\.([0-9a-z]{6,24})$/.exec(location.hash || "");
    if (m) { openRoom(m[1]); return; }
    if (location.hash === "#solo") { showSetup(); startSolo(); return; }
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
      g.fillStyle = "#CDEBEF"; g.fillRect(0, 0, 192, 192);
      g.fillStyle = "#93CFB8"; g.beginPath(); g.moveTo(0, 120); g.quadraticCurveTo(70, 80, 192, 118); g.lineTo(192, 192); g.lineTo(0, 192); g.fill();
      g.fillStyle = "#6BBD73"; g.fillRect(0, 150, 192, 42); g.fillStyle = "#F2B36B"; g.fillRect(0, 162, 192, 30);
      g.fillStyle = "#2B2440"; g.save(); g.translate(104, 78); g.rotate(-0.55); g.fillRect(0, -9, 66, 18); g.restore();
      g.fillStyle = "#3A3152"; g.beginPath(); g.roundRect ? g.roundRect(30, 116, 132, 38, 19) : g.rect(30, 116, 132, 38); g.fill();
      g.fillStyle = "#F25A45"; g.beginPath(); g.moveTo(36, 124); g.bezierCurveTo(36, 80, 66, 60, 96, 60); g.bezierCurveTo(128, 60, 156, 82, 156, 124); g.closePath(); g.fill();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(80, 98, 15, 0, 7); g.arc(114, 98, 15, 0, 7); g.fill(); g.fillStyle = "#2B2440"; g.beginPath(); g.arc(85, 100, 7, 0, 7); g.arc(119, 100, 7, 0, 7); g.fill();
      g.fillStyle = "#5D5279"; [52, 96, 140].forEach(function (x) { g.beginPath(); g.arc(x, 135, 9, 0, 7); g.fill(); });
            var png = c.toDataURL("image/png");
      var ti = document.createElement("link"); ti.rel = "apple-touch-icon"; ti.href = png; document.head.appendChild(ti);
      var man = { name: "Tančíky", short_name: "Tančíky", description: "Tahová tanková přestřelka pro dva.", lang: "cs", start_url: new URL(location.pathname, location.href).href, scope: new URL(".", location.href).href, display: "standalone", orientation: "any", background_color: "#CDEBEF", theme_color: "#CDEBEF", icons: [{ src: png, sizes: "192x192", type: "image/png", purpose: "any" }] };
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
    setTimeout(function () { if (view === "end" || view === "play" || !$("shop").hidden) return; box.hidden = false; document.body.classList.add("has-a2hs"); store.set("tanc-a2hs", String(Date.now())); }, 1800);
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
    setView: function (v) { if (v === "share") renderShare(); setView(v); },
    state: function () { return S.state ? E.clone(S.state) : null; },
    hash: function () { return S.state ? E.hash(S.state) : null; },
    view: function () { return view; },
    me: function () { return S.mode === "online" ? S.seat : S.mode === "local" && S.state ? S.state.cur : null; },
    busy: function () { return !!(S.pumping || S.committing); },
    solo: function () { return !!S.solo; },
    series: function () { return S.g && S.g.w ? S.g.w.slice() : null; },
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
