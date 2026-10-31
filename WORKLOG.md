# Tančíky – pracovní deník

Nejnovější nahoře. Číst jen horních ~40 řádků.

PŘEVZATO 31. 10. – dodělává session na účtu P, jiná session sem nepíše.

## 2026-10-31 – předávka (rozpracováno, kontext hlavní session plný)
- **Hotovo:** engine (`src/engine.js`, deterministický, celočíselný, twist Dárek, vyvážení z playtestu), sync (`src/net.js`, mantledb, polling 1 s po tahu), UI přestavěné na plochý vektor „A Hřiště“ + prvky z B (`design/`), testy `tests/engine.test.cjs`, `tests/net.test.cjs`, `tests/duel.cjs` (2 prohlížeče, živý sync, determinismus přes hash h[] a HP), `tests/mobile.cjs` (kamera, zoom, fullscreen).
- **Ověřeno dřív:** živá URL (stará papírová verze) `node tests/duel.cjs https://sachasportrezervace-arch.github.io/tancicky/ --variant both` → 84/84 PASS, exit 0. Lokálně nový vzhled: duel 84/84, mobile 66/66, engine 260 PASS (hlášení UI agenta, exit 0).
- **Rozpracováno:** engine zvětšuje hitbox tanku na ±20 × 26 px (RULES.tankHalfW/tankH); UI škáluje kresbu tanku na hitbox, okraj Pal!, ± tlačítka 44 px, nápověda na šířku.
- **Další krok:** `node tools/build.cjs` → všechny testy → design-eye kolo s verdiktem „profi“ (max 3 kola oprav) → commit + push (`git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`) → živý test duel + mobile na Pages URL.
- **Stav:** repo `sachasportrezervace-arch/tancicky` (main, Pages zapnuté, 1. commit = papírová verze). Codex revize enginu: `tests/codex-review.md` (vše opraveno).
- **Otevřené:** zvuk neověřen poslechem (WebKit v Playwrightu nemá WebAudio).
- **Aktualizace (16:10):** hitbox 40×26 hotový (engine 274 PASS). Design-eye finál: „ještě ne“ → UI agent dělá kolo 2/3 (větší tanky na desktopu, méně ovládání, výbuchy, 44 px cíle, share, obchod). Mark navíc chce proti stereotypu: modifikátory kola (MODS), typy map (MAPS), Vztek pro prohrávajícího, kosmetika za sérii → engine i UI zadáno. Pak: playtest 3 partií za sebou (musí se lišit), design-eye kolo 3, push, živý test, krátký popis novinek.
