import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
const require = createRequire(import.meta.url);

// Ship PDF decoding resources with BrightWay. No CDN or external viewer.
export function pdfjsAssets() {
  const root = dirname(require.resolve("pdfjs-dist/package.json"));
  const files = new Map();
  for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
    for (const name of readdirSync(join(root, directory))) {
      if (!name.startsWith("LICENSE") && !/\.(bcmap|pfb|ttf|wasm|js)$/.test(name)) continue;
      files.set(`pdfjs/${directory}/${name}`, join(root, directory, name));
    }
  }
  return {
    name: "brightway-pdf-resources",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = new URL(req.url, "http://localhost").pathname.replace(/^\//, "");
        if (!files.has(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm"
          : name.endsWith(".js") ? "text/javascript" : "application/octet-stream");
        res.end(readFileSync(files.get(name)));
      });
    },
    generateBundle() {
      for (const [fileName, path] of files) this.emitFile({ type: "asset", fileName, source: readFileSync(path) });
    },
  };
}
