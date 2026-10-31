# Tančíky

Tahová tanková hra pro dva s ničitelným terénem. Hraje se na jednom odkazu (živá synchronizace), nebo lokálně na jednom zařízení.

Hra: https://sachasportrezervace-arch.github.io/tancicky/

## Co v ní je
- Deterministický celočíselný engine (`src/engine.js`): stav = seed + seznam tahů, oba hráči spočítají totéž.
- Každé kolo jiná mapa (Kopečky, Kaňon, Plošiny, Sopka, Duny, Věže) a modifikátor (Vichřice, Měsíc, Těžká planeta, Zrcadlo, Boháči, Krátery). Mapa ani zvláštní modifikátor se v dalším kole neopakují.
- Zbraně, schopnosti, obchod, Dárek pro soupeře, Vztek pro toho, kdo prohrává (+25 % poškození), kosmetika tanku za výhry v sérii.

## Vývoj
```bash
node tools/build.cjs
```
```bash
node tools/serve.cjs 8802
```
`src/index.src.html` se skládá do `index.html` (to se nasazuje na GitHub Pages z `main`).

## Testy
```bash
node tests/engine.test.cjs
```
```bash
node tests/net.test.cjs
```
```bash
node tests/duel.cjs http://127.0.0.1:8802/ --variant both
```
```bash
node tests/mobile.cjs http://127.0.0.1:8802/
```
```bash
node tests/playtest3.cjs
```
Duel a mobile potřebují globálně nainstalovaný Playwright (`%APPDATA%/npm/node_modules/playwright`). Proti živé verzi stačí místo localhost dát Pages URL.
