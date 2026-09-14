import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseArguments, VERSION } from "../src/cli.mjs";

const execFileAsync = promisify(execFile);
const bin = fileURLToPath(new URL("../bin/depstory.mjs", import.meta.url));

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore", windowsHide: true });
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("validates mutually exclusive formats and required option values", () => {
  assert.throws(
    () => parseArguments(["--json", "--markdown"]),
    /Choose either --json or --markdown/,
  );
  assert.throws(() => parseArguments(["--workspace"]), /requires a package name/);
  assert.throws(() => parseArguments(["--cwd", "--json"]), /requires a directory path/);
});

test("prints its package version without inspecting a repository", async () => {
  const { stdout } = await execFileAsync(process.execPath, [bin, "--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(stdout.trim(), VERSION);
  const manifest = JSON.parse(await readFile(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf8",
  ));
  assert.equal(VERSION, manifest.version);
});

test("prints help without inspecting a repository", async () => {
  const { stdout } = await execFileAsync(process.execPath, [bin, "--help"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.match(stdout, /depstory \[dependency\] \[options\]/);
  assert.match(stdout, /--workspace <name>/);
});

test("produces workspace-scoped, versioned JSON", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-cli-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  await writeJson(path.join(cwd, "package.json"), {
    name: "fixture-root",
    workspaces: ["packages/*"],
    dependencies: { dotenv: "^17.0.0" },
  });
  await writeJson(path.join(cwd, "packages", "web", "package.json"), {
    name: "@fixture/web",
    dependencies: { react: "^19.0.0" },
  });
  await mkdir(path.join(cwd, "packages", "web", "src"), { recursive: true });
  await writeFile(
    path.join(cwd, "packages", "web", "src", "app.tsx"),
    'import React from "react";\n',
  );

  const { stdout } = await execFileAsync(process.execPath, [
    bin,
    "--cwd",
    cwd,
    "--workspace",
    "@fixture/web",
    "--json",
  ], { encoding: "utf8", windowsHide: true });
  const report = JSON.parse(stdout);

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.project, "fixture-root");
  assert.equal(report.manifestCount, 1);
  assert.deepEqual(report.repository, { isRepository: false, isShallow: false });
  assert.equal(report.stories.length, 1);
  assert.equal(report.stories[0].workspace, "@fixture/web");
  assert.deepEqual(report.stories[0].usageFiles, ["packages/web/src/app.tsx"]);
});

test("returns a useful error for an unknown workspace", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-cli-error-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeJson(path.join(cwd, "package.json"), { name: "fixture" });

  await assert.rejects(
    execFileAsync(process.execPath, [bin, "--cwd", cwd, "--workspace", "missing"], {
      encoding: "utf8",
      windowsHide: true,
    }),
    (error) => error.code === 1 && error.stderr.includes('Workspace "missing" was not found.'),
  );
});

test("renders Git evidence as terminal text and safe Markdown", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-cli-render-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "Depstory Test");
  git(cwd, "config", "user.email", "test@depstory.local");
  await writeJson(path.join(cwd, "package.json"), {
    name: "render-fixture",
    dependencies: { "@scope/tool": "^1.0.0" },
  });
  await mkdir(path.join(cwd, "src"));
  await writeFile(path.join(cwd, "src", "app.js"), 'require("@scope/tool/runtime");\n');
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "feat: use <tool> *now*");

  const textResult = await execFileAsync(process.execPath, [bin, "--cwd", cwd], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.match(textResult.stdout, /1 dependency declaration across 1 manifest/);
  assert.match(textResult.stdout, /introduced .*feat: use <tool> \*now\*/);
  assert.match(textResult.stdout, /used by 1 file\(s\): src\/app\.js/);

  const markdownResult = await execFileAsync(process.execPath, [
    bin,
    "--cwd",
    cwd,
    "--markdown",
  ], { encoding: "utf8", windowsHide: true });
  assert.match(markdownResult.stdout, /## `@scope\/tool`/);
  assert.match(markdownResult.stdout, /&lt;tool&gt; \\\*now\\\*/);
  assert.match(markdownResult.stdout, /Current usage: `src\/app\.js`/);
});
