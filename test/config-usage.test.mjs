import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findConfigurationUsage } from "../src/config-usage.mjs";

test("finds scripts and plugin aliases without counting declarations", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "depstory-config-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(path.join(cwd, "package.json"), JSON.stringify({
    scripts: { build: "tool build" },
    devDependencies: {
      "eslint-plugin-react": "latest",
      tool: "latest",
      foo: "latest",
      "declared-only": "latest",
    },
  }));
  await mkdir(path.join(cwd, "config"));
  await writeFile(
    path.join(cwd, "config", ".eslintrc.json"),
    JSON.stringify({ plugins: ["react"] }),
  );
  await writeFile(path.join(cwd, "vite.config.js"), 'export default { command: "foobar" };\n');

  const usage = await findConfigurationUsage(cwd, [
    "eslint-plugin-react",
    "tool",
    "foo",
    "declared-only",
  ]);
  assert.deepEqual(usage.get("eslint-plugin-react"), ["config/.eslintrc.json"]);
  assert.deepEqual(usage.get("tool"), ["package.json"]);
  assert.deepEqual(usage.get("foo"), []);
  assert.deepEqual(usage.get("declared-only"), []);
});
