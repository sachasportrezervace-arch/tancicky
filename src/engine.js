/*
 * Tančíky – ENGINE (deterministická simulace, žádné DOM)
 * Publikuje window.TankEngine (v Node module.exports).
 *
 * ===== PRAVIDLA (finální čísla, UI je smí zobrazit; jsou i v TankEngine.RULES) =====
 *  Svět 960x540 px, S=100 sub-pixelů na pixel, tick = 1/60 s, gravitace 10 jednotek/tick^2, MAX_V = 1000 (10 px/tick).
 *  Vstup míření = vx, vy v jednotkách sub-px/tick, vx^2+vy^2 <= MAX_V^2. Síla 100 % = MAX_V, úhel 0 = doprava, 90 = nahoru.
 *  Vítr: celé číslo -15..15 (součet dvou hodů 0..15 minus 15), přesně vítr/10 jednotky zrychlení vx za tick. Určuje ho
 *        čistá funkce seed+turnNo (žádný uložený generátor), takže stav = seed + vstupy.
 *  Terén: výšková mapa h[0..959], krátery kruhem (dx^2+dy^2<=r^2), hlína nad dírou se sesune (h klesne o překryv),
 *        nezničitelný základ 8 px. Hliněná bomba přidá násep (3/4 půlkruhu). Tank stojí na max h pod svou stopou (+-4 px).
 *  Tank: 100 HP, palivo 160 px na kolo (+60 px za úroveň upgradu, +20 px dobití po každém vlastním tahu), pohyb 1 px/tick,
 *        nevyleze svah > 2 px na 1 px, nesjede útes > 4 px, drží 44 px od soupeře. Zásahový obdélník tanku: x +-20 px, od y-26 do y
 *        (RULES.tankHalfW/tankH), platí pro přímé zásahy i střepiny. Pád: nad 24 px pádu poškození
 *        (pád-24)/2+1 (max 50), nejde do mincí soupeře.
 *  Poškození výbuchu (škálované DMG_PCT = 62 %, RULES.dmgPct; dmg v WEAPONS je základ): R = r + 6, d2 = čtverec vzdálenosti výbuchu od NEJBLIŽŠÍHO BODU obdélníku tanku (uvnitř 0),
 *        dmg = max(1, dmgMax*(R^2-d2)/R^2) pro d2 <= R^2 (kvadratický pokles). Pancíř: každá úroveň -8 % poškození (max 4 úrovně =
 *        -32 %, minimum 1). Štít (40 bodů) pohltí poškození až po pancíři, vyprší na konci soupeřova příštího tahu.
 *  Mince: střelec dostane tolik mincí, kolik HP soupeři skutečně ubral (ne za sebe, ne za pád). Kolo: +40 vítěz, +20 poražený
 *        (remíza kola +20 oběma). Start 60 mincí.
 *  Kolo: končí smrtí tanku (oba mrtví = remíza), nebo po 14 tazích celkem (víc HP vyhrává, rovnost remíza).
 *        Zápas: první na 2 výhry kol, max 5 kol (pak víc výher, rovnost = winner -1). Další kolo: nový terén (seed+kolo),
 *        HP a palivo plné, cooldowny nuly, munice/upgrady/mince/nabití zůstávají, začíná poražený (remíza: střídavě).
 *  Obchod: tank.shop = true před prvním tahem hráče v každém kole (i v 1.). input.buy = ["up:armor","w:mirv","a:shield"].
 *        up:<id> = další úroveň upgradu (ceny v UPGRADES.prices), w:<id> = balíček munice (WEAPONS.pack kusů, sklad drží
 *        4 + 2*úroveň slots kusů od jedné zbraně), a:<id> = nabití navíc (tank.ch[id], max 3): příští použití aktivky
 *        nespustí cooldown. Granát je neomezený a nekupuje se.
 *  Aktivky: max 1 za tah, cooldown v tazích vlastního hráče (tank.cd[id] = kolik tahů ještě čekat; po použití
 *        cooldown-1, po každém vlastním tahu -1), v novém kole nuly. shield, teleport (ax, vzdálenost >= 50 px od soupeře),
 *        repair (+35 HP), calm (vítr 0 pro výstřel), airstrike (nahrazuje výstřel, 5 bomb nad ax, vítr je ovlivňuje),
 *        magnet (střela v okruhu 220 px od soupeře se stáčí vodorovně k němu), antigrav (gravitace střely míří nahoru
 *        prvních 60 ticků).
 *  Výhoda druhého v kole: hráč, který kolo nezačíná, má na začátku kola štít 20 bodů (RULES.firstShield); zanikne
 *        po prvním tahu začínajícího (běžné pravidlo štítu), takže ukrojí část první rány.
 *  Bot: suggestShot() je ve výchozím stavu lehce omylný (deterministická chyba 5..44 jednotek vx/vy z seed+turnNo+cur),
 *        opts.perfect:true = bez chyby, opts.jitter:N = pevná amplituda chyby.
 *  DÁREK (Dárek): Po každém výstřelu vybereš soupeři dárek: jednu ze tří zbraní, kterou musí vystřelit příště.
 *        input.gift (povinné v každém tahu) je jedna ze tří TankEngine.giftOptions(state): 2 zbraně z inventáře příjemce
 *        (munice > 0, granát taky) + 1 troll zbraň zdarma (pirko, konfety, hlína). Příjemce má v dalším tahu tank.gift
 *        a musí vystřelit právě ji (zbraň z jeho inventáře mu ubere munici, troll zbraň je zdarma). Výjimka: input.giftBack:true
 *        ("Vrátit dárek") utratí žeton tank.gb (1 na kolo, obchod a:giftback +1, max 2) a pak střílí cokoli. Nálet dárek
 *        nenahradí (při vynuceném dárku nejde). První tah kola a tah, který kolo ukončí, dárek nemá (zahodí se).
 *  Troll slot v nabídce: příjemce, který dostal posledně troll dárek, dostane tentokrát 3 běžné zbraně (z inventáře,
 *        případně doplněné granátem/základními zbraněmi) - nikdy dva trolly po sobě stejnému příjemci (tank.lt).
 *  MODIFIKÁTOR KOLA (state.mod, z seedu a čísla kola, TankEngine.MODS): normal (40 %), vichr (vítr x2), mesic (gravitace 6 místo 10),
 *        tezko (gravitace 13 místo 10; ne 14, aby šlo vždy dostřelit na soupeře), zrcadlo (vítr mění znaménko každý tah kola),
 *        bohaci (+40 mincí oběma na začátku kola), kratery (poloměry výbuchů x1.3).
 *  MAPA KOLA (state.map, TankEngine.MAPS): hills, kanon (hluboký kaňon uprostřed), plosiny (2-3 stupně), vulkan (velký kužel s kráterem),
 *        duny (hodně malých vln), ostrovy (vysoké věže). Tanky vždy stojí na rovném padu.
 *  VZTEK (tank.rage): kdo má na začátku svého tahu o 30+ HP míň než soupeř, má v tom tahu +25 % poškození výbuchů a dostane +10 mincí
 *        (událost {type:"rage",tank}). Poražený kola dostane navíc +30 mincí (celkem 50, vítěz 40).
 *  Pořadí tahu: nákup, pohyb (1 px/tick), aktivka (1 tick), výstřel, dosimulování, vyhodnocení kola, vítr, předání.
 *  Strop: 1800 ticků na tah, pak se vše násilně dokončí.
 *
 * ===== DETERMINISMUS =====
 *  Jen celá čísla, + - * a celočíselné dělení (idiv = Math.trunc(a/b)), isqrt, Math.imul pro PRNG a hash,
 *  Math.abs/min/max/floor/ceil/trunc. Žádné sin/cos/sqrt/pow/random/Date. Výjimka: blok // UI-ONLY na konci souboru.
 */
(function (root) {
  "use strict";

  const VERSION = "1";
  const W = 960, H = 540, S = 100, MAX_V = 1000, G = 10;
  const BASE = 8, TURRET = 10, TIP = 14, GRACE = 12;
  const ROUND_TURNS = 14, WIN_ROUNDS = 2, MAX_ROUNDS = 5, MAX_TICKS = 1800;
  const START_COINS = 60, WIN_BONUS = 40, LOSE_BONUS = 20;
  const BASE_HP = 100, BASE_FUEL = 160, FUEL_STEP = 60, FUEL_REGEN = 20, ARMOR_PCT = 8;
  const CLIMB_MAX = 2, DROP_MAX = 4, FALL_T = 24, FALL_CAP = 50;
  const SHIELD_PTS = 40, REPAIR_HP = 35, MAG_R = 220, MAG_PUSH = 30, ANTIGRAV_T = 60;
  const DRILL_LEN = 150, ROLL_TIME = 300, ROLL_MAX = 450, MIRV_MIN = 6;
  const LOSE_EXTRA = 30, RAGE_GAP = 30, RAGE_PCT = 125, RAGE_COINS = 10;
  const SPLASH_PAD = 6, DMG_PCT = 62;      // globální škálování poškození výbuchů v procentech
  const TANK_HW = 20, TANK_H = 26;      // zásahový obdélník tanku: x +-20, od y-26 (nahoře) do y (spodek = povrch)
  const FIRST_SHIELD = 20, ROLL_CLIMB = 3, GB_PRICE = 40;
  const AIR = 0, LAND = 1, TANKHIT = 2, OUT = 3;

  // ---------- pomocné celočíselné funkce ----------
  function idiv(a, b) { return Math.trunc(a / b) + 0; }
  function sgn(a) { return a > 0 ? 1 : (a < 0 ? -1 : 0); }
  function clampi(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function isqrt(n) {
    if (n <= 0) return 0;
    let x = n, y = Math.floor((x + 1) / 2);
    while (y < x) { x = y; y = Math.floor((x + Math.floor(n / x)) / 2); }
    return x;
  }
  function mix32(a) {
    a = Math.imul(a ^ (a >>> 16), 0x85EBCA6B);
    a = Math.imul(a ^ (a >>> 13), 0xC2B2AE35);
    return (a ^ (a >>> 16)) >>> 0;
  }
  function mulberry(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
  }
  function seedInt(seed) {
    if (typeof seed === "number" && isFinite(seed)) return mix32((Math.trunc(seed) % 4294967296) | 0);
    if (typeof seed === "string") {
      let x = 0x811C9DC5;
      for (let i = 0; i < seed.length; i++) { x ^= seed.charCodeAt(i); x = Math.imul(x, 0x01000193); }
      return mix32(x);
    }
    return mix32(0);
  }
  function windFor(si, n) {
    const a = mix32(si ^ Math.imul(n + 1, 0x9E3779B1));
    const b = mix32(a ^ 0x68E31DA4);
    return (a % 16) + (b % 16) - 15;
  }

  // ---------- data ----------
  const WEAPONS = [
    { id: "grenade", name: "Granát", desc: "Obyčejný, spolehlivý bum. Nikdy nedojde.", price: 0, start: 99, unlimited: true, pack: 0, k: "std", r: 34, d: 45, ek: "boom" },
    { id: "triple", name: "Trojitá", desc: "Tři granáty ve vějíři. Aspoň jeden snad trefí.", price: 30, start: 2, pack: 2, k: "std", r: 26, d: 28, ek: "boom" },
    { id: "mirv", name: "Rozpadávka", desc: "Na vrcholu dráhy se rozpadne na pět bomb.", price: 45, start: 1, pack: 1, k: "mirv", r: 24, d: 22, ek: "boom" },
    { id: "roller", name: "Válec", desc: "Dopadne a kutálí se z kopce. Bouchne na tanku nebo v údolí.", price: 35, start: 1, pack: 2, k: "roller", r: 38, d: 50, ek: "boom" },
    { id: "drill", name: "Vrták", desc: "Prožene se zemí a vyhloubí příkop. Bouchne na tanku.", price: 40, start: 1, pack: 2, k: "drill", r: 30, d: 52, ek: "boom" },
    { id: "napalm", name: "Napalm", desc: "Hořící kaluže stékají z kopce a pálí.", price: 50, start: 1, pack: 1, k: "napalm", r: 14, d: 0, ek: "fire" },
    { id: "dirt", name: "Hlína", desc: "Nasype kopec. Nikomu neublíží, jen ho zasype.", price: 20, start: 2, pack: 2, k: "dirt", r: 36, d: 0, ek: "dirt" },
    { id: "bouncer", name: "Skokan", desc: "Odskočí, odskočí a na třetí dopad bouchne.", price: 30, start: 1, pack: 2, k: "bouncer", r: 30, d: 48, ek: "boom" },
    { id: "spray", name: "Rozprašovač", desc: "Sedm malých broků v kuželu.", price: 35, start: 1, pack: 2, k: "std", r: 14, d: 15, ek: "small" },
    { id: "nuke", name: "Atomovka", desc: "Obří výbuch. Drahá a hlasitá.", price: 160, start: 0, pack: 1, k: "std", r: 80, d: 85, ek: "boom" },
    { id: "leaper", name: "Žabák", desc: "Třikrát skočí a pokaždé malounko bouchne.", price: 40, start: 1, pack: 2, k: "leaper", r: 22, d: 36, ek: "small" }
  ];
  // troll zbraně: jen jako dárek (nejsou v obchodě ani v tank.ammo)
  const TROLL = [
    { id: "pirko", name: "Pírko", desc: "Lehounká střela, vítr s ní třikrát cloumá. Malý bouchanec.", price: 0, start: 0, pack: 0, troll: true, k: "std", r: 16, d: 12, ek: "small", wm: 3 },
    { id: "konfety", name: "Konfety", desc: "Prask konfet. Skoro nic nebolí, hlavně pobaví.", price: 0, start: 0, pack: 0, troll: true, k: "std", r: 5, d: 8, ek: "small" }
  ];
  const TROLL_POOL = ["pirko", "konfety", "dirt"];
  const PAD_POOL = ["grenade", "triple", "spray", "bouncer", "leaper", "mirv"];   // doplnění nabídky bez trollu: základní zbraně
  const ABILITIES = [
    { id: "shield", name: "Štít", desc: "Pohltí 40 bodů poškození do konce soupeřova tahu.", cooldown: 3, price: 25 },
    { id: "teleport", name: "Teleport", desc: "Přenese tě na zvolené místo (aspoň 30 px od soupeře), pak střílíš.", cooldown: 4, price: 35 },
    { id: "repair", name: "Oprava", desc: "Vrátí 35 životů.", cooldown: 4, price: 30 },
    { id: "calm", name: "Bezvětří", desc: "Vítr je pro tenhle výstřel nulový.", cooldown: 3, price: 20 },
    { id: "airstrike", name: "Nálet", desc: "Místo výstřelu spadne pět bomb kolem zvoleného místa.", cooldown: 7, price: 50 },
    { id: "magnet", name: "Magnet", desc: "Střela se v okruhu 220 px stáčí k soupeři.", cooldown: 3, price: 30 },
    { id: "antigrav", name: "Antigravitace", desc: "První vteřinu střela padá nahoru. Přehodí i kopec.", cooldown: 3, price: 25 }
  ];
  const UPGRADES = [
    { id: "armor", name: "Pancíř", desc: "-8 % poškození za úroveň.", max: 4, prices: [40, 70, 110, 160] },
    { id: "fuel", name: "Palivo", desc: "+60 px dojezdu za úroveň.", max: 3, prices: [25, 45, 70] },
    { id: "preview", name: "Náhled", desc: "Delší náhled dráhy, od 3. úrovně i s větrem.", max: 4, prices: [15, 30, 50, 80] },
    { id: "slots", name: "Sklad", desc: "+2 kusy munice od každé zbraně (základ 4).", max: 3, prices: [30, 60, 100] }
  ];
  const RULES = {
    roundTurns: ROUND_TURNS, winRounds: WIN_ROUNDS, maxRounds: MAX_ROUNDS, hp: BASE_HP, fuel: BASE_FUEL, fuelStep: FUEL_STEP,
    fuelRegen: FUEL_REGEN, startCoins: START_COINS, winBonus: WIN_BONUS, loseBonus: LOSE_BONUS, fallThreshold: FALL_T,
    shield: SHIELD_PTS, repair: REPAIR_HP, armorPct: ARMOR_PCT, magnetRadius: MAG_R, maxTicks: MAX_TICKS,
    previewTicks: [14, 24, 38, 56, 76], gravity: G, windMax: 15, firstShield: FIRST_SHIELD, loseExtra: LOSE_EXTRA, rageGap: RAGE_GAP, ragePct: RAGE_PCT, rageCoins: RAGE_COINS, tankHalfW: TANK_HW, tankH: TANK_H, dmgPct: DMG_PCT, giftBackPerRound: 1, giftBackMax: 2, giftBackPrice: GB_PRICE, trollPool: TROLL_POOL
  };
  const MODS = [
    { id: "normal", name: "Normální", desc: "Žádné vtípky, jen poctivá dělostřelba." },
    { id: "vichr", name: "Vichřice", desc: "Vítr je dvakrát silnější." },
    { id: "mesic", name: "Měsíc", desc: "Gravitace jen 60 %, střely létají daleko." },
    { id: "tezko", name: "Těžká planeta", desc: "Gravitace o 30 % větší, střely padají dřív." },
    { id: "zrcadlo", name: "Zrcadlo", desc: "Vítr každý tah změní směr." },
    { id: "bohaci", name: "Boháči", desc: "Každý začne kolo s 40 mincemi navíc." },
    { id: "kratery", name: "Krátery", desc: "Výbuchy mají o 30 % větší dosah." }
  ];
  const MAPS = [
    { id: "hills", name: "Kopečky" }, { id: "kanon", name: "Kaňon" }, { id: "plosiny", name: "Plošiny" },
    { id: "vulkan", name: "Sopka" }, { id: "duny", name: "Duny" }, { id: "ostrovy", name: "Věže" }
  ];
  const MOD_TABLE = ["normal", "normal", "normal", "normal", "vichr", "mesic", "tezko", "zrcadlo", "bohaci", "kratery"];
  // kolo nikdy nezopakuje mapu ani zvláštní modifikátor předchozího kola (prev = předchozí kolo, v 1. kole se nehlídá)
  function mapFor(si, round, prev) {
    let i = mix32(si ^ Math.imul(round + 3, 0x85EBCA6B) ^ 0x5BD1E995) % MAPS.length;
    if (round > 1 && MAPS[i].id === prev) i = (i + 1 + mix32(si ^ Math.imul(round + 7, 0x27D4EB2F)) % (MAPS.length - 1)) % MAPS.length;
    return MAPS[i].id;
  }
  function modFor(si, round, prev) {
    const i = mix32(si ^ Math.imul(round + 5, 0x9E3779B1) ^ 0x27D4EB2F) % MOD_TABLE.length;
    return round > 1 && prev !== "normal" && MOD_TABLE[i] === prev ? MOD_TABLE[(i + 1) % MOD_TABLE.length] : MOD_TABLE[i];
  }
  function grav(s) { return s.mod === "mesic" ? 6 : (s.mod === "tezko" ? 13 : G); }
  function rad(s, r) { return s.mod === "kratery" ? idiv(r * 13, 10) : r; }
  function windOf(s, si, n) {
    let w = windFor(si, n);
    if (s.mod === "vichr") w = w * 2;
    if (s.mod === "zrcadlo" && (s.roundTurn & 1)) w = 0 - w;
    return w;
  }
  const MAPOWN = Object.create(null), MODOWN = Object.create(null);
  MAPS.forEach(function (m) { MAPOWN[m.id] = m; });
  MODS.forEach(function (m) { MODOWN[m.id] = m; });
  const WMAP = Object.create(null), AMAP = Object.create(null), UMAP = Object.create(null);
  WEAPONS.forEach(function (w) { WMAP[w.id] = w; });
  TROLL.forEach(function (w) { WMAP[w.id] = w; });
  ABILITIES.forEach(function (a) { AMAP[a.id] = a; });
  UPGRADES.forEach(function (u) { UMAP[u.id] = u; });
  function own(m, k) { return typeof k === "string" && Object.prototype.hasOwnProperty.call(m, k); }
  const EXTRAS = [{ id: "a:giftback", name: "Vrátit dárek", desc: "Žeton navíc: vrátíš soupeřův dárek a střílíš čím chceš (max 2 na kolo).", price: GB_PRICE, max: 1 }];
  const ROT = { 6: [9945, 1045], 8: [9903, 1392], 12: [9781, 2079], 18: [9511, 3090] };
  const COS = [1000, 1000, 999, 999, 998, 996, 995, 993, 990, 988, 985, 982, 978, 974, 970, 966, 961, 956, 951, 946, 940, 934, 927, 921, 914, 906, 899, 891, 883, 875, 866, 857, 848, 839, 829, 819, 809, 799, 788, 777, 766, 755, 743, 731, 719, 707, 695, 682, 669, 656, 643, 629, 616, 602, 588, 574, 559, 545, 530, 515, 500, 485, 469, 454, 438, 423, 407, 391, 375, 358, 342, 326, 309, 292, 276, 259, 242, 225, 208, 191, 174, 156, 139, 122, 105, 87, 70, 52, 35, 17, 0];
  function cosA(a) { return a <= 90 ? COS[a] : -COS[180 - a]; }
  function sinA(a) { return COS[Math.abs(90 - a)]; }

  // ---------- terén ----------
  function genTerrain(si, round, map) {
    const rng = mulberry(mix32(si ^ Math.imul(round, 0x27D4EB2F) ^ 0x1234567));
    let NP = 11, SEG = 96, lim = 80;
    const pts = [];
    if (map === "kanon") {
      const depth = 55 + rng() % 25, rim = 150 + rng() % 60, tilt = (rng() % 30) - 15;
      lim = 110;
      for (let i = 0; i < NP; i++) {
        const d = Math.abs(i - 5);
        let v = d === 0 ? depth : (d === 1 ? depth + 15 : (d === 2 ? rim - 30 : rim));
        if (d >= 2) v += rng() % 20;
        pts.push(clampi(v + idiv(tilt * (i - 5), 5), 50, 290));
      }
    } else if (map === "plosiny") {
      const n = 2 + rng() % 2, lv = [];
      lim = 70;
      for (let k = 0; k < n; k++) {
        let v = 90 + rng() % 170;
        if (k > 0 && Math.abs(v - lv[k - 1]) < 50) v = lv[k - 1] + (lv[k - 1] < 170 ? 60 : -60);
        lv.push(clampi(v, 70, 280));
      }
      for (let i = 0; i < NP; i++) pts.push(clampi(lv[idiv(i * n, NP)] + rng() % 12, 60, 290));
    } else if (map === "vulkan") {
      const peak = 265 + rng() % 25, base = 80 + rng() % 50, tilt = (rng() % 40) - 20;
      lim = 60;
      for (let i = 0; i < NP; i++) {
        const d = Math.abs(i - 5);
        let v = base + idiv((peak - base) * (5 - d), 5) + idiv(tilt * (i - 5), 5) + rng() % 10;
        if (i === 5) v -= 50;
        pts.push(clampi(v, 60, 290));
      }
    } else if (map === "duny") {
      NP = 21; SEG = 48;
      const base = 110 + rng() % 60, amp = 30 + rng() % 40, tilt = (rng() % 40) - 20;
      for (let i = 0; i < NP; i++) pts.push(clampi(base + ((i & 1) ? amp : 0) + rng() % 25 + idiv(tilt * (i - 10), 10), 60, 290));
    } else if (map === "ostrovy") {
      NP = 21; SEG = 48; lim = 160;
      const low = 85 + rng() % 40, cand = [7, 9, 11, 13];
      for (let i = 0; i < NP; i++) pts.push(low + rng() % 15);
      for (let k = 0; k < 3; k++) {
        const c = cand.splice(rng() % cand.length, 1)[0], hgt = 185 + rng() % 55;
        pts[c] = hgt; pts[c + 1] = hgt;
      }
    } else {
      const style = rng() % 5;
      const tilt = (rng() % 90) - 45;
      for (let i = 0; i < NP; i++) {
        const d = Math.abs(i - 5);
        let v;
        if (style === 0) v = 90 + rng() % 150;
        else if (style === 1) v = 80 + rng() % 50 + Math.max(0, 170 - d * 50);
        else if (style === 2) v = 90 + rng() % 50 + Math.min(180, d * 38);
        else if (style === 3) v = 110 + rng() % 70;
        else v = 100 + rng() % 70 + ((i & 1) ? 60 : 0);
        v += idiv(tilt * (i - 5), 5);
        pts.push(clampi(v, 60, 290));
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < NP; i++) pts[i] = clampi(pts[i], pts[i - 1] - lim, pts[i - 1] + lim);
      for (let i = NP - 2; i >= 0; i--) pts[i] = clampi(pts[i], pts[i + 1] - lim, pts[i + 1] + lim);
    }
    let h = new Array(W);
    for (let x = 0; x < W; x++) {
      const i = Math.min(NP - 2, Math.floor(x / SEG));
      const t = idiv((x - i * SEG) * 1000, SEG);
      const sm = idiv(t * t * (3000 - 2 * t), 1000000);
      h[x] = pts[i] + idiv((pts[i + 1] - pts[i]) * sm, 1000);
    }
    for (let pass = 0; pass < 2; pass++) {
      const g = new Array(W);
      for (let x = 0; x < W; x++) {
        let sum = 0;
        for (let k = -4; k <= 4; k++) sum += h[clampi(x + k, 0, W - 1)];
        g[x] = idiv(sum, 9);
      }
      h = g;
    }
    const x0 = idiv(W * 12, 100) + rng() % idiv(W * 10, 100);
    const x1 = idiv(W * 78, 100) + rng() % idiv(W * 10, 100);
    [x0, x1].forEach(function (cx) {
      let sum = 0;
      for (let k = -12; k <= 12; k++) sum += h[cx + k];
      const level = idiv(sum, 25);
      for (let d = -26; d <= 26; d++) {
        const x = cx + d, ad = Math.abs(d);
        if (ad <= 14) h[x] = level;
        else h[x] = level + idiv((h[x] - level) * (ad - 14), 12);
      }
    });
    for (let x = 0; x < W; x++) h[x] = clampi(h[x], BASE + 12, H - 100);
    return { h: h, xs: [x0, x1] };
  }
  function carve(h, cx, cy, r) {
    let tot = 0;
    const r2 = r * r, a = Math.max(0, cx - r), b = Math.min(W - 1, cx + r);
    for (let x = a; x <= b; x++) {
      const dx = x - cx, dy = isqrt(r2 - dx * dx);
      const lo = Math.max(H - h[x], cy - dy), hi = Math.min(H - BASE - 1, cy + dy);
      if (hi >= lo) { const ov = hi - lo + 1; h[x] -= ov; tot += ov; }
    }
    return tot;
  }
  function addDirt(h, cx, cy, r) {
    const r2 = r * r, a = Math.max(0, cx - r), b = Math.min(W - 1, cx + r);
    for (let x = a; x <= b; x++) {
      const dx = x - cx, dy = isqrt(r2 - dx * dx);
      h[x] = Math.min(H - 60, h[x] + idiv(dy * 3, 4));
    }
  }
  function tankY(h, x) {
    let m = 0;
    const a = Math.max(0, x - 4), b = Math.min(W - 1, x + 4);
    for (let i = a; i <= b; i++) if (h[i] > m) m = h[i];
    return H - m;
  }

  // ---------- stav ----------
  function cl(o) {
    if (o === null || typeof o !== "object") return o;
    if (Array.isArray(o)) {
      if (o.length && typeof o[0] !== "object") return o.slice();
      const a = new Array(o.length);
      for (let i = 0; i < o.length; i++) a[i] = cl(o[i]);
      return a;
    }
    const r = {};
    for (const k in o) r[k] = cl(o[k]);
    return r;
  }
  function clone(state) { return cl(state); }

  function makeTank(color) {
    const ammo = {}, cd = {}, ch = {};
    WEAPONS.forEach(function (w) { ammo[w.id] = w.start; });
    ABILITIES.forEach(function (a) { cd[a.id] = 0; ch[a.id] = 0; });
    return {
      x: 0, y: 0, hp: BASE_HP, maxHp: BASE_HP, fuel: BASE_FUEL, maxFuel: BASE_FUEL, shield: 0, coins: START_COINS,
      ammo: ammo, cd: cd, ch: ch, up: { armor: 0, fuel: 0, preview: 0, slots: 0 }, shop: true, color: color, alive: true,
      fall: 0, fd: 0, gift: null, gf: 0, gb: 1, gbx: 0, lt: 0, rage: false
    };
  }
  function setupRound(s, starter, force) {
    const si = seedInt(s.seed);
    force = force || {};
    s.map = own(MAPOWN, force.map) ? force.map : mapFor(si, s.round, s.map);
    s.mod = own(MODOWN, force.mod) ? force.mod : modFor(si, s.round, s.mod);
    const g = genTerrain(si, s.round, s.map);
    s.h = g.h;
    for (let i = 0; i < 2; i++) {
      const t = s.tanks[i];
      t.x = g.xs[i]; t.y = tankY(s.h, t.x);
      t.hp = t.maxHp; t.fuel = t.maxFuel; t.shield = 0; t.alive = true; t.shop = true; t.fall = 0; t.fd = 0;
      t.gift = null; t.gf = 0; t.gb = 1 + t.gbx; t.lt = 0; t.rage = false;
      if (s.mod === "bohaci") t.coins += 40;
      for (const id in t.cd) t.cd[id] = 0;
    }
    s.tanks[1 - starter].shield = FIRST_SHIELD;
    s.cur = starter; s.rstart = starter; s.roundTurn = 0; s.proj = []; s.fires = []; s.rdmg = [0, 0];
    s.wind = windOf(s, si, s.turnNo);
  }
  function newMatch(opts) {
    opts = opts || {};
    const start = opts.start === 1 ? 1 : 0;
    const seed = opts.seed === undefined ? 1 : opts.seed;
    const s = {
      seed: seed, start: start, round: 1, turnNo: 0, roundTurn: 0, cur: start, wind: 0, h: [],
      tanks: [makeTank(0), makeTank(1)], wins: [0, 0], roundOver: false, matchOver: false, winner: null,
      lastRound: null, proj: [], fires: [], rdmg: [0, 0], rstart: start, map: "hills", mod: "normal"
    };
    setupRound(s, start, { map: opts.map, mod: opts.mod });
    return s;
  }
  function surfaceY(state, x) { return tankY(state.h, clampi(x, 0, W - 1)); }

  // ---------- nákup ----------
  function capFor(t) { return 4 + 2 * t.up.slots; }
  // mění t (nebo jeho kopii), vrací důvod nebo null
  function applyBuy(t, item) {
    if (typeof item !== "string") return "Položka v obchodě není text.";
    const p = item.indexOf(":");
    if (p < 1) return "Neznámá položka v obchodě.";
    const kind = item.slice(0, p), id = item.slice(p + 1);
    if (kind === "up") {
      if (!own(UMAP, id)) return "Neznámý upgrade.";
      const u = UMAP[id];
      const lv = t.up[id] | 0;
      if (lv >= u.max) return "Upgrade " + u.name + " už je na maximu.";
      if (t.coins < u.prices[lv]) return "Na " + u.name + " nemáš dost mincí.";
      t.coins -= u.prices[lv]; t.up[id] = lv + 1;
      if (id === "fuel") { t.maxFuel += FUEL_STEP; t.fuel += FUEL_STEP; }
      return null;
    }
    if (kind === "w") {
      if (!own(WMAP, id) || WMAP[id].unlimited || WMAP[id].troll) return "Tuhle zbraň koupit nejde.";
      const w = WMAP[id];
      if (t.coins < w.price) return "Na " + w.name + " nemáš dost mincí.";
      if ((t.ammo[id] | 0) + w.pack > capFor(t)) return "Sklad na " + w.name + " je plný.";
      t.coins -= w.price; t.ammo[id] = (t.ammo[id] | 0) + w.pack;
      return null;
    }
    if (kind === "a" && id === "giftback") {
      if (t.coins < GB_PRICE) return "Na vrácení dárku nemáš dost mincí.";
      if ((t.gbx | 0) >= 1) return "Víc vrácení dárku už se nevejde.";
      t.coins -= GB_PRICE; t.gbx = 1; t.gb = (t.gb | 0) + 1;
      return null;
    }
    if (kind === "a") {
      if (!own(AMAP, id)) return "Neznámá aktivka.";
      const a = AMAP[id];
      if (t.coins < a.price) return "Na " + a.name + " nemáš dost mincí.";
      if ((t.ch[id] | 0) >= 3) return "Víc nabití už se nevejde.";
      t.coins -= a.price; t.ch[id] = (t.ch[id] | 0) + 1;
      return null;
    }
    return "Neznámá položka v obchodě.";
  }

  // ---------- validace ----------
  // nabídka dárků pro právě hrajícího (dárce): 2 zbraně z inventáře příjemce + 1 troll zdarma, deterministicky
  function giftPlan(state) {
    const o = state.tanks[1 - state.cur];
    let r = mix32(seedInt(state.seed) ^ Math.imul((state.turnNo | 0) + 13, 0x9E3779B1) ^ Math.imul(state.cur + 1, 0x85EBCA6B));
    const inv = [];
    for (let i = 0; i < WEAPONS.length; i++) { const w = WEAPONS[i]; if (w.unlimited || (o.ammo[w.id] | 0) > 0) inv.push(w.id); }
    const plan = [];
    const noTroll = (o.lt | 0) === 1;      // soupeř posledně dostal troll: tentokrát žádný (nikdy 2x po sobě)
    const nInv = Math.min(noTroll ? 3 : 2, inv.length);
    for (let k = 0; k < nInv; k++) {
      r = mix32(r + 0x9E3779B1);
      plan.push({ id: inv.splice(r % inv.length, 1)[0], free: false, troll: false });
    }
    const pool = (noTroll ? PAD_POOL : TROLL_POOL).filter(function (id) { return !plan.some(function (e) { return e.id === id; }); });
    while (plan.length < 3 && pool.length) {
      r = mix32(r + 0x85EBCA6B);
      plan.push({ id: pool.splice(r % pool.length, 1)[0], free: true, troll: !noTroll });
    }
    return plan;
  }
  function giftOptions(state) {
    try { if (!state || state.matchOver) return []; return giftPlan(state).map(function (e) { return e.id; }); } catch (e) { return []; }
  }
  function weaponInfo(id) { return own(WMAP, id) ? WMAP[id] : null; }
  function isInt(v) { return typeof v === "number" && Number.isSafeInteger(v); }
  function shapeOk(t) {
    return !!t && typeof t === "object" && typeof t.coins === "number" && typeof t.fuel === "number" && typeof t.x === "number" &&
      ["up", "ammo", "cd", "ch"].every(function (k) { return t[k] !== null && typeof t[k] === "object"; });
  }
  function validate(state, input) {
    try { return validateInner(state, input); } catch (e) { return "Neplatný vstup."; }
  }
  function validateInner(state, input) {
    if (!state || typeof state !== "object" || !Array.isArray(state.tanks) || state.tanks.length !== 2) return "Neplatný stav hry.";
    if (state.matchOver) return "Zápas už skončil.";
    if (!input || typeof input !== "object" || Array.isArray(input)) return "Tah musí být objekt.";
    const t = state.tanks[state.cur], o = state.tanks[1 - state.cur];
    if (!t || !o) return "Neplatný stav hry.";
    if (!Array.isArray(state.h) || !shapeOk(t) || !shapeOk(o)) return "Neplatný stav hry.";
    // nákup na kopii tanku
    const sim = { coins: t.coins, up: Object.assign({}, t.up), ammo: Object.assign({}, t.ammo), ch: Object.assign({}, t.ch), maxFuel: t.maxFuel, fuel: t.fuel, gb: t.gb, gbx: t.gbx };
    const buy = input.buy;
    if (buy !== undefined && buy !== null) {
      if (!Array.isArray(buy)) return "Nákup musí být seznam.";
      if (buy.length > 20) return "Moc nákupů najednou.";
      if (buy.length && !t.shop) return "Obchod je teď zavřený.";
      for (let i = 0; i < buy.length; i++) { const why = applyBuy(sim, buy[i]); if (why) return why; }
    }
    const move = input.move === undefined || input.move === null ? 0 : input.move;
    if (!isInt(move)) return "Pohyb musí být celé číslo.";
    if (Math.abs(move) > sim.fuel) return "Na tolik pohybu nemáš palivo.";
    const note = input.note;
    if (note !== undefined && note !== null && (typeof note !== "string" || note.length > 40)) return "Poznámka je moc dlouhá.";
    const ax = input.ax;
    if (ax !== undefined && ax !== null && !isInt(ax)) return "Cíl aktivky musí být celé číslo.";
    const ab = input.ability === undefined || input.ability === null ? null : input.ability;
    if (ab !== null) {
      if (!own(AMAP, ab)) return "Neznámá aktivka.";
      if ((t.cd[ab] | 0) > 0) return "Aktivka se ještě nabíjí.";
      if (ab === "teleport" || ab === "airstrike") {
        if (!isInt(ax)) return "Chybí cíl aktivky.";
        if (ab === "teleport") {
          if (ax < 14 || ax > W - 15) return "Teleport mimo hřiště.";
          if (o.alive && Math.abs(ax - o.x) < 2 * TANK_HW + 10) return "Moc blízko soupeři.";
        } else if (ax < 0 || ax > W - 1) return "Nálet mimo hřiště.";
      }
    }
    const gbk = input.giftBack;
    if (gbk !== undefined && gbk !== null && typeof gbk !== "boolean") return "Vrácení dárku musí být ano/ne.";
    const forcedId = t.gift === undefined || t.gift === null ? null : t.gift;
    if (gbk === true) {
      if (forcedId === null) return "Není co vracet, žádný dárek nemáš.";
      if ((sim.gb | 0) < 1) return "Nemáš žeton na vrácení dárku.";
    }
    const forced = forcedId !== null && gbk !== true;
    if (forced && ab === "airstrike") return "Dárek musíš vystřelit, nálet nejde.";
    if (typeof input.gift !== "string") return "Vyber soupeři dárek.";
    if (!giftPlan(state).some(function (e) { return e.id === input.gift; })) return "Dárek musí být jedna ze tří nabízených zbraní.";
    if (ab !== "airstrike") {
      if (!own(WMAP, input.weapon)) return "Neznámá zbraň.";
      const w = WMAP[input.weapon];
      if (forced) { if (input.weapon !== forcedId) return "Musíš vystřelit dárek: " + (own(WMAP, forcedId) ? WMAP[forcedId].name : forcedId) + "."; }
      else if (!w.unlimited && (sim.ammo[w.id] | 0) <= 0) return "Tuhle zbraň nemáš.";
      if (!isInt(input.vx) || !isInt(input.vy)) return "Rychlost musí být celé číslo.";
      if (Math.abs(input.vx) > MAX_V || Math.abs(input.vy) > MAX_V || input.vx * input.vx + input.vy * input.vy > MAX_V * MAX_V) return "Moc velká síla výstřelu.";
    }
    return null;
  }
  // zkopíruje a normalizuje už zvalidovaný vstup (turn nesmí držet odkaz na měnitelný objekt)
  function normInput(input) {
    const ab = input.ability === undefined || input.ability === null ? null : input.ability;
    const air = ab === "airstrike";
    return {
      buy: Array.isArray(input.buy) ? input.buy.slice() : [],
      move: (input.move || 0) + 0,
      ability: ab,
      ax: isInt(input.ax) ? input.ax + 0 : 0,
      weapon: air ? "grenade" : input.weapon,
      vx: air ? 0 : input.vx + 0,
      vy: air ? 0 : input.vy + 0,
      gift: input.gift,
      giftBack: input.giftBack === true
    };
  }

  // ---------- fyzika projektilu ----------
  function mkProj(ctx, w, x, y, vx, vy, o) {
    return {
      id: ++ctx.pid, w: w.id, k: w.k, x: x, y: y, vx: vx, vy: vy, o: o, age: 0, wa: 0, ma: 0, r: w.r, d: w.d, ek: w.ek,
      ag: ctx.ag ? 1 : 0, mg: ctx.mg ? 1 : 0, n: 0, wm: w.wm || 1, lo: 0
    };
  }
  function inBox(t, px, py) { return px >= t.x - TANK_HW && px <= t.x + TANK_HW && py >= t.y - TANK_H && py <= t.y + 2; }
  // čtverec vzdálenosti bodu od nejbližšího bodu zásahového obdélníku tanku (0 uvnitř)
  function boxDist2(t, x, y) {
    const dx = Math.max(0, Math.abs(x - t.x) - TANK_HW);
    const dy = y < t.y - TANK_H ? (t.y - TANK_H) - y : (y > t.y ? y - t.y : 0);
    return dx * dx + dy * dy;
  }
  function tankAt(s, px, py, o, grace) {
    for (let i = 0; i < 2; i++) {
      const t = s.tanks[i];
      if (!t.alive) continue;
      if (grace && i === o) continue;
      if (inBox(t, px, py)) return i;
    }
    return -1;
  }
  // zrychlení + pohyb o 1 tick po pixelových podkrocích; vrací AIR/LAND/TANKHIT/OUT
  function advance(s, wind, p) {
    p.age++;
    p.vy += (p.ag && p.age <= ANTIGRAV_T) ? -grav(s) : grav(s);
    p.wa += wind * (p.wm || 1);
    const dw = idiv(p.wa, 10);
    p.wa -= dw * 10; p.vx += dw;
    if (p.mg) {
      const ot = s.tanks[1 - p.o];
      if (ot && ot.alive) {
        const ddx = ot.x - Math.floor(p.x / S), ddy = (ot.y - 6) - Math.floor(p.y / S);
        if (ddx * ddx + ddy * ddy <= MAG_R * MAG_R) {
          p.ma += sgn(ddx) * MAG_PUSH;
          const dm = idiv(p.ma, 10);
          p.ma -= dm * 10; p.vx += dm;
        }
      }
    }
    const vx = p.vx, vy = p.vy, h = s.h;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) / S));
    const x0 = p.x, y0 = p.y;
    let lx = x0, ly = y0;
    for (let i = 1; i <= n; i++) {
      const nx = x0 + idiv(vx * i, n), ny = y0 + idiv(vy * i, n);
      const px = Math.floor(nx / S), py = Math.floor(ny / S);
      if (px < 0 || px >= W) { p.x = nx; p.y = ny; return OUT; }
      const ti = tankAt(s, px, py, p.o, !p.lo);
      if (!p.lo && !inBox(s.tanks[p.o], px, py)) p.lo = 1;     // vlastní tank neškodí, dokud střela neopustí jeho obdélník
      if (ti >= 0) { p.x = nx; p.y = ny; p.lx = lx; p.ly = ly; p.ht = ti; return TANKHIT; }
      if (py >= H - h[px]) { p.x = nx; p.y = ny; p.lx = lx; p.ly = ly; return LAND; }
      lx = nx; ly = ny;
    }
    p.x = x0 + vx; p.y = y0 + vy;
    return AIR;
  }

  // ---------- výbuchy a poškození ----------
  function dealDamage(s, ctx, ev, ti, raw, owner) {
    const t = s.tanks[ti];
    if (!t.alive) return;
    let dmg = Math.max(1, idiv(raw * (100 - ARMOR_PCT * t.up.armor), 100));
    const absorbed = Math.min(t.shield, dmg);
    t.shield -= absorbed;
    const loss = Math.min(dmg - absorbed, t.hp);
    t.hp -= loss;
    ev.push({ type: "damage", tank: ti, amount: loss, hp: t.hp, shielded: absorbed > 0 });
    if (loss > 0 && owner >= 0 && owner !== ti) {
      s.tanks[owner].coins += loss;
      s.rdmg[owner] += loss;
      ev.push({ type: "coins", tank: owner, amount: loss });
    }
    if (t.hp <= 0) { t.alive = false; ev.push({ type: "die", tank: ti }); }
  }
  function boom(s, ctx, ev, x, y, r, d, owner, ek, w) {
    r = rad(s, r);
    ev.push({ type: "explode", x: x, y: y, r: r, weapon: w, kind: ek });
    if (ek === "dirt") { addDirt(s.h, x, y, r); ctx.terr = true; return; }
    if (carve(s.h, x, y, r) > 0) ctx.terr = true;
    if (d > 0) {
      const R = r + SPLASH_PAD, R2 = R * R;
      const pct = DMG_PCT * (owner >= 0 && s.tanks[owner].rage ? RAGE_PCT : 100);
      for (let ti = 0; ti < 2; ti++) {
        const t = s.tanks[ti];
        if (!t.alive) continue;
        const d2 = boxDist2(t, x, y);
        if (d2 <= R2) dealDamage(s, ctx, ev, ti, Math.max(1, idiv(d * pct * (R2 - d2), 10000 * R2)), owner);
      }
    }
  }
  function spawnFire(s, ctx, ev, x, owner) {
    x = clampi(x, 1, W - 2);
    ev.push({ type: "explode", x: x, y: H - s.h[x], r: 14, weapon: "napalm", kind: "fire" });
    for (let i = 0; i < 7; i++) {
      const off = (i - 3) * 6, fx = clampi(x + off, 1, W - 2);
      s.fires.push({ x: fx, y: H - s.h[fx] - 1, t: 36 + i * 3, d: sgn(off), o: owner });
    }
  }
  function detonate(s, ctx, ev, p, x, y) {
    x = clampi(x, 0, W - 1);
    if (p.k === "napalm") spawnFire(s, ctx, ev, x, p.o);
    else boom(s, ctx, ev, x, y, p.r, p.d, p.o, p.ek, p.w);
  }

  // ---------- chování zbraní za letu ----------
  function rollTick(s, ctx, ev, p) {
    p.age++; p.t++;
    const h = s.h;
    const px0 = Math.floor(p.x / S);
    const sl = h[Math.min(W - 1, px0 + 2)] - h[Math.max(0, px0 - 2)];
    p.rv += -sl * 6;
    p.rv -= idiv(p.rv, 24);
    p.rv = clampi(p.rv, -ROLL_MAX, ROLL_MAX);
    const target = p.x + p.rv, tpx = Math.floor(target / S), d = sgn(tpx - px0);
    let cx = px0, blocked = false;
    while (cx !== tpx) {          // sloupec po sloupci: zeď strmější než ROLL_CLIMB válec zastaví a odrazí
      const nx = cx + d;
      if (nx < 0 || nx >= W) return false;
      if (h[nx] - h[cx] > ROLL_CLIMB) { blocked = true; break; }
      cx = nx;
      if (tankAt(s, cx, H - h[cx] - 3, p.o, p.t < 30) >= 0) { p.x = cx * S; p.y = (H - h[cx] - 3) * S; detonate(s, ctx, ev, p, cx, H - h[cx] - 3); return false; }
    }
    if (blocked) { p.rv = -idiv(p.rv, 2); p.x = cx * S + (d > 0 ? S - 1 : 0); }
    else p.x = target;
    const py = H - h[cx] - 3;
    p.y = py * S;
    if (Math.abs(p.rv) < 60 && Math.abs(sl) <= 1) p.st++; else p.st = 0;
    if (tankAt(s, cx, py, p.o, p.t < 30) >= 0 || p.t >= ROLL_TIME || p.st >= 20) { detonate(s, ctx, ev, p, cx, py); return false; }
    return true;
  }
  function drillTick(s, ctx, ev, p) {
    p.age++;
    const vx = p.vx, vy = p.vy, h = s.h;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) / S));
    const x0 = p.x, y0 = p.y;
    for (let i = 1; i <= n; i++) {
      const nx = x0 + idiv(vx * i, n), ny = y0 + idiv(vy * i, n);
      const px = Math.floor(nx / S), py = Math.floor(ny / S);
      p.x = nx; p.y = ny;
      if (px < 0 || px >= W) return false;
      if (tankAt(s, px, py, p.o, p.age <= GRACE) >= 0 || py >= H - BASE - 1) { detonate(s, ctx, ev, p, px, py); return false; }
      if (py >= H - h[px]) p.ar = 0; else p.ar++;
      carve(h, px, py, 5); ctx.terr = true;
      p.dr++;
      if (p.dr >= DRILL_LEN) { detonate(s, ctx, ev, p, px, py); return false; }
      if (p.ar > 20) { p.dg = 0; p.x = nx; p.y = ny; return true; }
    }
    p.x = x0 + vx; p.y = y0 + vy;
    return true;
  }
  function splitMirv(s, ctx, ev, p, np) {
    ev.push({ type: "split", x: Math.floor(p.x / S), y: Math.floor(p.y / S) });
    for (let i = 0; i < 5; i++) {
      const q = mkProj(ctx, WMAP.mirv, p.x, p.y, p.vx + (i - 2) * 70, p.vy + 40, p.o);
      q.k = "std"; q.r = 22; q.d = 20; q.age = p.age; q.ag = p.ag; q.mg = p.mg; q.lo = p.lo; q.wa = p.wa; q.ma = p.ma;
      np.push(q);
    }
  }
  function tickProj(s, ctx, ev, p, np) {
    if (p.k === "roll") return rollTick(s, ctx, ev, p);
    if (p.dg) return drillTick(s, ctx, ev, p);
    const res = advance(s, ctx.wind, p);
    if (res === OUT) return false;
    const px = Math.floor(p.x / S), py = Math.floor(p.y / S);
    if (res === AIR) {
      if (p.k === "mirv" && p.vy >= 0 && p.age >= MIRV_MIN) { splitMirv(s, ctx, ev, p, np); return false; }
      return true;
    }
    if (res === TANKHIT) { detonate(s, ctx, ev, p, px, py); return false; }
    // LAND
    const h = s.h;
    if (p.k === "bouncer") {
      p.n++;
      if (p.n >= 3) { detonate(s, ctx, ev, p, px, py); return false; }
      const sl = h[Math.min(W - 1, px + 3)] - h[Math.max(0, px - 3)];
      const nx = -sl, ny = -6, nn = nx * nx + ny * ny;
      const dot = p.vx * nx + p.vy * ny;
      if (dot < 0) { p.vx -= idiv(2 * dot * nx, nn); p.vy -= idiv(2 * dot * ny, nn); }
      p.vx = idiv(p.vx * 4, 5); p.vy = idiv(p.vy * 4, 5);
      p.x = p.lx; p.y = p.ly;
      ev.push({ type: "bounce", x: px, y: py });
      if (p.vx * p.vx + p.vy * p.vy < 32400) { detonate(s, ctx, ev, p, px, py); return false; }
      return true;
    }
    if (p.k === "leaper") {
      boom(s, ctx, ev, px, py, p.r, p.d, p.o, p.ek, p.w);
      p.n++;
      if (p.n >= 3) return false;
      const dir = p.vx === 0 ? (s.tanks[p.o].x < 480 ? 1 : -1) : sgn(p.vx);
      p.vx = dir * clampi(idiv(Math.abs(p.vx) * 3, 4), 300, 700);
      p.vy = -450; p.wa = 0;
      p.x = p.lx; p.y = p.ly;
      ev.push({ type: "bounce", x: px, y: py });
      return true;
    }
    if (p.k === "roller") {
      p.k = "roll"; p.t = 0; p.st = 0; p.rv = clampi(idiv(p.vx, 3), -ROLL_MAX, ROLL_MAX);
      p.y = (H - h[clampi(px, 0, W - 1)] - 3) * S;
      return true;
    }
    if (p.k === "drill") {
      const mag = isqrt(p.vx * p.vx + p.vy * p.vy);
      if (mag > 600) { p.vx = idiv(p.vx * 600, mag); p.vy = idiv(p.vy * 600, mag); }
      p.dg = 1; p.dr = 0; p.ar = 0;
      return true;
    }
    detonate(s, ctx, ev, p, px, py);
    return false;
  }
  function tickFires(s, ctx, ev) {
    if (!s.fires.length) return;
    const h = s.h, keep = [], hot = [false, false], who = [-1, -1];
    for (let i = 0; i < s.fires.length; i++) {
      const f = s.fires[i];
      f.t--;
      if (f.t <= 0) continue;
      if ((f.t & 1) === 0) {
        const l = h[Math.max(0, f.x - 2)], r = h[Math.min(W - 1, f.x + 2)], c = h[f.x];
        if (l < c && l <= r) { f.x--; f.d = -1; }
        else if (r < c) { f.x++; f.d = 1; }
        else if (l === c && r === c && f.d !== 0) f.x += f.d;
        f.x = clampi(f.x, 1, W - 2);
      }
      f.y = H - h[f.x] - 1;
      for (let ti = 0; ti < 2; ti++) {
        const t = s.tanks[ti];
        if (t.alive && Math.abs(f.x - t.x) <= TANK_HW && f.y >= t.y - TANK_H && f.y <= t.y + 3) { hot[ti] = true; who[ti] = f.o; }
      }
      keep.push(f);
    }
    s.fires = keep;
    for (let ti = 0; ti < 2; ti++) {
      if (!hot[ti]) continue;
      ctx.hotc[ti]++;
      if (ctx.hotc[ti] % 4 === 0) dealDamage(s, ctx, ev, ti, 3, who[ti]);
    }
  }
  function settleTanks(s, ctx, ev) {
    for (let ti = 0; ti < 2; ti++) {
      const t = s.tanks[ti], surf = tankY(s.h, t.x);
      if (t.y > surf) { t.y = surf; t.fall = 0; t.fd = 0; continue; }
      if (t.y < surf) {
        t.fall++;
        const step = Math.min(surf - t.y, Math.min(7, 1 + idiv(t.fall, 5)));
        t.y += step; t.fd += step;
      }
      if (t.y === surf && t.fall > 0) {
        const fd = t.fd;
        t.fall = 0; t.fd = 0;
        let dmg = 0;
        if (fd > FALL_T) { dmg = Math.min(FALL_CAP, idiv(fd - FALL_T, 2) + 1); dealDamage(s, ctx, ev, ti, dmg, -1); }
        if (fd >= 4) ev.push({ type: "fall", tank: ti, dist: fd, dmg: dmg });
      }
    }
  }
  function tanksStable(s) {
    for (let ti = 0; ti < 2; ti++) {
      const t = s.tanks[ti];
      if (t.fall > 0 || t.y !== tankY(s.h, t.x)) return false;
    }
    return true;
  }
  function simTick(s, ctx, ev) {
    const keep = [], np = [];
    for (let i = 0; i < s.proj.length; i++) {
      const p = s.proj[i];
      if (tickProj(s, ctx, ev, p, np)) keep.push(p);
    }
    s.proj = np.length ? keep.concat(np) : keep;
    tickFires(s, ctx, ev);
    if (ctx.terr) { ev.push({ type: "terrain" }); ctx.terr = false; }
    settleTanks(s, ctx, ev);
  }

  // ---------- tah ----------
  function moveTank(s, ti, dir) {
    const t = s.tanks[ti], o = s.tanks[1 - ti];
    const nx = t.x + dir;
    if (nx < 12 || nx > W - 13) return false;
    if (o.alive && Math.abs(nx - o.x) < 2 * TANK_HW + 4) return false;
    const ny = tankY(s.h, nx);
    if (t.y - ny > CLIMB_MAX) return false;
    if (ny - t.y > DROP_MAX) return false;
    t.x = nx; t.y = ny;
    return true;
  }
  function rotv(vx, vy, c, sn) { return [idiv(vx * c - vy * sn, 10000), idiv(vx * sn + vy * c, 10000)]; }
  // odpal z ústí hlavně, ale nikdy ne za zeď: úsečka věž -> ústí se projde po pixelech proti terénu
  function muzzlePos(s, ti, vx, vy) {
    const t = s.tanks[ti], mag = isqrt(vx * vx + vy * vy);
    const tx = t.x * S, ty = (t.y - TURRET) * S;
    const ox = mag ? idiv(vx * TIP * S, mag) : 0, oy = mag ? idiv(vy * TIP * S, mag) : -TIP * S;
    let lx = tx, ly = ty;
    for (let i = 1; i <= TIP; i++) {
      const nx = tx + idiv(ox * i, TIP), ny = ty + idiv(oy * i, TIP);
      const px = Math.floor(nx / S), py = Math.floor(ny / S);
      if (px < 0 || px >= W || py >= H - s.h[px]) break;
      lx = nx; ly = ny;
    }
    return [lx, ly];
  }
  function spawnShot(s, ctx, ev, ti, w, vx, vy) {
    const mp = muzzlePos(s, ti, vx, vy), sx = mp[0], sy = mp[1];
    ev.push({ type: "fire", tank: ti, weapon: w.id, x: Math.floor(sx / S), y: Math.floor(sy / S), vx: vx, vy: vy });
    function add(ax, ay) { s.proj.push(mkProj(ctx, w, sx, sy, ax, ay, ti)); }
    if (w.id === "triple" || w.id === "spray" || w.id === "konfety") {
      const degs = w.id === "triple" ? [-8, 0, 8] : (w.id === "konfety" ? [-12, -6, 0, 6, 12] : [-18, -12, -6, 0, 6, 12, 18]);
      for (let i = 0; i < degs.length; i++) {
        const dg = degs[i];
        if (dg === 0) { add(vx, vy); continue; }
        const q = ROT[Math.abs(dg)], v = rotv(vx, vy, q[0], dg < 0 ? -q[1] : q[1]);
        add(v[0], v[1]);
      }
    } else add(vx, vy);
  }
  function doAct(s, ctx, ev) {
    const ti = s.cur, t = s.tanks[ti], inp = ctx.inp, ab = inp.ability || null;
    let shot = true;
    if (ctx.gbUsed) ev.push({ type: "giftBack", tank: ti });
    if (ab) {
      const A = AMAP[ab], fx = t.x;
      if (ab === "shield") t.shield = SHIELD_PTS;
      else if (ab === "teleport") { t.x = inp.ax; t.y = tankY(s.h, t.x); t.fall = 0; t.fd = 0; }
      else if (ab === "repair") t.hp = Math.min(t.maxHp, t.hp + REPAIR_HP);
      else if (ab === "calm") ctx.wind = 0;
      else if (ab === "magnet") ctx.mg = true;
      else if (ab === "antigrav") ctx.ag = true;
      else if (ab === "airstrike") {
        shot = false;
        const offs = [-100, 50, -50, 100, 0];
        for (let i = 0; i < 5; i++) {
          const bx = clampi(inp.ax + offs[i], 4, W - 5);
          const q = mkProj(ctx, { id: "airstrike", k: "std", r: 30, d: 22, ek: "boom" }, bx * S, -(20 + i * 40) * S, 0, 250, ti);
          s.proj.push(q);
        }
      }
      ev.push({ type: "ability", tank: ti, id: ab, x: t.x, y: t.y, fx: fx });
      if (t.ch[ab] > 0) t.ch[ab]--; else t.cd[ab] = A.cooldown;
    }
    if (shot) {
      const w = WMAP[inp.weapon];
      if (ctx.forced) { if (!ctx.forced.free && !w.unlimited && !w.troll && t.ammo[w.id] > 0) t.ammo[w.id]--; }
      else if (!w.unlimited) t.ammo[w.id]--;
      spawnShot(s, ctx, ev, ti, w, inp.vx, inp.vy);
    }
  }
  function endTurn(s, ctx, ev) {
    const ti = s.cur, t = s.tanks[ti], o = s.tanks[1 - ti], si = seedInt(s.seed);
    for (const id in t.cd) if (t.cd[id] > 0) t.cd[id]--;
    t.rage = false;
    o.shield = 0;
    t.fuel = Math.min(t.maxFuel, t.fuel + FUEL_REGEN);
    s.roundTurn++; s.turnNo++;
    let rw = null;
    const a0 = s.tanks[0].alive, a1 = s.tanks[1].alive;
    if (!a0 || !a1) rw = a0 ? 0 : (a1 ? 1 : -1);
    else if (s.roundTurn >= ROUND_TURNS) {
      const c = s.tanks[0].hp * s.tanks[1].maxHp - s.tanks[1].hp * s.tanks[0].maxHp;
      rw = c > 0 ? 0 : (c < 0 ? 1 : -1);
    }
    if (rw === null) {
      const g = ctx.giftOut;
      o.gift = g.id; o.gf = g.free ? 1 : 0; o.lt = g.troll ? 1 : 0;
      ev.push({ type: "gift", from: ti, to: 1 - ti, weapon: g.id, free: !!g.free });
      s.cur = 1 - s.cur;
      s.tanks[s.cur].rage = s.tanks[s.cur].hp + RAGE_GAP <= s.tanks[1 - s.cur].hp;
      s.wind = windOf(s, si, s.turnNo);
      return;
    }
    const oldH = s.h.slice();
    if (rw === -1) { s.tanks[0].coins += LOSE_BONUS; s.tanks[1].coins += LOSE_BONUS; }
    else { s.tanks[rw].coins += WIN_BONUS; s.tanks[1 - rw].coins += LOSE_BONUS + LOSE_EXTRA; s.wins[rw]++; }
    s.lastRound = { winner: rw, dmg: [s.rdmg[0], s.rdmg[1]] };
    s.roundOver = true;
    ev.push({ type: "roundEnd", winner: rw, dmg: [s.rdmg[0], s.rdmg[1]], h: oldH });
    if (s.wins[0] >= WIN_ROUNDS || s.wins[1] >= WIN_ROUNDS || s.round >= MAX_ROUNDS) {
      s.matchOver = true;
      s.winner = s.wins[0] > s.wins[1] ? 0 : (s.wins[1] > s.wins[0] ? 1 : -1);
      s.wind = windOf(s, si, s.turnNo);
      ev.push({ type: "matchEnd", winner: s.winner });
      return;
    }
    s.round++;
    setupRound(s, rw === -1 ? 1 - s.rstart : 1 - rw);
  }
  function forceFinish(s, ctx, ev) {
    s.proj = []; s.fires = [];
    const evs = [];
    for (let i = 0; i < 400 && !tanksStable(s); i++) settleTanks(s, ctx, evs);
    for (let i = 0; i < evs.length; i++) ev.push(evs[i]);
    endTurn(s, ctx, ev);
    ctx.phase = "done";
  }
  function stepTurn(s, ctx) {
    const ev = [];
    if (ctx.phase === "done") return ev;
    ctx.ticks++;
    if (ctx.rage && !ctx.rageSent) { ctx.rageSent = true; ev.push({ type: "rage", tank: s.cur }); }
    if (ctx.ticks > MAX_TICKS) { forceFinish(s, ctx, ev); return ev; }
    if (ctx.phase === "move") {
      if (ctx.moveLeft > 0) {
        if (moveTank(s, s.cur, ctx.dir)) {
          const t = s.tanks[s.cur];
          t.fuel--; ctx.moveLeft--;
          ev.push({ type: "move", tank: s.cur, x: t.x, y: t.y });
        } else ctx.moveLeft = 0;
        if (ctx.moveLeft > 0) return ev;
      }
      ctx.phase = "act";
    }
    if (ctx.phase === "act") { doAct(s, ctx, ev); ctx.phase = "sim"; return ev; }
    simTick(s, ctx, ev);
    if (s.proj.length === 0 && s.fires.length === 0 && tanksStable(s)) { endTurn(s, ctx, ev); ctx.phase = "done"; }
    return ev;
  }
  function startTurn(state, input) {
    const why = validate(state, input);
    if (why) throw new Error("Neplatný tah: " + why);
    input = normInput(input);
    const giftOut = giftPlan(state).filter(function (e) { return e.id === input.gift; })[0];
    const s = cl(state);
    s.roundOver = false; s.proj = []; s.fires = [];
    const t = s.tanks[s.cur];
    const buy = input.buy || [];
    for (let i = 0; i < buy.length; i++) applyBuy(t, buy[i]);
    t.shop = false;
    const raging = t.rage === true;
    if (raging) t.coins += RAGE_COINS;
    let forced = t.gift !== null && t.gift !== undefined ? { id: t.gift, free: t.gf === 1 } : null;
    const gbUsed = input.giftBack === true;
    if (gbUsed) { t.gb--; forced = null; }
    t.gift = null; t.gf = 0;
    const move = input.move || 0;
    const ctx = {
      phase: "move", ticks: 0, pid: 0, terr: false, mg: false, ag: false, hotc: [0, 0], wind: s.wind,
      moveLeft: Math.abs(move), dir: sgn(move), inp: input, rage: raging, rageSent: false, forced: forced, gbUsed: gbUsed, giftOut: giftOut
    };
    const turn = { state: s, done: false };
    turn.step = function () {
      const ev = stepTurn(s, ctx);
      turn.done = ctx.phase === "done";
      return ev;
    };
    turn.finish = function () {
      while (ctx.phase !== "done") stepTurn(s, ctx);
      turn.done = true;
      return s;
    };
    return turn;
  }
  function playTurn(state, input) { return startTurn(state, input).finish(); }
  function replay(seed, start, inputs) {
    let s = newMatch({ seed: seed, start: start });
    for (let i = 0; i < inputs.length; i++) s = playTurn(s, inputs[i]);
    return s;
  }

  // ---------- hash ----------
  function hash(s) {
    let x = 0x811C9DC5;
    function f(v) {
      v = v | 0;
      for (let k = 0; k < 4; k++) { x ^= v & 255; x = Math.imul(x, 0x01000193); v >>>= 8; }
    }
    function fs(str) { for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193); } f(str.length); }
    function fm(m) { const ks = Object.keys(m).sort(); for (let i = 0; i < ks.length; i++) { fs(ks[i]); f(m[ks[i]]); } }
    f(s.round); f(s.wins[0]); f(s.wins[1]); f(s.cur); f(s.wind); f(s.turnNo); f(s.roundTurn);
    f(s.matchOver ? 1 : 0); f(s.winner === null ? 9 : s.winner); fs(s.map || ""); fs(s.mod || "");
    for (let i = 0; i < s.h.length; i++) f(s.h[i]);
    for (let ti = 0; ti < 2; ti++) {
      const t = s.tanks[ti];
      f(t.x); f(t.y); f(t.hp); f(t.maxHp); f(t.fuel); f(t.maxFuel); f(t.shield); f(t.coins);
      f(t.shop ? 1 : 0); f(t.alive ? 1 : 0); fs(t.gift === null || t.gift === undefined ? "" : t.gift); f(t.gf); f(t.gb); f(t.gbx); f(t.lt); f(t.rage ? 1 : 0);
      fm(t.ammo); fm(t.cd); fm(t.ch); fm(t.up);
    }
    return ("00000000" + (x >>> 0).toString(16)).slice(-8);
  }

  // ---------- náhled dráhy ----------
  function shooterView(state, input) {
    // kopie jen s tím, co náhled/bot potřebují; aplikuje pohyb a teleport okamžitě
    const s = cl(state);
    const ti = s.cur, t = s.tanks[ti];
    const move = isInt(input && input.move) ? input.move : 0;
    const dir = sgn(move);
    for (let i = 0, n = Math.min(Math.abs(move), t.fuel); i < n; i++) if (!moveTank(s, ti, dir)) break;
    if (input && input.ability === "teleport" && isInt(input.ax)) { t.x = clampi(input.ax, 14, W - 15); t.y = tankY(s.h, t.x); }
    return s;
  }
  function launch(s, ctx, w, ti, vx, vy) {
    const mp = muzzlePos(s, ti, vx, vy);
    return mkProj(ctx, w, mp[0], mp[1], vx, vy, ti);
  }
  function previewPath(state, input) {
    try { return previewInner(state, input); } catch (e) { return []; }
  }
  function previewInner(state, input) {
    if (!state || state.matchOver || !input) return [];
    const ab = own(AMAP, input.ability) ? input.ability : null;
    const w = own(WMAP, input.weapon) ? WMAP[input.weapon] : null;
    if (ab === "airstrike" || !w || !isInt(input.vx) || !isInt(input.vy)) return [];
    if (input.vx * input.vx + input.vy * input.vy > MAX_V * MAX_V) return [];
    const s = shooterView(state, input);
    const lv = clampi(s.tanks[s.cur].up.preview | 0, 0, 4);
    const ctx = { pid: 0, ag: ab === "antigrav", mg: ab === "magnet" };
    const wind = (lv >= 3 && ab !== "calm") ? s.wind : 0;
    const p = launch(s, ctx, w, s.cur, input.vx, input.vy);
    const out = [];
    for (let i = 0, n = RULES.previewTicks[lv]; i < n; i++) {
      const res = advance(s, wind, p);
      out.push({ x: Math.floor(p.x / S), y: Math.floor(p.y / S) });
      if (res !== AIR) break;
    }
    return out;
  }

  // ---------- bot ----------
  function fullScore(state, input, ti) {
    const turn = startTurn(state, input);
    let dOpp = 0, dSelf = 0, bonus = 0;
    while (!turn.done) {
      const ev = turn.step();
      for (let i = 0; i < ev.length; i++) {
        const e = ev[i];
        if (e.type === "damage") { if (e.tank === ti) dSelf += e.amount; else dOpp += e.amount; }
        else if (e.type === "roundEnd") bonus += e.winner === ti ? 200 : (e.winner === -1 ? 0 : -200);
      }
    }
    return (dOpp - dSelf) * 10 + bonus;
  }
  function impactScore(s, ti, w, res, px, py) {
    if (res === AIR || res === OUT) return -1000000;
    let dOpp = 0, dSelf = 0, d2o = 0;
    const R = rad(s, w.r) + SPLASH_PAD, R2 = R * R;
    for (let j = 0; j < 2; j++) {
      const t = s.tanks[j];
      if (!t.alive) continue;
      const cx = t.x - px, cy = (t.y - 13) - py, d2 = boxDist2(t, px, py);
      if (j !== ti) d2o = cx * cx + cy * cy;
      if (d2 <= R2) { const dm = idiv(w.d * DMG_PCT * (R2 - d2), 100 * R2); if (j === ti) dSelf += dm; else dOpp += dm; }
    }
    return (dOpp * 10 - dSelf * 12) * 100 - idiv(Math.min(d2o, 1000000), 100);
  }
  function suggestShot(state, opts) {
    opts = opts || {};
    const ti = state.cur, t0 = state.tanks[ti];
    const s = state;
    // dárek: co dostanu vynuceně, jestli ho vrátím (jen když je neškodný a mám žeton), co darovat soupeři
    const forcedId = t0.gift === null || t0.gift === undefined || !own(WMAP, t0.gift) ? null : t0.gift;
    const useBack = forcedId !== null && opts.noGiftBack !== true && (t0.gb | 0) >= 1 && WMAP[forcedId].d <= 12;
    const mustFire = forcedId !== null && !useBack ? forcedId : null;
    const plan = giftPlan(state);
    let giftId = plan[0].id, giftHarm = 1e9;
    for (let i = 0; i < plan.length; i++) { const hm = WMAP[plan[i].id].d; if (hm < giftHarm) { giftHarm = hm; giftId = plan[i].id; } }
    function mkInput(wid, vx, vy) {
      return { buy: [], move: 0, ability: null, ax: t0.x, weapon: wid, vx: vx, vy: vy, note: "", gift: giftId, giftBack: useBack };
    }
    const wids = mustFire !== null ? [mustFire] : (opts.weapons || [opts.weapon || "grenade"]).filter(function (id) {
      const w = own(WMAP, id) ? WMAP[id] : null;
      return w && !w.troll && (w.unlimited || (t0.ammo[id] | 0) > 0) && w.d > 0;
    });
    if (!wids.length) wids.push("grenade");
    const cands = [];
    function toV(a, pw) { const v = idiv(MAX_V * pw, 100); return [idiv(v * cosA(a), 1000), 0 - idiv(v * sinA(a), 1000)]; }
    wids.forEach(function (wid) {
      const w = WMAP[wid], wctx = { pid: 0, ag: false, mg: false };
      function ev(vx, vy) {
        if (vx * vx + vy * vy > MAX_V * MAX_V) return -2000000;
        const p = launch(s, wctx, w, ti, vx, vy);
        let res = AIR;
        for (let k = 0; k < 800; k++) { res = advance(s, s.wind, p); if (res !== AIR) break; }
        return impactScore(s, ti, w, res, Math.floor(p.x / S), Math.floor(p.y / S));
      }
      const coarse = [];
      for (let a = 15; a <= 165; a += 5) for (let pw = 25; pw <= 100; pw += 5) {
        const v = toV(a, pw);
        coarse.push({ vx: v[0], vy: v[1], sc: ev(v[0], v[1]) });
      }
      coarse.sort(function (a, b) { return b.sc - a.sc; });
      const picked = [];
      for (let i = 0; i < coarse.length && picked.length < 3; i++) {
        const c = coarse[i];
        if (picked.every(function (q) { return Math.abs(q.vx - c.vx) + Math.abs(q.vy - c.vy) > 40; })) picked.push(c);
      }
      picked.forEach(function (c, idx) {
        let best = c, step = 24;
        while (step >= 1) {
          let improved = false;
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const vx = best.vx + dx * step, vy = best.vy + dy * step;
            const sc = ev(vx, vy);
            if (sc > best.sc) { best = { vx: vx, vy: vy, sc: sc }; improved = true; }
          }
          if (!improved) step = idiv(step, 2);
        }
        if (idx < (wids.length === 1 ? 3 : 1)) cands.push({ wid: wid, vx: best.vx, vy: best.vy, sc: best.sc });
      });
    });
    cands.sort(function (a, b) { return b.sc - a.sc; });
    let chosen = null, chosenScore = -1e12;
    const top = cands.slice(0, 4);
    for (let i = 0; i < top.length; i++) {
      const c = top[i];
      const inp = mkInput(c.wid, c.vx, c.vy);
      if (validate(state, inp)) continue;
      const sc = fullScore(state, inp, ti);
      if (sc > chosenScore) { chosenScore = sc; chosen = inp; }
    }
    if (!chosen) chosen = mkInput(mustFire !== null ? mustFire : "grenade", 500, -500);
    let amp = 0;
    const r = mix32(seedInt(state.seed) ^ Math.imul(state.turnNo + 7, 0x9E3779B1) ^ Math.imul(ti + 1, 0x85EBCA6B));
    if (opts.perfect !== true) amp = isInt(opts.jitter) ? Math.max(0, opts.jitter) : 5 + r % 40;
    if (amp > 0) {
      chosen.vx += (r % (2 * amp + 1)) - amp;
      chosen.vy += (mix32(r) % (2 * amp + 1)) - amp;
      while (chosen.vx * chosen.vx + chosen.vy * chosen.vy > MAX_V * MAX_V) { chosen.vx = idiv(chosen.vx * 99, 100); chosen.vy = idiv(chosen.vy * 99, 100); }
    }
    chosen.vx += 0; chosen.vy += 0;
    if (validate(state, chosen)) { chosen.vx = 500; chosen.vy = -500; }
    return chosen;
  }

  const api = {
    VERSION: VERSION, W: W, H: H, S: S, MAX_V: MAX_V, RULES: RULES,
    WEAPONS: WEAPONS, ABILITIES: ABILITIES, UPGRADES: UPGRADES,
    newMatch: newMatch, clone: clone, validate: validate, startTurn: startTurn, playTurn: playTurn, replay: replay,
    hash: hash, previewPath: previewPath, suggestShot: suggestShot, surfaceY: surfaceY,
    TROLL: TROLL, EXTRAS: EXTRAS, MODS: MODS, MAPS: MAPS, giftOptions: giftOptions, weaponInfo: weaponInfo,
    aimToVel: aimToVel, velToAim: velToAim
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TankEngine = api;

  // UI-ONLY: od tohoto řádku dál smí být Math.sin/cos/sqrt/atan2. Simulace tyhle funkce nikdy nevolá.
  function aimToVel(angleDeg, power) {
    const pw = Math.max(0, Math.min(100, power));
    const rad = angleDeg * Math.PI / 180, m = MAX_V * pw / 100;
    return { vx: Math.trunc(Math.cos(rad) * m) + 0, vy: -Math.trunc(Math.sin(rad) * m) + 0 };
  }
  function velToAim(vx, vy) {
    return {
      angle: Math.round(Math.atan2(0 - vy, vx) * 1800 / Math.PI) / 10 + 0,
      power: Math.round(Math.sqrt(vx * vx + vy * vy) * 1000 / MAX_V) / 10
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
