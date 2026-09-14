import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDiffReport } from "../src/diff.mjs";
import { renderDiffHtml, renderDiffMarkdown, renderDiffText } from "../src/diff-render.mjs";

const bin = fileURLToPath(new URL("../bin/depstory.mjs", import.meta.url));

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

test("compares declarations, lock versions, evidence, and Git references", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-diff-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "Depstory Test");
  git(cwd, "config", "user.email", "test@depstory.local");
  git(cwd, "config", "core.autocrlf", "false");
  git(cwd, "remote", "add", "origin", "git@github.com:example/fixture.git");
  await mkdir(path.join(cwd, "src"));
  await writeJson(path.join(cwd, "package.json"), {
    name: "fixture",
    packageManager: "npm@11.0.0",
    dependencies: {
      "change-me": "^1.0.0",
      "lock-only": "^1.0.0",
      "remove-me": "^1.0.0",
    },
  });
  await writeJson(path.join(cwd, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "node_modules/change-me": { version: "1.0.0" },
      "node_modules/lock-only": { version: "1.1.0" },
      "node_modules/remove-me": { version: "1.0.0" },
    },
  });
  await writeFile(path.join(cwd, "src", "legacy.js"), 'import "remove-me";\n');
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "feat: add baseline (#12)", "-m", "Fixes #7");
  const base = git(cwd, "rev-parse", "HEAD");

  await writeJson(path.join(cwd, "package.json"), {
    name: "fixture",
    packageManager: "npm@11.0.0",
    scripts: { build: "add-me build" },
    dependencies: {
      "add-me": "^1.0.0",
      "change-me": "^2.0.0",
      "lock-only": "^1.0.0",
    },
  });
  await writeJson(path.join(cwd, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "node_modules/add-me": { version: "1.0.2" },
      "node_modules/change-me": { version: "2.3.0" },
      "node_modules/lock-only": { version: "1.2.0" },
    },
  });
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "feat: revise dependencies (#23)");

  const report = await buildDiffReport(cwd, `${base}..HEAD`);
  assert.deepEqual(report.summary, {
    total: 4,
    added: 1,
    removed: 1,
    changed: 1,
    resolved: 1,
  });
  assert.equal(report.lockfiles.base.type, "npm");
  assert.equal(report.lockfiles.head.type, "npm");
  assert.match(report.manifestPatch, /\+    "add-me": "\^1\.0\.0"/);

  const added = report.changes.find((change) => change.name === "add-me");
  assert.equal(added.status, "added");
  assert.equal(added.after.resolvedVersion, "1.0.2");
  assert.deepEqual(added.configurationFiles, ["package.json"]);
  assert.equal(added.links.pullRequest.number, 23);

  const removed = report.changes.find((change) => change.name === "remove-me");
  assert.equal(removed.status, "removed");
  assert.equal(removed.evidence.assessment, "still-referenced");
  assert.deepEqual(removed.usageFiles, ["src/legacy.js"]);
  assert.equal(removed.links.pullRequest.number, 12);
  assert.equal(removed.links.issues[0].number, 7);

  const lockOnly = report.changes.find((change) => change.name === "lock-only");
  assert.equal(lockOnly.status, "resolved");
  assert.equal(lockOnly.before.resolvedVersion, "1.1.0");
  assert.equal(lockOnly.after.resolvedVersion, "1.2.0");

  assert.match(renderDiffText(report), /4 total · 1 added/);
  assert.match(renderDiffMarkdown(report), /\| RESOLVED \| `lock-only`/);
  const html = renderDiffHtml(report);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /class="timeline"/);
  assert.doesNotMatch(html, /<script>/);

  const cliReport = JSON.parse(execFileSync(process.execPath, [
    bin,
    "diff",
    `${base}..HEAD`,
    "--cwd",
    cwd,
    "--json",
  ], { encoding: "utf8", windowsHide: true }));
  assert.deepEqual(cliReport.summary, report.summary);
});

test("escapes untrusted values in HTML reports", () => {
  const report = {
    project: "<unsafe>",
    comparison: {
      baseReference: "base",
      headReference: "head",
      base: "a".repeat(40),
      head: "b".repeat(40),
    },
    summary: { total: 1, added: 1, removed: 0, changed: 0, resolved: 0 },
    changes: [{
      status: "added",
      name: "<img src=x>",
      workspace: "fixture",
      manifestPath: "package.json",
      before: null,
      after: { version: "1", resolvedVersion: null, section: "dependencies" },
      usageFiles: [],
      configurationFiles: [],
      evidence: { assessment: "review", note: "<script>alert(1)</script>" },
      introduction: null,
      links: { commit: null, pullRequest: null, issues: [] },
    }],
  };
  const html = renderDiffHtml(report);
  assert.doesNotMatch(html, /<img src=x>|<script>alert/);
  assert.match(html, /&lt;unsafe&gt;/);
});
