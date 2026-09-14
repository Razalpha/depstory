import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { lockVersion, resolveLocalVersions } from "../src/lockfiles.mjs";
import { normalizeManifest } from "../src/manifest.mjs";

function rootManifest(cwd, packageManager, dependencies) {
  return normalizeManifest(cwd, "package.json", {
    name: "fixture",
    packageManager,
    dependencies,
  });
}

test("reads npm lockfile versions", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-npm-lock-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const manifest = rootManifest(cwd, "npm@11.0.0", { zod: "^4.0.0" });
  await writeFile(path.join(cwd, "package-lock.json"), JSON.stringify({
    lockfileVersion: 3,
    packages: { "node_modules/zod": { version: "4.1.5" } },
  }));

  const lockfile = await resolveLocalVersions(cwd, [manifest]);
  assert.equal(lockfile.type, "npm");
  assert.equal(lockVersion(lockfile, manifest.dependencies[0]), "4.1.5");
});

test("reads classic and modern Yarn lockfile entries", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-yarn-lock-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const manifest = rootManifest(cwd, "yarn@4.9.0", {
    react: "^19.0.0",
    zod: "^4.0.0",
  });
  await writeFile(path.join(cwd, "yarn.lock"), [
    '"react@npm:^19.0.0":',
    "  version: 19.1.1",
    '"zod@^4.0.0":',
    '  version "4.1.5"',
    "",
  ].join("\n"));

  const lockfile = await resolveLocalVersions(cwd, [manifest]);
  assert.equal(lockVersion(lockfile, manifest.dependencies[0]), "19.1.1");
  assert.equal(lockVersion(lockfile, manifest.dependencies[1]), "4.1.5");
});

test("reads pnpm importer versions for root and nested workspaces", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-pnpm-lock-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const root = rootManifest(cwd, "pnpm@10.0.0", { zod: "^4.0.0" });
  const web = normalizeManifest(cwd, "packages/web/package.json", {
    name: "@fixture/web",
    dependencies: { react: "^19.0.0" },
  });
  await writeFile(path.join(cwd, "pnpm-lock.yaml"), [
    "lockfileVersion: '9.0'",
    "importers:",
    "  .:",
    "    dependencies:",
    "      zod:",
    "        specifier: ^4.0.0",
    "        version: 4.1.5",
    "  packages/web:",
    "    dependencies:",
    "      react:",
    "        specifier: ^19.0.0",
    "        version: 19.1.1(typescript@5.9.2)",
    "",
  ].join("\n"));

  const lockfile = await resolveLocalVersions(cwd, [root, web]);
  assert.equal(lockVersion(lockfile, root.dependencies[0]), "4.1.5");
  assert.equal(lockVersion(lockfile, web.dependencies[0]), "19.1.1");
});
