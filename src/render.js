/* Tančíky: Canvas 2D renderer, směr „A Hřiště“. Plochý vektor: plné barvy, žádné přechody, rozmazání ani zrno.
   Tanky jsou hračkové kapky s inkoustovým obrysem 2,5 px a živými výrazy. Vše se kreslí procedurálně.
   Tohle je jen vzhled: smí používat Math.sin a náhodu, simulaci to neovlivní. */
(function () {
  "use strict";
  var W = 960, H = 540, TAU = Math.PI * 2, DEG = Math.PI / 180;

  /* ================= VZHLED: všechny barvy a míry na jednom místě (výměna vzhledu = úprava tohoto bloku) ================= */
  var LOOK = {
    font: '"Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif',
    sky: "#CDEBEF", far: "#B3DED1", near: "#93CFB8", cloud: "#E4F4F6",
    soil: "#F2B36B", lip: "#6BBD73", lipW: 12, deep: "#DD9452", deepOff: 85,
    ink: "#2B2440", cream: "#FFF9EE", line: "#EADFCB", accent: "#FFC93C", accentDeep: "#E9A913",
    tread: "#3A3152", wheel: "#5D5279", blush: "#FF9C93", tongue: "#FF7A85", sweat: "#7FD3F0", white: "#FFFFFF",
    boomCore: "#FFC93C", boomRing: "#FF5A4E", boomDirt: "#E39A55", fire: ["#FF6B4A", "#FF9A3C", "#FFC93C"],
    debris: ["#F2B36B", "#DD9452", "#6BBD73"], smoke: "#FFF9EE", dust: "#E9B57E", teal: "#3FBFAE",
    players: [
      { main: "#F25A45", shade: "#C9412F", light: "#FFB3A3", pale: "#FFE3DC" },
      { main: "#7B61F2", shade: "#5A43CC", light: "#C4B6FF", pale: "#ECE7FF" }
    ],
    deadMix: "#8E879E", deadAmt: 0.5,
    outlinePx: 2.5, projOutlinePx: 2, shadowA: 0.16, shadowPx: 4, aimInkA: 0.65, zoneInkA: 0.25,
    tankPxPhone: 92, tankPxDesk: 110, tsMin: 0.5, tsMax: 1.15,
    edgeR: 32, cloudY: 50, cloudW: 150, cloudSpeed: 4,
    hills: [
      { col: "#B3DED1", base: 188, a1: 30, f1: 140, p1: 1.2, a2: 12, f2: 57, p2: 2.1, par: 0.03 },
      { col: "#93CFB8", base: 246, a1: 24, f1: 104, p1: 4.0, a2: 9, f2: 41, p2: 0.7, par: 0.07 }
    ]
  };
  var FONT = LOOK.font, INK = LOOK.ink, CREAM = LOOK.cream, ACC = LOOK.accent;

  var calmQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  var calm = function () { return !!(calmQuery && calmQuery.matches); };
  // projektily v enginu: pozice a rychlosti jsou v sub-pixelech (S jednotek na pixel)
  var SUBPX = true;

  // PAL: app.js čte PAL[i].body (barvy UI); body/light/dark/deep zůstávají kvůli kompatibilitě
  var PAL = LOOK.players.map(function (p) { return { body: p.main, light: p.light, dark: p.shade, deep: p.shade, flag: ACC, main: p.main, shade: p.shade, pale: p.pale }; });

  var WEAPON_LOOK = {
    grenade: { c: "#5D5279", r: 5, trail: "smoke", fuse: true },
    triple: { c: "#FFC93C", r: 3.8, trail: "smoke" },
    mirv: { c: "#F25A45", r: 6, trail: "smoke", band: "#FFF9EE" },
    roller: { c: "#FFF9EE", r: 5.5, trail: "dust", wheel: true },
    drill: { c: "#FFC93C", r: 5, trail: "dust", cone: true },
    napalm: { c: "#FF6B4A", r: 5.5, trail: "fire", core: "#FFC93C" },
    dirt: { c: "#DD9452", r: 5.5, trail: "dust", blob: true },
    bouncer: { c: "#7FD3F0", r: 5, trail: "smoke", stripe: "#FFF9EE" },
    spray: { c: "#FFF9EE", r: 2.8, trail: "smoke" },
    pirko: { c: "#3FBFAE", r: 4.2, trail: "smoke", feather: true },
    konfety: { c: "#FFF9EE", r: 4.8, trail: "confetti", dots: ["#FFC93C", "#F25A45", "#7B61F2"] },
    nuke: { c: "#3A3152", r: 7.5, trail: "smoke", band: "#FFC93C" },
    leaper: { c: "#6BBD73", r: 4.6, trail: "dust" },
    airstrike: { c: "#3A3152", r: 4.6, trail: "smoke", fin: true }
  };
  var DEFAULT_LOOK = { c: "#5D5279", r: 4.5, trail: "smoke" };

  function fr(x) { var s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(c1, c2, t) { // #rrggbb mix
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    var r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  function rr(c, x, y, w, h, r) { // rounded rect path
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
  }
  function mk(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  /* ================= tvary tanků (jednotka: tank široký 100, počátek uprostřed na zemi, y nahoru záporné) ================= */
  var SHAPES = null;
  function shapes() {
    if (SHAPES) return SHAPES;
    SHAPES = [
      { // hráč 1: široká kapka s náplastí, hustým obočím a čelenkou
        hull: new Path2D("M-48 -20 H48 C51 -20 52 -24 51 -30 C47 -52 29 -62 0 -62 C-29 -62 -47 -52 -51 -30 C-52 -24 -51 -20 -48 -20Z"),
        band: new Path2D("M-62 -29 Q0 -73 62 -29 L62 -38 Q0 -82 -62 -38Z"),
        top: -62, tw: 51, wheels: [-34, -11.5, 11.5, 34], ey: -44, rx: 11, ry: 12, e1: 2, e2: 26, mx: 14, my: -31,
        faceC: [14, -39], topUnits: 94, tall: false
      },
      { // hráč 2: vysoká kopule, tři kola, bambule, řasy, pihy
        hull: new Path2D("M-40 -20 H40 C44 -20 45 -26 44 -34 C41 -64 24 -78 0 -78 C-24 -78 -41 -64 -44 -34 C-45 -26 -44 -20 -40 -20Z"),
        top: -78, tw: 42, wheels: [-26, 0, 26], ey: -50, rx: 11, ry: 13.5, e1: 0, e2: 23, mx: 12, my: -32.5,
        faceC: [11.5, -44], topUnits: 112, tall: true
      }
    ];
    return SHAPES;
  }
  var deadPal = [null, null];
  function palFor(style, dead) {
    var p = LOOK.players[style];
    if (!dead) return p;
    if (!deadPal[style]) deadPal[style] = { main: mix(p.main, LOOK.deadMix, LOOK.deadAmt), shade: mix(p.shade, LOOK.deadMix, LOOK.deadAmt), light: mix(p.light, LOOK.deadMix, LOOK.deadAmt), pale: p.pale };
    return deadPal[style];
  }

  /* ---- obličej: oko ---- */
  function drawEye(c, P, cx, cy, rx, ry, face, side, la) {
    c.strokeStyle = INK; c.lineCap = "round"; c.lineJoin = "round";
    if (face === "blink") { c.lineWidth = 3.4; c.beginPath(); c.moveTo(cx - rx * 0.8, cy); c.quadraticCurveTo(cx, cy + 5, cx + rx * 0.8, cy); c.stroke(); return; }
    if (face === "win") { c.lineWidth = 3.8; c.beginPath(); c.moveTo(cx - rx * 0.75, cy + 3); c.quadraticCurveTo(cx, cy - 9, cx + rx * 0.75, cy + 3); c.stroke(); return; }
    if (face === "hit") {
      c.lineWidth = 3.8; c.beginPath();
      if (side < 0) { c.moveTo(cx - 6, cy - 7); c.lineTo(cx + 5, cy); c.lineTo(cx - 6, cy + 7); } else { c.moveTo(cx + 6, cy - 7); c.lineTo(cx - 5, cy); c.lineTo(cx + 6, cy + 7); }
      c.stroke(); return;
    }
    if (face === "lose") { c.lineWidth = 3.6; c.beginPath(); c.moveTo(cx - 5.5, cy - 5.5); c.lineTo(cx + 5.5, cy + 5.5); c.moveTo(cx + 5.5, cy - 5.5); c.lineTo(cx - 5.5, cy + 5.5); c.stroke(); return; }
    var px = cx + 2.6, py = cy + 1.2;
    if (face === "aim") { px = cx + Math.cos(la * DEG) * 3.8; py = cy - Math.sin(la * DEG) * 3.8; }
    if (face === "worry") { px = cx - 3; py = cy + 2.5; }
    c.fillStyle = LOOK.white; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(px, py, rx * 0.52, 0, TAU); c.fill();
    c.fillStyle = LOOK.white; c.beginPath(); c.arc(px - 1.6, py - 2.2, 1.9, 0, TAU); c.fill();
    if (face === "aim" || face === "worry") { // víčko: plochý šikmý řez v barvě trupu
      var a, b;
      if (face === "aim") { a = cy - ry * (side < 0 ? 0.52 : 0.2); b = cy - ry * (side < 0 ? 0.2 : 0.52); }
      else { a = cy - ry * (side < 0 ? 0.3 : 0.62); b = cy - ry * (side < 0 ? 0.62 : 0.3); }
      c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.clip();
      c.fillStyle = P.main; c.beginPath(); c.moveTo(cx - rx - 3, cy - ry - 3); c.lineTo(cx + rx + 3, cy - ry - 3); c.lineTo(cx + rx + 3, b); c.lineTo(cx - rx - 3, a); c.closePath(); c.fill();
      var ext = face === "aim" ? 0.15 : 0;
      c.strokeStyle = INK; c.lineWidth = face === "aim" ? 3.2 : 3; c.beginPath(); c.moveTo(cx - rx - 3, a - (b - a) * ext); c.lineTo(cx + rx + 3, b + (b - a) * ext); c.stroke();
      c.restore();
    }
  }

  /* ---- obličej: pusa ---- */
  function drawMouth(c, face, x, y, tall) {
    var w = 12; c.strokeStyle = INK; c.lineCap = "round"; c.lineJoin = "round";
    if (face === "hit") { c.fillStyle = INK; c.beginPath(); c.ellipse(x, y + 1, 4.6, 5.4, 0, 0, TAU); c.fill(); c.fillStyle = LOOK.tongue; c.beginPath(); c.ellipse(x, y + 3.6, 3, 2, 0, 0, TAU); c.fill(); return; }
    if (face === "win") {
      c.fillStyle = INK; c.beginPath(); c.moveTo(x - w / 2 - 1, y - 3.5); c.lineTo(x + w / 2 + 1, y - 3.5); c.quadraticCurveTo(x + w / 2 + 1, y + 7, x, y + 7); c.quadraticCurveTo(x - w / 2 - 1, y + 7, x - w / 2 - 1, y - 3.5); c.closePath(); c.fill();
      c.fillStyle = LOOK.tongue; c.beginPath(); c.moveTo(x - 3.6, y + 5.6); c.quadraticCurveTo(x, y + 1, x + 3.6, y + 5.6); c.quadraticCurveTo(x, y + 7.4, x - 3.6, y + 5.6); c.closePath(); c.fill(); return;
    }
    if (face === "aim") {
      c.lineWidth = 2.8; c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x + w / 2 - 2, y); c.stroke();
      c.fillStyle = LOOK.tongue; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + 1, y); c.quadraticCurveTo(x + 2, y + 5, x + 5.5, y + 4.5); c.quadraticCurveTo(x + 8, y + 3.9, x + 7, y); c.closePath(); c.fill(); c.stroke(); return;
    }
    c.lineWidth = 2.7; c.beginPath();
    if (face === "worry") { c.moveTo(x - 5, y + 2); c.quadraticCurveTo(x - 2, y - 1, x, y + 2); c.quadraticCurveTo(x + 3, y + 5, x + 5, y + 2); }
    else if (face === "lose") { c.moveTo(x - 5.5, y + 3); c.quadraticCurveTo(x, y - 3.5, x + 5.5, y + 3); }
    else if (tall) { c.moveTo(x - w / 2, y); c.quadraticCurveTo(x + 1, y + 4.5, x + w / 2 + 1, y - 2.6); }
    else { c.moveTo(x - w / 2, y - 0.5); c.quadraticCurveTo(x, y + 4, x + w / 2, y - 0.5); }
    c.stroke();
  }

  function sparkle(c, x, y, r, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.closePath(); c.fill();
  }

  /* ---- doplňky výrazu: pot, čárky, jiskry ---- */
  function drawExtras(c, face, tall, t, still) {
    var dy = tall ? -10 : 0;
    if (face === "hit") {
      c.fillStyle = LOOK.sweat;
      c.beginPath(); c.moveTo(-30, -74 + dy); c.quadraticCurveTo(-35, -66 + dy, -30, -64 + dy); c.quadraticCurveTo(-25, -66 + dy, -30, -74 + dy); c.fill();
      c.beginPath(); c.moveTo(-42, -62 + dy); c.quadraticCurveTo(-46, -56 + dy, -42, -54 + dy); c.quadraticCurveTo(-38, -56 + dy, -42, -62 + dy); c.fill();
      c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = "round"; c.beginPath();
      c.moveTo(44, -74 + dy); c.lineTo(50, -82 + dy); c.moveTo(52, -64 + dy); c.lineTo(61, -67 + dy); c.moveTo(40, -82 + dy); c.lineTo(41, -91 + dy); c.stroke();
    }
    if (face === "win") {
      var k = still ? 1 : 1 + Math.sin(t * 5) * 0.18, k2 = still ? 1 : 1 + Math.sin(t * 5 + 2) * 0.2;
      sparkle(c, -48, -70 + dy, 7 * k, ACC); sparkle(c, 52, -78 + dy, 9 * k2, ACC); sparkle(c, 60, -54 + dy, 5 * k, LOOK.white);
    }
  }

  /* ---- celý tank v lokálních souřadnicích (sdílí hlavní plátno, bublina i ikona HUD) ---- */
  function drawTankShape(c, o) {
    var S = shapes()[o.style], P = o.pal, ol = o.ol, face = o.face, tall = S.tall, t = o.t || 0, still = !!o.still;
    var rec = (o.recoil || 0) * 5;
    c.lineJoin = "round"; c.lineCap = "round";
    function line(w) { c.lineWidth = w == null ? ol : w; c.strokeStyle = INK; c.stroke(); }
    // čelenka hráče 1: dva vlající cípy za tankem
    if (!tall) {
      for (var k = 1; k >= 0; k--) {
        var L = 19 + k * 6, wv = still ? 0 : 1, ym = Math.sin(t * 9 + k * 1.7) * 3 * wv, yt = Math.sin(t * 9 + k * 1.7 - 1.3) * 4.5 * wv;
        c.save(); c.translate(-48, -41 + k * 2.5); c.rotate((180 + (k ? 24 : 6)) * DEG);
        c.beginPath(); c.moveTo(0, -2.9); c.quadraticCurveTo(L * 0.5, -3.1 + ym, L, -3.6 + yt); c.lineTo(L - 4.5, yt); c.lineTo(L, 3.6 + yt); c.quadraticCurveTo(L * 0.5, 3.1 + ym, 0, 2.9); c.closePath();
        c.fillStyle = k ? LOOK.accentDeep : ACC; c.fill(); line();
        c.restore();
      }
    }
    // anténa s bambulí (hráč 2)
    if (tall) {
      var sw = o.sway || 0;
      c.beginPath(); c.moveTo(-20, -70); c.quadraticCurveTo(-28 + sw * 0.5, -86, -34 + sw, -98); c.strokeStyle = INK; c.lineWidth = Math.max(3.2, ol * 1.3); c.stroke();
      c.beginPath(); c.arc(-34 + sw, -100, 7.5, 0, TAU); c.fillStyle = ACC; c.fill(); line();
      c.globalAlpha *= 0.75; c.fillStyle = LOOK.white; c.beginPath(); c.arc(-36.5 + sw, -102.5, 2.3, 0, TAU); c.fill(); c.globalAlpha /= 0.75;
    }
    // hlaveň
    c.save(); c.translate(10, S.top + 13); c.rotate(-o.la * DEG);
    rr(c, -rec, -5.5, 42, 11, 5.5); c.fillStyle = P.shade; c.fill(); line();
    rr(c, 35 - rec, -7.5, 10, 15, 4); c.fillStyle = LOOK.tread; c.fill(); line();
    c.restore();
    // pásy a kola
    rr(c, -S.tw, -22, S.tw * 2, 22, 11); c.fillStyle = LOOK.tread; c.fill(); line();
    var wr = o.wheel || 0;
    for (var i = 0; i < S.wheels.length; i++) {
      var wx = S.wheels[i];
      c.fillStyle = LOOK.wheel; c.beginPath(); c.arc(wx, -11, 6.6, 0, TAU); c.fill();
      c.fillStyle = LOOK.tread; c.beginPath(); c.arc(wx, -11, 2.3, 0, TAU); c.fill();
      c.beginPath(); c.arc(wx + Math.cos(wr) * 4.4, -11 + Math.sin(wr) * 4.4, 1.1, 0, TAU); c.fill();
    }
    // trup
    c.fillStyle = P.main; c.fill(S.hull);
    c.save(); c.clip(S.hull);
    if (!tall) { // čelenka přes temeno
      c.fillStyle = ACC; c.fill(S.band);
      c.beginPath(); c.moveTo(-62, -29); c.quadraticCurveTo(0, -73, 62, -29); c.moveTo(-62, -38); c.quadraticCurveTo(0, -82, 62, -38); line();
      c.fillStyle = LOOK.accentDeep; [[-30, -50.4], [-14, -54.4], [4, -55.4], [40, -46.3]].forEach(function (d) { c.beginPath(); c.arc(d[0], d[1], 1.7, 0, TAU); c.fill(); });
    } else {
      c.beginPath(); c.moveTo(-30, -52); c.quadraticCurveTo(-26, -66, -12, -72); c.strokeStyle = P.light; c.lineWidth = 4.5; c.stroke();
    }
    if (face === "lose") { // saze
      c.fillStyle = rgba(INK, 0.3);
      [[-30, -48, 7], [-21, -54, 5], [-38, -38, 4.5], [30, -30, 6], [21, -27, 4], [6, -60, 4]].forEach(function (s) { c.beginPath(); c.arc(s[0], s[1] + (tall ? -6 : 0), s[2], 0, TAU); c.fill(); });
    }
    c.restore();
    c.lineWidth = ol; c.strokeStyle = INK; c.stroke(S.hull);
    rr(c, -S.tw - 2, -27, S.tw * 2 + 4, 8, 4); c.fillStyle = P.shade; c.fill(); line();
    if (!tall) { // knoflík čelenky a náplast
      c.beginPath(); c.arc(-47, -40, 4.2, 0, TAU); c.fillStyle = ACC; c.fill(); line();
      c.save(); c.translate(-29, -37); c.rotate(-30 * DEG); rr(c, -10, -4, 20, 8, 4); c.fillStyle = CREAM; c.fill(); c.fillStyle = LOOK.line; c.fillRect(-3.5, -4, 7, 8); c.restore();
    }
    // tvářičky, pihy
    var ey = S.ey, e1 = S.e1, e2 = S.e2;
    c.fillStyle = LOOK.blush; c.beginPath(); c.ellipse(e1 - 12, ey + 14, 4.8, 2.7, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(e2 + 12, ey + 14, 3.6, 2.4, 0, 0, TAU); c.fill();
    if (tall) { c.fillStyle = P.shade; [[-16, 9], [-12, 7.5], [-8, 9.5]].forEach(function (d) { c.beginPath(); c.arc(e1 + d[0], ey + d[1], 1.3, 0, TAU); c.fill(); }); }
    // oči
    drawEye(c, P, e1, ey, S.rx, S.ry, face, -1, o.la); drawEye(c, P, e2, ey, S.rx, S.ry, face, 1, o.la);
    // obočí (hráč 1) / řasy (hráč 2, nejvýš 2 na oko)
    if (!tall && face !== "win") {
      var lift = face === "aim" ? 3 : face === "hit" ? -2 : 0;
      var r1 = face === "aim" ? 16 : face === "hit" ? -16 : (face === "worry" || face === "lose") ? -14 : 6;
      c.fillStyle = INK;
      [[e1, r1], [e2, -r1]].forEach(function (b) { c.save(); c.translate(b[0], ey - 17 + lift); c.rotate(b[1] * DEG); rr(c, -9, -3, 18, 5.5, 2.75); c.fill(); c.restore(); });
    }
    if (tall && face !== "hit" && face !== "win" && face !== "lose") {
      c.strokeStyle = INK; c.lineWidth = 2.6; c.lineCap = "round"; c.beginPath();
      c.moveTo(e1 - 9, ey - 10); c.lineTo(e1 - 14.5, ey - 14); c.moveTo(e1 - 5, ey - 13); c.lineTo(e1 - 8, ey - 18);
      c.moveTo(e2 + 9, ey - 10); c.lineTo(e2 + 14.5, ey - 14); c.moveTo(e2 + 5, ey - 13); c.lineTo(e2 + 8, ey - 18); c.stroke();
    }
    drawMouth(c, face, S.mx, S.my, tall);
    drawExtras(c, face, tall, t, still);
    if ((o.cos | 0) > 0) drawCosmetics(c, S, o.cos | 0, face, tall, ol);
  }

  /* ---- kosmetika za výhry v sérii: 1 = brýle / mašle, 2 = koruna, 3 = zlatý lem ---- */
  function drawCosmetics(c, S, tier, face, tall, ol) {
    c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = INK; c.lineWidth = ol;
    if (tier >= 3) { // zlatý lem: pruh nad pásy a zlatá náboj kol
      rr(c, -S.tw - 2, -27, S.tw * 2 + 4, 8, 4); c.fillStyle = ACC; c.fill(); c.stroke();
      c.fillStyle = ACC; S.wheels.forEach(function (wx) { c.beginPath(); c.arc(wx, -11, 2.6, 0, TAU); c.fill(); });
    }
    if (tier >= 1 && !tall && face !== "hit" && face !== "lose") { // sluneční brýle
      [S.e1, S.e2].forEach(function (ex) { rr(c, ex - S.rx - 3.5, S.ey - S.ry * 0.82, S.rx * 2 + 7, S.ry * 1.75, 8); c.fillStyle = INK; c.fill(); c.stroke(); c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.moveTo(ex - 6, S.ey - 7); c.lineTo(ex - 1, S.ey - 7); c.lineTo(ex - 6, S.ey - 1); c.closePath(); c.fill(); });
      c.beginPath(); c.moveTo(S.e1 + S.rx + 3.5, S.ey - 4); c.lineTo(S.e2 - S.rx - 3.5, S.ey - 4); c.lineWidth = ol * 1.4; c.stroke(); c.lineWidth = ol;
    }
    if (tier >= 1 && tall) { // mašle na kopuli
      var bx = 24, by = -71;
      c.fillStyle = LOOK.tongue;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 15, by - 9); c.lineTo(bx + 15, by + 9); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - 15, by - 9); c.lineTo(bx - 15, by + 9); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.arc(bx, by, 5, 0, TAU); c.fillStyle = LOOK.blush; c.fill(); c.stroke();
    }
    if (tier >= 2) { // koruna
      var cx = tall ? 8 : 4, cy = S.top + 2, w = 30, h = 20;
      c.beginPath(); c.moveTo(cx - w / 2, cy); c.lineTo(cx - w / 2 - 2, cy - h); c.lineTo(cx - w / 4, cy - h * 0.55); c.lineTo(cx, cy - h - 4); c.lineTo(cx + w / 4, cy - h * 0.55); c.lineTo(cx + w / 2 + 2, cy - h); c.lineTo(cx + w / 2, cy); c.closePath();
      c.fillStyle = ACC; c.fill(); c.stroke();
      c.fillStyle = LOOK.boomRing; c.beginPath(); c.arc(cx, cy - 6, 2.6, 0, TAU); c.fill();
    }
  }

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var cw = 1, ch = 1, dpr = 1, scale = 1, ox = 0, oy = 0, fit = 1, bk = 1, zMax = 3;
    var cam = { x: W / 2, y: H / 2, z: 1 }, tgt = { x: W / 2, y: H / 2, z: 1 }, camRate = 3, camInit = false;
    var hills = [], hillsOk = false, cloud = { x: 210 };
    var terrC = mk(1, 1), tctx = terrC.getContext("2d"), tKey = "";
    var parts = [], texts = [], trails = {}, planes = [];
    var mkFx = function (b) { return { hit: 0, blink: b, wheel: 0, lastX: null, recoil: 0, dust: 0, dead: false, shieldPing: 0 }; };
    var fx = [mkFx(1.2), mkFx(2.9)];
    var shake = 0, time = 0, lastWind = 0, lastState = null, prevPos = [null, null];
    var exprNow = ["idle", "idle"], edgeHit = [null, null];
    var cosTier = [0, 0], themeKey = "", theme = null;
    function setCosmetics(a) { cosTier = [(a && a[0]) | 0, (a && a[1]) | 0]; }

    /* ---------------- sizing + cached art ---------------- */
    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      var nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
      if (nw === cw && nh === ch && hillsOk) return false;
      cw = nw; ch = nh;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      fit = Math.min(cw / W, ch / H);
      zMax = clamp(3 / fit, 1.25, 5);
      bk = clamp(2 * dpr * fit, dpr * fit, 2.2); // kolik pixelu cache pripada na jeden svetovy pixel
      terrC.width = Math.ceil(W * bk); terrC.height = Math.ceil(H * bk); tctx = terrC.getContext("2d");
      tKey = "";
      buildHills();
      clampCam(cam); clampCam(tgt); applyView();
      return true;
    }

    /* ---------------- kamera: stred pohledu ve svetovych pixelech, z = 1 je cele bojiste ---------------- */
    function limits() { return { fit: fit, zMax: zMax, cw: cw, ch: ch }; }
    function clampCam(c) {
      c.z = clamp(c.z, 1, zMax);
      var s = fit * c.z, vw = cw / s, vh = ch / s;
      c.x = vw >= W ? W / 2 : clamp(c.x, vw / 2, W - vw / 2);
      var minY = vh / 2 - 90, maxY = H - vh / 2;
      c.y = minY > maxY ? maxY : clamp(c.y, minY, maxY);
    }
    function applyView() { scale = fit * cam.z; ox = cw / 2 - cam.x * scale; oy = ch / 2 - cam.y * scale; }
    function yFit() { return H - ch / fit / 2; }
    function setView(x, y, z, o) {
      o = o || {}; tgt.x = x; tgt.y = y; tgt.z = z; clampCam(tgt);
      if (o.rate) camRate = o.rate;
      if (o.snap || !camInit) { camInit = true; cam.x = tgt.x; cam.y = tgt.y; cam.z = tgt.z; applyView(); }
    }
    function nudge(dx, dy) { // posun o pixely obrazovky, hned a bez dojezdu
      cam.x -= dx / scale; cam.y -= dy / scale; clampCam(cam); tgt.x = cam.x; tgt.y = cam.y; tgt.z = cam.z; applyView();
    }
    function zoomAt(sx, sy, factor) { // sx, sy: px uvnitr platna
      var wx = (sx - ox) / scale, wy = (sy - oy) / scale, nz = clamp(cam.z * factor, 1, zMax), ns = fit * nz;
      cam.z = nz; cam.x = wx - (sx - cw / 2) / ns; cam.y = wy - (sy - ch / 2) / ns; clampCam(cam);
      tgt.x = cam.x; tgt.y = cam.y; tgt.z = cam.z; applyView();
    }
    function fitAll(snap) { setView(W / 2, yFit(), 1, { rate: 5, snap: !!snap }); }
    function homeZoom() { return cw < 640 ? clamp(1.0 / fit, 1, zMax) : 1; }
    function camStep(dt) {
      var k = calm() ? 1 : 1 - Math.exp(-camRate * dt);
      cam.x += (tgt.x - cam.x) * k; cam.y += (tgt.y - cam.y) * k; cam.z *= Math.pow(tgt.z / cam.z, k);
      clampCam(cam); applyView();
    }
    function camera() { return { x: Math.round(cam.x * 10) / 10, y: Math.round(cam.y * 10) / 10, zoom: Math.round(cam.z * 1000) / 1000, scale: Math.round(scale * 1000) / 1000, tx: Math.round(tgt.x * 10) / 10, ty: Math.round(tgt.y * 10) / 10, tz: Math.round(tgt.z * 1000) / 1000 }; }
    function pannable() { var s = fit * cam.z; return cw / s < W - 1 || ch / s < H - 1; }
    function uiK() { return clamp(0.95 / scale, 1, 2.4); }

    /* ---------------- pozadí: nebe, jeden mrak, dvě vrstvy kopců ---------------- */
    var HILL_M = 240, HILL_Y0 = 120;
    var THEMES = { // plochá paleta, jen jemný posun: sky + dvě vrstvy kopců
      vichr: { sky: "#D2E5EB", far: "#B6D8DA", near: "#95C6C0" },
      mesic: { sky: "#DAD5F1", far: "#C2BCE4", near: "#A7A1D4" },
      tezko: { sky: "#F3DDCB", far: "#E1CBB3", near: "#C9B79B" },
      zrcadlo: { sky: "#CFEDE6", far: "#AEE0D5", near: "#8CD0BF" },
      bohaci: { sky: "#FBF0C9", far: "#E6E2B4", near: "#C8D79F" },
      kratery: { sky: "#F2D9D4", far: "#DEC9BE", near: "#C5B3A5" }
    };
    function themeFor(st) {
      var th = Object.assign({ sky: LOOK.sky, far: LOOK.hills[0].col, near: LOOK.hills[1].col }, THEMES[st.mod] || {});
      if (st.map === "vulkan") { th.sky = mix(th.sky, "#FFD9B8", 0.35); th.far = mix(th.far, "#F0B58E", 0.3); }
      else if (st.map === "kanon") { th.far = mix(th.far, "#E3B98B", 0.22); }
      return th;
    }
    function hillCol(i) { return theme ? (i === 0 ? theme.far : theme.near) : LOOK.hills[i].col; }
    function buildHills() {
      hills = []; hillsOk = true;
      var hk = Math.min(bk, 1.6);
      LOOK.hills.forEach(function (d, di) {
        var cv = mk((W + HILL_M * 2) * hk, (H - HILL_Y0) * hk), c = cv.getContext("2d");
        c.setTransform(hk, 0, 0, hk, HILL_M * hk, -HILL_Y0 * hk);
        c.fillStyle = hillCol(di); c.beginPath(); c.moveTo(-HILL_M, H);
        for (var x = -HILL_M; x <= W + HILL_M; x += 5) c.lineTo(x, d.base + d.a1 * Math.sin(x / d.f1 + d.p1) + d.a2 * Math.sin(x / d.f2 + d.p2));
        c.lineTo(W + HILL_M, H); c.closePath(); c.fill();
        hills.push({ cv: cv, par: d.par });
      });
    }
    function drawSky() { ctx.fillStyle = theme ? theme.sky : LOOK.sky; ctx.fillRect(0, 0, cw, ch); }
    function drawHills() {
      for (var i = 0; i < hills.length; i++) {
        var hl = hills[i], offx = -(cam.x - W / 2) * hl.par;
        ctx.drawImage(hl.cv, -HILL_M + offx, HILL_Y0, W + HILL_M * 2, H - HILL_Y0);
        // za okrajem bojiště (široké obrazovky) pokračuje kopec plnou barvou
        ctx.fillStyle = hillCol(i); ctx.fillRect(-1200, H - 40, 1200 - HILL_M + offx + 1, 40); ctx.fillRect(W + HILL_M + offx - 1, H - 40, 1200, 40);
      }
    }
    function drawCloud(dt) { // jediný pomalý mrak v horních ~18 % bojiště, mimo dosah míření
      if (!calm()) { cloud.x += LOOK.cloudSpeed * dt; if (cloud.x > W + 260) cloud.x = -260; }
      var x = cloud.x - (cam.x - W / 2) * 0.15, y = LOOK.cloudY, w = LOOK.cloudW;
      ctx.fillStyle = LOOK.cloud; rr(ctx, x - w / 2, y, w, 26, 13); ctx.fill();
      ctx.beginPath(); ctx.arc(x - w * 0.18, y + 4, 19, 0, TAU); ctx.arc(x + w * 0.1, y - 2, 25, 0, TAU); ctx.arc(x + w * 0.32, y + 8, 14, 0, TAU); ctx.fill();
    }

    // podpis modifikátoru na nebi (v px obrazovky, ať je vidět při každém přiblížení): kolo je poznat bez čtení
    var streaks = [], coins = [];
    for (var si0 = 0; si0 < 7; si0++) streaks.push({ x: ((si0 * 0.173) % 1), y: 0.16 + ((si0 * 0.061) % 0.3), l: 46 + ((si0 * 37) % 50) });
    for (var ci0 = 0; ci0 < 6; ci0++) coins.push({ x: 0.08 + ci0 * 0.16 + ((ci0 * 0.047) % 0.06), y: 0.17 + ((ci0 * 0.053) % 0.2), p: ci0 * 1.7 });
    function drawModSky(dt, st) {
      var mod = st.mod, still = calm(), px = -(cam.x - W / 2) * scale * 0.06, u = clamp(Math.min(cw, ch) / 420, 0.75, 1.5);
      var sky = theme ? theme.sky : LOOK.sky;
      if (mod === "mesic") { /* měsíc se kreslí před kopci (drawModFront), ať ho kopec ani HUD neschová */
      } else if (mod === "tezko") { // obří planeta s prstencem, zapadlá za kopci
        var tx = cw * 0.2 + px, tr = 46 * u, ty = Math.min(ch * 0.3, hillTopY(tx) - tr * 0.3), ring = mix(sky, INK, 0.2);
        ctx.strokeStyle = ring; ctx.lineWidth = 7 * u; ctx.lineCap = "round";
        ctx.beginPath(); ctx.ellipse(tx, ty, tr * 1.65, tr * 0.3, -0.22, Math.PI, TAU); ctx.stroke(); // zadní půlka prstence
        ctx.fillStyle = mix(sky, "#D98E6A", 0.45); ctx.beginPath(); ctx.arc(tx, ty, tr, 0, TAU); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(tx, ty, tr, 0, TAU); ctx.clip();
        ctx.fillStyle = mix(sky, "#D98E6A", 0.62); ctx.fillRect(tx - tr, ty - tr * 0.45, tr * 2, tr * 0.2); ctx.fillRect(tx - tr, ty + tr * 0.2, tr * 2, tr * 0.12); ctx.restore();
        ctx.beginPath(); ctx.ellipse(tx, ty, tr * 1.65, tr * 0.3, -0.22, 0, Math.PI); ctx.stroke(); // přední půlka
      }
    }
    function hillTopY(sx) { // y vzdáleného kopce (px obrazovky) pod bodem sx, ať měsíc a planeta vykouknou nad kopec
      var d = LOOK.hills[0], wx = (sx - ox) / scale + (cam.x - W / 2) * d.par;
      return (d.base + d.a1 * Math.sin(wx / d.f1 + d.p1) + d.a2 * Math.sin(wx / d.f2 + d.p2)) * scale + oy;
    }
    function drawModFront(dt, st) { // mince a vítr jsou ve vzduchu, kreslí se před kopci
      var mod = st.mod, still = calm(), px = -(cam.x - W / 2) * scale * 0.06, u = clamp(Math.min(cw, ch) / 420, 0.75, 1.5);
      if (mod === "mesic") { // měsíc a hvězdy pod horní lištou, vpravo
        var r = 34 * u, mx = cw * 0.82 + px * 0.3, my = Math.max(ch * 0.2, 96 + r);
        ctx.fillStyle = "#FFF7DD"; ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.fill();
        ctx.fillStyle = "#EFE2BF"; [[-0.33, -0.22, 0.23], [0.3, 0.28, 0.17], [0.42, -0.36, 0.1]].forEach(function (k) { ctx.beginPath(); ctx.arc(mx + r * k[0], my + r * k[1], r * k[2], 0, TAU); ctx.fill(); });
        for (var s = 0; s < 6; s++) {
          var sx = cw * (0.07 + s * 0.15 + ((s * 0.029) % 0.05)) + px * 0.6, sy = ch * (0.17 + ((s * 0.041) % 0.16)), a = still ? 0.85 : 0.5 + 0.4 * Math.sin(time * 2 + s * 1.9), k = 6 * u;
          ctx.fillStyle = rgba(CREAM, a); ctx.beginPath(); ctx.moveTo(sx, sy - k); ctx.lineTo(sx + k * 0.27, sy - k * 0.27); ctx.lineTo(sx + k, sy); ctx.lineTo(sx + k * 0.27, sy + k * 0.27); ctx.lineTo(sx, sy + k); ctx.lineTo(sx - k * 0.27, sy + k * 0.27); ctx.lineTo(sx - k, sy); ctx.lineTo(sx - k * 0.27, sy - k * 0.27); ctx.closePath(); ctx.fill();
        }
      }
      if (mod === "bohaci") { // točící se mince
        coins.forEach(function (c) {
          var ph = still ? 0.6 : time * 2.2 + c.p, w = Math.max(0.18, Math.abs(Math.cos(ph))), cr = 10 * u, y = ch * c.y + (still ? 0 : Math.sin(time * 1.3 + c.p) * 5), x = cw * c.x + px * 0.6;
          ctx.fillStyle = LOOK.accentDeep; ctx.beginPath(); ctx.ellipse(x, y + 2 * u, cr * w, cr, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = ACC; ctx.beginPath(); ctx.ellipse(x, y, cr * w, cr, 0, 0, TAU); ctx.fill();
          if (w > 0.5) { ctx.strokeStyle = LOOK.accentDeep; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.ellipse(x, y, cr * 0.55 * w, cr * 0.55, 0, 0, TAU); ctx.stroke(); }
        });
      }
      // vítr: bílé čárky letí po větru, při Vichřici hustě, při Zrcadle se otočí s větrem
      var wnd = lastWind || 0, n = mod === "vichr" ? 7 : mod === "mesic" ? 0 : Math.abs(wnd) >= 8 ? 3 : 0;
      if (!n) return;
      var dir = wnd < 0 ? -1 : 1, spd = (0.05 + Math.abs(wnd) * 0.012);
      ctx.strokeStyle = rgba(LOOK.white, mod === "vichr" ? 0.75 : 0.55); ctx.lineWidth = 3 * u; ctx.lineCap = "round";
      for (var k2 = 0; k2 < n; k2++) {
        var q = streaks[k2];
        if (!still) { q.x += dir * spd * dt * (0.8 + (k2 % 3) * 0.2); if (q.x > 1.15) q.x = -0.15; if (q.x < -0.15) q.x = 1.15; }
        var qx = cw * q.x, qy = ch * q.y + Math.sin(time * 1.7 + k2) * 3, L = q.l * u;
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx - dir * L, qy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(qx - dir * L * 0.35, qy + 9 * u); ctx.lineTo(qx - dir * L * 0.85, qy + 9 * u); ctx.stroke();
      }
    }

    /* ---------------- terén: jedna plocha hlíny, lem trávy, hlubší pás ---------------- */
    function buildTerrain(h) {
      var c = tctx; c.setTransform(bk, 0, 0, bk, 0, 0); c.clearRect(0, 0, W, H);
      var y = function (x) { return H - h[clamp(x, 0, W - 1)]; };
      c.beginPath(); c.moveTo(-2, H); c.lineTo(-2, y(0));
      for (var x = 0; x < W; x++) c.lineTo(x + 0.5, y(x));
      c.lineTo(W + 2, y(W - 1)); c.lineTo(W + 2, H); c.closePath();
      c.fillStyle = LOOK.soil; c.fill();
      c.save(); c.clip();
      c.beginPath(); c.moveTo(-2, H); c.lineTo(-2, y(0) + LOOK.deepOff);
      for (var x2 = 0; x2 < W; x2 += 2) c.lineTo(x2 + 0.5, y(x2) + LOOK.deepOff);
      c.lineTo(W + 2, y(W - 1) + LOOK.deepOff); c.lineTo(W + 2, H); c.closePath(); c.fillStyle = LOOK.deep; c.fill();
      c.beginPath(); c.moveTo(-8, y(0));
      for (var x3 = 0; x3 < W; x3 += 2) c.lineTo(x3 + 0.5, y(x3));
      c.lineTo(W - 0.5, y(W - 1)); c.lineTo(W + 8, y(W - 1));
      c.strokeStyle = LOOK.lip; c.lineWidth = LOOK.lipW * 2; c.lineJoin = "round"; c.lineCap = "round"; c.stroke();
      c.restore();
    }
    function terrainKey(h) { var a = 0, b = 0; for (var i = 0; i < W; i += 1) { a += h[i]; b += h[i] * ((i % 7) + 1); } return a + ":" + b + ":" + bk; }
    function drawTerrainEdges(h) { // pokračování terénu za okraj bojiště (jen na hodně širokých obrazovkách)
      if (cw / scale <= W + 1) return;
      [[-1400, H - h[0]], [W, H - h[W - 1]]].forEach(function (e) {
        ctx.fillStyle = LOOK.soil; ctx.fillRect(e[0], e[1], 1400, H - e[1]);
        ctx.fillStyle = LOOK.deep; ctx.fillRect(e[0], e[1] + LOOK.deepOff, 1400, Math.max(0, H - e[1] - LOOK.deepOff));
        ctx.fillStyle = LOOK.lip; ctx.fillRect(e[0], e[1], 1400, LOOK.lipW);
      });
    }

    /* ---------------- částice (vše ploché) ---------------- */
    var CAL = function () { return calm() ? 0.35 : 1; };
    function P(o) { parts.push(o); if (parts.length > 900) parts.splice(0, parts.length - 900); }
    function puff(x, y, o) {
      o = o || {};
      P({ k: "puff", x: x, y: y, vx: o.vx || 0, vy: o.vy || 0, r: o.r || 8, gr: o.gr == null ? 14 : o.gr, life: 0, max: o.max || 1.1, col: o.col || LOOK.smoke, wind: o.wind == null ? 1 : o.wind, a: o.a == null ? 0.6 : o.a });
    }
    function chunk(x, y, vx, vy, size, colour, tri) {
      P({ k: "chunk", x: x, y: y, vx: vx, vy: vy, r: size, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, life: 0, max: 1.1 + Math.random() * 0.7, col: colour || LOOK.debris[(Math.random() * 3) | 0], tri: tri == null ? Math.random() < 0.5 : tri });
    }
    function blast(x, y, r, max, ring, core) { P({ k: "blast", x: x, y: y, r: r, life: 0, max: max || 0.22, ring: ring || LOOK.boomRing, core: core || LOOK.boomCore }); }
    function spark(x, y, vx, vy, col, max) { P({ k: "spark", x: x, y: y, vx: vx, vy: vy, life: 0, max: max || 0.4, col: col || ACC, r: 1.8 }); }
    function ring(x, y, r0, r1, max, col, w) { P({ k: "ring", x: x, y: y, r0: r0, r1: r1, life: 0, max: max || 0.4, col: col || CREAM, w: w || 4 }); }
    function star(x, y, vx, vy, col, size) { P({ k: "star", x: x, y: y, vx: vx, vy: vy, r: size || 4, life: 0, max: 0.9 + Math.random() * 0.5, col: col || CREAM, rot: Math.random() * TAU }); }
    function confetti(x, y, n, cols, spread, fall) {
      for (var i = 0; i < n; i++) P({ k: "confetti", x: x + (Math.random() - 0.5) * spread, y: y - Math.random() * 20, vx: (Math.random() - 0.5) * (fall ? 60 : 220), vy: fall ? 40 + Math.random() * 80 : -80 - Math.random() * 160, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, w: 5 + Math.random() * 5, hh: 3 + Math.random() * 3, col: cols[i % cols.length], life: 0, max: (fall ? 3.2 : 1.6) + Math.random() * 1.2, ph: Math.random() * 6 });
    }
    function floatText(x, y, text, col, big, max) { texts.push({ x: x, y: y, text: text, col: col || CREAM, life: 0, max: max || 1.2, big: !!big }); }

    function explode(e) {
      var r = e.r || 20, c = CAL(), kind = e.kind || "boom", x = e.x, y = e.y;
      if (e.weapon === "konfety") { // neškodný prask konfet
        ring(x, y, 3, 26, 0.3, ACC, 3);
        confetti(x, y, Math.round(30 * c + 6), [ACC, LOOK.players[0].main, LOOK.players[1].main, CREAM, LOOK.sweat], 10, false);
        return;
      }
      if (e.weapon === "pirko") {
        blast(x, y, r * 0.9, 0.18, LOOK.teal, CREAM);
        for (var fp = 0; fp < 4 * c + 2; fp++) star(x, y, (Math.random() - 0.5) * 70, -30 - Math.random() * 60, fp % 2 ? LOOK.teal : CREAM, 3 + Math.random() * 2);
        return;
      }
      if (kind === "small") {
        blast(x, y, r * 1.2, 0.18);
        for (var i = 0; i < 3 * c + 2; i++) chunk(x, y, (Math.random() - 0.5) * 150, -60 - Math.random() * 100, 2 + Math.random() * 2);
        shake = Math.max(shake, calm() ? 0 : 1.2);
        return;
      }
      if (kind === "dirt") {
        ring(x, y, r * 0.4, r * 1.2, 0.3, LOOK.deep, 4);
        for (var d = 0; d < (10 + r / 3) * c; d++) chunk(x, y, (Math.random() - 0.5) * 190, -60 - Math.random() * 190, 2.5 + Math.random() * 3.5, LOOK.debris[d % 2]);
        for (var q = 0; q < 5 * c + 2; q++) puff(x + (Math.random() - 0.5) * r, y - Math.random() * r * 0.4, { r: r * 0.3 + Math.random() * 6, col: LOOK.dust, a: 0.5, vy: -18 - Math.random() * 20, vx: (Math.random() - 0.5) * 40, max: 1 + Math.random() * 0.6, gr: 16 });
        shake = Math.max(shake, calm() ? 0 : Math.min(5, r / 14));
        return;
      }
      if (kind === "fire") {
        blast(x, y, r * 1.3, 0.22, LOOK.fire[0], LOOK.fire[2]);
        for (var f = 0; f < (10 + r / 2) * c; f++) P({ k: "ember", x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r * 0.5, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 110, r: 2 + Math.random() * 3, life: 0, max: 0.6 + Math.random() * 0.8 });
        shake = Math.max(shake, calm() ? 0 : Math.min(5, r / 12));
        return;
      }
      // boom: plochý kruhový záblesk (0,22 s), 5-7 kousků hlíny, pár krémových obláčků
      blast(x, y, r * 1.45, 0.3);
      ring(x, y, r * 0.9, r * 2.1, 0.34, LOOK.boomRing, 3); // vnější prstenec #FF5A4E
      for (var k = 0; k < 6; k++) { // 6 kousků hlíny #E39A55 s obrysem
        var a = -Math.PI * (0.1 + 0.8 * (k + Math.random() * 0.7) / 6), sp = 110 + Math.random() * (120 + r * 2.4);
        chunk(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 4 + Math.random() * 3, LOOK.boomDirt, k % 2 === 0);
      }
      shake = Math.max(shake, calm() ? 0 : 6 / Math.max(0.4, scale)); // 6 px na obrazovce, ~200 ms
    }

    function event(ev, st) {
      if (!ev) return;
      var t = ev.type, c = CAL();
      if (st) lastState = st;
      if (t === "explode") explode(ev);
      else if (t === "rage") {
        var rt = st && st.tanks[ev.tank];
        if (rt) {
          ring(rt.x, rt.y - 14, 6, 38, 0.5, LOOK.boomRing, 3);
          for (var rq = 0; rq < 7 * c + 2; rq++) puff(rt.x + (Math.random() - 0.5) * 22, rt.y - 24, { r: 2 + Math.random() * 2, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 40, max: 0.8, gr: 0, wind: 0, col: LOOK.boomRing, a: 0.9 });
          floatText(rt.x, rt.y - 54, "Vztek!", LOOK.boomRing, true, 1.3);
        }
      }
      else if (t === "fire") {
        var tk = ev.tank != null ? ev.tank : 0; if (fx[tk]) fx[tk].recoil = 1;
        for (var i = 0; i < 6 * c + 1; i++) spark(ev.x, ev.y, (Math.random() - 0.3) * 120, (Math.random() - 0.7) * 90, i % 2 ? ACC : CREAM, 0.22);
        shake = Math.max(shake, calm() ? 0 : 1.6);
      } else if (t === "damage") {
        var tt = st && st.tanks[ev.tank], dx = tt ? tt.x : 0, dy = tt ? tt.y - (shapes()[tt.color === 1 ? 1 : 0].topUnits + 8) * TS : 0;
        if (fx[ev.tank] && (ev.amount > 0 || ev.shielded)) fx[ev.tank].hit = 0.8;
        if (ev.shielded) { floatText(dx, dy, ev.amount > 0 ? "štít -" + ev.amount : "štít", CREAM, true, 0.9); if (fx[ev.tank]) fx[ev.tank].shieldPing = 1; }
        else if (ev.amount > 0) floatText(dx, dy, "-" + ev.amount, CREAM, true, 0.9);
      } else if (t === "die") {
        var d = st && st.tanks[ev.tank];
        if (d) {
          explode({ x: d.x, y: d.y - 30 * TS, r: 46, kind: "boom" });
          var pal = LOOK.players[d.color === 1 ? 1 : 0];
          for (var j = 0; j < 8 * c + 3; j++) chunk(d.x, d.y - 30 * TS, (Math.random() - 0.5) * 240, -80 - Math.random() * 200, 3 + Math.random() * 4, j % 3 ? pal.main : pal.shade);
        }
        if (fx[ev.tank]) fx[ev.tank].dead = true;
        shake = Math.max(shake, calm() ? 0 : 12);
      } else if (t === "coins") {
        var ct = st && st.tanks[ev.tank];
        if (ct && ev.amount > 0) floatText(ct.x, ct.y - 92 * TS, "+" + ev.amount, ACC, false, 1.2);
      } else if (t === "ability") {
        var at = st && st.tanks[ev.tank], ax = ev.x != null ? ev.x : (at ? at.x : 0), ay = ev.y != null ? ev.y - 30 * TS : (at ? at.y - 30 * TS : 0);
        if (ev.id === "teleport") {
          var old = prevPos[ev.tank];
          [[ax, ay], old ? [old.x, old.y - 30 * TS] : null].forEach(function (p) { if (!p) return; ring(p[0], p[1], 6, 44, 0.5, LOOK.sweat, 3); for (var n = 0; n < 12 * c + 3; n++) { var a = Math.random() * TAU; star(p[0] + Math.cos(a) * 14, p[1] + Math.sin(a) * 14, Math.cos(a) * 30, -30 - Math.random() * 60, n % 2 ? LOOK.sweat : CREAM, 3 + Math.random() * 3); } });
        } else if (ev.id === "airstrike") {
          planes.push({ x: ax - 460, y: 46, vx: 520, life: 0, ax: ax });
        } else if (ev.id === "shield") {
          if (fx[ev.tank]) fx[ev.tank].shieldPing = 1; ring(ax, ay, 10, 60, 0.45, LOOK.sweat, 4);
        } else if (ev.id === "repair") {
          for (var h2 = 0; h2 < 10 * c + 3; h2++) star(ax + (Math.random() - 0.5) * 50, ay + 20 + Math.random() * 10, 0, -30 - Math.random() * 30, LOOK.lip, 4);
          if (at) floatText(at.x, at.y - 92 * TS, "oprava", "#BFF0B0", false, 1.2);
        } else if (ev.id === "calm") {
          for (var w2 = 0; w2 < 3; w2++) ring(ax, ay, 8 + w2 * 6, 50 + w2 * 18, 0.6 + w2 * 0.1, CREAM, 2);
        } else if (ev.id === "magnet") {
          ring(ax, ay, 40, 6, 0.6, LOOK.blush, 3); ring(ax, ay, 56, 10, 0.7, LOOK.blush, 2);
        } else if (ev.id === "antigrav") {
          for (var b2 = 0; b2 < 9 * c + 2; b2++) puff(ax + (Math.random() - 0.5) * 50, ay + Math.random() * 20, { r: 3 + Math.random() * 4, col: LOOK.cloud, vy: -50 - Math.random() * 40, gr: 0, wind: 0, max: 1 + Math.random() * 0.5, a: 0.8 });
        }
      } else if (t === "bounce") {
        ring(ev.x, ev.y, 3, 18, 0.28, CREAM, 2.5); for (var z = 0; z < 4 * c + 1; z++) chunk(ev.x, ev.y, (Math.random() - 0.5) * 80, -40 - Math.random() * 60, 1.8 + Math.random() * 1.6);
      } else if (t === "split") {
        ring(ev.x, ev.y, 4, 26, 0.3, ACC, 3); blast(ev.x, ev.y, 14, 0.2, ACC, CREAM);
        for (var q = 0; q < 5 * c + 1; q++) spark(ev.x, ev.y, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, CREAM, 0.3);
      } else if (t === "fall") {
        var ft = st && st.tanks[ev.tank];
        if (ft) for (var u = 0; u < 5 * c + 1; u++) puff(ft.x + (Math.random() - 0.5) * 60 * TS, ft.y - 2, { r: 4 + Math.random() * 4, vx: (Math.random() - 0.5) * 60, vy: -10 - Math.random() * 14, max: 0.6, col: LOOK.dust, a: 0.55 });
      } else if (t === "move") {
        var mt = st && st.tanks[ev.tank], f = fx[ev.tank];
        if (mt && f && f.dust <= 0) { f.dust = 0.07; puff(mt.x - 46 * TS * Math.sign(ev.dir || 1), mt.y - 3, { r: 3.2, vx: (Math.random() - 0.5) * 14, vy: -8, max: 0.5, col: LOOK.dust, a: 0.55 }); }
      } else if (t === "roundEnd" || t === "matchEnd") {
        if (ev.winner === 0 || ev.winner === 1) {
          var wt = st && st.tanks[ev.winner], pl2 = LOOK.players[ev.winner];
          confetti(wt ? wt.x : W / 2, -30, Math.round((t === "matchEnd" ? 90 : 36) * c), [pl2.main, ACC, CREAM, pl2.light], 200, true);
        }
      }
      // "gift" a "giftBack" jsou jen pro HUD
    }

    function reset() { parts.length = 0; texts.length = 0; trails = {}; planes.length = 0; shake = 0; fx.forEach(function (f) { f.hit = 0; f.dead = false; f.lastX = null; f.recoil = 0; f.shieldPing = 0; }); prevPos = [null, null]; exprNow = ["idle", "idle"]; }

    /* ---------------- výrazy ---------------- */
    function nearShot(proj, t, i) {
      for (var k = 0; k < proj.length; k++) {
        var p = proj[k], pp = projPx(p), vy = SUBPX ? p.vy / 100 : p.vy;
        if (p.o === i && vy <= 0) continue; // vlastní stoupající střela nestraší
        if (Math.hypot(pp.x - t.x, pp.y - (t.y - 30)) < 150) return true;
      }
      return false;
    }
    function computeExpr(scene, st) {
      var over = scene.over || null, win = null;
      if (over) { if (over.winner === 0 || over.winner === 1) win = over.winner; }
      else if (st.matchOver) { if (st.winner === 0 || st.winner === 1) win = st.winner; }
      else if (st.roundOver && st.lastRound && (st.lastRound.winner === 0 || st.lastRound.winner === 1)) win = st.lastRound.winner;
      var busy = (st.proj && st.proj.length > 0) || planes.length > 0;
      var aimIdx = scene.aim ? scene.aim.idx : (scene.active != null ? scene.active : -1);
      for (var i = 0; i < 2; i++) {
        var t = st.tanks[i], f = fx[i], e = "idle";
        if (!t) { exprNow[i] = e; continue; }
        if (t.alive === false || t.hp <= 0 || (win != null && win !== i)) e = "lose";
        else if (f.hit > 0) e = "hit";
        else if (win === i) e = "win";
        else if ((aimIdx === 1 - i && !busy) || nearShot(st.proj || [], t, i)) e = "scared";
        else if (aimIdx === i) e = t.rage ? "rage" : "aim";
        exprNow[i] = e;
      }
    }
    function faceOf(idx, e) {
      if (e === "idle") return fx[idx] && fx[idx].blink < 0.12 && !calm() ? "blink" : "idle";
      if (e === "scared") return "worry";
      if (e === "rage") return "aim";
      return e;
    }

    /* ---------------- tanky ---------------- */
    function slopeAt(h, x) { var a = H - h[clamp(Math.round(x) - 16, 0, W - 1)], b = H - h[clamp(Math.round(x) + 16, 0, W - 1)]; return clamp(Math.atan2(b - a, 32), -0.42, 0.42); }

    function tankScale() { /* trup tanku = hitbox z enginu (RULES.tankHalfW x tankH, v svetovych px); hlaven, antena a ocasy celenky smi presahovat */
      var R = (window.TankEngine && window.TankEngine.RULES) || {}, hw = R.tankHalfW || 20, th = R.tankH || 26;
      return Math.min(2 * hw / 102, th / 62);
    }
    var TS = tankScale(), HK = 1; // TS = svetove px na jednotku tanku (tank je 100 jednotek siroky)
    function poseOf(t, ang, h) { // flip podle hlavne, lokalni uhel hlavne vykompenzovany o naklon terenu
      var tilt = h ? slopeAt(h, t.x) : 0, a = ang == null ? 50 : ang, flip = a > 90 ? -1 : 1;
      var la = flip > 0 ? a + tilt / DEG : 180 - a - tilt / DEG;
      return { tilt: tilt, flip: flip, la: la };
    }
    function pivotOf(t, ang, h) {
      var S = shapes()[t.color === 1 ? 1 : 0], ps = poseOf(t, ang, h), px = 10 * ps.flip * TS, py = (S.top + 13) * TS, cs = Math.cos(ps.tilt), sn = Math.sin(ps.tilt);
      return { x: t.x + px * cs - py * sn, y: t.y + px * sn + py * cs };
    }
    function drawTank(t, idx, o) {
      var f = fx[idx], style = t.color === 1 ? 1 : 0, dead = t.alive === false || t.hp <= 0;
      var ang = o.angle == null ? (idx === 0 ? 50 : 130) : o.angle, ps = poseOf(t, ang, o.h);
      var la = dead ? 4 : ps.la, e = o.expr || exprNow[idx] || "idle", face = faceOf(idx, e), still = calm();
      var bob = o.active && !dead && !still ? Math.sin(time * 3.2) * 1.4 : 0;
      var shk = e === "hit" && !still ? Math.sin(time * 55) * 1.8 * Math.min(1, f.hit / 0.4) : 0;
      var ol = LOOK.outlinePx / (TS * scale);
      ctx.save(); if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.translate(t.x, t.y); ctx.rotate(ps.tilt); ctx.scale(TS * ps.flip, TS);
      ctx.translate(shk, bob);
      if (e === "hit") ctx.rotate(-8 * DEG);
      drawTankShape(ctx, { style: style, cos: cosTier[style], pal: palFor(style, dead), face: face, la: la, ol: ol, t: time + idx * 1.3, still: still, recoil: f.recoil, wheel: f.wheel, sway: still ? 0 : Math.sin(time * 2.6 + idx) * 2.2 });
      ctx.restore();
      if (t.rage && !dead) { // vztek: červená žilka a drobná pára z tanku
        var vx = t.x + 16 * TS * ps.flip * 0.8, vy = t.y - (style ? 36 : 31), vr = 4 / scale * 1.4 + 1.6;
        ctx.save(); ctx.strokeStyle = LOOK.boomRing; ctx.lineWidth = 2.2 / scale; ctx.lineCap = "round";
        for (var q = 0; q < 4; q++) { var a0 = q * TAU / 4 + 0.35; ctx.beginPath(); ctx.arc(vx + Math.cos(a0 + 0.8) * vr, vy + Math.sin(a0 + 0.8) * vr, vr, a0 + Math.PI * 0.55, a0 + Math.PI * 1.45); ctx.stroke(); }
        ctx.restore();
        if (!still && Math.random() < 0.18) puff(t.x + (Math.random() - 0.5) * 18 * TS, t.y - (style ? 30 : 26), { r: 1.7 + Math.random() * 1.2, vx: (Math.random() - 0.5) * 12, vy: -22 - Math.random() * 14, max: 0.7, gr: 0, wind: 0, col: LOOK.boomRing, a: 0.9 });
      }
      if (t.shield > 0 && !dead) { // štít: plochý kruh 3 px, výplň 15 %
        var pulse = 1 + (still ? 0 : Math.sin(time * 4) * 0.025) + f.shieldPing * 0.08, R = 66 * TS * pulse, cy = t.y - 46 * TS;
        ctx.fillStyle = rgba(LOOK.sweat, 0.15); ctx.beginPath(); ctx.arc(t.x, cy, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = LOOK.sweat; ctx.lineWidth = 3 / scale; ctx.stroke();
      }
    }

    /* ---------------- frame ---------------- */
    function toWorld(cx, cy) { var r = canvas.getBoundingClientRect(); return { x: (cx - r.left - ox) / scale, y: (cy - r.top - oy) / scale }; }
    function toScreen(x, y) { return { x: ox + x * scale, y: oy + y * scale }; }
    function projPx(p) { return SUBPX ? { x: p.x / 100, y: p.y / 100 } : { x: p.x, y: p.y }; }

    function drawProjectile(p) {
      var pp = projPx(p), look = WEAPON_LOOK[p.w] || DEFAULT_LOOK, id = p.id == null ? p.w : p.id;
      var tr = trails[id] || (trails[id] = { pts: [], look: look, seen: time }); tr.seen = time;
      var last = tr.pts[tr.pts.length - 1];
      if (!last || Math.abs(last.x - pp.x) + Math.abs(last.y - pp.y) > 3) { tr.pts.push({ x: pp.x, y: pp.y, t: time }); if (tr.pts.length > 46) tr.pts.shift(); }
      var vx = SUBPX ? p.vx / 100 : p.vx, vy = SUBPX ? p.vy / 100 : p.vy, ang = Math.atan2(vy, vx);
      var rk = clamp(1 / scale, 1, 1.8), r = look.r * rk, lw = LOOK.projOutlinePx / scale;
      ctx.save(); ctx.translate(pp.x, pp.y); ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = INK; ctx.lineWidth = lw;
      if (look.cone) {
        ctx.rotate(ang); ctx.fillStyle = look.c; ctx.beginPath(); ctx.moveTo(r * 2, 0); ctx.lineTo(-r * 1.3, -r * 1.1); ctx.lineTo(-r * 1.3, r * 1.1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.7); ctx.lineTo(r * 0.2, r * 0.5); ctx.moveTo(-r * 1, -r * 0.8); ctx.lineTo(-r * 0.5, r * 0.8); ctx.stroke();
      } else if (look.feather) { // pírko: plochá tyrkysová šipka-pírko, kymácí se
        ctx.rotate(ang + (calm() ? 0 : Math.sin(time * 12) * 0.35)); ctx.fillStyle = look.c;
        ctx.beginPath(); ctx.moveTo(r * 2.2, 0); ctx.quadraticCurveTo(0, -r * 1.3, -r * 2, -r * 0.2); ctx.lineTo(-r * 2, r * 0.2); ctx.quadraticCurveTo(0, r * 1.3, r * 2.2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r * 2, 0); ctx.lineTo(-r * 2.6, 0); ctx.stroke();
      } else if (look.wheel) {
        ctx.rotate(time * 14); ctx.fillStyle = look.c; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.7); ctx.stroke();
      } else if (look.blob) {
        ctx.rotate(time * 6 + 1); ctx.fillStyle = look.c; ctx.beginPath();
        for (var i = 0; i < 7; i++) { var a = i / 7 * TAU, rad = r * (1 + 0.22 * Math.sin(i * 2.7)); ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (look.fin) {
        ctx.rotate(ang); ctx.fillStyle = ACC; ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.lineTo(-r * 1.9, -r * 1.1); ctx.lineTo(-r * 1.9, r * 1.1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = look.c; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r * 0.85, 0, 0, TAU); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = look.c; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        if (look.core) { ctx.fillStyle = look.core; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.fill(); }
        if (look.band || look.stripe || look.dots) {
          ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
          if (look.band) { ctx.rotate(ang); ctx.fillStyle = look.band; ctx.fillRect(-r * 0.28, -r, r * 0.56, r * 2); }
          if (look.stripe) { ctx.rotate(time * 9); ctx.fillStyle = look.stripe; ctx.fillRect(-r, -r * 0.26, r * 2, r * 0.52); }
          if (look.dots) { ctx.rotate(time * 7); look.dots.forEach(function (dc, k) { var a2 = k / 3 * TAU; ctx.fillStyle = dc; ctx.beginPath(); ctx.arc(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45, r * 0.3, 0, TAU); ctx.fill(); }); }
          ctx.restore();
        }
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        if (look.fuse) { var fa = ang + Math.PI, fx2 = Math.cos(fa) * r * 1.5, fy2 = Math.sin(fa) * r * 1.5 - r * 0.6; ctx.fillStyle = ACC; ctx.beginPath(); ctx.arc(fx2, fy2, r * 0.32 + (calm() ? 0 : Math.sin(time * 40) * r * 0.1), 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    function drawTrails() {
      var ids = Object.keys(trails);
      for (var k = 0; k < ids.length; k++) {
        var tr = trails[ids[k]], look = tr.look, kind = look.trail;
        for (var i = 0; i < tr.pts.length; i++) {
          var p = tr.pts[i], age = time - p.t, life = kind === "fire" ? 0.45 : 0.9;
          if (age > life) continue;
          var u = age / life;
          if (kind === "fire") { ctx.fillStyle = u < 0.4 ? LOOK.fire[2] : LOOK.fire[0]; ctx.globalAlpha = 0.85 * (1 - u); ctx.beginPath(); ctx.arc(p.x, p.y, 4 * (1 - u) + 1, 0, TAU); ctx.fill(); }
          else if (kind === "dust") { ctx.fillStyle = LOOK.dust; ctx.globalAlpha = 0.6 * (1 - u); ctx.beginPath(); ctx.arc(p.x, p.y, 2 + u * 3, 0, TAU); ctx.fill(); }
          else if (kind === "confetti") { ctx.fillStyle = look.dots[i % 3]; ctx.globalAlpha = 1 - u; ctx.fillRect(p.x - 1.6, p.y - 1.6 + u * 6, 3.2, 3.2); }
          else { ctx.fillStyle = LOOK.smoke; ctx.globalAlpha = 0.75 * (1 - u); ctx.beginPath(); ctx.arc(p.x, p.y - u * 4, 2 + u * 3, 0, TAU); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        if (time - tr.seen > 1) delete trails[ids[k]];
      }
    }

    function drawFires(list) {
      for (var i = 0; i < list.length; i++) {
        var f = list[i], fxp = SUBPX && f.x > W * 2 ? f.x / 100 : f.x, fyp = SUBPX && f.y > H * 2 ? f.y / 100 : f.y;
        var k = fr(i * 3.7 + Math.floor(fxp)), sz = f.t != null ? clamp(f.t / 40, 0.5, 1) : 1, mv = calm() ? 0 : 1;
        var wob = Math.sin(time * 11 + k * 6) * 1.4 * mv;
        ctx.save(); ctx.translate(fxp, fyp);
        for (var n = 0; n < 3; n++) {
          var hh = ([12, 9, 5.5][n] + Math.sin(time * 13 + k * 5 + n) * 2.2 * mv) * sz, ww = (6 - n * 1.3) * sz;
          ctx.fillStyle = LOOK.fire[n]; ctx.beginPath(); ctx.moveTo(-ww, 0); ctx.quadraticCurveTo(-ww * 0.9, -hh * 0.6, wob * (n ? 0.5 : 1), -hh); ctx.quadraticCurveTo(ww * 0.9, -hh * 0.6, ww, 0); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        if (!calm() && Math.random() < 0.05) P({ k: "ember", x: fxp, y: fyp - 8, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, r: 1.6, life: 0, max: 0.8 });
      }
    }

    function drawPlane(pl) { // plochý letoun s obrysem
      var lw = 2 / scale;
      ctx.save(); ctx.translate(pl.x, pl.y + (calm() ? 0 : Math.sin(pl.life * 5) * 3)); ctx.lineJoin = "round"; ctx.strokeStyle = INK; ctx.lineWidth = lw;
      ctx.fillStyle = LOOK.players[0].shade; ctx.beginPath(); ctx.moveTo(-20, -2); ctx.lineTo(-30, -16); ctx.lineTo(-22, -16); ctx.lineTo(-10, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
      rr(ctx, -28, -6, 58, 13, 6.5); ctx.fillStyle = LOOK.players[0].main; ctx.fill(); ctx.stroke();
      ctx.fillStyle = LOOK.players[0].shade; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(8, 2); ctx.lineTo(-4, 14); ctx.lineTo(-14, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(16, -1, 3.4, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (!calm() && Math.random() < 0.5) puff(pl.x - 30, pl.y, { r: 4, max: 0.9, vx: -10, gr: 6, a: 0.7 });
    }

    function drawStarShape(c, x, y, r, rot, pts, inner) {
      c.beginPath();
      for (var i = 0; i < pts * 2; i++) { var a = rot + i / (pts * 2) * TAU, rad = i % 2 ? r * inner : r; if (i) c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); else c.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
      c.closePath();
    }

    function drawParts(dt, wind) {
      var wf = wind * 2.6; // px/s^2 unášení kouře
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i]; p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        var u = p.life / p.max;
        if (p.k === "puff") {
          p.vx += wf * (p.wind || 0) * dt; p.vy -= p.gr * dt * 0.3; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985;
          ctx.globalAlpha = p.a * (1 - u * u); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + u * 0.9), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        } else if (p.k === "chunk") {
          p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx *= 0.995;
          ctx.save(); ctx.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col;
          ctx.lineJoin = "round"; ctx.lineWidth = LOOK.projOutlinePx / scale; ctx.strokeStyle = INK;
          if (p.tri) { ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(p.r * 0.9, p.r * 0.7); ctx.lineTo(-p.r * 0.9, p.r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); }
          else { rr(ctx, -p.r * 0.8, -p.r * 0.8, p.r * 1.6, p.r * 1.6, p.r * 0.45); ctx.fill(); ctx.stroke(); }
          ctx.restore();
        } else if (p.k === "spark") {
          p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.globalAlpha = 1 - u; ctx.strokeStyle = p.col; ctx.lineWidth = p.r; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke(); ctx.globalAlpha = 1;
        } else if (p.k === "blast") { // plochý kruh: prstenec + jádro, rychle se zvětší a zmizí
          var eb = 1 - Math.pow(1 - Math.min(1, u * 1.6), 3), rb = p.r * (0.4 + 0.6 * eb), olw = LOOK.projOutlinePx / scale;
          if (p.life < 0.045) { ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.15, 0, TAU); ctx.fill(); continue; } // jednoframový bílý záblesk
          ctx.globalAlpha = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4; ctx.lineWidth = olw; ctx.strokeStyle = INK; ctx.lineJoin = "round";
          ctx.fillStyle = p.ring; ctx.beginPath(); ctx.arc(p.x, p.y, rb, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = p.core; ctx.beginPath(); ctx.arc(p.x, p.y, rb * (0.66 - 0.22 * u), 0, TAU); ctx.fill(); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (p.k === "ring") {
          var rr2 = lerp(p.r0, p.r1, 1 - Math.pow(1 - u, 3));
          ctx.globalAlpha = (1 - u) * 0.95; ctx.strokeStyle = p.col; ctx.lineWidth = Math.max(0.8, p.w * (1 - u)); ctx.beginPath(); ctx.arc(p.x, p.y, rr2, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        } else if (p.k === "ember") {
          p.vy -= 20 * dt; p.vx += wf * 0.3 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.globalAlpha = 1 - u; ctx.fillStyle = u < 0.5 ? LOOK.fire[2] : LOOK.fire[1]; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - u * 0.6), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        } else if (p.k === "star") {
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 3;
          ctx.globalAlpha = 1 - u; ctx.fillStyle = p.col; drawStarShape(ctx, p.x, p.y, p.r * (1 - u * 0.4), p.rot, 4, 0.32); ctx.fill(); ctx.globalAlpha = 1;
        } else if (p.k === "confetti") {
          if (p.vy < 0) p.vy += 320 * dt; else p.vy = Math.min(p.vy + 16 * dt, 90);
          p.x += (p.vx + Math.sin(time * 3 + p.ph) * 30 + wf * 4) * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx *= 0.99;
          ctx.save(); ctx.globalAlpha = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * 0.8 + 0.2);
          ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh); ctx.restore();
        }
      }
    }

    function textOutlined(text, x, y, size, col, align, lw) {
      ctx.font = "700 " + size + "px " + FONT; ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = lw || Math.max(3, size * 0.22); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
      ctx.fillStyle = col; ctx.fillText(text, x, y);
    }

    function wrapText(text, maxW, font) {
      ctx.font = font; var words = text.split(/\s+/), lines = [], cur = "";
      words.forEach(function (w) { var t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
      if (cur) lines.push(cur); return lines.slice(0, 3);
    }
    function flatCard(x, y, w, h, r, fill) { // plochá karta: stín = tentýž tvar o 4 px níž
      ctx.fillStyle = rgba(INK, LOOK.shadowA); rr(ctx, x, y + LOOK.shadowPx, w, h, r); ctx.fill();
      ctx.fillStyle = fill || CREAM; rr(ctx, x, y, w, h, r); ctx.fill();
    }

    /* ---------------- míření (svět) ---------------- */
    function aimBase(scene, st) {
      var a = scene.aim, at = st.tanks[a.idx], base = { x: at.x, y: at.y, color: at.color };
      if (scene.ghost && scene.ghost.idx === a.idx) { base.x = scene.ghost.x; base.y = H - st.h[clamp(Math.round(base.x), 0, W - 1)]; }
      return base;
    }
    function drawZone(scene, st) {
      if (!scene.zone || !scene.aim || !scene.aim.dragging || !st.tanks[scene.aim.idx] || st.tanks[scene.aim.idx].alive === false) return; // zóna jen při tažení
      var b = aimBase(scene, st), u = 1 / scale;
      ctx.save(); ctx.strokeStyle = rgba(INK, LOOK.zoneInkA); ctx.lineWidth = 2 * u; ctx.setLineDash([6 * u, 9 * u]);
      ctx.beginPath(); ctx.arc(b.x, b.y - 14, scene.zone.r, 0, TAU); ctx.stroke(); ctx.restore();
    }
    function drawAim(scene, st) {
      var a = scene.aim; if (!a || !st.tanks[a.idx] || st.tanks[a.idx].alive === false) return;
      var b = aimBase(scene, st), pv = pivotOf(b, a.angle, st.h), u = 1 / scale, ang = a.angle * DEG, hx = Math.cos(ang), hy = -Math.sin(ang);
      var R0 = 45 * TS + 14 * u;
      // pravítko: tečkovaný půloblouk inkoustových teček (čitelné na nebi i na hlíně), rysky po 45° jako větší tečky
      ctx.fillStyle = rgba(INK, LOOK.aimInkA);
      if (a.dragging) for (var d = 0; d <= 180; d += 10) { var ar = d * DEG, big = d % 45 === 0; ctx.beginPath(); ctx.arc(pv.x + Math.cos(ar) * R0, pv.y - Math.sin(ar) * R0, (big ? 3.4 : 2.2) * u, 0, TAU); ctx.fill(); }
      // síla: tečky ve směru hlavně, od žluté k červené, s inkoustovým obrysem 1,5 px
      var pw = clamp(a.power / 100, 0, 1), n = Math.max(2, Math.round(3 + pw * 9)), red = LOOK.players[0].main;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * u;
      for (var i = 0; i < n; i++) {
        var k = i / Math.max(1, n - 1), dist = R0 + (12 + i * 9) * u, rad = (2.4 + k * 2.2) * u;
        ctx.fillStyle = mix(ACC, red, k * pw); ctx.beginPath(); ctx.arc(pv.x + hx * dist, pv.y + hy * dist, rad, 0, TAU); ctx.fill(); ctx.stroke();
      }
    }
    function drawPreview(scene) {
      var pv = scene.preview; if (!pv || pv.length < 2) return;
      var n = pv.length, u = 1 / scale;
      ctx.fillStyle = INK;
      for (var i = 2; i < n; i += 3) { var q = pv[i], k = i / n; ctx.globalAlpha = 1 - k * 0.55; ctx.beginPath(); ctx.arc(q.x, q.y, lerp(4.2, 1.7, k) * u, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    function drawTarget(scene, st) {
      if (!scene.target) return;
      var tx = clamp(scene.target.x, 8, W - 8), ty = H - st.h[clamp(Math.round(tx), 0, W - 1)], pulse = calm() ? 0 : Math.sin(time * 6) * 2, u = 1 / scale;
      var air = scene.target.kind === "airstrike";
      ctx.strokeStyle = air ? LOOK.players[0].main : LOOK.wheel; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.6 * u; ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (air) { ctx.setLineDash([2 * u, 7 * u]); ctx.beginPath(); ctx.moveTo(tx, 6); ctx.lineTo(tx, ty - 10); ctx.stroke(); ctx.setLineDash([]); for (var ai = -1; ai <= 1; ai++) { var bx = tx + ai * 38; ctx.beginPath(); ctx.moveTo(bx - 6, ty - 10 - pulse); ctx.lineTo(bx, ty - 2 - pulse); ctx.lineTo(bx + 6, ty - 10 - pulse); ctx.stroke(); } }
      else { ctx.setLineDash([4 * u, 5 * u]); ctx.beginPath(); ctx.arc(tx, ty - 30 * TS, 40 * TS + pulse, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty - 30 * TS, 3 * u, 0, TAU); ctx.fill(); }
    }

    /* ---------------- vrstva obrazovky: značky, texty, bubliny ---------------- */
    function tankTopScreen(t) { var S = shapes()[t.color === 1 ? 1 : 0]; return toScreen(t.x, t.y - S.topUnits * TS); }
    function drawMarkers(scene, st) {
      for (var i = 0; i < st.tanks.length; i++) {
        var t = st.tanks[i]; if (!t || t.alive === false || t.hp <= 0 || scene.hideTank === i) continue;
        var p = tankTopScreen(t), pal = LOOK.players[t.color === 1 ? 1 : 0];
        if (scene.active === i) { // trojúhelník v barvě hráče, poskakuje
          var bounce = calm() ? 0 : Math.abs(Math.sin(time * 4)) * 5, my = p.y - 8 - bounce;
          ctx.fillStyle = pal.main; ctx.beginPath(); ctx.moveTo(p.x - 8, my - 11); ctx.lineTo(p.x + 8, my - 11); ctx.lineTo(p.x, my); ctx.closePath(); ctx.fill();
        } else {
          var hp = clamp(t.hp / (t.maxHp || 100), 0, 1);
          if (hp < 0.35) { var bw = 30, bh = 6, bx = p.x - bw / 2, by = p.y - 12; ctx.fillStyle = rgba(INK, 0.25); rr(ctx, bx, by, bw, bh, 3); ctx.fill(); ctx.fillStyle = pal.main; rr(ctx, bx, by, Math.max(bh, bw * hp), bh, 3); ctx.fill(); }
        }
      }
    }
    function drawTexts(dt) { // plovoucí texty: Fredoka 700, krémová výplň, inkoustový obrys 4 px
      for (var i = texts.length - 1; i >= 0; i--) {
        var tx = texts[i]; tx.life += dt; if (tx.life > tx.max) { texts.splice(i, 1); continue; }
        var u = tx.life / tx.max, e = 1 - Math.pow(1 - u, 3), wide = cw >= 640;
        var fs = tx.big ? (wide ? 28 : 22) : (wide ? 20 : 17), rise = tx.big ? 40 : 26, sp = toScreen(tx.x, tx.y);
        ctx.globalAlpha = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
        var pop = 1 + Math.max(0, 1 - u * 8) * 0.5;
        textOutlined(tx.text, sp.x, sp.y - e * rise, fs * pop, tx.col, "center", 4);
        ctx.globalAlpha = 1;
      }
    }
    function tankVisible(t) {
      var p = toScreen(t.x, t.y), hw = 55 * TS * scale, top = 110 * TS * scale;
      return p.x + hw > 0 && p.x - hw < cw && p.y > 0 && p.y - top < ch;
    }
    function drawEdgeBubble(t, i, names, other) { // soupeř mimo záběr: kulatá bublina s jeho živým obličejem u okraje
      edgeHit[i] = null;
      if (tankVisible(t)) return;
      var p = toScreen(t.x, t.y - 40 * TS), R = LOOK.edgeR, pal = LOOK.players[t.color === 1 ? 1 : 0];
      var nm = (names && names[i]) || "";
      if (nm.length > 8) nm = nm.slice(0, 7) + "…";
      if (other) nm += " · " + Math.round(Math.hypot(t.x - other.x, t.y - other.y) / 10) + " m";
      var x = clamp(p.x, R + 14, cw - R - 14), yMin = cw >= 1000 ? 176 : 112, yMax = Math.max(yMin, ch - (cw >= 1000 ? 150 : 96)), y = clamp(p.y, yMin, yMax);
      var ang = Math.atan2(p.y - y, p.x - x);
      // šipka k tanku
      ctx.fillStyle = pal.main; ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(R + 11, 0); ctx.lineTo(R - 2, -9); ctx.lineTo(R - 2, 9); ctx.closePath(); ctx.fill(); ctx.restore();
      // bublina
      ctx.fillStyle = rgba(INK, LOOK.shadowA); ctx.beginPath(); ctx.arc(x, y + LOOK.shadowPx, R, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.main; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      drawFace(ctx, i, x, y, R - 3);
      // popisek
      ctx.font = "600 13px " + FONT; var tw = ctx.measureText(nm).width, lw = tw + 18, lh = 22;
      var lx = clamp(x - lw / 2, 6, cw - lw - 6), ly = y + R + 7;
      flatCard(lx, ly, lw, lh, lh / 2, CREAM);
      ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(nm, lx + lw / 2, ly + lh / 2 + 0.5);
      edgeHit[i] = { x: x, y: y, r: R };
    }
    function drawAimBubble(scene, st) { // jen při tažení: krémová bublina na straně odvrácené od hlavně
      var a = scene.aim; if (!a || !a.dragging || !st.tanks[a.idx] || st.tanks[a.idx].alive === false) return;
      var b = aimBase(scene, st), top = tankTopScreen(b), base = toScreen(b.x, b.y);
      var v1 = Math.round(a.angle) + "°", v2 = String(Math.round(a.power));
      ctx.font = "700 22px " + FONT; var w1 = ctx.measureText(v1).width, w2 = ctx.measureText(v2).width;
      ctx.font = "600 11px " + FONT; w1 = Math.max(w1, ctx.measureText("úhel").width); w2 = Math.max(w2, ctx.measureText("síla").width);
      var bw = 16 + w1 + 18 + w2 + 16, bh = 54, side = Math.cos(a.angle * DEG) >= 0 ? -1 : 1, gap = 46 * TS * scale + 10;
      var bx = side < 0 ? base.x - gap - bw : base.x + gap, by = top.y - bh + 10;
      bx = clamp(bx, 8, cw - bw - 8); by = clamp(by, 8, ch - bh - 8);
      flatCard(bx, by, bw, bh, 16, CREAM);
      // ocásek k tanku
      var txx = side < 0 ? bx + bw - 2 : bx + 2; ctx.fillStyle = CREAM; ctx.beginPath(); ctx.moveTo(txx, by + bh - 22); ctx.lineTo(txx - side * 12, by + bh - 6); ctx.lineTo(txx, by + bh - 9); ctx.closePath(); ctx.fill();
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      var c1 = bx + 16, c2 = c1 + w1 + 18;
      ctx.fillStyle = rgba(INK, 0.6); ctx.font = "600 11px " + FONT; ctx.fillText("úhel", c1, by + 17); ctx.fillText("síla", c2, by + 17);
      ctx.fillStyle = INK; ctx.font = "700 22px " + FONT; ctx.fillText(v1, c1, by + 42); ctx.fillText(v2, c2, by + 42);
    }
    function drawNoteBubble(scene, st) {
      if (!scene.bubble || !st.tanks[scene.bubble.idx]) return;
      var bt = st.tanks[scene.bubble.idx], sp = tankTopScreen(bt);
      var font = "600 15px " + FONT, lines = wrapText(scene.bubble.text, Math.min(200, cw * 0.55), font);
      ctx.font = font; var wmax = 0; lines.forEach(function (l) { wmax = Math.max(wmax, ctx.measureText(l).width); });
      var bw = wmax + 24, bh = lines.length * 19 + 16, bx = clamp(sp.x - bw / 2, 6, cw - bw - 6), by = Math.max(6, sp.y - bh - 16);
      flatCard(bx, by, bw, bh, 12, CREAM);
      var tailx = clamp(sp.x, bx + 14, bx + bw - 14);
      ctx.fillStyle = CREAM; ctx.beginPath(); ctx.moveTo(tailx - 7, by + bh - 1); ctx.lineTo(tailx + 3, by + bh - 1); ctx.lineTo(sp.x, by + bh + 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      lines.forEach(function (l, li) { ctx.fillText(l, bx + 12, by + 8 + 9.5 + li * 19); });
    }

    function frame(scene, dtSec) {
      var dt = Math.min(dtSec || 1 / 60, 1 / 20); time += dt;
      var st = scene.state; if (!st) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      if (!hillsOk) resize();
      lastState = st; lastWind = scene.wind != null ? scene.wind : st.wind || 0;
      fx.forEach(function (f) { f.hit = Math.max(0, f.hit - dt); f.blink -= dt; if (f.blink < 0) f.blink = 2.4 + Math.random() * 2.6; f.recoil = Math.max(0, f.recoil - dt * 4); f.dust -= dt; f.shieldPing = Math.max(0, f.shieldPing - dt * 2); });
      // kola se otáčí podle ujeté vzdálenosti
      st.tanks.forEach(function (t, i) { var f = fx[i]; if (f.lastX != null && Math.abs(t.x - f.lastX) > 0.01) f.wheel += (t.x - f.lastX) / (6.6 * TS); f.lastX = t.x; });

      var key = terrainKey(st.h); if (key !== tKey) { tKey = key; buildTerrain(st.h); }
      var tk = (st.mod || "") + "|" + (st.map || ""); if (tk !== themeKey) { themeKey = tk; theme = themeFor(st); buildHills(); }

      camStep(dt);
      TS = tankScale(); HK = clamp(1 / (scale * 1.35), 1, 2.2);
      computeExpr(scene, st);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSky(); drawModSky(dt, st);
      var shx = 0, shy = 0; if (shake > 0.05 && !calm()) { shx = (Math.random() - 0.5) * shake * 2 * scale; shy = (Math.random() - 0.5) * shake * 2 * scale; shake *= Math.pow(0.00002, dt); } else shake = 0;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + shx), dpr * (oy + shy));

      drawCloud(dt); drawHills();
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawModFront(dt, st); ctx.restore();
      drawTerrainEdges(st.h);
      ctx.drawImage(terrC, 0, 0, W, H);
      drawFires(st.fires || []);
      drawTarget(scene, st);
      drawZone(scene, st);

      // duch tanku při jízdě
      if (scene.ghost && st.tanks[scene.ghost.idx]) {
        var gt = st.tanks[scene.ghost.idx], gx = scene.ghost.x, gy = H - st.h[clamp(Math.round(gx), 0, W - 1)];
        ctx.strokeStyle = rgba(INK, 0.35); ctx.lineWidth = 2 / scale; ctx.setLineDash([3 / scale, 6 / scale]); ctx.beginPath(); ctx.moveTo(gt.x, gt.y - 6); ctx.lineTo(gx, gy - 6); ctx.stroke(); ctx.setLineDash([]);
        drawTank({ x: gx, y: gy, hp: gt.hp, maxHp: gt.maxHp, alive: true, color: gt.color, shield: 0 }, scene.ghost.idx, { alpha: 0.42, h: st.h, angle: scene.aim ? scene.aim.angle : null, expr: "idle" });
      }
      // stopy a projektily za tanky (střela vylétá zpoza hlavně)
      drawTrails();
      (st.proj || []).forEach(function (p) { drawProjectile(p); });
      // tanky
      for (var ti = 0; ti < st.tanks.length; ti++) {
        var t = st.tanks[ti];
        if (scene.hideTank === ti) continue;
        drawTank(t, ti, { h: st.h, active: scene.active === ti, angle: (scene.aim && scene.aim.idx === ti) ? scene.aim.angle : (scene.angles ? scene.angles[ti] : null) });
        prevPos[ti] = { x: t.x, y: t.y };
        if ((t.alive === false || t.hp <= 0) && !calm() && Math.random() < dt * 2.5) puff(t.x + (Math.random() - 0.5) * 30 * TS, t.y - 50 * TS, { r: 5 + Math.random() * 4, vy: -22, max: 1.4, a: 0.5, col: LOOK.dust });
      }
      drawAim(scene, st);
      drawPreview(scene);
      for (var pl = planes.length - 1; pl >= 0; pl--) { var plane = planes[pl]; plane.life += dt; plane.x += plane.vx * dt; if (plane.x > W + 120 || plane.life > 4) { planes.splice(pl, 1); continue; } drawPlane(plane); }
      drawParts(dt, lastWind);

      // vrstva v pixelech obrazovky
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMarkers(scene, st);
      drawTexts(dt);
      for (var ei = 0; ei < 2; ei++) { var et = st.tanks[ei]; if (et && et.alive !== false && et.hp > 0 && scene.hideTank !== ei) drawEdgeBubble(et, ei, scene.names, st.tanks[1 - ei]); else edgeHit[ei] = null; }
      drawAimBubble(scene, st);
      drawNoteBubble(scene, st);
    }

    /* ---------------- veřejné doplňky: výraz, obličej do HUD, klepnutí na bublinu ---------------- */
    function expr(idx) { return exprNow[idx] || "idle"; }
    function drawFace(c, idx, cx, cy, r, exprOverride) {
      if (!c || !(r > 0)) return;
      var st = lastState, t = st && st.tanks && st.tanks[idx];
      var style = t ? (t.color === 1 ? 1 : 0) : (idx === 1 ? 1 : 0), S = shapes()[style];
      var e = exprOverride || exprNow[idx] || "idle", dead = !!t && (t.alive === false || t.hp <= 0) && e === "lose";
      var sc = r * 2 / 66;
      c.save();
      c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fillStyle = LOOK.players[style].pale; c.fill(); c.clip();
      c.translate(cx - S.faceC[0] * sc, cy - S.faceC[1] * sc); c.scale(sc, sc);
      drawTankShape(c, { style: style, cos: cosTier[style], pal: palFor(style, dead), face: faceOf(idx, e), la: 30, ol: Math.max(1.2, r / 16) / sc, t: time + idx * 1.3, still: calm(), recoil: 0, wheel: 0, sway: 0 });
      c.restore();
    }
    // celý tank jako samostatný obrázek (konec zápasu, logo): střed na zemi v (x, y), šířka pxWidth v aktuálních souřadnicích ctx
    function drawTankSprite(c, idx, x, y, pxWidth, exprName, opts) {
      if (!c || !(pxWidth > 0)) return;
      opts = opts || {};
      var style = idx === 1 ? 1 : 0, e = exprName || "idle", sc = pxWidth / 100, t = opts.t != null ? opts.t : time;
      var still = calm(), face = e === "scared" ? "worry" : e;
      if (e === "idle" && !opts.noBlink && !still && (t + idx * 1.7) % 3.7 < 0.12) face = "blink";
      var la = opts.barrel != null ? opts.barrel : 50;
      c.save();
      c.translate(x, y); c.scale(opts.flip ? -sc : sc, sc);
      if (e === "hit") { c.translate(still ? 0 : Math.sin(t * 55) * 1.2, 0); c.rotate(-8 * DEG); }
      drawTankShape(c, { style: style, cos: opts.cos != null ? opts.cos : cosTier[style], pal: palFor(style, e === "lose"), face: face, la: e === "lose" ? 4 : la, ol: LOOK.outlinePx / sc, t: t + idx * 1.3, still: still, recoil: 0, wheel: 0, sway: still ? 0 : Math.sin(t * 2.6 + idx) * 2.2 });
      if (e === "lose") { // obláček kouře nad poraženým
        var S = shapes()[style], top = S.top - 10;
        for (var k = 0; k < 3; k++) {
          var ph = still ? k / 3 : ((t * 0.45 + k / 3) % 1), py = top - 2 - ph * 22, px = -6 + Math.sin(ph * 5 + k) * 5 + ph * 8;
          c.globalAlpha = (still ? 0.6 : 0.75 * (1 - ph)); c.fillStyle = "#E9B57E"; c.beginPath(); c.arc(px, py, 4 + ph * 5, 0, TAU); c.fill();
        }
        c.globalAlpha = 1;
      }
      c.restore();
    }
    function edgeAt(clientX, clientY) {
      var r = canvas.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top;
      for (var i = 0; i < 2; i++) { var b = edgeHit[i]; if (b && Math.hypot(x - b.x, y - b.y) <= b.r + 4) return i; }
      return -1;
    }
    function tankTop(t) { var S = shapes()[t.color === 1 ? 1 : 0]; return t.y - S.topUnits * TS - 22 / scale; }

    return { camera: camera, setView: setView, nudge: nudge, zoomAt: zoomAt, fitAll: fitAll, homeZoom: homeZoom, limits: limits, pannable: pannable, uiK: uiK, tankTop: tankTop, resize: resize, frame: frame, event: event, reset: reset, invalidate: function () { tKey = ""; }, toWorld: toWorld, toScreen: toScreen, scaleNow: function () { return scale; }, size: function () { return { w: cw, h: ch }; }, setSubPx: function (v) { SUBPX = !!v; }, expr: expr, drawFace: drawFace, drawTankSprite: drawTankSprite, edgeAt: edgeAt, setCosmetics: setCosmetics, PAL: PAL };
  }

  window.TankRender = { create: create, W: W, H: H, PAL: PAL };
})();
