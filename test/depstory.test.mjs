import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findIntroduction } from "../src/git.mjs";
import { extractModuleSpecifiers } from "../src/imports.mjs";
import { findUsageFiles, findUsageMap, readManifest } from "../src/scan.mjs";

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore", windowsHide: true });
}

test("finds dependency usage and its introduction commit", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "Depstory Test");
  git(cwd, "config", "user.email", "test@depstory.local");
  await writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({ name: "fixture", dependencies: { zod: "^4.0.0" } }, null, 2),
  );
  await mkdir(path.join(cwd, "src"));
  await writeFile(path.join(cwd, "src", "index.ts"), 'import { z } from "zod";\n');
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "feat: validate user input");

  const { dependencies } = await readManifest(cwd);
  assert.deepEqual(dependencies, [
    { name: "zod", version: "^4.0.0", section: "dependencies" },
  ]);
  assert.deepEqual(await findUsageFiles(cwd, "zod"), ["src/index.ts"]);

  const introduction = await findIntroduction(cwd, "package.json", "zod");
  assert.equal(introduction.subject, "feat: validate user input");
  assert.equal(introduction.author, "Depstory Test");
});

test("returns null when a directory has no Git history", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-no-git-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  assert.equal(await findIntroduction(cwd, "package.json", "zod"), null);
});

test("returns null for an initialized repository without commits", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-empty-git-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  git(cwd, "init", "-q");
  assert.equal(await findIntroduction(cwd, "package.json", "zod"), null);
});

test("extracts supported module syntax and ignores comments and examples", () => {
  const source = `
    import React from "react";
    import "dotenv/config";
    export { z } from "zod/v4";
    const kleur = require("kleur");
    const lazy = import("@scope/tool/runtime");
    // import "commented-out";
    /* require("also-commented-out") */
    const example = 'import "inside-a-string"';
    const template = \`require("inside-a-template")\`;
    const metadata = import.meta.url;
    const customImport = loader.import("not-a-module");
    const customRequire = loader.require("also-not-a-module");
    const matcher = /import("regex-example")/;
  `;

  assert.deepEqual(extractModuleSpecifiers(source).sort(), [
    "@scope/tool/runtime",
    "dotenv/config",
    "kleur",
    "react",
    "zod/v4",
  ]);
});

test("scans every source file once and maps package subpaths", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-usage-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(path.join(cwd, "src"));
  await writeFile(
    path.join(cwd, "src", "app.ts"),
    'import "dotenv/config";\nimport value from "@scope/tool/runtime";\n',
  );
  await writeFile(
    path.join(cwd, "src", "ignored.ts"),
    '// import "dotenv";\nconst example = \'require("@scope/tool")\';\n',
  );

  const usage = await findUsageMap(cwd, ["dotenv", "@scope/tool", "unused"]);
  assert.deepEqual(usage.get("dotenv"), ["src/app.ts"]);
  assert.deepEqual(usage.get("@scope/tool"), ["src/app.ts"]);
  assert.deepEqual(usage.get("unused"), []);
});

test("only scans script blocks in Vue and Svelte components", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-components-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(path.join(cwd, "src"));
  await writeFile(
    path.join(cwd, "src", "Component.vue"),
    '<template><p>import "template-example"</p></template>\n' +
      '<script setup>import value from "real-vue-package";</script>\n',
  );
  await writeFile(
    path.join(cwd, "src", "Widget.svelte"),
    '<p>require("markup-example")</p>\n' +
      '<script>const value = require("real-svelte-package");</script>\n',
  );

  const usage = await findUsageMap(cwd, [
    "template-example",
    "real-vue-package",
    "markup-example",
    "real-svelte-package",
  ]);
  assert.deepEqual(usage.get("template-example"), []);
  assert.deepEqual(usage.get("real-vue-package"), ["src/Component.vue"]);
  assert.deepEqual(usage.get("markup-example"), []);
  assert.deepEqual(usage.get("real-svelte-package"), ["src/Widget.svelte"]);
});
