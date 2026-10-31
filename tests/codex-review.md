`node tests/engine.test.cjs`: **136 PASS, 0 FAIL**. An additional **4,620 border/weapon cases** completed, maximum 553 ticks. No files changed.

Repros use `E=require("./src/engine.js")`, fresh `s=E.newMatch({seed:1})`, and `I={weapon:"grenade",vx:-1000,vy:0}`.

1. **P1 — Inherited catalog keys permit crashes, free purchases and JSON desync.** [src/engine.js:126](</C:/Users/le artist/Desktop/react-apps/tancicky/src/engine.js:126>), lines 273–295, 322, 651.  
   **Repro:** `E.validate(s,{...I,buy:["up:constructor"]})` throws. `buy:["w:constructor","w:nuke","up:armor"]` passes and produces `coins=NaN`, bypassing prices. `ability:"toString"` passes and creates an undefined cooldown; serialization drops it and changes the hash.  
   **Fix:** Use null-prototype catalogs and explicit own-key membership checks everywhere. Reject unknown IDs before accessing definitions.

2. **P1 — Weapon lookup coerces an untrusted object before checking its type.** [src/engine.js:333](</C:/Users/le artist/Desktop/react-apps/tancicky/src/engine.js:333>).  
   **Repro:** `E.validate(s,{weapon:{toString:null},vx:0,vy:0})` throws `TypeError: Cannot convert object to primitive value`. This payload is ordinary JSON.  
   **Fix:** Check `typeof input.weapon === "string"` before indexing `WMAP`; malformed input must return a validation reason.

3. **P2 — The muzzle offset bypasses terrain collision.** [src/engine.js:615](</C:/Users/le artist/Desktop/react-apps/tancicky/src/engine.js:615>).  
   **Fixture:** Set `s.wind=0`, `s.h.fill(100)`, tank positions `(100,440)` and `(800,440)`. Set `s.h[110]=250`.  
   **Repro:** Fire `{weapon:"grenade",vx:1000,vy:0}`. It spawns at `(114,430)`, beyond the wall, and explodes at `(251,440)`; the wall survives untouched.  
   **Fix:** Sweep the segment from turret to muzzle against terrain before launching.

4. **P2 — Rolling projectiles skip terrain columns.** [src/engine.js:447](</C:/Users/le artist/Desktop/react-apps/tancicky/src/engine.js:447>).  
   **Repro:** Same flat fixture, with only `s.h[264]=300`; fire `{weapon:"roller",vx:1000,vy:0}`. Tick 20 moves from `(263.05,437)` to `(265.77,437)` through the ridge at x=264, whose surface is y=240.  
   **Fix:** Sweep every crossed column and resolve walls/slopes. Directly replacing projectile y with the destination surface also permits instantaneous vertical climbs.

5. **P2 — `startTurn()` retains mutable input after validation.** [src/engine.js:730](</C:/Users/le artist/Desktop/react-apps/tancicky/src/engine.js:730>).  
   **Repro:** `const i={...I}, t=E.startTurn(s,i); i.ability="teleport"; i.ax=1000000; t.finish();` finishes with tank x=1,000,000.  
   **Fix:** Copy and normalize accepted input before storing it in the turn context. This is a local asynchronous API hazard, not a standalone JSON exploit.

6. **P2 — Bot statistics conceal a complete first-player advantage.** [src/engine.js:837](</C:/Users/le artist/Desktop/react-apps/tancicky/src/engine.js:837>), [tests/engine.test.cjs:431](</C:/Users/le artist/Desktop/react-apps/tancicky/tests/engine.test.cjs:431>).  
   **Repro:** Seeds 1–20, `start:seed%2`, default `suggestShot`: **300 hits, zero misses**; damage was 38 or the remaining 24 HP. All 60 rounds ended by death after five turns; all 20 match winners were the starting player.  
   **Explanation/fix:** These are three five-turn rounds, not timeouts. Alternating the starter produces the misleading 10/10 split. Record starter-conditioned wins and termination reasons; introduce deterministic aiming error if this bot is intended as a fallible opponent.

The JSON-safety assertion at [tests/engine.test.cjs:475](</C:/Users/le artist/Desktop/react-apps/tancicky/tests/engine.test.cjs:475>) compares serialized values, hiding `NaN`, undefined properties and signed-zero changes. Compare original versus parsed state and recursively assert finite integers.

For ordinary accepted IDs, I found no additional forbidden math, untruncated physics arithmetic, harmful overflow or iteration-order instability. PRNG/hash `Math.imul` wrapping is intentional. Border runs preserved terrain bounds, settled tanks and exact final-state JSON roundtrips; out-of-range ability targets were rejected.