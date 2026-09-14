import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createSiteServer, fileForRequest } from "../scripts/serve-site.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("ships a self-contained, accessible product site", async () => {
  const html = await fs.readFile(path.join(root, "dist/index.html"), "utf8");
  const css = await fs.readFile(path.join(root, "dist/styles.css"), "utf8");
  const script = await fs.readFile(path.join(root, "dist/site.js"), "utf8");

  assert.match(html, /<title>depstory — dependency history with evidence<\/title>/);
  assert.match(html, /<meta name="description"/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /href="#main">Skip to content<\/a>/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"[^>]+href="https?:/i);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(script, /navigator\.clipboard\.writeText/);
  assert.match(script, /ArrowLeft/);
});

test("serves only files inside the static site directory", async (context) => {
  assert.equal(fileForRequest("/%2e%2e%5cpackage.json"), null);
  assert.equal(path.basename(fileForRequest("/")), "index.html");

  const server = createSiteServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const [page, stylesheet, missing] = await Promise.all([
    fetch(`${origin}/`),
    fetch(`${origin}/styles.css`),
    fetch(`${origin}/missing.txt`),
  ]);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /^text\/html/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(await page.text(), /The missing context behind every dependency change/);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get("content-type"), /^text\/css/);
  assert.equal(missing.status, 404);
});
