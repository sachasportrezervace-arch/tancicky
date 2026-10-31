# Tančíky: dva vizuální směry (A a B)

Stav: **HYPOTÉZA**. Jsou to statické SVG mockupy, ne postavená hra. Verdikt dává `design-eye` z renderů a schvaluje Mark.
Zařazení: L2 · D2 (odvozené z „custom, hezké, vtipné“; D3 nebylo výslovně zadané).
Zdroj SVG: `_src/gen.cjs` (generuje ručně laditelné SVG). Rendery: `_src/render.cjs` (Playwright, Chromium; mobil 2×, desktop 1×).

| Soubor | A Hřiště | B Komiks |
|---|---|---|
| Telefon 390×844 | `A-mobile.svg/.png` | `B-mobile.svg/.png` |
| Desktop 1280×800 | `A-desktop.svg/.png` | `B-desktop.svg/.png` |
| Výrazy tanků + výběr dárku | `A-tanks.svg/.png` | `B-tanks.svg/.png` |

## A · Hřiště
**Koncept:** odpoledne na kopci. Plochý vektor bez obrysů, hračkové tanky ve tvaru gumových kapek, klidný krémový HUD nad scénou. Herní plocha je slunná a čitelná, nic na ní nepřekáží.

- **Paleta:** obloha `#CDEBEF` · vzdálené kopce `#B3DED1` · bližší kopce `#93CFB8` · slunce `#FFF4D2` · hlína `#F2B36B` · horní lem (tráva) `#6BBD73` · hlubší pás `#DD9452` · inkoust `#2B2242` · krémová plocha `#FFF9EE` · linka a dráha `#EADFCB` · akcent Pal `#FFC93C` (spodní hrana `#E9A913`) · hráč 1 `#F25A45` / stín `#C9412F` / světlo `#FFB3A3` / podklad `#FFE3DC` · hráč 2 `#7B61F2` / `#5A43CC` / `#C4B6FF` / `#ECE7FF` · pásy tanku `#3A3152` / kola `#5D5279` · tvářičky `#FF9C93`.
- **Font:** Fredoka 500/600/700 (Google Fonts, latin-ext, české znaky v renderu sedí). Jedna rodina, čísla 700.
- **Tvary:** rádius = polovina výšky (pilulky a kruhy), panel zásobníku 28. Stín je plochý: tentýž tvar o 3–4 px níž, inkoust při 12–14 % krytí. Žádný blur, žádné přechody.
- **Pozadí:** obloha, 2 vrstvy kopců, 1 slunce. Terén = jeden tvar, nahoře lem trávy (11–13 px) a hlubší pás o 78–96 px níž. Lem kopíruje i krátery.

## B · Komiks
**Koncept:** sobotní komiks. Silné inkoustové obrysy (3 px), sytá trojice kobaltová obloha, hořčicová hlína a rajčatový/mátový tank. Hodnoty míření ukazuje komiksová bublina nad tankem a HUD drží tmavé inkoustové pásy nahoře a dole.

- **Paleta:** obloha `#3A57E3` · kopce `#2F49C8` / `#2539AA` · měsíc `#FFF1C7` · hlína `#FFC23A` · horní lem `#FFF0B8` · hlubší pás `#EC9A10` · inkoust a obrys `#1C1633` · krémová `#FFF6E3` · neaktivní prvky a dráha `#4A4268` · hráč 1 `#FF5B3A` / `#D23E1E` / `#FFB19E` / `#FFE1D8` · hráč 2 `#2FD3A4` / `#159E78` / `#A6F2DB` / `#DDFBF1` · tvářičky `#FF8F87`.
- **Font:** Bricolage Grotesque 600/800, `font-stretch` 80 % (Google Fonts, latin-ext). Velká písmena jen u jmen, tlačítek a štítků.
- **Tvary:** obrys 3 px všude, karty s rádiusem 6–8, tlačítka jako pilulky, pod tlačítkem Pal plochý posun ve stínovém odstínu.

## Tanky (oba směry, 4+ výrazy, viz `*-tanks.png`)
- **Hráč 1:** široký rváč. V A červená kapka s náplastí a hustým obočím, v B krabice s čelenkou a vlajícími cípy. Výchozí výraz je odhodlaný.
- **Hráč 2:** vysoká kulatá kopule. Má řasy, pihy, žlutou bambuli na anténě a drzý úsměšek. V A jsou 3 kola místo 4, takže je odlišný i obrys.
- **Výrazy:** *klid* (velké oči s odleskem, mrkání = oči jako oblouky), *míří* (víčka do V, jazyk v koutku, zornice míří k hlavni), *zásah* (oči `> <`, otevřená pusa, kapky potu, náklon −8°), *výhra* (oči `^ ^`, velký úsměv s jazykem, žluté jiskry). Navíc *strach* (zvednutá vnitřní víčka). Ten má soupeř, když na něj míříš, a vidí se v ikoně obličeje i v bublině s kamerou na soupeře.
- **Velikost:** telefon 92 px šířky (scale 0.92 z 100jednotkového tanku), desktop 106–114 px. Ikona obličeje = stejný tank oříznutý do kruhu a vycentrovaný na oči, takže v HUD vždy sedí aktuální výraz.

## HUD (míry v CSS px)
| Prvek | A telefon | A desktop | B telefon | B desktop |
|---|---|---|---|---|
| Zdraví | jedna pilulka 366×54 nahoře, obličeje r22, lišty 104×12 od obličeje ke středu, uprostřed skóre r17 | pilulka 720×64 uprostřed, obličeje r27, lišty 242×14 | inkoustový pás výšky 96, obličeje r27 s krémovým okrajem, lišty 72×14 | pás výšky 92, obličeje r32, lišty 366×16 |
| Vítr | pilulka 132×38 pod zdravím: lišta od středu, šipka, číslo 21 px | 170×38 | ve středu pásu: lišta 64×10, šipka, číslo 22 px | lišta 120×10 |
| Úhel a síla | v zásobníku 27 px (`52°` / `74`) | v pravém dolním čipu 24 px | **jen komiksová bublina** nad tankem, 22 px | jen bublina |
| Zbraně | dárková zbraň r26 v čipu 222×60 | čip vlevo dole 372×64 | karusel r23–25, dárek první v rajčatovém kroužku, ostatní se zámkem | spodní pás: dárek r28 + 6 zamčených r21 |
| Aktivky | řada r22 (44 px) v zásobníku, cooldown = číslo v odznaku | r24 pod svým obličejem, soupeřovy r17 tlumeně vpravo | svislá lišta r22 vlevo | svislá lišta r25 s popisky |
| Jízda | ◀ ▶ r28 (56 px) + lišta paliva | ◀ ▶ r24 + palivo v čipu, klávesy A/D | jedna pilulka 168×54 rozdělená na ◀/▶ + palivo 5 px | lišta paliva + nápověda kláves |
| Pal | kruh r40 (80 px), `#FFC93C` | kruh r46 + „mezerník“ | pilulka přes celou šířku 358×56 v barvě hráče | pilulka 196×64 |

- **Míření:** táhneš od tanku a vidíš duch prstu (kroužek r20) a tečkovanou čáru tahu. Dráha je tečkovaný oblouk, tečky se zmenšují a blednou. Nad aktivním tankem je trojúhelník v barvě hráče (A), v B na jeho místě sedí bublina.
- **Telefon:** všechno ovládání je v dolním zásobníku od y = 604–612, tank stojí nad ním (spodek tanku ≈ y 500–570). Primární tlačítka mají ≥ 56 px, ostatní ≥ 44 px. Soupeř mimo záběr: v A čip „Radka >“ na okraji ve výšce terénu, v B kruhová kamera r44 s jejím vyděšeným obličejem.
- **Desktop:** samostatná kompozice, žádný zvětšený telefon. A má plovoucí čipy v rozích přímo nad hlubokým pásem terénu a oba tanky v záběru. B má kokpit: horní a dolní inkoustový pás, aktivky svisle vlevo.

## Twist „Dárek“
- **Výběr po ráně** (pravý panel v `*-tanks.png`): „Vyber Radce dárek“, 3 náhodné zbraně jako řádky s ikonou, názvem a vtipným popiskem, potom „Zabalit a poslat“. V A je vybraný řádek fialový (barva příjemce) s mašlí, v B je každá ikona zabalená stuhou a vybraná karta je mátová.
- **Příjem:** vynucená zbraň nese mašli. V A je to žlutá mašle a čip „Napalm · dárek od Radky“ v barvě dárce, v B kruhová ikona převázaná rajčatovou stuhou a štítek „DÁREK OD RADKY: NAPALM“. Ostatní zbraně jsou v B vidět se zámkem, v A skryté. **Vrátit dárek** = žeton (zlatá mince s počtem `1`) v obrysové pilulce, klávesa R.

## Poctivé srovnání (taste lens + reference)
- **Čistota jako reference:** oba směry mají velké ploché plochy, nejvýš 2 vrstvy kopců, žádné mraky, kosti, šum ani ornamenty. Horní lišta zdraví s obličeji, vítr uprostřed a kulaté ikony vycházejí z reference. Postavy ji ale **nekopírují**: jsou to tanky-hračky a reference má lidi. Mobil je postavený na šířku telefonu, ne jako výřez obrazovky na šířku.
- **Kde zaostávám za referencí:** reference má postavy přes čtvrtinu výšky obrazu. Tady má tank kvůli zadání 90–110 px a na telefonu zůstává hodně oblohy (A víc než B). Pro „velké na obrazovce“ by v implementaci pomohl zoom kamery na 1.3× při míření. V A je nad terénem prázdno, nebe je nejslabší místo směru.
- **Proti AI slopu (lens H/QB):** jeden výrazný prvek, který vychází z obsahu hry: tvář tanku žije v HUD (ikony obličeje mění výraz podle stavu), v B navíc kamera na soupeře a bublina. Žádné gradienty, glassmorphismus ani emoji. Fonty nejsou Inter, Roboto ani Arial. Nepoužil jsem paletu ani font odmítnuté papírové verze (fialovo-oranžové vrstvy, zaoblený display, segmentované lišty) ani žádnou Markovu dřívější paletu.
- **Rizika:** A může působit „příliš hodně“ jako mobilní kawaii hra. B je hlasitější a obrysy znamenají v canvasu víc práce (tah obrysu u ničitelného terénu, výkon na telefonu). Komiksová bublina v B nesmí překrýt dráhu: v renderu B-mobile zakrývá první tečky.
- **Doporučení:** **B** pro charakter a vtip (silnější siluety, bublina, kamera na soupeře a kontrast na telefonu venku). A je bezpečnější a klidnější. Když se Markovi líbí čistota A, dají se do A převzít tvary tanků z B.
- **Ověření před stavbou:** rendery desktop a telefon ve hře (míření, let, zásah, konec), kontrast textu (krémová na `#1C1633` i inkoust na `#FFC93C` vychází vysoko, malé 11–12px popisky při 60 % krytí ještě změřit), fokus na tlačítkách, `prefers-reduced-motion` (mrkání a poskočení vypnout) a rozpočet 60 fps na telefonu.
