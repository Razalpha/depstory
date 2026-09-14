import { promises as fs } from "node:fs";
import path from "node:path";
import { extractModuleSpecifiers } from "./imports.mjs";
export { discoverManifests, readManifest } from "./manifest.mjs";

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
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw new Error(`Cannot scan ${directory}: ${error.message}`);
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

function packageNameFromSpecifier(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function scriptContent(relative, content) {
  const extension = path.extname(relative);
  if (extension !== ".vue" && extension !== ".svelte") return content;
  return [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => match[1])
    .join("\n");
}

export async function findUsageMap(cwd, dependencies) {
  const usage = new Map(dependencies.map((dependency) => [dependency, []]));
  if (usage.size === 0) return usage;
  const files = (await walk(cwd, cwd)).sort();

  for (const relative of files) {
    const absolute = path.join(cwd, relative);
    try {
      const stat = await fs.stat(absolute);
      if (stat.size > 1024 * 1024) continue;
      const content = await fs.readFile(absolute, "utf8");
      const specifiers = extractModuleSpecifiers(scriptContent(relative, content));
      const importedPackages = new Set(specifiers.map(packageNameFromSpecifier));
      for (const dependency of importedPackages) {
        if (usage.has(dependency)) usage.get(dependency).push(relative);
      }
    } catch (error) {
      // A file can disappear while the repository is being scanned. Other
      // failures are surfaced so an incomplete report is never mistaken for a
      // complete one.
      if (error.code !== "ENOENT") {
        throw new Error(`Cannot scan ${relative}: ${error.message}`);
      }
    }
  }

  return usage;
}
