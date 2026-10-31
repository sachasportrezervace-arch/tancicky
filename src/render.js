/* Tančíky: Canvas 2D renderer. Papírový diorama: vrstvy vystřižené z papíru, měkké stíny, teplé odpolední světlo.
   Vše se kreslí procedurálně. Tohle je jen vzhled: smí používat Math.sin a náhodu, simulaci to neovlivní. */
(function () {
  "use strict";
  var W = 960, H = 540, TAU = Math.PI * 2;
  var FONT = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
  var calmQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  var calm = function () { return !!(calmQuery && calmQuery.matches); };
  // projektily v enginu: pozice a rychlosti jsou v sub-pixelech (S jednotek na pixel)
  var SUBPX = true;

  var INK = "#2a1a2e", CREAM = "#fff1d6", MUSTARD = "#f6c76a", TOMATO = "#e8543c", PLUM = "#4a2f45";
  var PAL = [
    { body: "#ee5d44", light: "#f78f78", dark: "#b8402d", deep: "#8c2e22", flag: "#f6c76a" },
    { body: "#2fa3ad", light: "#76cdd1", dark: "#1f7480", deep: "#175560", flag: "#f6c76a" }
  ];
  var DEAD = { body: "#7a6672", light: "#948190", dark: "#58485a", deep: "#43364a", flag: "#6a5a66" };
  var CHUNK_COLORS = ["#cf8f52", "#b9653f", "#8f4a3b", "#6aa24f", "#cf8f52", "#b9653f"];
  var WEAPON_LOOK = {
    grenade: { c: "#4a2f45", hi: "#8b6a86", r: 5, trail: "smoke" },
    triple: { c: "#f6c76a", hi: "#fff1d6", r: 3.6, trail: "smoke" },
    mirv: { c: "#e8543c", hi: "#f78f78", r: 6, trail: "smoke", band: CREAM },
    roller: { c: "#fff1d6", hi: "#ffffff", r: 5.5, trail: "dust", wheel: true },
    drill: { c: "#f6c76a", hi: "#fff1d6", r: 5, trail: "dust", cone: true },
    napalm: { c: "#ff8a3d", hi: "#ffd28a", r: 5.5, trail: "fire" },
    dirt: { c: "#8f4a3b", hi: "#cf8f52", r: 5.5, trail: "dust", blob: true },
    bouncer: { c: "#47b3b8", hi: "#b9f0f0", r: 5, trail: "smoke", stripe: CREAM },
    spray: { c: "#fff1d6", hi: "#ffffff", r: 2.8, trail: "smoke" }
  };
  var DEFAULT_LOOK = { c: "#4a2f45", hi: "#8b6a86", r: 4.5, trail: "smoke" };

  function fr(x) { var s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(c1, c2, t) { // #rrggbb mix
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    var r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
    return "rgb(" + r + "," + g + "," + bl + ")";
  }
  function rr(c, x, y, w, h, r) { // rounded rect path
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
  }
  function mk(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var cw = 1, ch = 1, dpr = 1, scale = 1, ox = 0, oy = 0, fit = 1, bk = 1, zMax = 3, SKYM = 160;
    var cam = { x: W / 2, y: H / 2, z: 1 }, tgt = { x: W / 2, y: H / 2, z: 1 }, camRate = 3, camInit = false;
    var skyC = null, hills = [], clouds = [], cloudSpr = [], strata = null, grain = null;
    var terrC = mk(1, 1), tctx = terrC.getContext("2d"), tKey = "";
    var parts = [], texts = [], trails = {}, planes = [], fires = [];
    var fx = [{ hit: 0, blink: 1.2, wheel: 0, lastX: null, recoil: 0, dust: 0, mouth: 0, dead: false, shieldPing: 0 }, { hit: 0, blink: 2.4, wheel: 0, lastX: null, recoil: 0, dust: 0, mouth: 0, dead: false, shieldPing: 0 }];
    var shake = 0, time = 0, lastWind = 0, lastState = null, prevPos = [null, null];

    /* ---------------- sizing + cached art ---------------- */
    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      var nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
      if (nw === cw && nh === ch && skyC) return false;
      cw = nw; ch = nh;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      fit = Math.min(cw / W, ch / H);
      zMax = clamp(2.4 / fit, 1.25, 5);
      bk = clamp(2 * dpr * fit, dpr * fit, 2.2); // kolik pixelu cache pripada na jeden svetovy pixel
      terrC.width = Math.ceil(W * bk); terrC.height = Math.ceil(H * bk); tctx = terrC.getContext("2d");
      tKey = "";
      buildSky(); buildHills(); buildClouds(); buildStrata(); buildGrain();
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
    function homeZoom() { return cw < 640 ? clamp(0.85 / fit, 1, zMax) : 1; }
    function camStep(dt) {
      var k = calm() ? 1 : 1 - Math.exp(-camRate * dt);
      cam.x += (tgt.x - cam.x) * k; cam.y += (tgt.y - cam.y) * k; cam.z *= Math.pow(tgt.z / cam.z, k);
      clampCam(cam); applyView();
    }
    function camera() { return { x: Math.round(cam.x * 10) / 10, y: Math.round(cam.y * 10) / 10, zoom: Math.round(cam.z * 1000) / 1000, scale: Math.round(scale * 1000) / 1000, tx: Math.round(tgt.x * 10) / 10, ty: Math.round(tgt.y * 10) / 10, tz: Math.round(tgt.z * 1000) / 1000 }; }
    function pannable() { var s = fit * cam.z; return cw / s < W - 1 || ch / s < H - 1; }
    function uiK() { return clamp(0.95 / scale, 1, 2.4); }

    function wobble(x, i) { return 6 * Math.sin(x / 70 + i * 1.7) + 3.5 * Math.sin(x / 23 + i * 2.3); }

    function buildSky() {
      skyC = mk(cw * dpr, (ch + SKYM * 2) * dpr); var c = skyC.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, SKYM * dpr);
      var ox = (cw - W * fit) / 2, oy = ch - H * fit, scale = fit; // nebe se pece pro pohled na cele bojiste
      var bands = [
        { y: -9999, col: "#3a2a5c" }, { y: 20, col: "#5e3b6b" }, { y: 88, col: "#9a4f6e" },
        { y: 150, col: "#d9715f" }, { y: 208, col: "#f0a066" }, { y: 262, col: "#f8cf8a" }
      ];
      var sx = function (x) { return ox + x * scale; }, sy = function (y) { return oy + y * scale; };
      c.fillStyle = bands[0].col; c.fillRect(0, -SKYM, cw, ch + SKYM * 2);
      for (var i = 1; i < bands.length; i++) {
        c.save();
        c.shadowColor = "rgba(25,8,35,.55)"; c.shadowBlur = 10 * Math.max(.5, scale); c.shadowOffsetY = -3 * Math.max(.5, scale);
        c.fillStyle = bands[i].col; c.beginPath(); c.moveTo(0, ch + SKYM);
        for (var px = 0; px <= cw + 8; px += 8) { var wx = (px - ox) / scale; c.lineTo(px, sy(bands[i].y + wobble(wx, i))); }
        c.lineTo(cw, ch + SKYM); c.closePath(); c.fill(); c.restore();
        if (i === 4) { // slunce se schovává za papírovým pruhem
          var cx = sx(700), cy = sy(246);
          c.save(); c.shadowColor = "rgba(25,8,35,.4)"; c.shadowBlur = 8 * Math.max(.5, scale); c.shadowOffsetY = 2 * Math.max(.5, scale);
          [[64, "#fbe0a0"], [46, "#f9c872"], [30, "#f4a95c"]].forEach(function (d) { c.fillStyle = d[1]; c.beginPath(); c.arc(cx, cy, d[0] * scale, 0, TAU); c.fill(); });
          c.restore();
        }
      }
    }

    function buildHills() {
      hills = [];
      var defs = [
        { col: "#6e416a", base: 330, a1: 34, f1: 130, p1: 1, a2: 12, f2: 47, p2: 2, pines: 0, par: 0.03 },
        { col: "#8a4b62", base: 372, a1: 28, f1: 96, p1: 4, a2: 9, f2: 31, p2: 1, pines: 1, par: 0.06 },
        { col: "#a65a58", base: 414, a1: 22, f1: 80, p1: 2, a2: 7, f2: 26, p2: 5, pines: 0, par: 0.1 }
      ];
      var M = 90;
      defs.forEach(function (d, li) {
        var cv = mk((W + M * 2) * bk, H * bk), c = cv.getContext("2d");
        c.setTransform(bk, 0, 0, bk, M * bk, 0);
        var ridge = function (x) { return d.base + d.a1 * Math.sin(x / d.f1 + d.p1) + d.a2 * Math.sin(x / d.f2 + d.p2); };
        c.save(); c.shadowColor = "rgba(25,8,35,.5)"; c.shadowBlur = 9 * bk; c.shadowOffsetY = -3 * bk;
        c.fillStyle = d.col; c.beginPath(); c.moveTo(-M, H);
        for (var x = -M; x <= W + M; x += 6) c.lineTo(x, ridge(x));
        c.lineTo(W + M, H); c.closePath(); c.fill(); c.restore();
        if (d.pines) { // papírové smrčky
          for (var i = 0; i < 26; i++) {
            var px = -M + fr(i * 3.1 + li) * (W + 2 * M), py = ridge(px) + 3, hh = 14 + fr(i + 9) * 14;
            c.fillStyle = mix(d.col, "#2a1a2e", 0.35 + fr(i + 4) * 0.2);
            c.beginPath(); c.moveTo(px, py - hh); c.lineTo(px + hh * .32, py - hh * .35); c.lineTo(px + hh * .2, py - hh * .35); c.lineTo(px + hh * .42, py); c.lineTo(px - hh * .42, py); c.lineTo(px - hh * .2, py - hh * .35); c.lineTo(px - hh * .32, py - hh * .35); c.closePath(); c.fill();
          }
        }
        hills.push({ cv: cv, par: d.par, M: M });
      });
    }

    function buildClouds() {
      cloudSpr = [];
      [[1, 1], [0.7, 2], [1.25, 3]].forEach(function (s, k) {
        var sc = s[0], cv = mk(200 * bk, 100 * bk), c = cv.getContext("2d");
        c.setTransform(bk, 0, 0, bk, 0, 0);
        var puffs = [[40, 62, 22], [70, 50, 28], [102, 56, 24], [130, 64, 17], [28, 70, 14]];
        c.save(); c.shadowColor = "rgba(60,20,50,.4)"; c.shadowBlur = 7 * bk; c.shadowOffsetY = 4 * bk;
        c.fillStyle = "#f6b8a0"; c.beginPath();
        puffs.forEach(function (p) { c.moveTo(p[0] + p[2], p[1] + 3); c.arc(p[0], p[1] + 3, p[2], 0, TAU); });
        c.fill(); c.restore();
        c.fillStyle = "#fff1d6"; c.beginPath();
        puffs.forEach(function (p) { c.moveTo(p[0] + p[2], p[1]); c.arc(p[0], p[1], p[2], 0, TAU); });
        c.fill();
        cloudSpr.push({ cv: cv, w: 160 * sc, h: 80 * sc, k: k });
      });
      clouds = [];
      for (var i = 0; i < 11; i++) clouds.push({ x: fr(i * 7.7) * (W + 300) - 150, y: i < 6 ? 40 + fr(i * 3.3) * 170 : -260 + fr(i * 3.3) * 280, v: 0.6 + fr(i + 1) * 0.8, s: i % 3, sz: 0.7 + fr(i + 5) * 0.7 });
    }

    function buildStrata() { // textura hlíny: pevné vrstvy podle y, kamínky, kořínky, zkameněliny
      strata = mk(W * bk, H * bk); var c = strata.getContext("2d");
      var s = bk; c.setTransform(s, 0, 0, s, 0, 0);
      var bands = [
        { y: 9999, col: "#cf8f52" }, { y: 372, col: "#b9653f" }, { y: 424, col: "#8f4a3b" }, { y: 470, col: "#603444" }, { y: 506, col: "#3d2237" }
      ];
      // od nejhlubší: každá vyšší vrstva leží nahoře a vrhá stín dolů
      var order = [4, 3, 2, 1, 0];
      c.fillStyle = bands[4].col; c.fillRect(0, 0, W, H);
      var bounds = [372, 424, 470, 506];
      for (var k = 3; k >= 0; k--) {
        c.save(); c.shadowColor = "rgba(20,6,20,.5)"; c.shadowBlur = 5 * s; c.shadowOffsetY = 3 * s;
        c.fillStyle = bands[k].col; c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0);
        for (var x = W; x >= 0; x -= 6) c.lineTo(x, bounds[k] + 4 * Math.sin(x / 41 + k * 2) + 2.5 * Math.sin(x / 13 + k));
        c.closePath(); c.fill(); c.restore();
      }
      void order;
      // zrnko papíru + tmavší pruhy
      for (var i = 0; i < 260; i++) {
        var px = fr(i * 1.7) * W, py = 200 + fr(i * 2.9 + 3) * 340, depth = py;
        var pc = depth < 372 ? "#b97a40" : depth < 424 ? "#a05536" : depth < 470 ? "#7a3f33" : "#4d2a3e";
        c.fillStyle = pc; c.globalAlpha = .55; c.beginPath(); c.ellipse(px, py, 5 + fr(i) * 14, 1.1 + fr(i + 4) * 1.4, 0, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
      // kamínky
      for (var j = 0; j < 150; j++) {
        var qx = fr(j * 5.3 + 1) * W, qy = 230 + fr(j * 7.1) * 300, rad = 2 + fr(j + 2) * 4.2;
        var base = qy < 372 ? "#e0b983" : qy < 424 ? "#d89a74" : qy < 470 ? "#b77a64" : "#7a5266";
        c.fillStyle = "rgba(25,8,25,.35)"; c.beginPath(); c.ellipse(qx, qy + 1.6, rad, rad * .75, 0, 0, TAU); c.fill();
        c.fillStyle = base; c.beginPath(); c.ellipse(qx, qy, rad, rad * .75, fr(j) * 2, 0, TAU); c.fill();
        c.fillStyle = "rgba(255,240,220,.4)"; c.beginPath(); c.ellipse(qx - rad * .3, qy - rad * .25, rad * .35, rad * .2, 0, 0, TAU); c.fill();
      }
      // zkameněliny v hlubokých vrstvách: kost, spirála, zub
      var fossil = function (kind, fx0, fy0, a) {
        c.save(); c.translate(fx0, fy0); c.rotate(a); c.strokeStyle = "rgba(255,226,190,.55)"; c.fillStyle = "rgba(255,226,190,.45)"; c.lineWidth = 3; c.lineCap = "round";
        if (kind === 0) { c.beginPath(); c.moveTo(-12, 0); c.lineTo(12, 0); c.stroke(); [[-12, -3], [-12, 3], [12, -3], [12, 3]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 3, 0, TAU); c.fill(); }); }
        else if (kind === 1) { c.beginPath(); for (var t = 0; t < 14; t += .3) c.lineTo(Math.cos(t) * (1 + t * .8), Math.sin(t) * (1 + t * .8)); c.stroke(); }
        else { c.beginPath(); c.moveTo(-7, -6); c.quadraticCurveTo(0, -9, 7, -6); c.quadraticCurveTo(5, 6, 0, 9); c.quadraticCurveTo(-5, 6, -7, -6); c.fill(); }
        c.restore();
      };
      [[120, 478, 0, .3], [330, 520, 1, 0], [520, 492, 2, .4], [700, 515, 0, -.2], [840, 484, 1, 1.2], [60, 522, 2, 0], [610, 454, 1, .6], [250, 455, 0, -.5], [900, 518, 0, .15]].forEach(function (f) { fossil(f[2], f[0], f[1], f[3]); });
    }

    function buildGrain() {
      var g = mk(128, 128), c = g.getContext("2d"), id = c.createImageData(128, 128);
      for (var i = 0; i < id.data.length; i += 4) { var v = 235 + Math.random() * 20; id.data[i] = v; id.data[i + 1] = v - 6; id.data[i + 2] = v - 14; id.data[i + 3] = Math.random() < .5 ? 0 : 255; }
      c.putImageData(id, 0, 0); grain = ctx.createPattern(g, "repeat");
    }

    /* ---------------- terrain ---------------- */
    function drawTerrain(h) {
      var s = bk; tctx.setTransform(s, 0, 0, bk, 0, 0); tctx.clearRect(0, 0, W, H);
      var y = function (x) { return H - h[Math.max(0, Math.min(W - 1, x))]; };
      tctx.save(); tctx.beginPath(); tctx.moveTo(0, H);
      for (var x = 0; x < W; x++) tctx.lineTo(x + .5, y(x));
      tctx.lineTo(W, H); tctx.closePath(); tctx.clip();
      tctx.drawImage(strata, 0, 0, W, H);
      // kořínky pod trávou
      tctx.strokeStyle = "rgba(78,44,34,.7)"; tctx.lineCap = "round";
      for (var b = 6; b < W; b += 29 + (b % 11)) {
        var sy = y(b), len = 12 + fr(b * 1.3) * 22, dir = fr(b) < .5 ? -1 : 1;
        tctx.lineWidth = 1.7; tctx.beginPath(); tctx.moveTo(b, sy + 5);
        tctx.bezierCurveTo(b + dir * 4, sy + len * .4, b - dir * 5, sy + len * .7, b + dir * 3, sy + len); tctx.stroke();
        tctx.lineWidth = 1.1; tctx.beginPath(); tctx.moveTo(b + dir * 1.5, sy + len * .45); tctx.lineTo(b + dir * 9, sy + len * .8); tctx.stroke();
      }
      // vnitřní stín pod travnatým okrajem
      tctx.strokeStyle = "rgba(40,14,24,.28)"; tctx.lineWidth = 9; tctx.lineJoin = "round"; tctx.beginPath();
      for (var x2 = 0; x2 < W; x2 += 2) { if (x2 === 0) tctx.moveTo(x2, y(x2) + 7); else tctx.lineTo(x2, y(x2) + 7); } tctx.stroke();
      tctx.restore();
      // travnatý okraj: stín, tmavý, světlý, odlesk
      var path = function (dy) { tctx.beginPath(); for (var xx = 0; xx < W; xx += 2) { if (xx === 0) tctx.moveTo(0, y(0) + dy); else tctx.lineTo(xx + .5, y(xx) + dy); } tctx.lineTo(W, y(W - 1) + dy); };
      tctx.lineJoin = "round"; tctx.lineCap = "round";
      tctx.strokeStyle = "rgba(30,10,24,.3)"; tctx.lineWidth = 13; path(3); tctx.stroke();
      tctx.strokeStyle = "#47783b"; tctx.lineWidth = 10; path(1); tctx.stroke();
      tctx.strokeStyle = "#6fae55"; tctx.lineWidth = 6.4; path(-1); tctx.stroke();
      tctx.strokeStyle = "rgba(190,235,130,.75)"; tctx.lineWidth = 1.8; path(-3); tctx.stroke();
      // trsy a kytičky
      for (var t = 4; t < W; t += 17 + (t % 7)) {
        var ty = y(t) - 3, th = 4 + fr(t * .7) * 5, k = fr(t * 2.1);
        tctx.fillStyle = k < .5 ? "#6fae55" : "#8fc766";
        tctx.beginPath(); tctx.moveTo(t - 3, ty + 2); tctx.lineTo(t - 2.5, ty - th); tctx.lineTo(t - .5, ty); tctx.lineTo(t + .5, ty - th - 2); tctx.lineTo(t + 2, ty); tctx.lineTo(t + 3.5, ty - th * .8); tctx.lineTo(t + 3.5, ty + 2); tctx.closePath(); tctx.fill();
        if (fr(t * 3.7) > .86) { var fc = fr(t) > .5 ? MUSTARD : "#f2a0a8"; tctx.fillStyle = "#47783b"; tctx.fillRect(t - .5, ty - 8, 1.2, 8); tctx.fillStyle = fc; tctx.beginPath(); tctx.arc(t, ty - 9, 3, 0, TAU); tctx.fill(); tctx.fillStyle = "#fff1d6"; tctx.beginPath(); tctx.arc(t, ty - 9, 1.1, 0, TAU); tctx.fill(); }
      }
    }
    function terrainKey(h) { var a = 0, b = 0; for (var i = 0; i < W; i += 1) { a += h[i]; b += h[i] * ((i % 7) + 1); } return a + ":" + b + ":" + bk; }

    /* ---------------- particles ---------------- */
    var CAL = function () { return calm() ? 0.35 : 1; };
    function P(o) { parts.push(o); if (parts.length > 900) parts.splice(0, parts.length - 900); }
    function puff(x, y, o) {
      o = o || {};
      P({ k: "puff", x: x, y: y, vx: o.vx || 0, vy: o.vy || 0, r: o.r || 8, gr: o.gr == null ? 14 : o.gr, life: 0, max: o.max || 1.1, col: o.col || "#e9d3bd", wind: o.wind == null ? 1 : o.wind, a: o.a == null ? .9 : o.a });
    }
    function chunk(x, y, vx, vy, size, colour) {
      P({ k: "chunk", x: x, y: y, vx: vx, vy: vy, r: size, rot: Math.random() * TAU, vr: (Math.random() - .5) * 14, life: 0, max: 1.2 + Math.random() * .8, col: colour || CHUNK_COLORS[(Math.random() * CHUNK_COLORS.length) | 0], n: 4 + ((Math.random() * 2) | 0), sd: Math.random() * 99 });
    }
    function spark(x, y, vx, vy, col, max) { P({ k: "spark", x: x, y: y, vx: vx, vy: vy, life: 0, max: max || .4, col: col || MUSTARD, r: 1.8 }); }
    function ring(x, y, r0, r1, max, col, w) { P({ k: "ring", x: x, y: y, r0: r0, r1: r1, life: 0, max: max || .4, col: col || CREAM, w: w || 5 }); }
    function burst(x, y, r, cols) { P({ k: "burst", x: x, y: y, r: r, life: 0, max: .42, cols: cols || [TOMATO, MUSTARD, CREAM], pts: 10 + ((Math.random() * 4) | 0), rot: Math.random() * TAU, sd: Math.random() * 50 }); }
    function star(x, y, vx, vy, col, size) { P({ k: "star", x: x, y: y, vx: vx, vy: vy, r: size || 4, life: 0, max: .9 + Math.random() * .5, col: col || CREAM, rot: Math.random() * TAU }); }
    function floatText(x, y, text, col, size) { texts.push({ x: x, y: y, text: text, col: col || CREAM, life: 0, max: 1.5, size: size || 17 }); }

    function explode(e) {
      var r = e.r || 20, c = CAL(), kind = e.kind || "boom", x = e.x, y = e.y;
      if (kind === "small") {
        ring(x, y, r * .3, r * 1.3, .25, CREAM, 3);
        for (var i = 0; i < 3 * c + 2; i++) chunk(x, y, (Math.random() - .5) * 150, -60 - Math.random() * 100, 2 + Math.random() * 2);
        puff(x, y - 2, { r: r * .5, max: .6, vy: -12 });
        shake = Math.max(shake, 1.2 * (calm() ? 0 : 1));
        return;
      }
      if (kind === "dirt") {
        ring(x, y, r * .4, r * 1.2, .35, "#cf8f52", 4);
        for (var d = 0; d < (16 + r / 2) * c; d++) chunk(x, y, (Math.random() - .5) * 190, -60 - Math.random() * 190, 2.5 + Math.random() * 4, ["#8f4a3b", "#b9653f", "#cf8f52"][d % 3]);
        for (var q = 0; q < 6 * c + 2; q++) puff(x + (Math.random() - .5) * r, y - Math.random() * r * .4, { r: r * .35 + Math.random() * 6, col: "#d6a77e", vy: -18 - Math.random() * 20, vx: (Math.random() - .5) * 40, max: 1 + Math.random() * .6, gr: 16 });
        shake = Math.max(shake, calm() ? 0 : Math.min(5, r / 14));
        return;
      }
      if (kind === "fire") {
        burst(x, y, r * 1.2, ["#ff8a3d", MUSTARD, CREAM]);
        for (var f = 0; f < (14 + r / 2) * c; f++) P({ k: "ember", x: x + (Math.random() - .5) * r, y: y + (Math.random() - .5) * r * .5, vx: (Math.random() - .5) * 90, vy: -30 - Math.random() * 110, r: 2 + Math.random() * 3.5, life: 0, max: .6 + Math.random() * .8 });
        for (var p = 0; p < 5 * c + 2; p++) puff(x + (Math.random() - .5) * r, y - Math.random() * r * .5, { r: r * .35 + Math.random() * 7, col: "#c9a58f", vy: -30 - Math.random() * 20, max: 1.2 + Math.random() * .6 });
        shake = Math.max(shake, calm() ? 0 : Math.min(5, r / 12));
        return;
      }
      // boom: záblesk, rázová vlna, kusy hlíny, kouřové žmolky co se nechají unášet větrem
      burst(x, y, r * 1.5);
      ring(x, y, r * .5, r * 2.0, .42, CREAM, Math.max(4, r / 6));
      ring(x, y, r * .3, r * 1.4, .3, MUSTARD, Math.max(3, r / 9));
      for (var k = 0; k < (14 + r * .7) * c; k++) {
        var a = Math.random() * TAU, sp = 60 + Math.random() * (140 + r * 3);
        chunk(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 70, 2.5 + Math.random() * (3 + r / 14));
      }
      for (var s = 0; s < (7 + r / 6) * c; s++) { var a2 = Math.random() * TAU, sp2 = 120 + Math.random() * 200; spark(x, y, Math.cos(a2) * sp2, Math.sin(a2) * sp2, s % 2 ? MUSTARD : CREAM, .25 + Math.random() * .25); }
      for (var m = 0; m < (5 + r / 8) * c; m++) puff(x + (Math.random() - .5) * r * 1.2, y + (Math.random() - .5) * r * .8, { r: r * .3 + Math.random() * 9, col: m % 3 === 0 ? "#bfa28f" : "#e9d3bd", vy: -26 - Math.random() * 40, vx: (Math.random() - .5) * 30, max: 1.3 + Math.random() * .9, gr: 18 });
      shake = Math.max(shake, calm() ? 0 : Math.min(11, 2 + r / 7));
    }

    function event(ev, st) {
      if (!ev) return;
      var t = ev.type, c = CAL();
      if (st) lastState = st;
      if (t === "explode") explode(ev);
      else if (t === "fire") {
        var tk = ev.tank != null ? ev.tank : 0; if (fx[tk]) { fx[tk].recoil = 1; fx[tk].mouth = .35; }
        for (var i = 0; i < 6 * c + 1; i++) spark(ev.x, ev.y, (Math.random() - .3) * 120, (Math.random() - .7) * 90, i % 2 ? MUSTARD : CREAM, .22);
        puff(ev.x, ev.y, { r: 7, max: .6, vy: -8 }); puff(ev.x + 3, ev.y - 3, { r: 5, max: .5, vy: -14 });
        shake = Math.max(shake, calm() ? 0 : 1.6);
      } else if (t === "damage") {
        var tt = st && st.tanks[ev.tank], dx = tt ? tt.x : 0, dy = tt ? tt.y - 36 : 0;
        if (fx[ev.tank]) { fx[ev.tank].hit = .7; }
        if (ev.shielded) { floatText(dx, dy, ev.amount > 0 ? "štít -" + ev.amount : "štít", "#9fe6e9", 16); if (fx[ev.tank]) fx[ev.tank].shieldPing = 1; }
        else if (ev.amount > 0) floatText(dx, dy, "-" + ev.amount, "#ff8a73", 20);
      } else if (t === "die") {
        var d = st && st.tanks[ev.tank];
        if (d) {
          explode({ x: d.x, y: d.y - 14, r: 46, kind: "boom" });
          var pal = PAL[d.color === 1 ? 1 : 0];
          for (var j = 0; j < 12 * c + 3; j++) chunk(d.x, d.y - 16, (Math.random() - .5) * 240, -80 - Math.random() * 200, 3 + Math.random() * 4, j % 3 ? pal.body : pal.dark);
        }
        if (fx[ev.tank]) fx[ev.tank].dead = true;
        shake = Math.max(shake, calm() ? 0 : 12);
      } else if (t === "coins") {
        var ct = st && st.tanks[ev.tank];
        if (ct && ev.amount > 0) floatText(ct.x, ct.y - 48, "+" + ev.amount, MUSTARD, 18);
      } else if (t === "ability") {
        var at = st && st.tanks[ev.tank], ax = ev.x != null ? ev.x : (at ? at.x : 0), ay = ev.y != null ? ev.y : (at ? at.y - 12 : 0);
        if (ev.id === "teleport") {
          var old = prevPos[ev.tank];
          [[ax, ay], old ? [old.x, old.y - 18] : null].forEach(function (p) { if (!p) return; ring(p[0], p[1], 6, 40, .5, "#9fe6e9", 3); for (var n = 0; n < 14 * c + 3; n++) { var a = Math.random() * TAU; star(p[0] + Math.cos(a) * 14, p[1] + Math.sin(a) * 14, Math.cos(a) * 30, -30 - Math.random() * 60, n % 2 ? "#9fe6e9" : CREAM, 3 + Math.random() * 3); } });
        } else if (ev.id === "airstrike") {
          planes.push({ x: ax - 460, y: 46, vx: 520, life: 0, ax: ax, drops: [] });
        } else if (ev.id === "shield") {
          if (fx[ev.tank]) fx[ev.tank].shieldPing = 1; ring(ax, ay, 10, 44, .45, "#9fe6e9", 4);
        } else if (ev.id === "repair") {
          for (var h2 = 0; h2 < 10 * c + 3; h2++) star(ax + (Math.random() - .5) * 40, ay + 10 + Math.random() * 10, 0, -30 - Math.random() * 30, "#9fe08a", 4);
          if (at) floatText(at.x, at.y - 48, "oprava", "#b8f09a", 16);
        } else if (ev.id === "calm") {
          for (var w2 = 0; w2 < 3; w2++) ring(ax, ay, 8 + w2 * 6, 50 + w2 * 18, .6 + w2 * .1, CREAM, 2);
        } else if (ev.id === "magnet") {
          ring(ax, ay, 40, 6, .6, "#e58a8f", 3); ring(ax, ay, 56, 10, .7, "#e58a8f", 2);
        } else if (ev.id === "antigrav") {
          for (var b2 = 0; b2 < 9 * c + 2; b2++) puff(ax + (Math.random() - .5) * 50, ay + Math.random() * 20, { r: 3 + Math.random() * 4, col: "#cfeef0", vy: -50 - Math.random() * 40, gr: 0, wind: 0, max: 1 + Math.random() * .5, a: .8 });
        }
      } else if (t === "bounce") {
        ring(ev.x, ev.y, 3, 18, .28, CREAM, 2.5); for (var z = 0; z < 4 * c + 1; z++) chunk(ev.x, ev.y, (Math.random() - .5) * 80, -40 - Math.random() * 60, 1.8 + Math.random() * 1.6);
      } else if (t === "split") {
        ring(ev.x, ev.y, 4, 26, .3, MUSTARD, 3); burst(ev.x, ev.y, 14, [MUSTARD, CREAM, CREAM]);
        for (var q = 0; q < 5 * c + 1; q++) spark(ev.x, ev.y, (Math.random() - .5) * 160, (Math.random() - .5) * 160, CREAM, .3);
      } else if (t === "fall") {
        var ft = st && st.tanks[ev.tank];
        if (ft) for (var u = 0; u < 5 * c + 1; u++) puff(ft.x + (Math.random() - .5) * 34, ft.y - 2, { r: 4 + Math.random() * 4, vx: (Math.random() - .5) * 60, vy: -10 - Math.random() * 14, max: .6, col: "#d6a77e" });
      } else if (t === "move") {
        var mt = st && st.tanks[ev.tank], f = fx[ev.tank];
        if (mt && f && f.dust <= 0) { f.dust = .07; puff(mt.x - 14 * Math.sign(ev.dir || 1), mt.y - 3, { r: 3.2, vx: (Math.random() - .5) * 14, vy: -8, max: .5, col: "#d6a77e", a: .7 }); }
      } else if (t === "roundEnd" || t === "matchEnd") {
        if (ev.winner === 0 || ev.winner === 1) {
          var wt = st && st.tanks[ev.winner], pal2 = PAL[ev.winner];
          var cols = [pal2.body, MUSTARD, CREAM, pal2.light];
          for (var cf = 0; cf < (t === "matchEnd" ? 90 : 36) * c; cf++) P({ k: "confetti", x: (wt ? wt.x : W / 2) + (Math.random() - .5) * 200, y: -20 - Math.random() * 60, vx: (Math.random() - .5) * 60, vy: 40 + Math.random() * 80, rot: Math.random() * TAU, vr: (Math.random() - .5) * 10, w: 5 + Math.random() * 5, hh: 3 + Math.random() * 3, col: cols[cf % cols.length], life: 0, max: 3.2 + Math.random() * 1.4, ph: Math.random() * 6 });
        }
      }
    }

    function reset() { parts.length = 0; texts.length = 0; trails = {}; planes.length = 0; shake = 0; fx.forEach(function (f) { f.hit = 0; f.dead = false; f.lastX = null; f.recoil = 0; f.mouth = 0; f.shieldPing = 0; }); prevPos = [null, null]; }

    /* ---------------- tanks ---------------- */
    function slopeAt(h, x) { var a = H - h[clamp(Math.round(x) - 11, 0, W - 1)], b = H - h[clamp(Math.round(x) + 11, 0, W - 1)]; return clamp(Math.atan2(b - a, 22), -.7, .7); }

    var TS = 0.56, HK = 1; // kreslíme o něco větší než zásahová plocha enginu (±11 px), aby tank byl čitelný na telefonu
    function drawTank(t, idx, o) {
      var f = fx[idx], pal = (!t.alive || t.hp <= 0) ? DEAD : PAL[t.color === 1 ? 1 : 0], dead = pal === DEAD;
      var tilt = o.h ? slopeAt(o.h, t.x) : 0, cs = Math.cos(tilt), sn = Math.sin(tilt);
      var ang = o.angle == null ? (idx === 0 ? 50 : 130) : o.angle, ar = ang * Math.PI / 180;
      if (dead) ar = idx === 0 ? -0.3 : Math.PI + 0.3;
      var hurt = f.hit > 0, bob = o.active && !dead ? Math.sin(time * 3.2) * 0.9 : 0, lean = hurt ? Math.sin(time * 60) * 1.6 : 0;
      var hpPct = t.hp / (t.maxHp || 100), low = hpPct < .35;
      ctx.save(); ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
      ctx.translate(t.x, t.y); ctx.scale(TS, TS);
      // kontaktní stín
      ctx.fillStyle = "rgba(25,8,25,.3)"; ctx.beginPath(); ctx.ellipse(0, 2, 29, 5, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.rotate(tilt); ctx.translate(lean, -1 + bob * .4);
      // anténa s praporkem
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.beginPath();
      if (!dead) {
        ctx.moveTo(-17, -22); ctx.lineTo(-20.5, -43); ctx.stroke();
        var fl = Math.sin(time * 6 + idx) * 2.6;
        ctx.fillStyle = pal.flag; ctx.beginPath(); ctx.moveTo(-20.5, -43); ctx.quadraticCurveTo(-11, -46 + fl, -3, -40 + fl); ctx.quadraticCurveTo(-11, -39 + fl * .6, -20.2, -36); ctx.closePath(); ctx.fill();
      } else { ctx.moveTo(-17, -22); ctx.quadraticCurveTo(-23, -33, -31, -30); ctx.stroke(); }
      // pásy (vrstva papíru: tmavý podklad, pak světlejší)
      ctx.fillStyle = "#2c1a2f"; rr(ctx, -27, -12, 54, 13.5, 6.75); ctx.fill();
      ctx.fillStyle = "#4a2f45"; rr(ctx, -27, -13, 54, 12.6, 6.3); ctx.fill();
      ctx.fillStyle = "rgba(255,240,220,.14)"; rr(ctx, -22, -12, 44, 2.6, 1.3); ctx.fill();
      for (var wi = 0; wi < 4; wi++) {
        var wx = -18.5 + wi * 12.3, wr = f.wheel;
        ctx.fillStyle = "#2c1a2f"; ctx.beginPath(); ctx.arc(wx, -5.4, 4.9, 0, TAU); ctx.fill();
        ctx.fillStyle = "#f3dcb2"; ctx.beginPath(); ctx.arc(wx, -5.9, 4.1, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#a07a58"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(wx + Math.cos(wr) * 3.2, -5.9 + Math.sin(wr) * 3.2); ctx.lineTo(wx - Math.cos(wr) * 3.2, -5.9 - Math.sin(wr) * 3.2); ctx.stroke();
        ctx.fillStyle = "#a07a58"; ctx.beginPath(); ctx.arc(wx, -5.9, 1.2, 0, TAU); ctx.fill();
      }
      // tělo
      var bodyC = hurt ? mix(pal.body, "#ffffff", .5) : pal.body, lightC = hurt ? mix(pal.light, "#ffffff", .5) : pal.light;
      ctx.fillStyle = pal.deep; rr(ctx, -23, -24, 46, 14.5, 7); ctx.fill();
      ctx.fillStyle = bodyC; rr(ctx, -23, -25, 46, 13.6, 6.8); ctx.fill();
      ctx.strokeStyle = pal.light; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-18, -21.8); ctx.lineTo(12, -21.8); ctx.stroke();
      ctx.fillStyle = pal.dark; [-15, 0, 15].forEach(function (x) { ctx.beginPath(); ctx.arc(x, -15.2, 1.6, 0, TAU); ctx.fill(); });
      ctx.restore();
      // hlaveň: pivot ve středu věže, úhel absolutní (0 = doprava, 90 = nahoru)
      var px = 23 * sn, py = -23 * cs + bob * .4 - 1;
      ctx.save(); ctx.translate(px + lean, py); ctx.rotate(-ar);
      var rec = f.recoil * 5;
      ctx.fillStyle = "#3a2233"; rr(ctx, 4 - rec, -4.8, 29, 9.6, 4.2); ctx.fill();
      ctx.fillStyle = dead ? "#8a7a86" : MUSTARD; rr(ctx, 4 - rec, -5.8, 29, 9.4, 4.2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)"; rr(ctx, 8 - rec, -4.6, 17, 2.2, 1.1); ctx.fill();
      ctx.fillStyle = "#3a2233"; rr(ctx, 26 - rec, -7.4, 7, 13.2, 3.2); ctx.fill();
      ctx.fillStyle = dead ? "#6e5f6c" : "#e0a43c"; rr(ctx, 26 - rec, -8.4, 7, 12.8, 3.2); ctx.fill();
      ctx.restore();
      // věž
      ctx.save(); ctx.rotate(tilt); ctx.translate(lean, -1 + bob * .4);
      ctx.fillStyle = pal.deep; ctx.beginPath(); ctx.arc(0, -22, 13.4, 0, TAU); ctx.fill();
      ctx.fillStyle = bodyC; ctx.beginPath(); ctx.arc(0, -23, 13.4, 0, TAU); ctx.fill();
      ctx.fillStyle = lightC; ctx.beginPath(); ctx.arc(0, -23, 13.4, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(0, -23, 10.4, Math.PI * 1.12, Math.PI * 1.45); ctx.stroke();
      // obličej
      var lx = Math.cos(ar), ly = -Math.sin(ar), blink = f.blink < .12 && !dead;
      var eyes = [[-5.2, -24.6], [5.4, -24.6]];
      if (dead) {
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = "round";
        eyes.forEach(function (e) { ctx.beginPath(); ctx.moveTo(e[0] - 2.8, e[1] - 2.8); ctx.lineTo(e[0] + 2.8, e[1] + 2.8); ctx.moveTo(e[0] + 2.8, e[1] - 2.8); ctx.lineTo(e[0] - 2.8, e[1] + 2.8); ctx.stroke(); });
      } else {
        eyes.forEach(function (e) {
          ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(e[0], e[1] + .8, 5.2, blink ? 1 : 5.4, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = "#fff6e4"; ctx.beginPath(); ctx.ellipse(e[0], e[1], 4.9, blink ? .9 : 5.1, 0, 0, TAU); ctx.fill();
          if (!blink) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(e[0] + lx * 1.7, e[1] + ly * 1.7 + (hurt ? 1 : 0), 2.5, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(e[0] + lx * 1.7 + .9, e[1] + ly * 1.7 - .9, .9, 0, TAU); ctx.fill(); }
        });
        // obočí: odhodlané (aktivní), ustaraná (málo HP / zásah)
        var mood = hurt || low ? -1 : (o.active ? 1 : 0), lift = mood * 1.8;
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = "round";
        [[-1, eyes[0]], [1, eyes[1]]].forEach(function (p) {
          var s = p[0], e = p[1];
          ctx.beginPath(); ctx.moveTo(e[0] + 4.4 * s, e[1] - 7 - lift * .5); ctx.lineTo(e[0] - 3.8 * s, e[1] - 7 + lift * .5); ctx.stroke();
        });
      }
      // pusa
      ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 2; ctx.lineCap = "round";
      if (dead) { ctx.beginPath(); ctx.moveTo(-3.6, -15.8); ctx.quadraticCurveTo(0, -18.8, 3.6, -15.8); ctx.stroke(); }
      else if (hurt || f.mouth > 0) { ctx.beginPath(); ctx.ellipse(0, -16.2, 2.6, hurt ? 2.8 : 2.3, 0, 0, TAU); ctx.fill(); }
      else if (low) { ctx.beginPath(); ctx.moveTo(-3.6, -15.4); ctx.quadraticCurveTo(0, -18, 3.6, -15.4); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(-3.8, -17); ctx.quadraticCurveTo(0, -13.6, 3.8, -17); ctx.stroke(); }
      if (!dead) { ctx.fillStyle = "rgba(255,170,160,.55)"; ctx.beginPath(); ctx.arc(-9.6, -18.4, 2.3, 0, TAU); ctx.arc(9.8, -18.4, 2.3, 0, TAU); ctx.fill(); }
      if (!dead && low) { ctx.fillStyle = "#bfe9f2"; ctx.beginPath(); ctx.moveTo(14, -34); ctx.quadraticCurveTo(17.5, -29, 14, -26.8); ctx.quadraticCurveTo(10.5, -29, 14, -34); ctx.fill(); }
      ctx.restore();
      // štít
      if (t.shield > 0 && !dead) {
        var pulse = 1 + Math.sin(time * 4) * .03 + f.shieldPing * .08;
        ctx.save(); ctx.translate(0, -20); ctx.scale(pulse, pulse);
        ctx.fillStyle = "rgba(159,230,233,.18)"; ctx.beginPath(); ctx.arc(0, 0, 41, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(220,250,250,.92)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 41, 0, TAU); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 3.4; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(0, 0, 33, Math.PI * 1.15, Math.PI * 1.5); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    /* ---------------- frame ---------------- */
    function toWorld(cx, cy) { var r = canvas.getBoundingClientRect(); return { x: (cx - r.left - ox) / scale, y: (cy - r.top - oy) / scale }; }
    function toScreen(x, y) { return { x: ox + x * scale, y: oy + y * scale }; }

    function projPx(p) { return SUBPX ? { x: p.x / 100, y: p.y / 100 } : { x: p.x, y: p.y }; }

    function drawProjectile(p, dt) {
      var pp = projPx(p), look = WEAPON_LOOK[p.w] || DEFAULT_LOOK, id = p.id == null ? p.w : p.id;
      var tr = trails[id] || (trails[id] = { pts: [], look: look, seen: time }); tr.seen = time;
      var last = tr.pts[tr.pts.length - 1];
      if (!last || Math.abs(last.x - pp.x) + Math.abs(last.y - pp.y) > 3) { tr.pts.push({ x: pp.x, y: pp.y, t: time }); if (tr.pts.length > 46) tr.pts.shift(); }
      var vx = SUBPX ? p.vx / 100 : p.vx, vy = SUBPX ? p.vy / 100 : p.vy, ang = Math.atan2(vy, vx);
      ctx.save(); ctx.translate(pp.x, pp.y);
      var r = look.r;
      ctx.fillStyle = "rgba(25,8,25,.28)"; ctx.beginPath(); ctx.arc(1.4, 2, r, 0, TAU); ctx.fill();
      if (look.cone) {
        ctx.rotate(ang); ctx.fillStyle = "#c58a2c"; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -5.6); ctx.lineTo(-7, 5.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = look.c; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -5); ctx.lineTo(-7, 3.4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-2, -3.6); ctx.lineTo(2, 2.4); ctx.moveTo(-6, -3.2); ctx.lineTo(-2, 3.4); ctx.stroke();
      } else if (look.wheel) {
        ctx.rotate(time * 14); ctx.fillStyle = "#c9b08a"; ctx.beginPath(); ctx.arc(0, 0, r + .8, 0, TAU); ctx.fill(); ctx.fillStyle = look.c; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#8a6a4a"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
      } else if (look.blob) {
        ctx.rotate(time * 6 + 1); ctx.fillStyle = "#6a3328"; ctx.beginPath();
        for (var i = 0; i < 7; i++) { var a = i / 7 * TAU, rad = r * (1 + .22 * Math.sin(i * 2.7)); ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad + .8); } ctx.fill();
        ctx.fillStyle = look.c; ctx.beginPath(); for (var j = 0; j < 7; j++) { var a3 = j / 7 * TAU, rad3 = r * (1 + .22 * Math.sin(j * 2.7)); ctx.lineTo(Math.cos(a3) * rad3, Math.sin(a3) * rad3); } ctx.fill();
        ctx.fillStyle = look.hi; ctx.beginPath(); ctx.arc(-r * .3, -r * .3, r * .3, 0, TAU); ctx.fill();
      } else if (p.w === "napalm") {
        var g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2.4); g.addColorStop(0, "rgba(255,230,160,.95)"); g.addColorStop(.4, "rgba(255,138,61,.7)"); g.addColorStop(1, "rgba(255,90,40,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, TAU); ctx.fill();
        ctx.fillStyle = "#e8543c"; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.fillStyle = look.hi; ctx.beginPath(); ctx.arc(-.8, -.8, r * .55, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = mix(look.c, "#000000", .35); ctx.beginPath(); ctx.arc(0, .8, r, 0, TAU); ctx.fill();
        ctx.fillStyle = look.c; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        if (look.band) { ctx.save(); ctx.rotate(ang); ctx.fillStyle = look.band; ctx.fillRect(-1.4, -r, 2.8, r * 2); ctx.restore(); }
        if (look.stripe) { ctx.save(); ctx.rotate(time * 9); ctx.fillStyle = look.stripe; ctx.fillRect(-r, -1.3, r * 2, 2.6); ctx.restore(); }
        ctx.fillStyle = look.hi; ctx.globalAlpha = .8; ctx.beginPath(); ctx.arc(-r * .32, -r * .35, r * .3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        if (p.w === "grenade" || p.w === "mirv") { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-Math.cos(ang) * r * .9, -Math.sin(ang) * r * .9 - r * .3); ctx.quadraticCurveTo(-Math.cos(ang) * (r + 3), -Math.sin(ang) * (r + 3) - r, -Math.cos(ang) * (r + 5), -Math.sin(ang) * (r + 5) - r - 1); ctx.stroke(); ctx.fillStyle = MUSTARD; ctx.beginPath(); ctx.arc(-Math.cos(ang) * (r + 5), -Math.sin(ang) * (r + 5) - r - 1, 1.8 + Math.sin(time * 40) * .6, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    function drawTrails(dt) {
      var ids = Object.keys(trails);
      for (var k = 0; k < ids.length; k++) {
        var tr = trails[ids[k]], look = tr.look, kind = look.trail;
        for (var i = 0; i < tr.pts.length; i++) {
          var p = tr.pts[i], age = time - p.t, life = kind === "fire" ? .45 : .9;
          if (age > life) continue;
          var u = age / life;
          if (kind === "fire") { ctx.fillStyle = "rgba(255," + Math.round(200 - u * 120) + ",70," + (.8 * (1 - u)) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5 * (1 - u) + 1, 0, TAU); ctx.fill(); }
          else if (kind === "dust") { ctx.fillStyle = "rgba(214,167,126," + (.45 * (1 - u)) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, 2 + u * 4, 0, TAU); ctx.fill(); }
          else { ctx.fillStyle = "rgba(255,241,214," + (.5 * (1 - u)) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y - u * 4, 2 + u * 3.6, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(60,25,50," + (.14 * (1 - u)) + ")"; ctx.beginPath(); ctx.arc(p.x + 1, p.y - u * 4 + 1.6, 1.6 + u * 2.4, 0, TAU); ctx.fill(); }
        }
        if (time - tr.seen > 1) delete trails[ids[k]];
      }
    }

    function drawFires(list) {
      for (var i = 0; i < list.length; i++) {
        var f = list[i], fxp = SUBPX && f.x > W * 2 ? f.x / 100 : f.x, fyp = SUBPX && f.y > H * 2 ? f.y / 100 : f.y;
        var k = fr(i * 3.7 + Math.floor(fxp)), sz = f.t != null ? clamp(f.t / 40, .5, 1) : 1;
        var wob = Math.sin(time * 11 + k * 6) * 1.4;
        ctx.save(); ctx.translate(fxp, fyp);
        ctx.fillStyle = "rgba(255,120,50,.25)"; ctx.beginPath(); ctx.ellipse(0, 0, 9 * sz, 3.4, 0, 0, TAU); ctx.fill();
        [[0, 12, "#e8543c"], [0, 9, "#ff8a3d"], [0, 5.5, "#f6c76a"]].forEach(function (d, n) {
          var hh = (d[1] + Math.sin(time * 13 + k * 5 + n) * 2.2) * sz, ww = (6 - n * 1.3) * sz;
          ctx.fillStyle = d[2]; ctx.beginPath(); ctx.moveTo(-ww, 0); ctx.quadraticCurveTo(-ww * .9, -hh * .6, wob * (n ? .5 : 1), -hh); ctx.quadraticCurveTo(ww * .9, -hh * .6, ww, 0); ctx.closePath(); ctx.fill();
        });
        ctx.restore();
        if (!calm() && Math.random() < .05) P({ k: "ember", x: fxp, y: fyp - 8, vx: (Math.random() - .5) * 20, vy: -30 - Math.random() * 30, r: 1.6, life: 0, max: .8 });
      }
    }

    function drawPlane(pl) {
      ctx.save(); ctx.translate(pl.x, pl.y + Math.sin(pl.life * 5) * 3);
      ctx.fillStyle = "rgba(25,8,25,.25)"; ctx.beginPath(); ctx.ellipse(3, 14, 24, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#c8402c"; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(-24, -11); ctx.lineTo(-14, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = TOMATO; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(-24, -11); ctx.lineTo(-8, -1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = CREAM; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(-14, 0); ctx.lineTo(-24, 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e9c9a8"; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-8, -1); ctx.lineTo(-24, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (!calm() && Math.random() < .6) puff(pl.x - 24, pl.y, { r: 4, max: .9, vx: -10, gr: 6, col: "#fff1d6", a: .8 });
    }

    function drawStarShape(c, x, y, r, rot, pts, inner, jit, sd) {
      c.beginPath();
      for (var i = 0; i < pts * 2; i++) { var a = rot + i / (pts * 2) * TAU, rad = (i % 2 ? r * inner : r) * (1 + (jit ? (fr(sd + i) - .5) * jit : 0)); if (i) c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); else c.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
      c.closePath();
    }

    function drawParts(dt, wind) {
      var wf = wind * 2.6; // px/s^2 unášení kouře
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i]; p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        var u = p.life / p.max;
        if (p.k === "puff") {
          p.vx += wf * (p.wind || 0) * dt; p.vy -= p.gr * dt * .3; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy *= .985;
          var r = p.r * (.6 + u * .9), a = p.a * (1 - u * u);
          ctx.globalAlpha = a * .5; ctx.fillStyle = "#4a2f45"; ctx.beginPath(); ctx.arc(p.x + 1.6, p.y + 2.2, r, 0, TAU); ctx.fill();
          ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
          ctx.globalAlpha = a * .5; ctx.fillStyle = "#fffaf0"; ctx.beginPath(); ctx.arc(p.x - r * .28, p.y - r * .3, r * .45, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        } else if (p.k === "chunk") {
          p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx *= .995;
          var ca = u > .7 ? 1 - (u - .7) / .3 : 1;
          ctx.save(); ctx.globalAlpha = ca; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = "rgba(25,8,25,.35)"; drawChunkPoly(p, 1.2, 1.6); ctx.fill();
          ctx.fillStyle = p.col; drawChunkPoly(p, 0, 0); ctx.fill(); ctx.restore();
        } else if (p.k === "spark") {
          p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.globalAlpha = 1 - u; ctx.strokeStyle = p.col; ctx.lineWidth = p.r; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .035, p.y - p.vy * .035); ctx.stroke(); ctx.globalAlpha = 1;
        } else if (p.k === "ring") {
          var rr2 = lerp(p.r0, p.r1, 1 - Math.pow(1 - u, 3));
          ctx.globalAlpha = (1 - u) * .95; ctx.strokeStyle = p.col; ctx.lineWidth = Math.max(.8, p.w * (1 - u)); ctx.beginPath(); ctx.arc(p.x, p.y, rr2, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        } else if (p.k === "burst") {
          var e = 1 - Math.pow(1 - Math.min(1, u * 2.4), 3), sc = p.r * (.25 + .85 * e), al = u < .55 ? 1 : 1 - (u - .55) / .45;
          ctx.save(); ctx.globalAlpha = al;
          ctx.fillStyle = "rgba(25,8,25,.3)"; drawStarShape(ctx, p.x + 2, p.y + 3, sc, p.rot, p.pts, .52, .35, p.sd); ctx.fill();
          ctx.fillStyle = p.cols[0]; drawStarShape(ctx, p.x, p.y, sc, p.rot, p.pts, .52, .35, p.sd); ctx.fill();
          ctx.fillStyle = p.cols[1]; drawStarShape(ctx, p.x, p.y, sc * .68, p.rot + .12, p.pts, .55, .3, p.sd + 7); ctx.fill();
          ctx.fillStyle = p.cols[2]; drawStarShape(ctx, p.x, p.y, sc * .36, p.rot + .25, p.pts, .6, .2, p.sd + 13); ctx.fill();
          ctx.restore();
        } else if (p.k === "ember") {
          p.vy -= 20 * dt; p.vx += wf * .3 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.globalAlpha = 1 - u; ctx.fillStyle = u < .5 ? MUSTARD : "#ff8a3d"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - u * .6), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        } else if (p.k === "star") {
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 3;
          ctx.globalAlpha = 1 - u; ctx.fillStyle = p.col; drawStarShape(ctx, p.x, p.y, p.r * (1 - u * .4), p.rot, 4, .32, 0, 0); ctx.fill(); ctx.globalAlpha = 1;
        } else if (p.k === "confetti") {
          p.vy += 16 * dt; p.vy = Math.min(p.vy, 90); p.x += (p.vx + Math.sin(time * 3 + p.ph) * 30 + wf * 4) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          ctx.save(); ctx.globalAlpha = u > .8 ? 1 - (u - .8) / .2 : 1; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * .8 + .2);
          ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh); ctx.restore();
        }
      }
    }
    function drawChunkPoly(p, dx, dy) {
      ctx.beginPath();
      for (var i = 0; i < p.n; i++) { var a = i / p.n * TAU, rad = p.r * (.65 + fr(p.sd + i) * .55); ctx.lineTo(Math.cos(a) * rad + dx, Math.sin(a) * rad + dy); }
      ctx.closePath();
    }

    function textShadowed(text, x, y, size, col, align) {
      ctx.font = "400 " + size + "px " + FONT; ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = Math.max(3, size * .26); ctx.strokeStyle = "rgba(42,26,46,.92)"; ctx.strokeText(text, x, y);
      ctx.fillStyle = col; ctx.fillText(text, x, y);
    }

    function wrapText(text, maxW, font) {
      ctx.font = font; var words = text.split(/\s+/), lines = [], cur = "";
      words.forEach(function (w) { var t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
      if (cur) lines.push(cur); return lines.slice(0, 3);
    }

    function frame(scene, dtSec) {
      var dt = Math.min(dtSec || 1 / 60, 1 / 20); time += dt;
      var st = scene.state; if (!st) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      lastState = st; lastWind = scene.wind != null ? scene.wind : st.wind || 0;
      fx.forEach(function (f) { f.hit = Math.max(0, f.hit - dt); f.blink -= dt; if (f.blink < 0) f.blink = 2.4 + Math.random() * 2.6; f.recoil = Math.max(0, f.recoil - dt * 4); f.dust -= dt; f.mouth = Math.max(0, f.mouth - dt); f.shieldPing = Math.max(0, f.shieldPing - dt * 2); });
      // kola se otáčí podle ujeté vzdálenosti
      st.tanks.forEach(function (t, i) { var f = fx[i]; if (f.lastX != null && Math.abs(t.x - f.lastX) > 0.01) f.wheel += (t.x - f.lastX) / 4.6; f.lastX = t.x; });

      var key = terrainKey(st.h); if (key !== tKey) { tKey = key; drawTerrain(st.h); }

      camStep(dt);
      TS = clamp(17 / (54 * scale), .56, .7); HK = clamp(1 / (scale * 1.35), 1, 2.2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var skyDy = clamp(-(cam.y - yFit()) * scale * .35, -SKYM, SKYM);
      ctx.drawImage(skyC, 0, -SKYM + skyDy, cw, ch + SKYM * 2);
      var shx = 0, shy = 0; if (shake > .05) { shx = (Math.random() - .5) * shake * 2 * scale; shy = (Math.random() - .5) * shake * 2 * scale; shake *= Math.pow(.0016, dt); } else shake = 0;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + shx), dpr * (oy + shy));

      var focus = cam.x;
      // kopce a mraky s paralaxou
      var drawHill = function (hl) { var offx = -(focus - W / 2) * hl.par; ctx.drawImage(hl.cv, -hl.M + offx, 0, W + hl.M * 2, H); };
      drawHill(hills[0]);
      clouds.forEach(function (c) {
        c.x += (c.v * 4 + lastWind * 1.4) * dt; if (c.x > W + 160) c.x = -220; if (c.x < -240) c.x = W + 140;
        var sp = cloudSpr[c.s]; ctx.globalAlpha = .95; ctx.drawImage(sp.cv, c.x, c.y, 200 * c.sz, 100 * c.sz); ctx.globalAlpha = 1;
      });
      drawHill(hills[1]); drawHill(hills[2]);

      ctx.drawImage(terrC, 0, 0, W, H);
      drawFires(st.fires || []);

      // duchové a cíle
      if (scene.ghost && st.tanks[scene.ghost.idx]) {
        var gt = st.tanks[scene.ghost.idx], gx = scene.ghost.x, gy = H - st.h[clamp(Math.round(gx), 0, W - 1)];
        drawTank({ x: gx, y: gy, hp: gt.hp, maxHp: gt.maxHp, alive: true, color: gt.color, shield: 0 }, scene.ghost.idx, { alpha: .42, h: st.h, angle: scene.aim ? scene.aim.angle : null });
        ctx.strokeStyle = "rgba(255,241,214,.7)"; ctx.lineWidth = 2; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(gt.x, gt.y - 4); ctx.lineTo(gx, gy - 4); ctx.stroke(); ctx.setLineDash([]);
      }
      // tanky
      for (var ti = 0; ti < st.tanks.length; ti++) {
        var t = st.tanks[ti];
        var o = { h: st.h, active: scene.active === ti, angle: (scene.aim && scene.aim.idx === ti) ? scene.aim.angle : (scene.angles ? scene.angles[ti] : null) };
        if (scene.hideTank === ti) continue;
        drawTank(t, ti, o);
        prevPos[ti] = { x: t.x, y: t.y };
      }
      // zaměřovač: pravítko s ryskami a šipka síly
      if (scene.aim && st.tanks[scene.aim.idx] && st.tanks[scene.aim.idx].alive !== false) {
        var at = st.tanks[scene.aim.idx], ax = at.x, ay = at.y - 13, ang = scene.aim.angle * Math.PI / 180, pw = scene.aim.power;
        if (scene.ghost && scene.ghost.idx === scene.aim.idx) { ax = scene.ghost.x; ay = H - st.h[clamp(Math.round(ax), 0, W - 1)] - 13; }
        var uk = uiK();
        if (scene.zone) { // hranice, odkud se miri (jinde se posouva mapa)
          ctx.save(); ctx.translate(ax, ay); ctx.strokeStyle = "rgba(255,241,214," + (.2 + .08 * Math.sin(time * 3)) + ")"; ctx.lineWidth = 2 / scale; ctx.setLineDash([6 / scale, 9 / scale]); ctx.lineDashOffset = -time * 10 / scale; ctx.beginPath(); ctx.arc(0, 0, scene.zone.r, 0, TAU); ctx.stroke(); ctx.restore();
        }
        ctx.save(); ctx.translate(ax, ay); ctx.scale(uk, uk);
        ctx.strokeStyle = "rgba(255,241,214,.32)"; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(0, 0, 44, Math.PI, TAU); ctx.stroke(); ctx.setLineDash([]);
        for (var tk = 0; tk <= 180; tk += 15) { var a = tk * Math.PI / 180, big = tk % 45 === 0; ctx.strokeStyle = "rgba(255,241,214," + (big ? .6 : .3) + ")"; ctx.lineWidth = big ? 2 : 1.2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 41, -Math.sin(a) * 41); ctx.lineTo(Math.cos(a) * (big ? 50 : 47), -Math.sin(a) * (big ? 50 : 47)); ctx.stroke(); }
        var L = 44 + pw * .62, hx = Math.cos(ang), hy = -Math.sin(ang);
        ctx.strokeStyle = mix("#f6c76a", "#e8543c", clamp(pw / 100, 0, 1)); ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.setLineDash([1, 8]); ctx.beginPath(); ctx.moveTo(hx * 36, hy * 36); ctx.lineTo(hx * L, hy * L); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle; ctx.save(); ctx.translate(hx * L, hy * L); ctx.rotate(Math.atan2(hy, hx)); ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-3, -6); ctx.lineTo(-3, 6); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.restore();
      }
      // náhled dráhy
      if (scene.preview && scene.preview.length > 1) {
        var pv = scene.preview, n = pv.length, pk = Math.min(uiK(), 1.7);
        for (var pi = 2; pi < n; pi += 3) { var q = pv[pi], k2 = 1 - pi / n * .65; ctx.fillStyle = "rgba(25,8,25,.3)"; ctx.beginPath(); ctx.arc(q.x + 1, q.y + 1.5, 2.8 * pk, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,241,214," + (.9 * k2) + ")"; ctx.beginPath(); ctx.arc(q.x, q.y, 2.5 * pk, 0, TAU); ctx.fill(); }
        var le = pv[n - 1]; ctx.strokeStyle = "rgba(246,199,106,.95)"; ctx.lineWidth = 2.2 * pk; ctx.beginPath(); ctx.arc(le.x, le.y, (6 + Math.sin(time * 5) * 1) * pk, 0, TAU); ctx.moveTo(le.x - 3.5, le.y - 3.5); ctx.lineTo(le.x + 3.5, le.y + 3.5); ctx.moveTo(le.x + 3.5, le.y - 3.5); ctx.lineTo(le.x - 3.5, le.y + 3.5); ctx.stroke();
      }
      // cíl schopnosti
      if (scene.target) {
        var tx = clamp(scene.target.x, 8, W - 8), ty = H - st.h[clamp(Math.round(tx), 0, W - 1)], pulse2 = Math.sin(time * 6) * 2;
        ctx.strokeStyle = scene.target.kind === "airstrike" ? "#ff8a73" : "#9fe6e9"; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.4; ctx.lineCap = "round";
        if (scene.target.kind === "airstrike") { ctx.setLineDash([2, 7]); ctx.beginPath(); ctx.moveTo(tx, 6); ctx.lineTo(tx, ty - 10); ctx.stroke(); ctx.setLineDash([]); for (var ai = -1; ai <= 1; ai++) { var bx = tx + ai * 38; ctx.beginPath(); ctx.moveTo(bx - 6, ty - 10 - pulse2); ctx.lineTo(bx, ty - 2 - pulse2); ctx.lineTo(bx + 6, ty - 10 - pulse2); ctx.stroke(); } }
        else { ctx.beginPath(); ctx.arc(tx, ty - 16, 17 + pulse2, 0, TAU); ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty - 16, 3, 0, TAU); ctx.fill(); }
      }
      // projektily, stopy, částice, letadla
      drawTrails(dt);
      (st.proj || []).forEach(function (p) { drawProjectile(p, dt); });
      for (var pl = planes.length - 1; pl >= 0; pl--) { var plane = planes[pl]; plane.life += dt; plane.x += plane.vx * dt; if (plane.x > W + 120 || plane.life > 4) { planes.splice(pl, 1); continue; } drawPlane(plane); }
      drawParts(dt, lastWind);

      // plovoucí texty
      for (var ti2 = texts.length - 1; ti2 >= 0; ti2--) {
        var tx2 = texts[ti2]; tx2.life += dt; if (tx2.life > tx2.max) { texts.splice(ti2, 1); continue; }
        var u2 = tx2.life / tx2.max, e2 = 1 - Math.pow(1 - Math.min(1, u2 * 3), 3);
        ctx.globalAlpha = u2 > .7 ? 1 - (u2 - .7) / .3 : 1;
        var pop = (1 + (1 - e2) * .6) * Math.min(HK, 1.8); textShadowed(tx2.text, tx2.x, tx2.y - e2 * 26 - u2 * 12, tx2.size * pop, tx2.col);
        ctx.globalAlpha = 1;
      }

      // HP ukazatele nad tanky a značka na tahu
      for (var hi = 0; hi < st.tanks.length; hi++) {
        var ht = st.tanks[hi]; if (!ht || ht.alive === false || ht.hp <= 0) continue;
        var hp = clamp(ht.hp / (ht.maxHp || 100), 0, 1), bx2 = ht.x, by2 = ht.y - 40 * TS - 10 * HK, bw = 40 * HK, bh = 7.5 * HK, pal = PAL[ht.color === 1 ? 1 : 0];
        ctx.fillStyle = "rgba(25,8,25,.35)"; rr(ctx, bx2 - bw / 2 - 1, by2 - bh / 2 - 1.2, bw + 2, bh + 2, (bh + 2) / 2); ctx.fill();
        ctx.fillStyle = "#1f1223"; rr(ctx, bx2 - bw / 2, by2 - bh / 2, bw, bh, bh / 2); ctx.fill();
        if (hp > 0) { ctx.fillStyle = hp < .3 ? "#f2795f" : hp < .55 ? MUSTARD : pal.light; rr(ctx, bx2 - bw / 2, by2 - bh / 2, Math.max(bh * .7, bw * hp), bh, bh / 2); ctx.fill(); }
        if (scene.active === hi) {
          var bounce = Math.abs(Math.sin(time * 4)) * 5 * HK, mw = 7 * HK, mh = 10 * HK, my = by2 - bh / 2 - 3 * HK - bounce;
          ctx.fillStyle = "rgba(25,8,25,.35)"; ctx.beginPath(); ctx.moveTo(bx2 - mw, my - mh + 1.5); ctx.lineTo(bx2 + mw, my - mh + 1.5); ctx.lineTo(bx2, my + 1.5); ctx.closePath(); ctx.fill();
          ctx.fillStyle = MUSTARD; ctx.beginPath(); ctx.moveTo(bx2 - mw, my - mh); ctx.lineTo(bx2 + mw, my - mh); ctx.lineTo(bx2, my); ctx.closePath(); ctx.fill();
        }
      }

      // bublina s poznámkou (v pixelech obrazovky, aby text zůstal čitelný)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (var ei = 0; ei < st.tanks.length; ei++) { var et = st.tanks[ei]; if (et && et.alive !== false && et.hp > 0) edgeMarker(et, ei, scene.names); }
      if (scene.bubble && st.tanks[scene.bubble.idx]) {
        var bt = st.tanks[scene.bubble.idx], sp = toScreenLocal(bt.x, bt.y - 72);
        var font = "400 15px " + FONT, lines = wrapText(scene.bubble.text, Math.min(200, cw * .55), font);
        ctx.font = font; var wmax = 0; lines.forEach(function (l) { wmax = Math.max(wmax, ctx.measureText(l).width); });
        var bw2 = wmax + 24, bh2 = lines.length * 19 + 16, bx3 = clamp(sp.x - bw2 / 2, 6, cw - bw2 - 6), by3 = Math.max(6, sp.y - bh2 - 10);
        ctx.fillStyle = "rgba(25,8,25,.3)"; rr(ctx, bx3 + 1.5, by3 + 3, bw2, bh2, 10); ctx.fill();
        ctx.fillStyle = "#fff1d6"; rr(ctx, bx3, by3, bw2, bh2, 10); ctx.fill();
        var tailx = clamp(sp.x, bx3 + 14, bx3 + bw2 - 14);
        ctx.beginPath(); ctx.moveTo(tailx - 7, by3 + bh2 - 1); ctx.lineTo(tailx + 3, by3 + bh2 - 1); ctx.lineTo(sp.x, by3 + bh2 + 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        lines.forEach(function (l, li) { ctx.fillText(l, bx3 + 12, by3 + 8 + 9.5 + li * 19); });
      }
      // papírové zrno přes celé bojiště
      if (grain) { ctx.globalAlpha = .07; ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = grain; ctx.fillRect(0, 0, cw, ch); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
    }
    function edgeMarker(t, i, names) { // znacka na kraji obrazovky, kdyz je tank mimo zaber
      var p = toScreenLocal(t.x, t.y - 18);
      var dxs = p.x < 4 ? -1 : p.x > cw - 4 ? 1 : 0, dys = p.y < 4 ? -1 : p.y > ch - 4 ? 1 : 0;
      if (!dxs && !dys) return;
      var pal = PAL[t.color === 1 ? 1 : 0], nm = (names && names[i]) || "";
      if (nm.length > 8) nm = nm.slice(0, 7) + "…";
      ctx.font = "400 14px " + FONT; var tw = ctx.measureText(nm).width, w = tw + 42, h = 30;
      var x = clamp(p.x, w / 2 + 16, cw - w / 2 - 16), y = clamp(p.y, 112, Math.max(112, ch - 96));
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = "rgba(25,8,25,.35)"; rr(ctx, -w / 2 + 1.5, -h / 2 + 3, w, h, 9); ctx.fill();
      ctx.fillStyle = CREAM; rr(ctx, -w / 2, -h / 2, w, h, 9); ctx.fill();
      ctx.fillStyle = pal.body; ctx.beginPath();
      if (dxs) { var ax = dxs * w / 2; ctx.moveTo(ax + dxs * 10, 0); ctx.lineTo(ax - dxs, -9); ctx.lineTo(ax - dxs, 9); }
      else { var ay = dys * h / 2; ctx.moveTo(0, ay + dys * 10); ctx.lineTo(-9, ay - dys); ctx.lineTo(9, ay - dys); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = pal.body; ctx.beginPath(); ctx.arc(-w / 2 + 15, 0, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.light; ctx.beginPath(); ctx.arc(-w / 2 + 13, -2, 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(nm, -w / 2 + 28, 1);
      ctx.restore();
    }
    function tankTop(t) { return t.y - 40 * TS - 10 * HK - 3.75 * HK - 3 * HK - 10 * HK; }
    function toScreenLocal(x, y) { return { x: ox + x * scale, y: oy + y * scale }; }

    return { camera: camera, setView: setView, nudge: nudge, zoomAt: zoomAt, fitAll: fitAll, homeZoom: homeZoom, limits: limits, pannable: pannable, uiK: uiK, tankTop: tankTop, resize: resize, frame: frame, event: event, reset: reset, invalidate: function () { tKey = ""; }, toWorld: toWorld, toScreen: toScreen, scaleNow: function () { return scale; }, size: function () { return { w: cw, h: ch }; }, setSubPx: function (v) { SUBPX = !!v; }, PAL: PAL };
  }

  window.TankRender = { create: create, W: W, H: H, PAL: PAL };
})();
