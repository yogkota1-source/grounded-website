import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Returns the <body> markup of an HTML file with every <script> tag removed. */
export function bodyOf(file) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const body = html.slice(html.indexOf("<body"), html.lastIndexOf("</body>"));
  return body.replace(/<body[^>]*>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
}

const tracked = [];
let originals = null;

/** Records every window/document listener so one test's page script can't leak into the next. */
export function trackListeners() {
  originals = {
    win: window.addEventListener,
    doc: document.addEventListener
  };
  window.addEventListener = function (type, fn, opts) {
    tracked.push([window, type, fn, opts]);
    return originals.win.call(window, type, fn, opts);
  };
  document.addEventListener = function (type, fn, opts) {
    tracked.push([document, type, fn, opts]);
    return originals.doc.call(document, type, fn, opts);
  };
}

export function untrackListeners() {
  for (const [target, type, fn, opts] of tracked.splice(0)) target.removeEventListener(type, fn, opts);
  if (originals) {
    window.addEventListener = originals.win;
    document.addEventListener = originals.doc;
    originals = null;
  }
}

/** Fresh DOM + fresh module instance. */
export async function loadPage(file, scriptFile, { mutateDom, beforeImport } = {}) {
  document.body.innerHTML = bodyOf(file);
  if (mutateDom) mutateDom(document);
  if (beforeImport) beforeImport();
  vi.resetModules();
  return import(/* @vite-ignore */ path.join(root, scriptFile));
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

