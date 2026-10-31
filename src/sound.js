/* Tančíky: drobné procedurální zvuky (WebAudio) a vibrace. Žádné soubory, žádné vzorky.
   Audio se spustí až po první interakci uživatele. Ztlumení se pamatuje v localStorage (klíč tanc-mute). */
(function () {
  "use strict";
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, noiseBuf = null, whistle = null, muted = false, unlocked = false;
  var KEY = "tanc-mute";
  try { muted = localStorage.getItem(KEY) === "1"; } catch (e) { muted = false; }
  var listeners = [];

  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = ctx.sampleRate * 1.2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = (Math.random() * 2 - 1) * 0.55 + last * 5; }
    noiseBuf = b; return b;
  }
  function ensure() {
    if (!AC || muted) return false;
    if (!ctx) {
      try {
        ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55;
        var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
        master.connect(comp); comp.connect(ctx.destination);
      } catch (e) { ctx = null; return false; }
    }
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) { /* nic */ } }
    return unlocked;
  }
  function unlock() {
    if (unlocked) { if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) { /* nic */ } } return; }
    unlocked = true; ensure();
  }
  ["pointerdown", "touchend", "keydown", "click"].forEach(function (ev) { window.addEventListener(ev, unlock, { capture: true, passive: true }); });

  // stavebni kameny
  function env(g, t0, a, d, peak, end) { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end || 0.0001), t0 + a + d); }
  function tone(o) { // {t, type, f0, f1, dur, a, peak, dest}
    var t0 = ctx.currentTime + (o.t || 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || "sine"; osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    env(g, t0, o.a || 0.004, o.dur, o.peak || 0.3);
    osc.connect(g); g.connect(o.dest || master); osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }
  function hiss(o) { // {t, dur, f0, f1, q, peak, type}
    var t0 = ctx.currentTime + (o.t || 0), src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise(); src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    fl.type = o.type || "lowpass"; fl.Q.value = o.q || 0.8; fl.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) fl.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    env(g, t0, o.a || 0.003, o.dur, o.peak || 0.4);
    src.connect(fl); fl.connect(g); g.connect(master); src.start(t0, Math.random() * 0.4); src.stop(t0 + o.dur + 0.05);
  }

  var SFX = {
    click: function () { tone({ type: "square", f0: 880, f1: 620, dur: 0.05, peak: 0.07 }); },
    tick: function () { tone({ type: "triangle", f0: 1250, f1: 900, dur: 0.035, peak: 0.07 }); },
    fire: function () { tone({ type: "sine", f0: 190, f1: 42, dur: 0.28, peak: 0.55 }); hiss({ dur: 0.2, f0: 2400, f1: 300, peak: 0.35 }); tone({ type: "square", f0: 320, f1: 90, dur: 0.07, peak: 0.08 }); },
    boom: function (r) { r = r || 24; var big = Math.min(1, r / 60), d = 0.35 + big * 0.6; tone({ type: "sine", f0: 120 - big * 40, f1: 30, dur: d, peak: 0.7 }); hiss({ dur: d, f0: 1800, f1: 120, peak: 0.6, q: 0.5 }); hiss({ dur: 0.12, f0: 5000, f1: 800, peak: 0.25, type: "highpass" }); },
    small: function () { tone({ type: "sine", f0: 180, f1: 60, dur: 0.14, peak: 0.35 }); hiss({ dur: 0.12, f0: 2500, f1: 400, peak: 0.28 }); },
    dirt: function () { tone({ type: "sine", f0: 240, f1: 70, dur: 0.2, peak: 0.5 }); hiss({ dur: 0.28, f0: 700, f1: 160, peak: 0.45, q: 1.2 }); tone({ t: 0.09, type: "sine", f0: 150, f1: 60, dur: 0.12, peak: 0.25 }); },
    fireburst: function () { hiss({ dur: 0.5, f0: 3200, f1: 500, peak: 0.4, type: "bandpass", q: 0.9 }); for (var i = 0; i < 7; i++) hiss({ t: 0.04 + i * 0.07 + Math.random() * 0.03, dur: 0.05, f0: 2500 + Math.random() * 2500, peak: 0.12, type: "highpass" }); tone({ type: "sine", f0: 110, f1: 45, dur: 0.3, peak: 0.4 }); },
    die: function () { SFX.boom(60); tone({ t: 0.18, type: "sawtooth", f0: 260, f1: 55, dur: 0.6, peak: 0.12 }); },
    bounce: function () { tone({ type: "triangle", f0: 520, f1: 260, dur: 0.09, peak: 0.2 }); },
    split: function () { tone({ type: "triangle", f0: 700, f1: 1200, dur: 0.09, peak: 0.16 }); tone({ t: 0.06, type: "triangle", f0: 900, f1: 1500, dur: 0.09, peak: 0.12 }); },
    hit: function () { tone({ type: "sawtooth", f0: 220, f1: 110, dur: 0.14, peak: 0.16 }); hiss({ dur: 0.08, f0: 1500, f1: 500, peak: 0.2 }); },
    shieldhit: function () { tone({ type: "sine", f0: 1400, f1: 900, dur: 0.22, peak: 0.16 }); tone({ type: "sine", f0: 2100, f1: 1500, dur: 0.18, peak: 0.08 }); },
    coin: function () { tone({ type: "triangle", f0: 988, dur: 0.1, peak: 0.2 }); tone({ t: 0.08, type: "triangle", f0: 1319, dur: 0.22, peak: 0.2 }); },
    turn: function () { tone({ type: "sine", f0: 660, dur: 0.14, peak: 0.16 }); tone({ t: 0.11, type: "sine", f0: 880, dur: 0.24, peak: 0.16 }); },
    teleport: function () { tone({ type: "sine", f0: 300, f1: 1800, dur: 0.25, peak: 0.16 }); tone({ t: 0.22, type: "sine", f0: 1800, f1: 400, dur: 0.18, peak: 0.1 }); },
    shield: function () { tone({ type: "triangle", f0: 523, dur: 0.12, peak: 0.14 }); tone({ t: 0.09, type: "triangle", f0: 784, dur: 0.12, peak: 0.14 }); tone({ t: 0.18, type: "triangle", f0: 1046, dur: 0.26, peak: 0.14 }); },
    repair: function () { [523, 659, 784].forEach(function (f, i) { tone({ t: i * 0.08, type: "triangle", f0: f, dur: 0.18, peak: 0.14 }); }); },
    plane: function () { hiss({ dur: 0.9, f0: 500, f1: 900, peak: 0.1, type: "bandpass", q: 2 }); tone({ type: "sawtooth", f0: 90, f1: 110, dur: 0.9, peak: 0.07 }); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone({ t: i * 0.11, type: "triangle", f0: f, dur: i === 3 ? 0.5 : 0.18, peak: 0.2 }); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone({ t: i * 0.16, type: "triangle", f0: f, dur: 0.3, peak: 0.16 }); }); },
    error: function () { tone({ type: "square", f0: 200, f1: 150, dur: 0.14, peak: 0.08 }); }
  };

  function play(name, arg) {
    if (!ensure() || !SFX[name]) return;
    try { SFX[name](arg); } catch (e) { /* zvuk nikdy nesmi shodit hru */ }
  }

  // pisknuti letici strely: vyska se meni podle svisle rychlosti
  function whistleOn(vy) {
    if (!ensure()) return;
    if (!whistle) {
      var osc = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      osc.type = "sine"; fl.type = "lowpass"; fl.frequency.value = 2600; g.gain.value = 0.0001;
      osc.connect(fl); fl.connect(g); g.connect(master); osc.start();
      whistle = { osc: osc, g: g };
    }
    var f = 520 + Math.max(-1, Math.min(1, vy / 900)) * -260 + 260; // klesa = vyssi tvar, stoupa = nizsi
    var t = ctx.currentTime; whistle.osc.frequency.setTargetAtTime(Math.max(300, Math.min(1500, f)), t, 0.04);
    whistle.g.gain.setTargetAtTime(0.045, t, 0.05);
  }
  function whistleOff() { if (whistle && ctx) whistle.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04); }

  function buzz(pattern) { if (muted) return; try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* nic */ } }

  function setMuted(v) {
    muted = !!v; try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch (e) { /* nic */ }
    if (muted) { whistleOff(); try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) { /* nic */ } }
    else { ensure(); }
    listeners.forEach(function (f) { f(muted); });
  }

  window.TankSound = {
    play: play, whistleOn: whistleOn, whistleOff: whistleOff, buzz: buzz, unlock: unlock,
    isMuted: function () { return muted; }, setMuted: setMuted, onMute: function (f) { listeners.push(f); },
    supported: !!AC, hasVibrate: typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  };
})();
