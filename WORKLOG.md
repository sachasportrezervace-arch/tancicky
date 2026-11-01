# Tančíky – pracovní deník

Nejnovější nahoře. Číst jen horních ~40 řádků.

PŘEVZATO 1. 11. – kolo vylepšení, session tancicky; jiná session sem nepíše.
PŘEVZATO 31. 10. – dodělává session na účtu P, jiná session sem nepíše.

## 2026-11-01 – kolo vylepšení (session tancicky)
- **Hotovo:** obchod se sám otevírá až od 2. kola (v 1. kole je v nabídce „…“; `src/app.js`, test `duel.cjs` hlídá); modifikátory mají podpis na nebi (`drawModSky`/`drawModFront` v `src/render.js`: Měsíc = měsíc a hvězdy, Těžká planeta = planeta s prstencem za kopcem, Vichřice/Zrcadlo = bílé čárky větru, Boháči = točící se mince); míření jen dráha + tečky síly (kruh zóny a pravítko úhlu jen při tažení, koncový kroužek pryč); text „X střílí…“ při letu skrytý; Přeskočit dole u okraje bojiště; desktop bez šedých soupeřových schopností; mobil na výšku: pojezd ‹ › vedle zbraně, Pal! vedle úhlu/síly, „Dárek“ jako malý popisek v řadě voleb (panel o ~2 řady nižší); Fredoka (OFL) přímo v projektu `fonts/*.woff2` místo Google CDN; `tests/shots.cjs` = snímky pro design-eye (d/m/l, sekvence výbuchu, nebe modů).
- **Vyloučeno:** výhoda začínajícího (80 partií bot×bot: začínající vyhrál 36×, kolo 98/204 → vyváženo).
- **Design-eye:** kolo 1 „OK s výhradami“ (font WebKit, 5 ukazatelů míření, vysoký panel) → opraveno; kolo 2 „blízko profi“: useknutý popisek Dárku na mobilu a schovaný měsíc → opraveno po kole 2 (neověřeno snímkem). Verdikt „profi“ zatím NE.
- **Ověřeno (mezibuild před fontem/mířením):** duel `--variant both` 86/86 (0), mobile 66/66 (0), engine 309 PASS (0), net 64/64 (0), playtest3 PASS (0).
- **Dál:** 1) celá baterie na finálním buildu (duel, mobile, solo, herna, engine, playtest3), commit + push, živý test na Pages; 2) design-eye kolo 3 (`node tests/shots.cjs <URL> tests/shots/de-k4`), hlavně m-02 Dárek a d-08-mod-mesic.
- **Otevřené / NEOVĚŘENO:** kamera při letu (desktop tanky ~70 px, mobil bez tanků v záběru, design-eye navrhuje pevné přiblížení 1,6× mezi tanky); řada schopností useknutá na šířku (l-02); štítek modu a „Trénink“ nad větrem dublují podpis na nebi; tloušťka Fredoky ve WebKitu na Windows (na iPhonu ověřit).

## 2026-10-31 – konec zápasu na nízké výšce (rám Herny)
- **Oprava:** `src/game.css` (poslední blok „konec zápasu se vejde na výšku“). `.end-wrap` je teď sloupec na výšku obrazovky, `.end-art` se podle výšky zmenšuje (`aspect-ratio` + `flex-shrink`, canvas `object-fit: contain`, min 84 px, na výšku do 520 px se skryje), `.actions` zůstávají dole; do 700 px výšky kompaktnější mezery/písmo/tlačítka (48 px), ležato do 460 px tlačítka vedle sebe, do 380 px i skóre + sázka + odemčení v jedné řadě (do 340 px bez věty `#endSub`); `.scroll` s `overflow-y: auto` zůstává jako pojistka. Mimo nízké výšky beze změny (změřeno: 1440×900 i iPhone 13 na celou obrazovku mají stejné y tlačítek, ilustrace i nadpisu jako před opravou). Režim Herny je dál `body[data-herna]`.
- **Příčina:** konec zápasu měl pevné rozměry (ilustrace 229 px + nadpis + věta + skóre + sázka + odemčení + 2×56 px tlačítka), v rámu 390×613 přetekl o 96 px.
- **Před/po (WebKit iPhone 13, iframe 390×613, skutečný konec v Herně):** Odveta 587–643 → 493–541, Jiná hra 653–709 → 551–599. Ležato 844×300: 355–473 → 204–252 (vedle sebe), 390×480: → 276–382.
- **Test:** `tests/herna.cjs` (lišta rodiče 51 px, jako v Herně) hlídá na konci zápasu `bottom <= innerHeight`, `top >= 0`, výška >= 44 px v iframe 390×613, 844×300 a 390×480; na starém buildu padá přesně na 587–643 / 653–709. `tests/mobile.cjs` konec zápasu nehraje, tam se nic nepřidávalo.
- **Ověřeno (příkaz → exit), lokálně:** `herna.cjs` 58/58 (0), `duel.cjs --variant both` 84/84 (0), `mobile.cjs` 66/66 (0), `solo.cjs` 21/21 (0), `engine.test.cjs` 309 PASS (0). **ŽIVĚ** (Pages, dccd7ff): `herna.cjs` 58/58 (0), `mobile.cjs` 66/66 (0); skutečná Herna `react-apps/herna/tests/mistnost-hry.cjs tancicky` 42 PASS, 0 FAIL (0).
- **Rozhodnuto:** ilustrace se při velmi nízké výšce na výšku (do 520 px) skryje, ležato se zmenšuje na 22 % šířky; text věty `#endSub` mizí až od 340 px výšky ležato / 440 px na výšku; v ležaté kompozici je text zarovnaný doleva (původní záměr, přebíjela ho specificita `.setup-wrap.center`).
- **NEOVĚŘENO:** skutečný iPhone (Safari lišty, `env(safe-area-inset-bottom)` v rámu je v emulaci 0); extrémně malé rámy (320×400 se vejde jen díky skrytí ilustrace a věty).

## 2026-10-31 – napojení na Hernu
- **Hotovo:** protokol Herny verze 1 (`react-apps/HERNA-PROTOKOL.md`). `<meta name="herna-protokol" content="1">` v `index.html`; při `#herna=1&m=…&r=…&seat=…&names=…&zaklada=…` hra přeskočí výzvu i setup (`hernaBoot` v `src/app.js`): zakladatel založí dokument `tancicky-<r>/hra` se jmény z Herny (`TankNet.create(g, seat, id)`), druhý polluje a sedne si sám (`TankNet.accept`, bez `introMine`). Skryté: sdílení odkazu, „Zkusit sám“, „Vyzvat soupeře“, „Do menu“, domů, celá obrazovka, nápověda Přidat na plochu (CSS `body[data-herna]`). Nové tlačítko „Jiná hra“ na konci. Zprávy rodiči: `pripraveno`, `stav` (ceka/hraje/konec), `vysledek` (`<r>:<gi>`, vitez = seat nebo null, jednou za partii a hráče), `jina-hra`. Bez `#herna` beze změny (`#solo`, série, výzva).
- **Rozhodnuto:** sázka v Herně = „Jen o čest“ (Herna sčítá skóre sama, sázka s kafem by tam seděla špatně); začíná seat 0 jako v ostré hře; adresa iframe se nikdy nemění (reload sedne zpět na své místo z localStorage); když jsou obě místa v dokumentu cizí (smazané úložiště), platí `seat` z adresy; `remember()` se v Herně nevolá (nezaplevelí „Naposledy hrané“).
- **Ověřeno (příkaz → exit), lokálně:** `node tests/herna.cjs http://127.0.0.1:8802/` 50/50 (0), engine 309 PASS (0), net 64/64 (0), `duel --variant both` 84/84 (0), mobile 66/66 (0), solo 21/21 (0).
- **Ověřeno ŽIVĚ na Pages (541f930):** `node tests/herna.cjs https://sachasportrezervace-arch.github.io/tancicky/` 50/50 (0), `node tests/duel.cjs <Pages URL> --variant both` 84/84 (0).
- **Otevřené / NEOVĚŘENO:** běh proti skutečné Herně (jen vlastní rodič emulující protokol, ne maketa ani ostrá Herna); `locator.tap()` ve WebKitu uvnitř iframe potřebuje v rodiči `<meta name=viewport>` (jinak iframe 980 px a tlačítka mimo obrazovku), Herna ho mít musí.

## 2026-10-31 noc – sólo režim (Trénink)
- **Hotovo:** „Zkusit sám proti robotovi“ na úvodu + adresa `#solo`. Robot = `suggestShot` s pauzou 0,9 s a rozptylem ±8 % (asi 2 ze 3 střel nesedí přesně). Bez sync, odkazu i série, ve hře je „Trénink“, na konci „Znovu“ a „Vyzvat soupeře“. Test `tests/solo.cjs` (Chromium 1440×900 + WebKit iPhone 13, celá partie, 0 požadavků na mantledb).
- **Ověřeno lokálně:** solo 21/21, duel 84/84, mobile 66/66, engine 309, net 64/64 (vše exit 0). ŽIVĚ na Pages (2bd75dd): `node tests/solo.cjs <Pages URL>` 21/21, duel `--variant both` 84/84 (exit 0).

## 2026-10-31 večer – dokončení po přerušení (session účet P)
- **Hotovo:** převzat rozdělaný engine (MODS, MAPS vč. „Věže“, Vztek) i UI (karta kola, čip modifikátoru, odstín nebe, vztek na tanku a v HUD, kosmetika za sérii, 2. kolo designu). Nově: kolo nikdy nezopakuje mapu ani zvláštní modifikátor předchozího kola (+ test), `tests/playtest3.cjs` (3 partie za sebou se musí lišit), README.
- **Design-eye kolo 3:** 3 blockery opraveny: řada schopností na ležato se posouvá se scroll-snap a zprůhledněním vpravo, obchod se otevírá až po kartě kola, texty jsou bez rodu a pádu („odemyká“, „Dárek · Bára“). Polish: výraznější `.ragetag` (#C8372A). Kontrola: všechno OK až na „Dárek od Bára“ na tlačítku zbraně, i to je opravené.
- **Rozhodnuto:** písmo Fredoka zůstává z Google CDN a schody na hraně trávy zůstávají (jen polish, neblokuje).
- **Ověřeno (příkaz → exit):** lokálně engine 309 PASS (0), net 64/64 (0), duel `--variant both` 84/84 (0), mobile 66/66 (0), `tests/playtest3.cjs` PASS (0). Nasazeno 501a10a; ŽIVĚ `node tests/duel.cjs https://sachasportrezervace-arch.github.io/tancicky/ --variant both` 84/84 (0), `node tests/mobile.cjs <Pages URL>` 66/66 (0).
- **Otevřené / NEOVĚŘENO:** zvuk poslechem, vzhled písma na skutečném iPhonu, bílý záblesk výbuchu na snímku.

## 2026-10-31 – předávka (rozpracováno, kontext hlavní session plný)
- **Hotovo:** engine (`src/engine.js`, deterministický, celočíselný, twist Dárek, vyvážení z playtestu), sync (`src/net.js`, mantledb, polling 1 s po tahu), UI přestavěné na plochý vektor „A Hřiště“ + prvky z B (`design/`), testy `tests/engine.test.cjs`, `tests/net.test.cjs`, `tests/duel.cjs` (2 prohlížeče, živý sync, determinismus přes hash h[] a HP), `tests/mobile.cjs` (kamera, zoom, fullscreen).
- **Ověřeno dřív:** živá URL (stará papírová verze) `node tests/duel.cjs https://sachasportrezervace-arch.github.io/tancicky/ --variant both` → 84/84 PASS, exit 0. Lokálně nový vzhled: duel 84/84, mobile 66/66, engine 260 PASS (hlášení UI agenta, exit 0).
- **Rozpracováno:** engine zvětšuje hitbox tanku na ±20 × 26 px (RULES.tankHalfW/tankH); UI škáluje kresbu tanku na hitbox, okraj Pal!, ± tlačítka 44 px, nápověda na šířku.
- **Další krok:** `node tools/build.cjs` → všechny testy → design-eye kolo s verdiktem „profi“ (max 3 kola oprav) → commit + push (`git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`) → živý test duel + mobile na Pages URL.
- **Stav:** repo `sachasportrezervace-arch/tancicky` (main, Pages zapnuté, 1. commit = papírová verze). Codex revize enginu: `tests/codex-review.md` (vše opraveno).
- **Otevřené:** zvuk neověřen poslechem (WebKit v Playwrightu nemá WebAudio).
- **Aktualizace (16:10):** hitbox 40×26 hotový (engine 274 PASS). Design-eye finál: „ještě ne“ → UI agent dělá kolo 2/3 (větší tanky na desktopu, méně ovládání, výbuchy, 44 px cíle, share, obchod). Mark navíc chce proti stereotypu: modifikátory kola (MODS), typy map (MAPS), Vztek pro prohrávajícího, kosmetika za sérii → engine i UI zadáno. Pak: playtest 3 partií za sebou (musí se lišit), design-eye kolo 3, push, živý test, krátký popis novinek.
