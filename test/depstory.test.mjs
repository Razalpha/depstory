import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findIntroduction } from "../src/git.mjs";
import { findUsageFiles, readManifest } from "../src/scan.mjs";

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
