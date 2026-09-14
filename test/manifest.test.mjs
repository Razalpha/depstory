import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverManifests } from "../src/manifest.mjs";

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("discovers workspace manifests and honors exclusion patterns", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-workspaces-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  await writeJson(path.join(cwd, "package.json"), {
    name: "fixture-root",
    workspaces: ["packages/*", "!packages/private"],
    devDependencies: { eslint: "^9.0.0" },
  });
  await writeJson(path.join(cwd, "packages", "web", "package.json"), {
    name: "@fixture/web",
    dependencies: { react: "^19.0.0" },
  });
  await writeJson(path.join(cwd, "packages", "private", "package.json"), {
    name: "@fixture/private",
    dependencies: { secret: "1.0.0" },
  });
  await writeJson(path.join(cwd, "node_modules", "ignored", "package.json"), {
    name: "ignored",
  });

  const manifests = await discoverManifests(cwd);
  assert.deepEqual(manifests.map(({ name, path: manifestPath }) => [name, manifestPath]), [
    ["fixture-root", "package.json"],
    ["@fixture/web", "packages/web/package.json"],
  ]);
  assert.deepEqual(manifests[1].dependencies, [{
    name: "react",
    version: "^19.0.0",
    section: "dependencies",
    workspace: "@fixture/web",
    workspacePath: "packages/web",
    manifestPath: "packages/web/package.json",
  }]);
});

test("supports the Yarn-style workspaces packages object", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-workspaces-object-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  await writeJson(path.join(cwd, "package.json"), {
    name: "fixture-root",
    workspaces: { packages: ["apps/**"] },
  });
  await writeJson(path.join(cwd, "apps", "admin", "package.json"), {
    name: "admin",
    peerDependencies: { react: ">=18" },
  });

  const manifests = await discoverManifests(cwd);
  assert.equal(manifests.length, 2);
  assert.equal(manifests[1].name, "admin");
  assert.equal(manifests[1].dependencies[0].section, "peerDependencies");
});

test("reports malformed package manifests with their path", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-invalid-manifest-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(path.join(cwd, "package.json"), "{ definitely-not-json }");

  await assert.rejects(
    discoverManifests(cwd),
    (error) => error.message.includes(path.join(cwd, "package.json")) &&
      error.message.includes("not valid JSON"),
  );
});

test("accepts a UTF-8 BOM and rejects non-string dependency ranges", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-manifest-validation-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(
    path.join(cwd, "package.json"),
    `\uFEFF${JSON.stringify({ name: "fixture", dependencies: { valid: "1.0.0" } })}`,
  );
  assert.equal((await discoverManifests(cwd))[0].dependencies[0].name, "valid");

  await writeJson(path.join(cwd, "package.json"), {
    name: "fixture",
    dependencies: { invalid: 1 },
  });
  await assert.rejects(
    discoverManifests(cwd),
    /dependencies\.invalid must be a string/,
  );
});
