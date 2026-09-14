import { promises as fs } from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function importPattern(dependency) {
  const escaped = escapeRegExp(dependency);
  return new RegExp(
    `(?:from\\s*|import\\s*\\(|require\\s*\\()\\s*[\"']${escaped}(?:/[^\"']*)?[\"']`,
  );
}

async function walk(directory, root, files = []) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolute, root, files);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  return files;
}

export async function findUsageFiles(cwd, dependency) {
  const pattern = importPattern(dependency);
  const files = await walk(cwd, cwd);
  const matches = [];

  for (const relative of files) {
    const absolute = path.join(cwd, relative);
    const stat = await fs.stat(absolute);
    if (stat.size > 1024 * 1024) continue;
    const content = await fs.readFile(absolute, "utf8");
    if (pattern.test(content)) matches.push(relative);
  }

  return matches;
}

export async function readManifest(cwd) {
  const manifestPath = path.join(cwd, "package.json");
  let content;
  try {
    content = await fs.readFile(manifestPath, "utf8");
  } catch {
    throw new Error(`No package.json found in ${cwd}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    throw new Error("package.json is not valid JSON.");
  }

  const sections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  const dependencies = [];
  for (const section of sections) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      dependencies.push({ name, version, section });
    }
  }

  return { manifest, dependencies, manifestPath: "package.json" };
}
