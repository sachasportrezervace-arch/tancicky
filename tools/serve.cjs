// Malý statický server pro složku hry (jen lokální vývoj a testy).
// node tools/serve.cjs [port]   (výchozí 8794; 8765 a 8791 používají jiné hry)
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const port = parseInt(process.argv[2] || process.env.PORT || "8794", 10);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2" };

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end("bad request"); }
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(root, p));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(`Tančíky na http://127.0.0.1:${port}/`));
