// Keep the entry page and its styles on the same deployment revision.
import { readFile, writeFile } from "node:fs/promises";
const entry = new URL("../dist/index.html", import.meta.url);
const html = await readFile(entry, "utf8");
const stylesheet = html.match(/<link rel="stylesheet"[^>]+href="(\/assets\/[^"]+\.css)"[^>]*>/);
if (!stylesheet) throw new Error("Missing entry stylesheet");
const css = await readFile(new URL(".." + stylesheet[1], entry.href.replace("index.html","assets/")), "utf8");
const shared = await readFile(new URL("../public/web/product.css",import.meta.url),"utf8");
await writeFile(entry, html.replace(stylesheet[0], () => '<style>' + css + shared + '</style>'));
