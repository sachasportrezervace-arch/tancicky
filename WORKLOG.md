# TanÄÃ­ky â€“ pracovnÃ­ denÃ­k

NejnovÄ›jÅ¡Ã­ nahoÅ™e. ÄŒÃ­st jen hornÃ­ch ~40 Å™Ã¡dkÅ¯.

PÅ˜EVZATO 31. 10. â€“ dodÄ›lÃ¡vÃ¡ session na ÃºÄtu P, jinÃ¡ session sem nepÃ­Å¡e.

## 2026-10-31 noc â€“ sÃ³lo reÅ¾im (TrÃ©nink)
- **Hotovo:** â€žZkusit sÃ¡m proti robotoviâ€œ na Ãºvodu + adresa `#solo`. Robot = `suggestShot` s pauzou 0,9 s a rozptylem Â±8 % (asi 2 ze 3 stÅ™el nesedÃ­ pÅ™esnÄ›). Bez sync, odkazu i sÃ©rie, ve hÅ™e je â€žTrÃ©ninkâ€œ, na konci â€žZnovuâ€œ a â€žVyzvat soupeÅ™eâ€œ. Test `tests/solo.cjs` (Chromium 1440Ã—900 + WebKit iPhone 13, celÃ¡ partie, 0 poÅ¾adavkÅ¯ na mantledb).
- **OvÄ›Å™eno lokÃ¡lnÄ›:** solo 21/21, duel 84/84, mobile 66/66, engine 309, net 64/64 (vÅ¡e exit 0).

## 2026-10-31 veÄer â€“ dokonÄenÃ­ po pÅ™eruÅ¡enÃ­ (session ÃºÄet P)
- **Hotovo:** pÅ™evzat rozdÄ›lanÃ½ engine (MODS, MAPS vÄ. â€žVÄ›Å¾eâ€œ, Vztek) i UI (karta kola, Äip modifikÃ¡toru, odstÃ­n nebe, vztek na tanku a v HUD, kosmetika za sÃ©rii, 2. kolo designu). NovÄ›: kolo nikdy nezopakuje mapu ani zvlÃ¡Å¡tnÃ­ modifikÃ¡tor pÅ™edchozÃ­ho kola (+ test), `tests/playtest3.cjs` (3 partie za sebou se musÃ­ liÅ¡it), README.
- **Design-eye kolo 3:** 3 blockery opraveny: Å™ada schopnostÃ­ na leÅ¾ato se posouvÃ¡ se scroll-snap a zprÅ¯hlednÄ›nÃ­m vpravo, obchod se otevÃ­rÃ¡ aÅ¾ po kartÄ› kola, texty jsou bez rodu a pÃ¡du (â€žodemykÃ¡â€œ, â€žDÃ¡rek Â· BÃ¡raâ€œ). Polish: vÃ½raznÄ›jÅ¡Ã­ `.ragetag` (#C8372A). Kontrola: vÅ¡echno OK aÅ¾ na â€žDÃ¡rek od BÃ¡raâ€œ na tlaÄÃ­tku zbranÄ›, i to je opravenÃ©.
- **Rozhodnuto:** pÃ­smo Fredoka zÅ¯stÃ¡vÃ¡ z Google CDN a schody na hranÄ› trÃ¡vy zÅ¯stÃ¡vajÃ­ (jen polish, neblokuje).
- **OvÄ›Å™eno (pÅ™Ã­kaz â†’ exit):** lokÃ¡lnÄ› engine 309 PASS (0), net 64/64 (0), duel `--variant both` 84/84 (0), mobile 66/66 (0), `tests/playtest3.cjs` PASS (0). Nasazeno 501a10a; Å½IVÄš `node tests/duel.cjs https://sachasportrezervace-arch.github.io/tancicky/ --variant both` 84/84 (0), `node tests/mobile.cjs <Pages URL>` 66/66 (0).
- **OtevÅ™enÃ© / NEOVÄšÅ˜ENO:** zvuk poslechem, vzhled pÃ­sma na skuteÄnÃ©m iPhonu, bÃ­lÃ½ zÃ¡blesk vÃ½buchu na snÃ­mku.

## 2026-10-31 â€“ pÅ™edÃ¡vka (rozpracovÃ¡no, kontext hlavnÃ­ session plnÃ½)
- **Hotovo:** engine (`src/engine.js`, deterministickÃ½, celoÄÃ­selnÃ½, twist DÃ¡rek, vyvÃ¡Å¾enÃ­ z playtestu), sync (`src/net.js`, mantledb, polling 1 s po tahu), UI pÅ™estavÄ›nÃ© na plochÃ½ vektor â€žA HÅ™iÅ¡tÄ›â€œ + prvky z B (`design/`), testy `tests/engine.test.cjs`, `tests/net.test.cjs`, `tests/duel.cjs` (2 prohlÃ­Å¾eÄe, Å¾ivÃ½ sync, determinismus pÅ™es hash h[] a HP), `tests/mobile.cjs` (kamera, zoom, fullscreen).
- **OvÄ›Å™eno dÅ™Ã­v:** Å¾ivÃ¡ URL (starÃ¡ papÃ­rovÃ¡ verze) `node tests/duel.cjs https://sachasportrezervace-arch.github.io/tancicky/ --variant both` â†’ 84/84 PASS, exit 0. LokÃ¡lnÄ› novÃ½ vzhled: duel 84/84, mobile 66/66, engine 260 PASS (hlÃ¡Å¡enÃ­ UI agenta, exit 0).
- **RozpracovÃ¡no:** engine zvÄ›tÅ¡uje hitbox tanku na Â±20 Ã— 26 px (RULES.tankHalfW/tankH); UI Å¡kÃ¡luje kresbu tanku na hitbox, okraj Pal!, Â± tlaÄÃ­tka 44 px, nÃ¡povÄ›da na Å¡Ã­Å™ku.
- **DalÅ¡Ã­ krok:** `node tools/build.cjs` â†’ vÅ¡echny testy â†’ design-eye kolo s verdiktem â€žprofiâ€œ (max 3 kola oprav) â†’ commit + push (`git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`) â†’ Å¾ivÃ½ test duel + mobile na Pages URL.
- **Stav:** repo `sachasportrezervace-arch/tancicky` (main, Pages zapnutÃ©, 1. commit = papÃ­rovÃ¡ verze). Codex revize enginu: `tests/codex-review.md` (vÅ¡e opraveno).
- **OtevÅ™enÃ©:** zvuk neovÄ›Å™en poslechem (WebKit v Playwrightu nemÃ¡ WebAudio).
- **Aktualizace (16:10):** hitbox 40Ã—26 hotovÃ½ (engine 274 PASS). Design-eye finÃ¡l: â€žjeÅ¡tÄ› neâ€œ â†’ UI agent dÄ›lÃ¡ kolo 2/3 (vÄ›tÅ¡Ã­ tanky na desktopu, mÃ©nÄ› ovlÃ¡dÃ¡nÃ­, vÃ½buchy, 44 px cÃ­le, share, obchod). Mark navÃ­c chce proti stereotypu: modifikÃ¡tory kola (MODS), typy map (MAPS), Vztek pro prohrÃ¡vajÃ­cÃ­ho, kosmetika za sÃ©rii â†’ engine i UI zadÃ¡no. Pak: playtest 3 partiÃ­ za sebou (musÃ­ se liÅ¡it), design-eye kolo 3, push, Å¾ivÃ½ test, krÃ¡tkÃ½ popis novinek.
