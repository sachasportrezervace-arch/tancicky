// Tančíky – design mockups generator (writes plain hand-tunable SVG into ../)
// node gen.cjs
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..");
const f = (n) => Math.round(n * 10) / 10;
let UID = 0;
const uid = (p) => `${p}${++UID}`;

/* ------------------------------------------------------------------ palettes */
const A = {
  sky: "#CDEBEF", far: "#B3DED1", near: "#93CFB8", sun: "#FFF4D2",
  ground: "#F2B36B", lip: "#6BBD73", deep: "#DD9452",
  ink: "#2B2242", cream: "#FFF9EE", line: "#EADFCB", accent: "#FFC93C", accentDeep: "#E9A913",
  tread: "#3A3152", wheel: "#5D5279", blush: "#FF9C93", tongue: "#FF7A85", sweat: "#7FD3F0",
  p1: { main: "#F25A45", shade: "#C9412F", light: "#FFB3A3", pale: "#FFE3DC", name: "Mark" },
  p2: { main: "#7B61F2", shade: "#5A43CC", light: "#C4B6FF", pale: "#ECE7FF", name: "Radka" },
};
const B = {
  sky: "#3A57E3", far: "#2F49C8", near: "#2539AA", moon: "#FFF1C7",
  ground: "#FFC23A", lip: "#FFF0B8", deep: "#EC9A10",
  ink: "#1C1633", cream: "#FFF6E3", accent: "#FFC23A",
  tread: "#1C1633", wheel: "#4A4268", blush: "#FF8F87", tongue: "#FF6B7A", sweat: "#9BE7FF",
  p1: { main: "#FF5B3A", shade: "#D23E1E", light: "#FFB19E", pale: "#FFE1D8", name: "Mark" },
  p2: { main: "#2FD3A4", shade: "#159E78", light: "#A6F2DB", pale: "#DDFBF1", name: "Radka" },
};

const FONT_A = `@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&amp;display=swap');`;
const FONT_B = `@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800&amp;display=swap');`;

const svgOpen = (w, h, font, css, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">\n<title>${title}</title>\n<defs><style>${font}\n${css}</style></defs>\n`;

/* ------------------------------------------------------------------ eyes / faces (shared logic, two styles) */
// cx,cy = eye centre in local tank coords; side -1 = rear eye, +1 = front eye
function eye(S, P, cx, cy, rx, ry, face, side, stroke) {
  const ink = S.ink;
  const sw = stroke ? ` stroke="${ink}" stroke-width="2.6"` : "";
  if (face === "blink") return `<path d="M${f(cx - rx * 0.8)} ${cy} Q${cx} ${cy + 5} ${f(cx + rx * 0.8)} ${cy}" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>`;
  if (face === "win") return `<path d="M${f(cx - rx * 0.75)} ${cy + 3} Q${cx} ${cy - 9} ${f(cx + rx * 0.75)} ${cy + 3}" fill="none" stroke="${ink}" stroke-width="3.8" stroke-linecap="round"/>`;
  if (face === "hit") {
    const d = side < 0 ? `M${cx - 6} ${cy - 7} L${cx + 5} ${cy} L${cx - 6} ${cy + 7}` : `M${cx + 6} ${cy - 7} L${cx - 5} ${cy} L${cx + 6} ${cy + 7}`;
    return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  let px = cx + 2.6, py = cy + 1.2;
  if (face === "aim") { px = cx + 3.6; py = cy - 1.5; }
  if (face === "worry") { px = cx - 3; py = cy + 2.5; }
  let s = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#FFFFFF"${sw}/>`;
  s += `<circle cx="${f(px)}" cy="${f(py)}" r="${f(rx * 0.52)}" fill="${ink}"/>`;
  s += `<circle cx="${f(px - 1.6)}" cy="${f(py - 2.2)}" r="1.9" fill="#FFFFFF"/>`;
  if (face === "aim") {
    // focused lid: flat slanted cut in hull colour
    const id = uid("ec");
    const top = cy - ry - 3, a = cy - ry * (side < 0 ? 0.52 : 0.2), b = cy - ry * (side < 0 ? 0.2 : 0.52);
    s += `<clipPath id="${id}"><ellipse cx="${cx}" cy="${cy}" rx="${rx + (stroke ? 1.3 : 0)}" ry="${ry + (stroke ? 1.3 : 0)}"/></clipPath>`;
    s += `<g clip-path="url(#${id})"><path d="M${cx - rx - 3} ${top} H${cx + rx + 3} V${f(b)} L${cx - rx - 3} ${f(a)} Z" fill="${P.main}"/>`;
    s += `<path d="M${cx - rx - 3} ${f(a - (b - a) * 0.15)} L${cx + rx + 3} ${f(b + (b - a) * 0.15)}" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/></g>`;
  }
  if (face === "worry") {
    const id = uid("ec");
    const a = cy - ry * (side < 0 ? 0.3 : 0.62), b = cy - ry * (side < 0 ? 0.62 : 0.3);
    s += `<clipPath id="${id}"><ellipse cx="${cx}" cy="${cy}" rx="${rx + (stroke ? 1.3 : 0)}" ry="${ry + (stroke ? 1.3 : 0)}"/></clipPath>`;
    s += `<g clip-path="url(#${id})"><path d="M${cx - rx - 3} ${cy - ry - 3} H${cx + rx + 3} V${f(b)} L${cx - rx - 3} ${f(a)} Z" fill="${P.main}"/><path d="M${cx - rx - 3} ${f(a)} L${cx + rx + 3} ${f(b)}" stroke="${ink}" stroke-width="3" stroke-linecap="round"/></g>`;
  }
  return s;
}

function mouth(S, face, x, y, who, w = 12) {
  const ink = S.ink;
  if (face === "hit") return `<ellipse cx="${x}" cy="${y + 1}" rx="4.6" ry="5.4" fill="${ink}"/><ellipse cx="${x}" cy="${y + 3.6}" rx="3" ry="2" fill="${S.tongue}"/>`;
  if (face === "win") return `<path d="M${x - w / 2 - 1} ${y - 3.5} H${x + w / 2 + 1} Q${x + w / 2 + 1} ${y + 7} ${x} ${y + 7} Q${x - w / 2 - 1} ${y + 7} ${x - w / 2 - 1} ${y - 3.5} Z" fill="${ink}"/><path d="M${x - 3.6} ${y + 5.6} Q${x} ${y + 1} ${x + 3.6} ${y + 5.6} Q${x} ${y + 7.4} ${x - 3.6} ${y + 5.6}Z" fill="${S.tongue}"/>`;
  if (face === "aim") return `<path d="M${x - w / 2} ${y} H${x + w / 2 - 2}" stroke="${ink}" stroke-width="2.8" stroke-linecap="round"/><path d="M${x + w / 2 - 5} ${y} q1 5 4.5 4.5 q2.5 -0.6 1.5 -4.5 Z" fill="${S.tongue}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
  if (face === "worry") return `<path d="M${x - w / 2 + 1} ${y + 2} q${w / 4} -3 ${w / 2 - 1} 0 q${w / 4} 3 ${w / 2 - 1} 0" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
  if (who === "p2") return `<path d="M${x - w / 2} ${y} Q${x + 1} ${y + 4.5} ${x + w / 2 + 1} ${y - 2.6}" fill="none" stroke="${ink}" stroke-width="2.8" stroke-linecap="round"/>`;
  return `<path d="M${x - w / 2} ${y - 0.5} Q${x} ${y + 4} ${x + w / 2} ${y - 0.5}" fill="none" stroke="${ink}" stroke-width="2.8" stroke-linecap="round"/>`;
}

function extras(S, face, who, stroke) {
  let s = "";
  if (face === "hit") {
    s += `<path d="M-30 -74 q-5 8 0 10 q5 -2 0 -10Z" fill="${S.sweat}"${stroke ? ` stroke="${S.ink}" stroke-width="2"` : ""}/>`;
    s += `<path d="M-42 -62 q-4 6 0 8 q4 -2 0 -8Z" fill="${S.sweat}"${stroke ? ` stroke="${S.ink}" stroke-width="2"` : ""}/>`;
    s += `<path d="M44 -74 l6 -8 M52 -64 l9 -3 M40 -82 l1 -9" stroke="${S.ink}" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (face === "win") {
    const st = (x, y, r, c) => `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="${c}"/>`;
    s += st(-48, -70, 7, S.accent) + st(52, -78, 9, S.accent) + st(60, -54, 5, "#FFFFFF");
  }
  return s;
}

/* ------------------------------------------------------------------ Direction A tank: flat, no outlines, gumdrop */
function tankA(o) {
  const S = A, P = S[o.who], who = o.who, face = o.face || "idle";
  const id = uid("ta");
  const ang = o.angle ?? 48;
  const tall = who === "p2";
  const top = tall ? -78 : -62;
  const hull = tall
    ? "M-40 -20 H40 C44 -20 45 -26 44 -34 C41 -64 24 -78 0 -78 C-24 -78 -41 -64 -44 -34 C-45 -26 -44 -20 -40 -20Z"
    : "M-48 -20 H48 C51 -20 52 -24 51 -30 C47 -52 29 -62 0 -62 C-29 -62 -47 -52 -51 -30 C-52 -24 -51 -20 -48 -20Z";
  const tw = tall ? 42 : 51;
  let g = "";
  if (tall) g += `<path d="M-20 -70 Q-28 -86 -34 -98" fill="none" stroke="${S.tread}" stroke-width="3" stroke-linecap="round"/><circle cx="-34" cy="-100" r="7.5" fill="${S.accent}"/><circle cx="-36.5" cy="-102.5" r="2.3" fill="#FFFFFF" opacity=".75"/>`;
  g += `<g transform="translate(10 ${top + 13}) rotate(${-ang})"><rect x="0" y="-5.5" width="42" height="11" rx="5.5" fill="${P.shade}"/><rect x="35" y="-7.5" width="10" height="15" rx="4" fill="${S.tread}"/></g>`;
  g += `<rect x="${-tw}" y="-22" width="${tw * 2}" height="22" rx="11" fill="${S.tread}"/>`;
  const wheels = tall ? [-26, 0, 26] : [-34, -11.5, 11.5, 34];
  for (const x of wheels) g += `<circle cx="${x}" cy="-11" r="6.6" fill="${S.wheel}"/><circle cx="${x}" cy="-11" r="2.3" fill="${S.tread}"/>`;
  g += `<path d="${hull}" fill="${P.main}"/>`;
  g += `<rect x="${-tw - 2}" y="-27" width="${tw * 2 + 4}" height="8" rx="4" fill="${P.shade}"/>`;
  g += tall
    ? `<path d="M-30 -52 Q-26 -66 -12 -72" fill="none" stroke="${P.light}" stroke-width="4.5" stroke-linecap="round"/>`
    : `<path d="M-36 -44 Q-28 -56 -14 -59" fill="none" stroke="${P.light}" stroke-width="4.5" stroke-linecap="round"/>`;
  const ey = tall ? -50 : -44, rx = 11, ry = tall ? 13.5 : 12;
  const e1 = tall ? 0 : 2, e2 = tall ? 23 : 26;
  if (!tall) g += `<g transform="translate(-27 -47) rotate(-34)"><rect x="-10" y="-4" width="20" height="8" rx="4" fill="${S.cream}"/><rect x="-3.5" y="-4" width="7" height="8" fill="${S.line}"/></g>`;
  g += `<ellipse cx="${e1 - 12}" cy="${ey + 14}" rx="4.8" ry="2.7" fill="${S.blush}"/><ellipse cx="${e2 + 12}" cy="${ey + 14}" rx="3.6" ry="2.4" fill="${S.blush}"/>`;
  if (tall) g += `<circle cx="${e1 - 16}" cy="${ey + 9}" r="1.3" fill="${P.shade}"/><circle cx="${e1 - 12}" cy="${ey + 7.5}" r="1.3" fill="${P.shade}"/><circle cx="${e1 - 8}" cy="${ey + 9.5}" r="1.3" fill="${P.shade}"/>`;
  g += eye(S, P, e1, ey, rx, ry, face, -1) + eye(S, P, e2, ey, rx, ry, face, 1);
  if (!tall && face !== "win" && face !== "blink") {
    const lift = face === "aim" ? 3 : face === "hit" ? -2 : 0;
    const r1 = face === "aim" ? 16 : face === "hit" ? -16 : face === "worry" ? -14 : 6;
    g += `<rect x="${e1 - 9}" y="${ey - 20 + lift}" width="18" height="5.5" rx="2.75" fill="${S.ink}" transform="rotate(${r1} ${e1} ${ey - 17 + lift})"/>`;
    g += `<rect x="${e2 - 9}" y="${ey - 20 + lift}" width="18" height="5.5" rx="2.75" fill="${S.ink}" transform="rotate(${-r1} ${e2} ${ey - 17 + lift})"/>`;
  }
  if (tall && face !== "hit" && face !== "win") g += `<path d="M${e1 - 9} ${ey - 10} l-5.5 -4 M${e1 - 5} ${ey - 13} l-3 -5 M${e2 + 9} ${ey - 10} l5.5 -4 M${e2 + 5} ${ey - 13} l3 -5" stroke="${S.ink}" stroke-width="2.6" stroke-linecap="round"/>`;
  g += mouth(S, face, tall ? 12 : 14, tall ? -32.5 : -31, who);
  g += extras(S, face, who, false);
  return wrap(o, g, id);
}

/* ------------------------------------------------------------------ Direction B tank: ink outline, distinct silhouettes */
function tankB(o) {
  const S = B, P = S[o.who], who = o.who, face = o.face || "idle";
  const id = uid("tb");
  const ang = o.angle ?? 48;
  const box = who === "p1";
  const sT = (w = 3.2) => `stroke="${S.ink}" stroke-width="${w}" stroke-linejoin="round"`; const st = sT();
  let g = "";
  if (!box) g += `<path d="M-14 -66 Q-18 -78 -10 -86" fill="none" stroke="${S.ink}" stroke-width="3.2" stroke-linecap="round"/><circle cx="-8" cy="-89" r="6.5" fill="${S.accent}" ${st}/>`;
  const piv = box ? [14, -64] : [10, -52];
  g += `<g transform="translate(${piv[0]} ${piv[1]}) rotate(${-ang})"><rect x="0" y="-5.5" width="44" height="11" rx="3" fill="${P.shade}" ${st}/><rect x="36" y="-8" width="11" height="16" rx="3" fill="${S.cream}" ${st}/></g>`;
  // tread
  g += `<rect x="-48" y="-22" width="96" height="21" rx="10.5" fill="${S.wheel}" ${st}/>`;
  for (const x of [-32, -11, 11, 32]) g += `<circle cx="${x}" cy="-11.5" r="6" fill="${S.cream}" ${sT(2.6)}/>`;
  if (box) {
    g += `<path d="M-44 -60 Q-56 -66 -64 -62 Q-58 -58 -60 -52 Q-52 -56 -44 -54Z" fill="${S.cream}" ${sT(2.6)}/>`;
    g += `<rect x="-44" y="-68" width="88" height="50" rx="13" fill="${P.main}" ${st}/>`;
    g += `<path d="M-44 -31 H44 V-26 Q44 -18 36 -18 H-36 Q-44 -18 -44 -26Z" fill="${P.shade}" ${st}/>`;
    // cap with brim
    g += `<path d="M-44.5 -66 Q0 -70 44.5 -66 V-58 Q0 -62 -44.5 -58Z" fill="${S.cream}" ${sT(2.6)}/>`;
    g += `<circle cx="-24" cy="-62.5" r="1.6" fill="${P.main}"/><circle cx="-6" cy="-63.5" r="1.6" fill="${P.main}"/><circle cx="12" cy="-63.5" r="1.6" fill="${P.main}"/><circle cx="30" cy="-62.5" r="1.6" fill="${P.main}"/>`;
    g += `<path d="M-30 -44 L-36 -40 M-26 -38 L-33 -35" stroke="${P.shade}" stroke-width="2.4" stroke-linecap="round"/>`;
  } else {
    g += `<path d="M-42 -19 H42 Q46 -19 45 -26 C42 -54 25 -68 0 -68 C-25 -68 -42 -54 -45 -26 Q-46 -19 -42 -19Z" fill="${P.main}" ${st}/>`;
    g += `<path d="M-45.2 -30 H45.2 L45 -26 Q46 -19 42 -19 H-42 Q-46 -19 -45 -26Z" fill="${P.shade}" ${st}/>`;
    g += `<path d="M-28 -50 Q-22 -60 -10 -62" fill="none" stroke="${P.light}" stroke-width="4" stroke-linecap="round"/>`;
  }
  const ey = box ? -45 : -46, rx = box ? 10 : 10.5, ry = box ? 10.5 : 12.5;
  const e1 = box ? 6 : 2, e2 = box ? 25 : 23;
  g += `<ellipse cx="${e1 - 10}" cy="${ey + 11}" rx="4.5" ry="2.6" fill="${S.blush}"/>`;
  g += eye(S, P, e1, ey, rx, ry, face, -1, true) + eye(S, P, e2, ey, rx, ry, face, 1, true);
  if (!box && (face === "idle" || face === "aim" || face === "worry")) g += `<path d="M${e1 - 8} ${ey - 10} l-5 -4 M${e2 + 8} ${ey - 10} l5 -4 M${e2 + 4} ${ey - 13} l3 -5" stroke="${S.ink}" stroke-width="2.6" stroke-linecap="round"/>`;
  if (box && face !== "win" && face !== "blink") {
    const r1 = face === "aim" ? 16 : face === "hit" ? -16 : face === "worry" ? -14 : 4;
    g += `<rect x="${e1 - 8}" y="${ey - 16}" width="16" height="5" rx="2.5" fill="${S.ink}" transform="rotate(${r1} ${e1} ${ey - 13.5})"/><rect x="${e2 - 8}" y="${ey - 16}" width="16" height="5" rx="2.5" fill="${S.ink}" transform="rotate(${-r1} ${e2} ${ey - 13.5})"/>`;
  }
  g += mouth(S, face, box ? 16 : 13, box ? -36 : -35, who, 11);
  g += extras(S, face, who, true);
  return wrap(o, g, id);
}

function wrap(o, g, id) {
  const s = o.s ?? 1, flip = o.flip ? -1 : 1, tilt = o.tilt ?? 0;
  return `<g id="${o.gid || id}" transform="translate(${f(o.x)} ${f(o.y)}) rotate(${f(tilt)}) scale(${f(s * flip)} ${f(s)})">${g}</g>`;
}

// face icon: tank head clipped in a circle
function faceIcon(T, S, who, cx, cy, r, face = "idle", flip = false, ring) {
  const id = uid("fc");
  const P = S[who];
  const sc = (r * 2) / 66;
  const ecx = T === tankA ? (who === "p2" ? 11.5 : 14) : (who === "p1" ? 15.5 : 12.5);
  const ecy = T === tankA ? (who === "p2" ? -44 : -39) : -40;
  const t = T({ who, face, x: cx - (flip ? -1 : 1) * ecx * sc, y: cy - ecy * sc, s: sc, flip, angle: 30 });
  return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${r}" fill="${P.pale}"${ring ? ` stroke="${ring}" stroke-width="3"` : ""}/><g clip-path="url(#${id})">${t}</g>${ring ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ring}" stroke-width="3"/>` : ""}`;
}

/* ------------------------------------------------------------------ icons (24 box) */
function icon(name, cx, cy, size, color, bg) {
  const k = size / 24;
  const c = color;
  const p = {
    grenade: `<circle cx="11" cy="14.5" r="7.2" fill="${c}"/><rect x="8" y="4.5" width="7" height="4.5" rx="1.5" fill="${c}"/><circle cx="18" cy="5.5" r="2.6" fill="none" stroke="${c}" stroke-width="2"/><circle cx="8.6" cy="12.6" r="1.8" fill="${bg}"/>`,
    triple: `<circle cx="5.5" cy="15" r="3.4" fill="${c}"/><circle cx="12" cy="8" r="3.4" fill="${c}"/><circle cx="18.5" cy="15" r="3.4" fill="${c}"/>`,
    mirv: `<circle cx="12" cy="7" r="4.6" fill="${c}"/><circle cx="5" cy="18" r="2.6" fill="${c}"/><circle cx="12" cy="20" r="2.6" fill="${c}"/><circle cx="19" cy="18" r="2.6" fill="${c}"/><path d="M10 11 L6.5 15.5 M12 12 V17 M14 11 L17.5 15.5" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
    roller: `<circle cx="13" cy="12" r="7.5" fill="none" stroke="${c}" stroke-width="3"/><circle cx="13" cy="12" r="2.4" fill="${c}"/><path d="M1.5 9 H4.5 M1 13 H4 M1.5 17 H4.5" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
    drill: `<path d="M5 4 H19 L12 21.5 Z" fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/><path d="M7.5 8.5 L16.5 6.8 M9 12.6 L15 11.4 M10.6 16.6 L13.6 16" stroke="${bg}" stroke-width="1.6" stroke-linecap="round"/>`,
    napalm: `<path d="M12 2.5 C16.5 7.5 19.5 10.5 19.5 15 A7.5 7.5 0 0 1 4.5 15 C4.5 11.5 7 9.8 8.2 7.4 C9.4 9.4 10 10.4 11 10.8 C11.4 8 11.2 5.4 12 2.5Z" fill="${c}"/><path d="M12 12.5 C14 14.5 15 15.5 15 17 A3 3 0 0 1 9 17 C9 15.5 10.4 14.4 12 12.5Z" fill="${bg}"/>`,
    dirt: `<path d="M2 20 C4 12 8 9 12 9 C16 9 20 12 22 20Z" fill="${c}"/><circle cx="9" cy="15" r="1.4" fill="${bg}"/><circle cx="14.5" cy="13.5" r="1.2" fill="${bg}"/>`,
    bouncer: `<circle cx="17" cy="7" r="4.5" fill="${c}"/><path d="M2 20 Q5 10 8 20 Q10.5 13 13 20" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 3.6"/>`,
    shield: `<path d="M12 2.8 L19.5 5.8 V11.8 C19.5 16.4 16.4 19.6 12 21.2 C7.6 19.6 4.5 16.4 4.5 11.8 V5.8Z" fill="${c}"/><path d="M8.5 12 L11 14.5 L15.8 9.5" fill="none" stroke="${bg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    repair: `<rect x="9.5" y="3.5" width="5" height="17" rx="2.5" fill="${c}"/><rect x="3.5" y="9.5" width="17" height="5" rx="2.5" fill="${c}"/>`,
    teleport: `<circle cx="12" cy="12" r="8" fill="none" stroke="${c}" stroke-width="2.4" stroke-dasharray="3.2 2.8" stroke-linecap="round"/><circle cx="12" cy="12" r="3.4" fill="${c}"/>`,
    calm: `<path d="M3 8 H14 A3 3 0 1 0 11 5 M3 13 H18 A3 3 0 1 1 15 16 M3 18 H10" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
    airstrike: `<path d="M21 4 L3 11 L10 13 L12 20 L15 14 Z" fill="${c}" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/>`,
    menu: `<rect x="4" y="6" width="16" height="2.6" rx="1.3" fill="${c}"/><rect x="4" y="11" width="16" height="2.6" rx="1.3" fill="${c}"/><rect x="4" y="16" width="16" height="2.6" rx="1.3" fill="${c}"/>`,
    left: `<path d="M15 5 L8 12 L15 19" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    right: `<path d="M9 5 L16 12 L9 19" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    lock: `<rect x="6" y="11" width="12" height="9" rx="2" fill="${c}"/><path d="M8.5 11 V8.5 A3.5 3.5 0 0 1 15.5 8.5 V11" fill="none" stroke="${c}" stroke-width="2.2"/>`,
  }[name];
  return `<g transform="translate(${f(cx - size / 2)} ${f(cy - size / 2)}) scale(${f(k * 100) / 100})">${p}</g>`;
}

// gift bow (small, on top of an element)
function bow(cx, cy, c, dark, k = 1, ink) {
  const st = ink ? ` stroke="${ink}" stroke-width="${2 / k}"` : "";
  return `<g transform="translate(${cx} ${cy}) scale(${k})"><path d="M0 0 C-4 -9 -15 -10 -14 -3 C-13 3 -5 2 0 0Z" fill="${c}"${st}/><path d="M0 0 C4 -9 15 -10 14 -3 C13 3 5 2 0 0Z" fill="${c}"${st}/><path d="M-1 1 L-6 10 M1 1 L6 10" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/><circle cx="0" cy="0" r="3.6" fill="${dark}"${st}/></g>`;
}

/* ------------------------------------------------------------------ terrain helpers */
function terrainFn(pts) { // pts: [[x,y],...] smooth cosine interpolation
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (x <= x1) { const t = (x - x0) / (x1 - x0); const u = (1 - Math.cos(Math.PI * t)) / 2; return y0 + (y1 - y0) * u; }
    }
    return pts[pts.length - 1][1];
  };
}
function crater(h, cx, r, depth) {
  return (x) => { const d = Math.abs(x - cx); const base = h(x); if (d >= r) return base; return base + depth * Math.sqrt(1 - (d / r) ** 2); };
}
function topPath(h, w, dy, bottom) {
  let d = `M-4 ${f(h(-4) + dy)}`;
  for (let x = 0; x <= w + 4; x += 3) d += ` L${x} ${f(h(x) + dy)}`;
  return d + ` L${w + 4} ${bottom} L-4 ${bottom} Z`;
}
function slope(h, x) { return Math.atan2(h(x + 12) - h(x - 12), 24) * 180 / Math.PI; }
function terrainLayers(S, h, w, bottom, lip = 11, deep = 78) {
  return `<path d="${topPath(h, w, 0, bottom)}" fill="${S.lip}"/><path d="${topPath(h, w, lip, bottom)}" fill="${S.ground}"/><path d="${topPath(h, w, deep, bottom)}" fill="${S.deep}"/>`;
}
function arcDots(x0, y0, angDeg, v, g, n, step, color, r0 = 4.2, flip = 1) {
  const a = angDeg * Math.PI / 180; let s = "";
  for (let i = 1; i <= n; i++) {
    const t = i * step; const x = x0 + flip * v * Math.cos(a) * t; const y = y0 - v * Math.sin(a) * t + 0.5 * g * t * t;
    const r = Math.max(1.6, r0 - i * (r0 - 1.6) / n);
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}" opacity="${f(1 - i * 0.5 / n)}"/>`;
  }
  return s;
}
function barrelTip(x, y, s, ang, piv, len, flip = 1) {
  const a = ang * Math.PI / 180;
  return [x + flip * s * (piv[0] + len * Math.cos(a)), y + s * (piv[1] - len * Math.sin(a))];
}

/* ================================================================== DIRECTION A */
const cssA = `text{font-family:'Fredoka',sans-serif;fill:${A.ink}} .b{font-weight:700} .m{font-weight:600} .r{font-weight:500}`;

function hpBarA(x, y, w, h, pct, color, fromRight) {
  const fw = Math.max(h, w * pct);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${A.line}"/><rect x="${fromRight ? x + w - fw : x}" y="${y}" width="${f(fw)}" height="${h}" rx="${h / 2}" fill="${color}"/>`;
}
function windA(cx, cy, w, val) {
  const h = 38, x = cx - w / 2;
  const bw = w - 70, bx = cx - bw / 2 - 12, by = cy + 4;
  const pct = Math.abs(val) / 15;
  let s = `<rect x="${x}" y="${cy - h / 2 + 3}" width="${w}" height="${h}" rx="${h / 2}" fill="${A.ink}" opacity=".12"/><rect x="${x}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${A.cream}"/>`;
  s += `<text x="${bx}" y="${cy - 4}" font-size="10.5" class="m" fill="${A.ink}" opacity=".6" letter-spacing=".6">VÍTR</text>`;
  s += `<rect x="${bx}" y="${by}" width="${bw}" height="6" rx="3" fill="${A.line}"/><rect x="${bx + bw / 2}" y="${by}" width="${f(bw / 2 * pct)}" height="6" rx="3" fill="${A.ink}"/><rect x="${bx + bw / 2 - 1}" y="${by - 3}" width="2" height="12" rx="1" fill="${A.ink}" opacity=".35"/>`;
  s += `<path d="M${cx + bw / 2 - 6} ${cy - 9} l9 5 l-9 5 Z" fill="${A.ink}" transform="translate(-6 -1)"/>`;
  s += `<text x="${x + w - 18}" y="${cy + 7.5}" font-size="21" class="b" text-anchor="end">${Math.abs(val)}</text>`;
  return s;
}
function roundBtnA(cx, cy, r, inner, opts = {}) {
  const fill = opts.fill || A.cream;
  return `<circle cx="${cx}" cy="${cy + 3}" r="${r}" fill="${A.ink}" opacity="${opts.shadow ?? 0.14}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${opts.ring ? ` stroke="${opts.ring}" stroke-width="3"` : ""}/>${inner}`;
}

function sceneBgA(w, h, horizon) {
  let s = `<rect width="${w}" height="${h}" fill="${A.sky}"/>`;
  s += `<circle cx="${w * 0.8}" cy="${w > 600 ? 230 : 196}" r="${w > 600 ? 58 : 34}" fill="${A.sun}"/>`;
  const far = terrainFn([[0, horizon - 40], [w * 0.22, horizon - 110], [w * 0.5, horizon - 60], [w * 0.8, horizon - 140], [w, horizon - 80]]);
  const near = terrainFn([[0, horizon + 10], [w * 0.3, horizon - 40], [w * 0.62, horizon + 20], [w * 0.88, horizon - 30], [w, horizon]]);
  s += `<path d="${topPath(far, w, 0, h)}" fill="${A.far}"/><path d="${topPath(near, w, 0, h)}" fill="${A.near}"/>`;
  return s;
}

function aimGaugeA(px, py, r, ang) {
  const a = ang * Math.PI / 180;
  const ex = px + r * Math.cos(a), ey = py - r * Math.sin(a);
  return `<path d="M${f(px + r)} ${f(py)} A${r} ${r} 0 0 0 ${f(ex)} ${f(ey)}" fill="none" stroke="${A.ink}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 6" opacity=".55"/><circle cx="${f(ex)}" cy="${f(ey)}" r="4" fill="${A.ink}" opacity=".7"/>`;
}

function aMobile() {
  const W = 390, H = 844;
  let s = svgOpen(W, H, FONT_A, cssA, "Tančíky – směr A Hřiště, telefon na výšku");
  s += sceneBgA(W, H, 410);
  let h = terrainFn([[0, 486], [70, 496], [150, 502], [214, 492], [292, 540], [350, 526], [390, 494]]);
  h = crater(h, 284, 24, 15);
  s += terrainLayers(A, h, W, H);
  // opponent off-screen marker
  s += `<g><rect x="282" y="558" width="100" height="40" rx="20" fill="${A.cream}"/>${faceIcon(tankA, A, "p2", 302, 578, 15, "worry", true)}<text x="324" y="583" font-size="14" class="m">Radka</text><path d="M368 572 l6 6 l-6 6" fill="none" stroke="${A.ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  // tank P1
  const tx = 150, ty = h(150), sc = 0.92, ang = 52, tilt = slope(h, tx);
  const [bx, by] = barrelTip(tx, ty, sc, ang - tilt, [10, -49], 46);
  s += arcDots(bx, by, ang - tilt, 116, 58, 13, 0.25, A.ink, 4.4);
  // drag guide: finger ring + dashed pull
  s += `<path d="M${tx - 14} ${ty - 34} L${tx - 82} ${ty + 30}" stroke="${A.ink}" stroke-width="2.4" stroke-dasharray="0.1 7" stroke-linecap="round" opacity=".5"/>`;
  s += `<circle cx="${tx - 88}" cy="${ty + 36}" r="20" fill="${A.cream}" opacity=".6"/><circle cx="${tx - 88}" cy="${ty + 36}" r="20" fill="none" stroke="${A.ink}" stroke-width="2.4" opacity=".5"/><circle cx="${tx - 88}" cy="${ty + 36}" r="6" fill="${A.ink}" opacity=".5"/>`;
  s += tankA({ who: "p1", face: "aim", x: tx, y: ty + 2, s: sc, angle: ang - tilt, tilt });
  s += `<path d="M${tx - 8} ${ty - 100} h16 l-8 11 Z" fill="${A.p1.main}"/>`;
  // ---------- HUD top
  s += `<rect x="12" y="17" width="366" height="54" rx="27" fill="${A.ink}" opacity=".12"/><rect x="12" y="14" width="366" height="54" rx="27" fill="${A.cream}"/>`;
  s += faceIcon(tankA, A, "p1", 41, 41, 22, "aim", false);
  s += faceIcon(tankA, A, "p2", 349, 41, 22, "worry", true);
  s += `<text x="70" y="35" font-size="13" class="m">Mark</text><text x="174" y="35" font-size="13" class="b" text-anchor="end">82</text>`;
  s += hpBarA(70, 41, 104, 12, 0.82, A.p1.main);
  s += `<text x="320" y="35" font-size="13" class="m" text-anchor="end">Radka</text><text x="216" y="35" font-size="13" class="b">57</text>`;
  s += hpBarA(216, 41, 104, 12, 0.57, A.p2.main, true);
  s += `<circle cx="195" cy="41" r="17" fill="${A.ink}"/><text x="195" y="46.5" font-size="14" class="b" text-anchor="middle" style="fill:${A.cream}">1:0</text>`;
  // row 2: turn chip, wind, menu
  s += `<rect x="12" y="84" width="88" height="34" rx="17" fill="${A.p1.main}"/><text x="56" y="106" font-size="14" class="b" text-anchor="middle" style="fill:#fff">Tvůj tah</text>`;
  s += windA(195, 101, 132, 7);
  s += roundBtnA(356, 101, 22, icon("menu", 356, 101, 22, A.ink, A.cream));
  // ---------- bottom tray
  const T = 612;
  s += `<path d="M0 ${T + 28} Q0 ${T} 28 ${T} H${W - 28} Q${W} ${T} ${W} ${T + 28} V${H} H0Z" fill="${A.cream}"/>`;
  s += `<rect x="171" y="${T + 8}" width="48" height="5" rx="2.5" fill="${A.line}"/>`;
  // row A: gift weapon
  const ra = T + 46;
  s += `<rect x="12" y="${ra - 30}" width="222" height="60" rx="30" fill="${A.p2.pale}"/>`;
  s += `<circle cx="42" cy="${ra}" r="26" fill="${A.p2.main}"/>` + icon("napalm", 42, ra + 1, 30, A.cream, A.p2.main);
  s += bow(58, ra - 22, A.accent, A.accentDeep, 0.95);
  s += `<text x="78" y="${ra - 3}" font-size="18" class="b">Napalm</text><text x="78" y="${ra + 15}" font-size="12.5" class="m" style="fill:${A.p2.shade}">dárek od Radky</text>`;
  s += `<rect x="244" y="${ra - 27}" width="134" height="54" rx="27" fill="${A.cream}" stroke="${A.ink}" stroke-width="2.4"/><circle cx="271" cy="${ra}" r="14" fill="${A.accent}"/><circle cx="271" cy="${ra}" r="9.5" fill="none" stroke="${A.accentDeep}" stroke-width="2"/><text x="271" y="${ra + 4.5}" font-size="13" class="b" text-anchor="middle">1</text><text x="292" y="${ra - 2}" font-size="14.5" class="b">Vrátit</text><text x="292" y="${ra + 13}" font-size="12" class="m" opacity=".65">dárek</text>`;
  // row B: abilities + fuel
  const rb = T + 112;
  const abil = [["shield", 0], ["teleport", 0], ["repair", 2], ["airstrike", 0]];
  abil.forEach(([n, cd], i) => {
    const cx = 36 + i * 52;
    s += `<circle cx="${cx}" cy="${rb}" r="22" fill="${cd ? A.line : "#F3EADB"}"/>` + icon(n, cx, rb, 22, A.ink, "#F3EADB").replace(/<g /, `<g opacity="${cd ? 0.35 : 1}" `);
    if (cd) s += `<circle cx="${cx + 15}" cy="${rb - 15}" r="9" fill="${A.ink}"/><text x="${cx + 15}" y="${rb - 11}" font-size="11" class="b" text-anchor="middle" style="fill:${A.cream}">${cd}</text>`;
  });
  s += `<text x="238" y="${rb - 6}" font-size="12" class="m" opacity=".65">palivo</text><text x="378" y="${rb - 6}" font-size="12" class="b" text-anchor="end">120</text>`;
  s += `<rect x="238" y="${rb + 1}" width="140" height="10" rx="5" fill="${A.line}"/><rect x="238" y="${rb + 1}" width="105" height="10" rx="5" fill="${A.ink}"/>`;
  // row C: move + readout + fire
  const rc = T + 178;
  s += roundBtnA(42, rc, 28, icon("left", 42, rc, 28, A.ink, A.cream), { fill: "#F3EADB", shadow: 0 });
  s += roundBtnA(104, rc, 28, icon("right", 104, rc, 28, A.ink, A.cream), { fill: "#F3EADB", shadow: 0 });
  s += `<text x="174" y="${rc - 12}" font-size="11.5" class="m" text-anchor="middle" opacity=".6">úhel</text><text x="174" y="${rc + 14}" font-size="27" class="b" text-anchor="middle">52°</text>`;
  s += `<text x="236" y="${rc - 12}" font-size="11.5" class="m" text-anchor="middle" opacity=".6">síla</text><text x="236" y="${rc + 14}" font-size="27" class="b" text-anchor="middle">74</text>`;
  s += `<circle cx="330" cy="${rc + 5}" r="40" fill="${A.accentDeep}"/><circle cx="330" cy="${rc}" r="40" fill="${A.accent}"/><text x="330" y="${rc + 8}" font-size="25" class="b" text-anchor="middle">Pal!</text>`;
  s += `<rect x="128" y="${H - 9}" width="134" height="5" rx="2.5" fill="${A.ink}" opacity=".25"/>`;
  return s + "</svg>\n";
}

function aDesktop() {
  const W = 1280, H = 800;
  let s = svgOpen(W, H, FONT_A, cssA, "Tančíky – směr A Hřiště, desktop");
  s += sceneBgA(W, H, 430);
  let h = terrainFn([[0, 520], [140, 500], [290, 512], [420, 566], [560, 604], [700, 596], [820, 548], [960, 516], [1100, 526], [1280, 492]]);
  h = crater(h, 620, 34, 20);
  s += terrainLayers(A, h, W, H, 13, 96);
  const sc = 1.14;
  // P2
  const ox = 975, oy = h(ox), otilt = slope(h, ox);
  s += tankA({ who: "p2", face: "worry", x: ox, y: oy + 2, s: sc, flip: true, angle: 38, tilt: otilt });
  // P1
  const tx = 290, ty = h(tx), tilt = slope(h, tx), ang = 50;
  const [bx, by] = barrelTip(tx, ty, sc, ang - tilt, [10, -49], 46);
  s += arcDots(bx, by, ang - tilt, 300, 120, 18, 0.22, A.ink, 5);
  s += tankA({ who: "p1", face: "aim", x: tx, y: ty + 2, s: sc, angle: ang - tilt, tilt });
  s += `<path d="M${tx - 9} ${ty - 118} h18 l-9 12 Z" fill="${A.p1.main}"/>`;
  // ---------- top HUD (centre)
  const cx = W / 2;
  s += `<rect x="${cx - 360}" y="25" width="720" height="64" rx="32" fill="${A.ink}" opacity=".12"/><rect x="${cx - 360}" y="21" width="720" height="64" rx="32" fill="${A.cream}"/>`;
  s += faceIcon(tankA, A, "p1", cx - 326, 53, 27, "aim", false);
  s += faceIcon(tankA, A, "p2", cx + 326, 53, 27, "worry", true);
  s += `<text x="${cx - 290}" y="47" font-size="15" class="m">Mark</text><text x="${cx - 48}" y="47" font-size="15" class="b" text-anchor="end">82</text>`;
  s += hpBarA(cx - 290, 54, 242, 14, 0.82, A.p1.main);
  s += `<text x="${cx + 290}" y="47" font-size="15" class="m" text-anchor="end">Radka</text><text x="${cx + 48}" y="47" font-size="15" class="b">57</text>`;
  s += hpBarA(cx + 48, 54, 242, 14, 0.57, A.p2.main, true);
  s += `<circle cx="${cx}" cy="53" r="22" fill="${A.ink}"/><text x="${cx}" y="60" font-size="17" class="b" text-anchor="middle" style="fill:${A.cream}">1:0</text>`;
  s += windA(cx, 118, 170, 7);
  // abilities under faces
  const ab = [["shield", 0], ["teleport", 0], ["repair", 2], ["airstrike", 0]];
  ab.forEach(([n, cd], i) => {
    const x = cx - 334 + i * 56, y = 124;
    s += roundBtnA(x, y, 24, icon(n, x, y, 24, A.ink, A.cream).replace(/<g /, `<g opacity="${cd ? 0.3 : 1}" `), { fill: cd ? A.line : A.cream });
    if (cd) s += `<circle cx="${x + 17}" cy="${y - 17}" r="9.5" fill="${A.ink}"/><text x="${x + 17}" y="${y - 13}" font-size="11.5" class="b" text-anchor="middle" style="fill:${A.cream}">${cd}</text>`;
  });
  ["shield", "teleport", "repair", "airstrike"].forEach((n, i) => {
    const x = cx + 334 - i * 42, y = 122;
    s += `<circle cx="${x}" cy="${y}" r="17" fill="${A.cream}" opacity=".7"/>` + icon(n, x, y, 18, A.p2.shade, A.cream).replace(/<g /, `<g opacity="${i === 0 ? 0.3 : 0.8}" `);
  });
  s += roundBtnA(W - 44, 50, 24, icon("menu", W - 44, 50, 22, A.ink, A.cream));
  // ---------- bottom-left: gift card (floating on deep band)
  const by0 = 716;
  s += `<rect x="28" y="${by0 + 4}" width="372" height="64" rx="32" fill="${A.ink}" opacity=".14"/><rect x="28" y="${by0}" width="372" height="64" rx="32" fill="${A.cream}"/>`;
  s += `<circle cx="60" cy="${by0 + 32}" r="26" fill="${A.p2.main}"/>` + icon("napalm", 60, by0 + 33, 30, A.cream, A.p2.main) + bow(77, by0 + 9, A.accent, A.accentDeep, 0.95);
  s += `<text x="98" y="${by0 + 29}" font-size="19" class="b">Napalm</text><text x="98" y="${by0 + 48}" font-size="13" class="m" style="fill:${A.p2.shade}">dárek od Radky · musíš ho vystřelit</text>`;
  s += `<rect x="410" y="${by0 + 4}" width="170" height="64" rx="32" fill="${A.ink}" opacity=".14"/><rect x="410" y="${by0}" width="170" height="64" rx="32" fill="${A.cream}"/><rect x="416" y="${by0 + 6}" width="158" height="52" rx="26" fill="none" stroke="${A.ink}" stroke-width="2.2"/><circle cx="446" cy="${by0 + 32}" r="15" fill="${A.accent}"/><circle cx="446" cy="${by0 + 32}" r="10" fill="none" stroke="${A.accentDeep}" stroke-width="2"/><text x="446" y="${by0 + 37}" font-size="14" class="b" text-anchor="middle">1</text><text x="470" y="${by0 + 30}" font-size="15.5" class="b">Vrátit dárek</text><text x="470" y="${by0 + 46}" font-size="12" class="m" opacity=".6">klávesa R</text>`;
  // ---------- bottom-right: move, readout, fire
  const rx0 = 772;
  s += `<rect x="${rx0}" y="${by0 + 4}" width="372" height="64" rx="32" fill="${A.ink}" opacity=".14"/><rect x="${rx0}" y="${by0}" width="372" height="64" rx="32" fill="${A.cream}"/>`;
  s += `<circle cx="${rx0 + 32}" cy="${by0 + 32}" r="24" fill="#F3EADB"/>` + icon("left", rx0 + 32, by0 + 32, 24, A.ink, A.cream);
  s += `<circle cx="${rx0 + 84}" cy="${by0 + 32}" r="24" fill="#F3EADB"/>` + icon("right", rx0 + 84, by0 + 32, 24, A.ink, A.cream);
  s += `<text x="${rx0 + 122}" y="${by0 + 27}" font-size="12" class="m" opacity=".6">palivo 120</text><rect x="${rx0 + 122}" y="${by0 + 36}" width="70" height="8" rx="4" fill="${A.line}"/><rect x="${rx0 + 122}" y="${by0 + 36}" width="52" height="8" rx="4" fill="${A.ink}"/>`;
  s += `<text x="${rx0 + 236}" y="${by0 + 24}" font-size="11.5" class="m" text-anchor="middle" opacity=".6">úhel</text><text x="${rx0 + 236}" y="${by0 + 48}" font-size="24" class="b" text-anchor="middle">50°</text>`;
  s += `<text x="${rx0 + 296}" y="${by0 + 24}" font-size="11.5" class="m" text-anchor="middle" opacity=".6">síla</text><text x="${rx0 + 296}" y="${by0 + 48}" font-size="24" class="b" text-anchor="middle">68</text>`;
  s += `<circle cx="${W - 84}" cy="${by0 + 37}" r="46" fill="${A.accentDeep}"/><circle cx="${W - 84}" cy="${by0 + 32}" r="46" fill="${A.accent}"/><text x="${W - 84}" y="${by0 + 36}" font-size="27" class="b" text-anchor="middle">Pal!</text><text x="${W - 84}" y="${by0 + 56}" font-size="11" class="m" text-anchor="middle" opacity=".65">mezerník</text>`;
  return s + "</svg>\n";
}

function tanksSheet(T, S, css, font, title, label, dir) {
  const W = 1280, H = 720;
  let s = svgOpen(W, H, font, css, title);
  const bg = dir === "A" ? S.cream : S.cream;
  s += `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  s += `<text x="48" y="64" font-size="30" class="b">${label}</text>`;
  const faces = [["idle", "klid · mrká"], ["aim", "míří · soustředění"], ["hit", "zásah · au!"], ["win", "výhra · culí se"]];
  ["p1", "p2"].forEach((who, row) => {
    const y = 260 + row * 230;
    s += `<text x="48" y="${y - 150}" font-size="16" class="m" opacity=".6">${dir === "A" ? (row ? "hráč 2 · vysoká kapka, drzý úsměšek, řasy, pihy, bambule" : "hráč 1 · široký rváč, náplast, husté obočí") : (row ? "HRÁČ 2 · KOPULE, ŘASY, BAMBULE, DRZÝ ÚSMĚŠEK" : "HRÁČ 1 · KRABICE, ČELENKA S VLAJÍCÍMI CÍPY, OBOČÍ")}</text>`;
    faces.forEach(([fc, name], i) => {
      const cx = 140 + i * 210;
      s += `<rect x="${cx - 92}" y="${y - 130}" width="184" height="176" rx="${dir === "A" ? 28 : 6}" fill="${S[who].pale}"${dir === "B" ? ` stroke="${S.ink}" stroke-width="3"` : ""}/>`;
      s += T({ who, face: fc, x: cx - 6, y: y + 12, s: 1.42, angle: fc === "aim" ? 55 : fc === "win" ? 70 : 30, tilt: fc === "hit" ? -8 : 0 });
      s += `<text x="${cx}" y="${y + 36}" font-size="14" class="m" text-anchor="middle">${name}</text>`;
    });
  });
  // gift picker
  const gx = 920, gy = 96;
  const r = dir === "A" ? 28 : 8;
  s += `<rect x="${gx}" y="${gy}" width="312" height="${dir === "A" ? 470 : 470}" rx="${r}" fill="${dir === "A" ? "#FFFFFF" : S.ink}"${dir === "A" ? ` stroke="${S.line}" stroke-width="2"` : ""}/>`;
  const tc = dir === "A" ? S.ink : S.cream;
  s += `<text x="${gx + 28}" y="${gy + 50}" font-size="23" class="b" style="fill:${tc}">Vyber Radce dárek</text><text x="${gx + 28}" y="${gy + 76}" font-size="14" class="m" style="fill:${tc}" opacity=".65">tuhle zbraň příště musí vystřelit</text>`;
  const opts = [["napalm", "Napalm", "hoří tři tahy"], ["roller", "Válec", "kutálí se z kopce"], ["dirt", "Hlína", "zasype, nezraní"]];
  opts.forEach(([ic, n, d], i) => {
    const y = gy + 120 + i * 92, sel = i === 0;
    if (dir === "A") {
      s += `<rect x="${gx + 20}" y="${y - 34}" width="272" height="72" rx="36" fill="${sel ? S.p2.pale : "#F7F0E4"}"${sel ? ` stroke="${S.p2.main}" stroke-width="3"` : ""}/>`;
      s += `<circle cx="${gx + 56}" cy="${y + 2}" r="26" fill="${sel ? S.p2.main : S.cream}"/>` + icon(ic, gx + 56, y + 3, 28, sel ? S.cream : S.ink, sel ? S.p2.main : S.cream);
      if (sel) s += bow(gx + 73, y - 20, S.accent, S.accentDeep, 0.9);
      s += `<text x="${gx + 96}" y="${y}" font-size="18" class="b">${n}</text><text x="${gx + 96}" y="${y + 19}" font-size="13" class="m" opacity=".6">${d}</text>`;
    } else {
      s += `<rect x="${gx + 20}" y="${y - 34}" width="272" height="72" rx="8" fill="${sel ? S.p2.main : "transparent"}" stroke="${sel ? S.cream : S.wheel}" stroke-width="3"/>`;
      s += giftWrapB(gx + 56, y + 2, 25, ic, sel);
      s += `<text x="${gx + 96}" y="${y}" font-size="19" class="b" style="fill:${sel ? S.ink : S.cream}">${n.toUpperCase()}</text><text x="${gx + 96}" y="${y + 19}" font-size="13" class="m" style="fill:${sel ? S.ink : S.cream}" opacity=".75">${d}</text>`;
    }
  });
  const by = gy + 400;
  if (dir === "A") s += `<rect x="${gx + 20}" y="${by - 28}" width="272" height="56" rx="28" fill="${S.accent}"/><text x="${gx + 156}" y="${by + 7}" font-size="19" class="b" text-anchor="middle">Zabalit a poslat</text>`;
  else s += `<rect x="${gx + 20}" y="${by - 28}" width="272" height="56" rx="28" fill="${S.p1.main}" stroke="${S.cream}" stroke-width="3"/><text x="${gx + 156}" y="${by + 7}" font-size="20" class="b" text-anchor="middle" style="fill:${S.ink}">ZABALIT A POSLAT</text>`;
  s += `<text x="${gx}" y="${gy + 510}" font-size="13" class="m" opacity=".6">Po každé ráně: 3 náhodné zbraně, vybereš jednu.</text>`;
  s += `<text x="${gx}" y="${gy + 530}" font-size="13" class="m" opacity=".6">Soupeř ji má jako vynucenou + žeton „Vrátit dárek“.</text>`;
  return s + "</svg>\n";
}

/* ================================================================== DIRECTION B */
const cssB = `text{font-family:'Bricolage Grotesque',sans-serif;font-stretch:80%;fill:${B.ink}} .b{font-weight:800} .m{font-weight:600}`;
const sB = (w = 3) => `stroke="${B.ink}" stroke-width="${w}" stroke-linejoin="round"`;
const stB = sB();

function giftWrapB(cx, cy, r, ic, sel) {
  const id = uid("gw");
  let s = `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${sel ? B.cream : B.p2.main}"/>`;
  s += icon(ic, cx, cy + 1, r * 1.12, B.ink, sel ? B.cream : B.p2.main);
  s += `<g clip-path="url(#${id})"><rect x="${cx + r * 0.42}" y="${cy - r}" width="${r * 0.32}" height="${r * 2}" fill="${B.p1.main}" stroke="${B.ink}" stroke-width="2.4"/></g>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ${stB}/>`;
  s += bow(cx + r * 0.58, cy - r + 2, B.p1.main, B.p1.shade, 0.8, B.ink);
  return s;
}
function hpBarB(x, y, w, h, pct, color, fromRight) {
  const fw = w * pct;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${B.wheel}"/>`;
  s += `<rect x="${fromRight ? x + w - fw : x}" y="${y}" width="${f(fw)}" height="${h}" rx="${h / 2}" fill="${color}"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="none" stroke="${B.cream}" stroke-width="2.4"/>`;
  return s;
}
function windB(cx, cy, w, val) {
  let s = `<text x="${cx}" y="${cy - 14}" font-size="11" class="b" text-anchor="middle" letter-spacing="1.5" style="fill:${B.cream}" opacity=".7">VÍTR</text>`;
  const bw = w, bx = cx - bw / 2;
  s += `<rect x="${bx}" y="${cy - 4}" width="${bw}" height="10" rx="5" fill="${B.wheel}"/><rect x="${cx}" y="${cy - 4}" width="${f(bw / 2 * Math.abs(val) / 15)}" height="10" rx="5" fill="${B.accent}"/><rect x="${cx - 1.5}" y="${cy - 8}" width="3" height="18" rx="1.5" fill="${B.cream}"/>`;
  s += `<path d="M${cx + 2} ${cy + 18} h20 l-6 -6 M${cx + 22} ${cy + 18} l-6 6" fill="none" stroke="${B.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<text x="${cx - 4}" y="${cy + 26}" font-size="22" class="b" text-anchor="end" style="fill:${B.cream}">${Math.abs(val)}</text>`;
  return s;
}
function sceneBgB(w, h, horizon) {
  let s = `<rect width="${w}" height="${h}" fill="${B.sky}"/>`;
  s += w > 600 ? `<circle cx="${w * 0.7}" cy="${horizon - 230}" r="64" fill="${B.moon}" ${stB}/>` : `<circle cx="${w * 0.52}" cy="${horizon - 190}" r="30" fill="${B.moon}" ${stB}/>`;
  const far = terrainFn([[0, horizon - 70], [w * 0.25, horizon - 140], [w * 0.55, horizon - 60], [w * 0.82, horizon - 150], [w, horizon - 90]]);
  const near = terrainFn([[0, horizon], [w * 0.35, horizon - 60], [w * 0.65, horizon + 10], [w * 0.9, horizon - 40], [w, horizon - 10]]);
  s += `<path d="${topPath(far, w, 0, h)}" fill="${B.far}" ${stB}/><path d="${topPath(near, w, 0, h)}" fill="${B.near}" ${stB}/>`;
  return s;
}
function terrainB(h, w, bottom) {
  return `<path d="${topPath(h, w, 0, bottom)}" fill="${B.lip}" ${stB}/><path d="${topPath(h, w, 10, bottom)}" fill="${B.ground}"/><path d="M-4 ${f(h(-4) + 10)}${(() => { let d = ""; for (let x = 0; x <= w + 4; x += 3) d += ` L${x} ${f(h(x) + 10)}`; return d; })()}" fill="none" ${stB}/><path d="${topPath(h, w, 84, bottom)}" fill="${B.deep}" ${stB}/>`;
}
function bubbleB(x, y, a, p) {
  return `<g transform="translate(${x} ${y})"><path d="M-62 -26 H62 Q70 -26 70 -18 V6 Q70 14 62 14 H12 L-2 30 L0 14 H-62 Q-70 14 -70 6 V-18 Q-70 -26 -62 -26Z" fill="${B.cream}" ${stB}/><text x="-8" y="2" font-size="22" class="b" text-anchor="end">${a}°</text><text x="2" y="2" font-size="22" class="b" opacity=".35">/</text><text x="14" y="2" font-size="22" class="b" style="fill:${B.p1.shade}">${p}</text></g>`;
}

function bMobile() {
  const W = 390, H = 844;
  let s = svgOpen(W, H, FONT_B, cssB, "Tančíky – směr B Komiks, telefon na výšku");
  s += sceneBgB(W, H, 470);
  let h = terrainFn([[0, 556], [70, 566], [140, 570], [200, 556], [280, 596], [340, 582], [390, 548]]);
  h = crater(h, 276, 24, 16);
  s += terrainB(h, W, H);
  // abilities rail (left)
  const ab = [["shield", 0], ["teleport", 0], ["repair", 2], ["airstrike", 0]];
  ab.forEach(([n, cd], i) => {
    const y = 140 + i * 56;
    s += `<circle cx="34" cy="${y}" r="22" fill="${cd ? B.wheel : B.cream}" ${stB}/>` + icon(n, 34, y, 22, cd ? B.cream : B.ink, B.cream).replace(/<g /, `<g opacity="${cd ? 0.45 : 1}" `);
    if (cd) s += `<circle cx="50" cy="${y - 15}" r="9" fill="${B.accent}" ${sB(2.4)}/><text x="50" y="${y - 11}" font-size="12" class="b" text-anchor="middle">${cd}</text>`;
  });
  // opponent cam bubble
  s += `<circle cx="326" cy="162" r="44" fill="${B.p2.pale}" ${stB}/>` + faceIcon(tankB, B, "p2", 326, 162, 42, "worry", true).replace(/<circle cx="326" cy="162" r="42" fill="[^"]+"\/>/, "");
  s += `<circle cx="326" cy="162" r="44" fill="none" stroke="${B.ink}" stroke-width="3.4"/><rect x="282" y="198" width="88" height="26" rx="13" fill="${B.ink}"/><text x="326" y="216" font-size="13" class="b" text-anchor="middle" style="fill:${B.cream}">Radka →</text>`;
  // tank
  const tx = 150, ty = h(150), sc = 0.9, ang = 54, tilt = slope(h, tx);
  const [bx, by] = barrelTip(tx, ty, sc, ang - tilt, [14, -64], 47);
  s += arcDots(bx, by, ang - tilt, 112, 62, 12, 0.25, B.cream, 4.6);
  s += `<path d="M${tx - 10} ${ty - 40} L${tx - 84} ${ty + 4}" stroke="${B.cream}" stroke-width="2.4" stroke-dasharray="2 7" stroke-linecap="round"/><circle cx="${tx - 90}" cy="${ty + 8}" r="20" fill="none" stroke="${B.cream}" stroke-width="3"/>`;
  s += tankB({ who: "p1", face: "aim", x: tx, y: ty + 2, s: sc, angle: ang - tilt, tilt });
  s += bubbleB(tx + 6, ty - 132, 54, 74);
  // ---------- top strip
  s += `<rect x="0" y="0" width="${W}" height="96" fill="${B.ink}"/>`;
  s += faceIcon(tankB, B, "p1", 42, 50, 27, "aim", false, B.cream);
  s += faceIcon(tankB, B, "p2", W - 42, 50, 27, "worry", true, B.cream);
  s += `<text x="78" y="40" font-size="17" class="b" style="fill:${B.cream}">MARK</text><text x="148" y="40" font-size="17" class="b" text-anchor="end" style="fill:${B.p1.main}">82</text>`;
  s += hpBarB(78, 50, 72, 14, 0.82, B.p1.main);
  s += `<text x="${W - 78}" y="40" font-size="17" class="b" text-anchor="end" style="fill:${B.cream}">RADKA</text><text x="${W - 148}" y="40" font-size="17" class="b" style="fill:${B.p2.main}">57</text>`;
  s += hpBarB(W - 150, 50, 72, 14, 0.57, B.p2.main, true);
  s += windB(195, 40, 64, 7);
  s += `<text x="78" y="84" font-size="12" class="m" style="fill:${B.cream}" opacity=".65">kolo 2 · 1:0</text><text x="${W - 78}" y="84" font-size="12" class="m" text-anchor="end" style="fill:${B.cream}" opacity=".65">menu ≡</text>`;
  // ---------- bottom tray
  const T = 604;
  s += `<rect x="0" y="${T}" width="${W}" height="${H - T}" fill="${B.ink}"/>`;
  s += `<text x="16" y="${T + 24}" font-size="13" class="b" letter-spacing=".6" style="fill:${B.p2.main}">DÁREK OD RADKY: NAPALM</text><text x="${W - 16}" y="${T + 26}" font-size="12" class="m" text-anchor="end" style="fill:${B.cream}" opacity=".6">ostatní zamčené</text>`;
  const ra = T + 64;
  s += `<circle cx="44" cy="${ra}" r="30" fill="none" stroke="${B.p1.main}" stroke-width="4"/>` + giftWrapB(44, ra, 25, "napalm", false);
  ["grenade", "triple", "mirv", "roller", "drill"].forEach((n, i) => {
    const cx = 110 + i * 56;
    s += `<circle cx="${cx}" cy="${ra}" r="23" fill="${B.wheel}"/>` + icon(n, cx, ra, 24, B.cream, B.wheel).replace(/<g /, `<g opacity=".4" `);
    s += `<circle cx="${cx + 16}" cy="${ra + 16}" r="8" fill="${B.ink}"/>` + icon("lock", cx + 16, ra + 16, 11, B.cream, B.ink);
  });
  const rb = T + 130;
  s += `<rect x="16" y="${rb - 27}" width="168" height="54" rx="27" fill="${B.cream}" ${stB}/><path d="M100 ${rb - 27} V${rb + 27}" stroke="${B.ink}" stroke-width="3"/>` + icon("left", 52, rb, 28, B.ink, B.cream) + icon("right", 148, rb, 28, B.ink, B.cream);
  s += `<rect x="196" y="${rb - 27}" width="178" height="54" rx="27" fill="none" stroke="${B.cream}" stroke-width="3"/><circle cx="226" cy="${rb}" r="15" fill="${B.accent}" ${sB(2.6)}/><text x="226" y="${rb + 5}" font-size="15" class="b" text-anchor="middle">1</text><text x="250" y="${rb + 6}" font-size="17" class="b" style="fill:${B.cream}">VRÁTIT DÁREK</text>`;
  const rc = T + 200;
  s += `<rect x="16" y="${rb + 32}" width="168" height="5" rx="2.5" fill="${B.wheel}"/><rect x="16" y="${rb + 32}" width="124" height="5" rx="2.5" fill="${B.accent}"/>`;
  s += `<rect x="16" y="${rc - 22}" width="358" height="56" rx="28" fill="${B.p1.shade}"/><rect x="16" y="${rc - 27}" width="358" height="56" rx="28" fill="${B.p1.main}" stroke="${B.cream}" stroke-width="3"/><text x="195" y="${rc + 11}" font-size="29" class="b" text-anchor="middle" letter-spacing="1">PAL!</text>`;
  return s + "</svg>\n";
}

function bDesktop() {
  const W = 1280, H = 800;
  let s = svgOpen(W, H, FONT_B, cssB, "Tančíky – směr B Komiks, desktop");
  s += sceneBgB(W, H, 450);
  let h = terrainFn([[0, 540], [150, 520], [320, 535], [450, 590], [600, 625], [740, 610], [860, 560], [980, 540], [1120, 556], [1280, 520]]);
  h = crater(h, 640, 32, 20);
  s += terrainB(h, W, H);
  const sc = 1.12;
  const ox = 985, oy = h(ox), otilt = slope(h, ox);
  s += tankB({ who: "p2", face: "worry", x: ox, y: oy + 2, s: sc, flip: true, angle: 36, tilt: otilt });
  const tx = 320, ty = h(tx), tilt = slope(h, tx), ang = 50;
  const [bx, by] = barrelTip(tx, ty, sc, ang - tilt, [14, -64], 47);
  s += arcDots(bx, by, ang - tilt, 300, 120, 18, 0.22, B.cream, 5.2);
  s += tankB({ who: "p1", face: "aim", x: tx, y: ty + 2, s: sc, angle: ang - tilt, tilt });
  s += bubbleB(tx + 4, ty - 150, 50, 68);
  // left rail abilities
  const ab = [["shield", 0], ["teleport", 0], ["repair", 2], ["airstrike", 0]];
  ab.forEach(([n, cd], i) => {
    const y = 148 + i * 62;
    s += `<circle cx="46" cy="${y}" r="25" fill="${cd ? B.wheel : B.cream}" ${stB}/>` + icon(n, 46, y, 24, cd ? B.cream : B.ink, B.cream).replace(/<g /, `<g opacity="${cd ? 0.45 : 1}" `);
    if (cd) s += `<circle cx="64" cy="${y - 17}" r="10" fill="${B.accent}" ${sB(2.4)}/><text x="64" y="${y - 12.5}" font-size="13" class="b" text-anchor="middle">${cd}</text>`;
    s += `<text x="82" y="${y + 5}" font-size="14" class="b" style="fill:${B.cream}">${["ŠTÍT", "TELEPORT", "OPRAVA", "NÁLET"][i]}</text>`;
  });
  // top strip
  s += `<rect x="0" y="0" width="${W}" height="92" fill="${B.ink}"/>`;
  s += faceIcon(tankB, B, "p1", 58, 46, 32, "aim", false, B.cream);
  s += faceIcon(tankB, B, "p2", W - 58, 46, 32, "worry", true, B.cream);
  s += `<text x="104" y="38" font-size="20" class="b" style="fill:${B.cream}">MARK</text><text x="470" y="38" font-size="20" class="b" text-anchor="end" style="fill:${B.p1.main}">82</text>`;
  s += hpBarB(104, 50, 366, 16, 0.82, B.p1.main);
  s += `<text x="${W - 104}" y="38" font-size="20" class="b" text-anchor="end" style="fill:${B.cream}">RADKA</text><text x="${W - 470}" y="38" font-size="20" class="b" style="fill:${B.p2.main}">57</text>`;
  s += hpBarB(W - 470, 50, 366, 16, 0.57, B.p2.main, true);
  s += windB(W / 2, 38, 120, 7);
  s += `<text x="${W / 2 - 90}" y="64" font-size="13" class="m" text-anchor="end" style="fill:${B.cream}" opacity=".6">KOLO 2</text><text x="${W / 2 + 90}" y="64" font-size="13" class="m" style="fill:${B.cream}" opacity=".6">SKÓRE 1:0</text>`;
  // bottom cockpit
  const T = 700;
  s += `<rect x="0" y="${T}" width="${W}" height="${H - T}" fill="${B.ink}"/>`;
  const cy = T + 50;
  s += `<circle cx="62" cy="${cy}" r="33" fill="none" stroke="${B.p1.main}" stroke-width="4"/>` + giftWrapB(62, cy, 28, "napalm", false);
  s += `<text x="108" y="${cy - 4}" font-size="20" class="b" style="fill:${B.cream}">NAPALM</text><text x="108" y="${cy + 17}" font-size="13.5" class="m" style="fill:${B.p2.main}">dárek od Radky</text>`;
  ["grenade", "triple", "mirv", "roller", "drill", "bouncer"].forEach((n, i) => {
    const cx = 268 + i * 52;
    s += `<circle cx="${cx}" cy="${cy}" r="21" fill="${B.wheel}"/>` + icon(n, cx, cy, 22, B.cream, B.wheel).replace(/<g /, `<g opacity=".4" `);
  });
  s += `<text x="${268 - 21}" y="${cy + 40}" font-size="11.5" class="m" style="fill:${B.cream}" opacity=".5">zamčeno, dokud nevystřelíš dárek</text>`;
  const rx0 = 640;
  s += `<text x="${rx0}" y="${cy - 8}" font-size="12" class="b" letter-spacing="1" style="fill:${B.cream}" opacity=".6">JÍZDA A/D · PALIVO 120</text><rect x="${rx0}" y="${cy + 4}" width="180" height="10" rx="5" fill="${B.wheel}"/><rect x="${rx0}" y="${cy + 4}" width="135" height="10" rx="5" fill="${B.accent}"/>`;
  s += `<text x="${rx0}" y="${cy + 36}" font-size="12" class="m" style="fill:${B.cream}" opacity=".5">táhni myší od tanku · ←→ úhel · ↑↓ síla</text>`;
  s += `<rect x="${W - 390}" y="${cy - 27}" width="150" height="54" rx="27" fill="none" stroke="${B.cream}" stroke-width="3"/><circle cx="${W - 362}" cy="${cy}" r="14" fill="${B.accent}" ${sB(2.6)}/><text x="${W - 362}" y="${cy + 5}" font-size="14" class="b" text-anchor="middle">1</text><text x="${W - 340}" y="${cy - 1}" font-size="15" class="b" style="fill:${B.cream}">VRÁTIT</text><text x="${W - 340}" y="${cy + 15}" font-size="12" class="m" style="fill:${B.cream}" opacity=".6">dárek · R</text>`;
  s += `<rect x="${W - 222}" y="${cy - 26}" width="196" height="64" rx="32" fill="${B.p1.shade}"/><rect x="${W - 222}" y="${cy - 32}" width="196" height="64" rx="32" fill="${B.p1.main}" stroke="${B.cream}" stroke-width="3"/><text x="${W - 124}" y="${cy + 6}" font-size="28" class="b" text-anchor="middle">PAL!</text><text x="${W - 124}" y="${cy + 22}" font-size="10.5" class="m" text-anchor="middle" opacity=".7">MEZERNÍK</text>`;
  return s + "</svg>\n";
}

/* ------------------------------------------------------------------ write */
const out = {
  "A-mobile": aMobile(), "A-desktop": aDesktop(),
  "A-tanks": tanksSheet(tankA, A, cssA, FONT_A, "Tančíky – směr A, výrazy tanků", "Směr A · Hřiště — výrazy tanků", "A"),
  "B-mobile": bMobile(), "B-desktop": bDesktop(),
  "B-tanks": tanksSheet(tankB, B, cssB, FONT_B, "Tančíky – směr B, výrazy tanků", "SMĚR B · KOMIKS — VÝRAZY TANKŮ", "B"),
};
for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(OUT, k + ".svg"), v, "utf8");
console.log("written", Object.keys(out).join(" "));
