# Tančíky – společná specifikace (kontrakt mezi moduly)

Tahová dělostřelecká hra pro dva na jednom odkazu (Pocket Tanks / Scorched Earth styl, vlastní).
Výstup: jeden `index.html` bez buildu (fonty z Google Fonts). Vývoj probíhá v `src/`, `node tools/build.cjs`
složí `src/index.src.html` do `index.html` (nahradí každé `/*@include soubor*/` obsahem `src/soubor`).
Hotový `index.html` je samostatný, na GitHub Pages se nasazuje jen on.

Jazyk UI: čeština, tykání, krátce a vtipně. Hráči: Mark a Radka (jména se zadávají, nikde je nenatvrdo).

## Moduly a vlastníci
| soubor | obsah | vlastník |
|---|---|---|
| `src/engine.js` | deterministická simulace, žádné DOM | agent ENGINE |
| `tests/engine.test.cjs` | Node testy enginu (determinismus, hash, fuzz, zákaz Math.sin…) | agent ENGINE |
| `src/index.src.html`, `src/game.css`, `src/render.js`, `src/app.js` | markup, styl, Canvas renderer, ovládání, obrazovky, lokální režim, online tok přes `Net` | agent UI |
| `src/net.js` | místnost na mantledb.sh, identita, polling, zápis | agent SYNC |
| `tests/duel.cjs`, `tests/net.test.cjs` | Playwright E2E + Node test net.js s mockem fetch | agent SYNC |
| `tools/build.cjs`, integrace, nasazení | hlavní session | MAIN |

Každý JS soubor v `src/` je IIFE, které se dá vložit do `<script>` beze změny a publikuje jeden globál:
`window.TankEngine`, `window.TankNet`, `window.TankRender`, app.js nic. Engine navíc
`if (typeof module !== "undefined") module.exports = TankEngine;` aby šel `require` v Node.
Pořadí v HTML: engine.js, net.js, render.js, app.js.

## Engine (src/engine.js) – pravidla determinismu (NUTNÉ)
- Stav zápasu = `seed` + pole vstupů tahů. Nic jiného se neukládá.
- Fyzika: pevný krok (tick, 60 ticků = 1 s animace), jen celá čísla, jen `+ - * /` a celočíselné zaokrouhlení
  (`Math.trunc`, `Math.floor`, `|0`, `Math.imul` pro PRNG, `Math.abs/min/max` OK). **Zakázáno** v engine.js:
  `Math.sin cos tan atan atan2 sqrt pow hypot exp log random`, `Date`, `**`. Odmocninu dělej celočíselnou funkcí `isqrt` (Newton s dělením).
- Krátery `dx*dx+dy*dy <= r*r`. Terén = celočíselná výšková mapa `h[x]` (výška hlíny od spodku, `x` = 0..W-1 po pixelu).
  Kráter v sloupci odebere překryv kruhu se sloupcem hlíny; hlína nad ním spadne (sesuv) = výška klesne o překryv.
  Hliněná bomba přidá hlínu. Spodek mapy má nezničitelný základ (min výška 8 px).
- PRNG: mulberry32 / xorshift nad `Math.imul`, semínko z `seed`, kola a čísla tahu. Vítr na tah určuje PRNG.
- Pozice projektilů v sub-pixelech: `S = 100` jednotek na pixel. Rychlosti v jednotkách za tick.
- Svět: `W = 960`, `H = 540` px (logické; renderer škáluje).

## Engine API
```js
TankEngine.VERSION        // "1"
TankEngine.W, .H, .S, .MAX_V   // MAX_V = max |v| ve stejných jednotkách jako vx/vy (vx*vx+vy*vy <= MAX_V*MAX_V)
TankEngine.WEAPONS        // [{id, name, desc, price, start, unlimited?}]  id: grenade, triple, mirv, roller, drill, napalm, dirt, bouncer, spray (+ smí víc)
TankEngine.ABILITIES      // [{id, name, desc, cooldown, price}]  id: shield, teleport, repair, calm, airstrike, magnet, antigrav
TankEngine.UPGRADES       // [{id, name, desc, max, prices:[...]}]  id: armor, fuel, preview, slots
TankEngine.newMatch({seed, start}) -> state      // start = 0|1 kdo začíná 1. kolo
TankEngine.clone(state) -> state                  // hluboká kopie (JSON-safe stav; h jako běžné pole)
TankEngine.validate(state, input) -> null | "důvod česky"
TankEngine.startTurn(state, input) -> turn        // NEmutuje vstupní state; turn.state je živá kopie
  turn.state      // živý stav (čti pro render)
  turn.step()     // jeden tick, vrací pole událostí tohoto ticku
  turn.done       // true až je tah dosimulovaný (vše dopadlo, hlína spadla, tanky dopadly, vyhodnoceno kolo)
  turn.finish()   // dojede do konce, vrací turn.state
TankEngine.playTurn(state, input) -> newState     // startTurn + finish
TankEngine.replay(seed, start, inputs) -> state   // newMatch + playTurn pro všechny vstupy
TankEngine.hash(state) -> "8 hex"                 // FNV-1a přes h[], tanky (x,y,hp,coins,ammo,cd,up), kolo, wins, cur, wind
TankEngine.previewPath(state, input) -> [{x,y}]   // náhled dráhy v px; délka podle upgradu preview aktuálního hráče
TankEngine.suggestShot(state, opts?) -> input     // deterministický „bot“: zkusí mřížku vx/vy, vrátí nejlepší vstup (pro testy a trénink)
TankEngine.aimToVel(angleDeg, power) -> {vx, vy} // POZOR: jen UI pomocník, smí používat Math.cos/sin, NESMÍ ho volat fyzika; drž ho ve
TankEngine.velToAim(vx, vy) -> {angle, power}    //   zvláštním bloku na konci souboru označeném // UI-ONLY (test zákazu ho vynechá)
```
Úhel: 0° = doprava, 90° = nahoru, 180° = doleva. Síla 0–100. `vy` záporné = nahoru (osa y roste dolů jako na canvasu).

### Stav (JSON-safe, čte renderer i UI)
```js
state = {
  seed, start, round /*1..*/, turnNo /*celkový počet odehraných tahů*/, roundTurn, cur /*0|1 na tahu*/,
  wind /*celé číslo -15..15, zobrazit jako šipku*/, h /*pole W výšek*/, 
  tanks: [{ x /*px*/, y /*px, spodek tanku = povrch*/, hp, maxHp, fuel, maxFuel, shield /*body štítu*/, coins,
            ammo: {weaponId: počet}, cd: {abilityId: tahů do nabití (0 = připraveno)}, up: {armor, fuel, preview, slots},
            shop /*true = při příštím tahu se otevře obchod*/, color /*0|1*/, alive }],
  wins: [0,0], roundOver, matchOver, winner /*null|0|1|-1 remíza*/, lastRound /*{winner, dmg:[a,b]} nebo null*/,
  proj: [{id, w, x, y, vx, vy /*sub-px*/, ...}],   // jen během tahu
  fires: [{x, y, t}],                               // napalm hořící na zemi během tahu
}
```
### Vstup tahu (to se ukládá do dokumentu)
```js
input = { buy: ["up:armor","w:mirv","a:shield"]? , move: celé px (-fuel..+fuel, 0), ability: null|"shield"|..., ax: celé px (cíl teleportu/náletu),
          weapon: "grenade", vx: int, vy: int, note: "≤ 40 znaků, simulace ho ignoruje", at: ms (ignoruje) }
```
Pořadí v tahu: nákup (jen když `tank.shop`), pohyb (animovaný, palivo), aktivka, výstřel (kromě náletu, ten výstřel nahrazuje),
dosimulování (krátery, sesuv, pád tanku + poškození pádem), vyhodnocení kola, nový vítr, předání tahu.

### Události z `turn.step()` (renderer z nich dělá částice, zvuky, shake)
`{type:"move",tank}` · `{type:"fire",tank,weapon,x,y}` · `{type:"ability",tank,id,x,y}` · `{type:"explode",x,y,r,weapon,kind:"boom"|"dirt"|"fire"|"small"}` ·
`{type:"terrain"}` (h se změnilo) · `{type:"damage",tank,amount,hp,shielded}` · `{type:"bounce",x,y}` · `{type:"split",x,y}` ·
`{type:"fall",tank,dist,dmg}` · `{type:"die",tank}` · `{type:"coins",tank,amount}` · `{type:"roundEnd",winner}` · `{type:"matchEnd",winner}`. Souřadnice událostí v px.

### Pravidla hry (výchozí, engine je smí doladit, ale zapíše je do komentáře nahoře v engine.js)
- Zápas: až 2 vítězná kola (max 5 kol). Kolo končí smrtí tanku, nebo po 16 tazích (víc HP v % vyhrává kolo, rovnost = remíza kola).
- Každé kolo nový terén (seed + kolo), HP a palivo doplněné, cooldowny vynulované, munice a upgrady zůstávají.
- Mince: 1 za každý bod poškození soupeře, +40 za vyhrané kolo, +20 za prohrané, start 60. Obchod před prvním tahem hráče v každém kole (i v 1.).
- Upgrady: pancíř (+maxHp nebo snížení poškození), palivo (+dojezd), náhled (delší náhled dráhy, od 3. úrovně i s větrem), sloty (víc kusů munice na nákup / víc aktivek na tah?). 
- Aktivky: max 1 za tah, mají cooldown v tazích vlastního hráče. Nálet nahrazuje výstřel (cíl `ax`). Teleport přesune tank na `ax` před výstřelem.
  Magnet: střela v okruhu se stáčí k soupeři. Antigravitace: gravitace střely první ~1 s míří vzhůru (umí přehodit vysoký kopec rovnou ranou).
  Uklidnění větru: vítr 0 pro tento výstřel. Štít: pohltí N poškození do konce soupeřova příštího tahu. Oprava: +HP.

## Dokument místnosti (mantledb.sh)
URL `https://mantledb.sh/v2/tancicky-<id>/hra`, odkaz hry `…/tancicky/#r.<id>` (id 12 znaků [0-9a-z]).
GET → JSON, 404 = neexistuje. POST s `Content-Type: application/json` přepíše celý dokument.
```js
doc = { app: "tancicky", v /*počítadlo zápisů*/, s0, s1 /*token zařízení na místě 0/1, "" volné*/, u /*ms*/,
        g: { n: ["jméno0","jméno1"], k /*sázka 1-6|c|""*/, kc /*vlastní text*/, w: [výhry0, výhry1] /*série zápasů*/,
             gi /*číslo zápasu v sérii, od 1*/, seed, start /*0|1*/, t: [input, …] } }
```
Zápis = čti, ověř (`v` se nezměnilo, `t.length` sedí, na tahu jsem já), zapiš `v+1`. Polling 3 s při viditelné stránce, po 5 min 10 s, po 30 min 30 s, backoff při chybách
(stejně jako `C:\Users\le artist\Desktop\react-apps\psanicko\index.html`, čti funkce req/loadDoc/saveDoc/commit/apply/poll/accept/claim/createRoom).
Identita: localStorage `tanc-dev` (token zařízení), `tanc-r-<id>` = "0"|"1" (moje místo), `tanc-name`, `tanc-rooms` (posledních 5), `tanc-seen-<id>` = kolik tahů už tohle zařízení vidělo animovaně.
Zakladatel = místo 0, první kdo přijme výzvu = místo 1, další přihlíží (vidí přehrávky, nehraje). Přihlížející má „jsem X / jsem Y“ (stejný hráč v jiném prohlížeči).

### TankNet API (src/net.js)
```js
TankNet.randId(n), TankNet.device, TankNet.docUrl(id)
TankNet.load(id) -> Promise<doc|null>            // throw při síťové chybě
TankNet.create(g, seat=0) -> Promise<{id, doc}>
TankNet.commit(id, knownV, check(g)->bool, nextG) -> Promise<{ok, doc, reason:"conflict"|"net"}>  // čti-ověř-zapiš
TankNet.accept(id) -> Promise<{seat|null, doc}>  // zabere volné místo tokenem zařízení
TankNet.watch(id, onDoc, getV) / TankNet.unwatch()  // polling s intervaly výše, onDoc(doc) jen když doc.v > getV()
TankNet.mySeat(id) / TankNet.setSeat(id, seat), TankNet.remember(id, info), TankNet.recent()
TankNet.store  // {get,set} bezpečně obalené try/catch
```

## Obrazovky a testovací háčky (UI je musí dodržet, testy na ně spoléhají)
`body[data-view]` = `setup | share | intro | play | end | info`. `document.title` začíná „Jsi na tahu“, když je na tahu tohle zařízení (online), jinak „Tančíky“.
- setup: `#setupForm`, `#nameMe`, `#nameOpp`, `#stakeSel`, `#stakeCustom`, `#createBtn` (online výzva), `#localBtn` (hra na jednom zařízení).
- share: `#shareMsg` (textarea se zprávou a odkazem), `#copyBtn`, `#shareGo` (do hry).
- intro (soupeřka otevřela odkaz poprvé): `#acceptBtn`, `#claim0`, `#claim1`.
- play: `canvas#cv`, `#fireBtn`, `#weaponBtn` + seznam `[data-w="<id>"]`, aktivky `[data-a="<id>"]`, `#moveL`, `#moveR`,
  `#angleDown #angleUp #powerDown #powerUp`, `#noteInput`, `#skipReplay` (přeskočit přehrávku), `#copyTopBtn`.
  Míření: tažení prstem/myší po canvasu (od tanku nebo kdekoli: směr a délka tahu = úhel a síla), šipky ←→ úhel, ↑↓ síla, mezerník/Enter = pal.
- shop: overlay `#shop` (viditelný = `!hidden`), položky `[data-buy="up:armor"|"w:mirv"|"a:shield"]`, `#shopCoins`, `#shopDone`.
- end: `#endTitle`, `#rematchBtn`, `#copyEndBtn`.
- `#toast`.
- `window.__tanc` (vždy, i v produkci; je to jen čtení + stejná cesta jako tlačítko Pal):
  `{ state() /*klon aktuálního stavu*/, hash(), view(), me() /*0|1|null*/, busy(), animating(), inputs() /*pole t*/,
     play(input) -> Promise<bool> /*odešle tah stejnou cestou jako #fireBtn, v lokálním režimu za hráče na tahu*/, skip() /*dojede přehrávku*/ }`.
