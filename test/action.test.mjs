import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

async function projectFile(relative) {
  return readFile(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

test("GitHub Action uses read-only inputs and the job summary", async () => {
  const action = await projectFile("action.yml");
  assert.match(action, /using: composite/);
  assert.match(action, /DEPSTORY_BASE: \$\{\{ inputs\.base \}\}/);
  assert.match(action, /"\$\{args\[@\]\}" >> "\$GITHUB_STEP_SUMMARY"/);
  assert.doesNotMatch(action, /pull-requests:\s*write/);

  const workflow = await projectFile(".github/workflows/dependency-review.yml");
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /fetch-depth: 0/);
});
