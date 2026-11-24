// Copies ONLY the public storefront files into dist/ so that backend code, tests,
// coverage reports and config never get uploaded to Cloudflare Pages.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

const NEVER = new Set(["worker.js", "vitest.config.js", "package.json", "package-lock.json"]);
const PUBLIC = /\.(html|css|js|png|jpe?g|ico|svg|webp|txt|xml)$/i;
const SPECIAL = new Set(["_headers", "_redirects"]);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);

const copied = [];
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile() || NEVER.has(entry.name)) continue;
  if (SPECIAL.has(entry.name) || PUBLIC.test(entry.name)) {
    fs.copyFileSync(path.join(root, entry.name), path.join(dist, entry.name));
    copied.push(entry.name);
  }
}
console.log(`Built dist/ with ${copied.length} public files:\n  ${copied.join("\n  ")}`);
