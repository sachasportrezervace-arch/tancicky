# Tančíky – pracovní deník

Nejnovější nahoře. Číst jen horních ~40 řádků.

PŘEVZATO 31. 10. – dodělává session na účtu P, jiná session sem nepíše.

## 2026-10-31 noc – sólo režim (Trénink)
- **Hotovo:** „Zkusit sám proti robotovi“ na úvodu + adresa `#solo`. Robot = `suggestShot` s pauzou 0,9 s a rozptylem ±8 % (asi 2 ze 3 střel nesedí přesně). Bez sync, odkazu i série, ve hře je „Trénink“, na konci „Znovu“ a „Vyzvat soupeře“. Test `tests/solo.cjs` (Chromium 1440×900 + WebKit iPhone 13, celá partie, 0 požadavků na mantledb).
- **Ověřeno lokálně:** solo 21/21, duel 84/84, mobile 66/66, engine 309, net 64/64 (vše exit 0).

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
