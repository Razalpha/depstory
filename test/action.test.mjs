import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { outputsForReport, runGitHubAction } from "../src/github-action.mjs";

async function projectFile(relative) {
  return readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("GitHub Action uses read-only inputs and the job summary", async () => {
  const action = await projectFile("action.yml");
  assert.match(action, /using: composite/);
  assert.match(action, /DEPSTORY_BASE: \$\{\{ inputs\.base \}\}/);
  assert.match(action, /has-changes:/);
  assert.match(action, /steps\.report\.outputs\.total/);
  assert.match(action, /run: node "\$GITHUB_ACTION_PATH\/scripts\/run-action\.mjs"/);
  assert.doesNotMatch(action, /pull-requests:\s*write/);

  const workflow = await projectFile(".github/workflows/dependency-review.yml");
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /id: depstory/);
  assert.match(workflow, /steps\.depstory\.outputs\.has-changes/);
});

test("GitHub Action writes a report and stable scalar outputs", async (t) => {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), "depstory-action-"));
  t.after(() => rm(repositoryPath, { recursive: true, force: true }));

  git(repositoryPath, "init", "-q");
  git(repositoryPath, "config", "user.name", "Depstory Test");
  git(repositoryPath, "config", "user.email", "test@depstory.local");
  git(repositoryPath, "config", "core.autocrlf", "false");
  await writeJson(path.join(repositoryPath, "package.json"), {
    name: "action-fixture",
    dependencies: {},
  });
  git(repositoryPath, "add", ".");
  git(repositoryPath, "commit", "-q", "-m", "chore: add fixture");
  const base = git(repositoryPath, "rev-parse", "HEAD");

  await mkdir(path.join(repositoryPath, "src"));
  await writeJson(path.join(repositoryPath, "package.json"), {
    name: "action-fixture",
    dependencies: { kleur: "^4.1.5" },
  });
  await writeFile(path.join(repositoryPath, "src", "index.js"), 'import kleur from "kleur";\n');
  git(repositoryPath, "add", ".");
  git(repositoryPath, "commit", "-q", "-m", "feat: add terminal colors");
  const head = git(repositoryPath, "rev-parse", "HEAD");

  const summaryPath = path.join(repositoryPath, "summary.md");
  const outputPath = path.join(repositoryPath, "outputs.txt");
  const result = await runGitHubAction({
    repositoryPath,
    base,
    head,
    workspace: "",
    summaryPath,
    outputPath,
  });

  assert.deepEqual(result.outputs, {
    "has-changes": "true",
    total: "1",
    added: "1",
    removed: "0",
    changed: "0",
    resolved: "0",
  });
  assert.match(await readFile(summaryPath, "utf8"), /# Dependency changes for action-fixture/);
  assert.equal(
    await readFile(outputPath, "utf8"),
    "has-changes=true\ntotal=1\nadded=1\nremoved=0\nchanged=0\nresolved=0\n",
  );
});

test("GitHub Action reports an unchanged comparison and validates its environment", async () => {
  assert.deepEqual(outputsForReport({
    summary: { total: 0, added: 0, removed: 0, changed: 0, resolved: 0 },
  }), {
    "has-changes": "false",
    total: "0",
    added: "0",
    removed: "0",
    changed: "0",
    resolved: "0",
  });

  await assert.rejects(
    runGitHubAction({}),
    /GITHUB_WORKSPACE is required/,
  );
});
