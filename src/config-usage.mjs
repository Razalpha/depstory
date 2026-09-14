import { promises as fs } from "node:fs";
import path from "node:path";
import { listFilesAtRevision, visitFilesAtRevision } from "./git.mjs";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const CONFIG_NAMES = new Set([
  ".babelrc",
  ".eslintrc",
  ".prettierrc",
  "nx.json",
  "turbo.json",
]);

const CONFIG_PREFIXES = [
  ".babelrc.",
  ".eslintrc.",
  ".prettierrc.",
  "babel.config.",
  "eslint.config.",
  "jest.config.",
  "postcss.config.",
  "prettier.config.",
  "rollup.config.",
  "tailwind.config.",
  "tsup.config.",
  "vite.config.",
  "vitest.config.",
  "webpack.config.",
];

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function isConfigurationFile(file) {
  const name = path.posix.basename(file);
  return name === "package.json" ||
    CONFIG_NAMES.has(name) ||
    CONFIG_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function searchableConfiguration(file, content) {
  if (path.posix.basename(file) !== "package.json") return content;
  try {
    const manifest = JSON.parse(content.replace(/^\uFEFF/, ""));
    for (const section of DEPENDENCY_SECTIONS) delete manifest[section];
    return JSON.stringify(manifest);
  } catch {
    return content;
  }
}

function aliasesFor(name) {
  const aliases = new Set([name]);
  const slash = name.indexOf("/");
  const scope = name.startsWith("@") && slash !== -1 ? name.slice(0, slash) : null;
  const unscoped = slash === -1 ? name : name.slice(slash + 1);
  for (const prefix of ["eslint-plugin-", "babel-plugin-"]) {
    if (!unscoped.startsWith(prefix)) continue;
    const shortName = unscoped.slice(prefix.length);
    if (!shortName) continue;
    aliases.add(shortName);
    if (scope) aliases.add(`${scope}/${shortName}`);
  }
  return [...aliases];
}

function containsReference(content, dependency) {
  return aliasesFor(dependency).some((alias) => {
    if (alias === dependency) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^A-Za-z0-9@._/-])${escaped}(?=$|/|[^A-Za-z0-9._-])`).test(content);
    }
    return content.includes(`\"${alias}\"`) || content.includes(`'${alias}'`);
  });
}

async function scanConfiguration(files, dependencies, reader) {
  const usage = new Map(dependencies.map((dependency) => [dependency, []]));
  if (usage.size === 0) return usage;
  for (const file of files.filter(isConfigurationFile).sort()) {
    const content = await reader(file);
    if (content === null || Buffer.byteLength(content) > 1024 * 1024) continue;
    const searchable = searchableConfiguration(file, content);
    for (const dependency of dependencies) {
      if (containsReference(searchable, dependency)) usage.get(dependency).push(file);
    }
  }
  return usage;
}

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
    } else {
      files.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  return files;
}

export async function findConfigurationUsage(cwd, dependencies) {
  if (dependencies.length === 0) return new Map();
  const files = await walk(cwd, cwd);
  return scanConfiguration(
    files,
    dependencies,
    async (file) => {
      try {
        return await fs.readFile(path.join(cwd, file), "utf8");
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw new Error(`Cannot read ${file}: ${error.message}`);
      }
    },
  );
}

export async function findConfigurationUsageAtRevision(cwd, revision, dependencies) {
  if (dependencies.length === 0) return new Map();
  const files = (await listFilesAtRevision(cwd, revision))
    .filter((file) => !file.split("/").some((part) => IGNORED_DIRECTORIES.has(part)));
  const usage = new Map(dependencies.map((dependency) => [dependency, []]));
  if (usage.size === 0) return usage;
  const configurationFiles = files.filter(isConfigurationFile).sort();
  await visitFilesAtRevision(cwd, revision, configurationFiles, (file, content) => {
    const searchable = searchableConfiguration(file, content);
    for (const dependency of dependencies) {
      if (containsReference(searchable, dependency)) usage.get(dependency).push(file);
    }
  });
  return usage;
}
