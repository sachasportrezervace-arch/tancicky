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
```bash
node tests/solo.cjs http://127.0.0.1:8802/
```
Trénink proti robotovi: tlačítko „Zkusit sám proti robotovi“ nebo adresa `#solo` (nic se nesynchronizuje, nepočítá se do série).
```bash
node tests/herna.cjs http://127.0.0.1:8802/
```
Herna (protokol `react-apps/HERNA-PROTOKOL.md`, verze 1): hra hlásí `<meta name="herna-protokol" content="1">` a při `#herna=1&m=…&r=…&seat=0|1&names=A,B&zaklada=0|1` přeskočí výzvu i setup (zakladatel založí dokument `r`, druhý se sám posadí, sdílení odkazu, „Zkusit sám“ a odkazy ven jsou skryté) a posílá rodiči `pripraveno`, `stav`, `vysledek` a `jina-hra`. `tests/herna.cjs` to ověří v iframe vlastního rodiče ve 2 prohlížečích (Chromium desktop a WebKit iPhone 13, role prohozené) včetně odvety. Bez `#herna` se hra chová jako dřív.
Duel a mobile potřebují globálně nainstalovaný Playwright (`%APPDATA%/npm/node_modules/playwright`). Proti živé verzi stačí místo localhost dát Pages URL.
