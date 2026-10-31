// Playtest 3 partií za sebou (bot proti botovi, jako Odveta: nový seed, začíná poražený).
// Ověřuje, že se partie liší: mapy, modifikátory, průběh. node tests/playtest3.cjs [seed]
const E = require("../src/engine.js");
let seed = parseInt(process.argv[2] || "20261031", 10) >>> 0;
const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) % 2147483646 + 1;
const games = [];
let start = 0;
for (let g = 0; g < 3; g++) {
  let s = E.newMatch({ seed: rnd(), start });
  const rounds = [], weapons = {};
  let turns = 0, rage = 0, round = -1;
  while (!s.matchOver && turns < 200) {
    if (s.round !== round) { round = s.round; rounds.push(`${s.map}/${s.mod}`); }
    const inp = E.suggestShot(s, {});
    weapons[inp.weapon] = (weapons[inp.weapon] || 0) + 1;
    const r = E.playTurn(s, inp);
    s = r.state || r;
    if (s.tanks.some(t => t.rage)) rage++;
    turns++;
  }
  games.push({ rounds: rounds.join(" → "), winner: s.winner, wins: s.wins.join(":"), turns, rageTurns: rage, hash: E.hash(s) });
  start = s.winner === 0 || s.winner === 1 ? 1 - s.winner : 1 - start;
}
games.forEach((g, i) => console.log(`partie ${i + 1}: ${g.rounds} | vítěz ${g.winner} (${g.wins}) | tahů ${g.turns} | tahů se vztekem ${g.rageTurns} | hash ${g.hash}`));
const distinct = new Set(games.map(g => g.rounds)).size === 3 && new Set(games.map(g => g.hash)).size === 3;
const firstRounds = new Set(games.map(g => g.rounds.split(" → ")[0])).size;
console.log(distinct && firstRounds >= 2 ? "PASS 3 partie se liší (mapy/modifikátory/průběh)" : "FAIL partie se opakují");
process.exit(distinct && firstRounds >= 2 ? 0 : 1);
