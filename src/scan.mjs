import { promises as fs } from "node:fs";
import path from "node:path";
import { extractModuleSpecifiers } from "./imports.mjs";

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
  const usage = await findUsageMap(cwd, [dependency]);
  return usage.get(dependency) ?? [];
}

function belongsToDependency(specifier, dependency) {
  return specifier === dependency || specifier.startsWith(`${dependency}/`);
}

export async function findUsageMap(cwd, dependencies) {
  const files = await walk(cwd, cwd);
  const usage = new Map(dependencies.map((dependency) => [dependency, []]));

  for (const relative of files) {
    const absolute = path.join(cwd, relative);
    try {
      const stat = await fs.stat(absolute);
      if (stat.size > 1024 * 1024) continue;
      const content = await fs.readFile(absolute, "utf8");
      const specifiers = extractModuleSpecifiers(content);
      for (const dependency of dependencies) {
        if (specifiers.some((specifier) => belongsToDependency(specifier, dependency))) {
          usage.get(dependency).push(relative);
        }
      }
    } catch {
      // A file can disappear while the repository is being scanned. Treat the
      // scan as a point-in-time best effort instead of failing the whole run.
    }
  }

  return usage;
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
