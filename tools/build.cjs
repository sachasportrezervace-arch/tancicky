// Skládá src/index.src.html do index.html: každé /*@include soubor*/ nahradí obsahem src/soubor.
// node tools/build.cjs
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), src = path.join(root, "src");
const html = fs.readFileSync(path.join(src, "index.src.html"), "utf8")
  .replace(/\/\*@include ([\w.-]+)\*\//g, (_, f) => fs.readFileSync(path.join(src, f), "utf8").replace(/<\/script/gi, "<\\/script"));
fs.writeFileSync(path.join(root, "index.html"), html);
console.log("index.html", html.length, "B");
