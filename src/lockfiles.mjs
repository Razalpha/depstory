import { promises as fs } from "node:fs";
import path from "node:path";
import { readFileAtRevision } from "./git.mjs";

const LOCKFILES = {
  npm: { type: "npm", path: "package-lock.json" },
  pnpm: { type: "pnpm", path: "pnpm-lock.yaml" },
  yarn: { type: "yarn", path: "yarn.lock" },
};

function dependencyKey(workspacePath, name) {
  return `${workspacePath}\0${name}`;
}

function cleanScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function cleanPnpmVersion(value) {
  const cleaned = cleanScalar(value);
  const peerSuffix = cleaned.indexOf("(");
  return peerSuffix === -1 ? cleaned : cleaned.slice(0, peerSuffix);
}

function npmVersions(content, manifests, label) {
  let lock;
  try {
    lock = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  const versions = new Map();
  for (const manifest of manifests) {
    for (const dependency of manifest.dependencies) {
      const paths = manifest.workspacePath === "."
        ? [`node_modules/${dependency.name}`]
        : [
          `${manifest.workspacePath}/node_modules/${dependency.name}`,
          `node_modules/${dependency.name}`,
        ];
      const entry = paths.map((candidate) => lock.packages?.[candidate]).find(Boolean) ??
        lock.dependencies?.[dependency.name];
      if (entry && typeof entry.version === "string") {
        versions.set(dependencyKey(manifest.workspacePath, dependency.name), entry.version);
      }
    }
  }
  return versions;
}

function yarnBlocks(content) {
  const blocks = [];
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    if (line && !/^\s/.test(line) && line.endsWith(":")) {
      if (current) blocks.push(current);
      const header = line.slice(0, -1);
      current = {
        selectors: header.split(/,\s+/).map(cleanScalar),
        version: null,
      };
      continue;
    }
    if (!current) continue;
    const match = line.match(/^\s+version(?:\s+|:\s*)(.+?)\s*$/);
    if (match) current.version = cleanScalar(match[1]);
  }
  if (current) blocks.push(current);
  return blocks;
}

function yarnVersions(content, manifests) {
  const blocks = yarnBlocks(content);
  const versions = new Map();
  for (const manifest of manifests) {
    for (const dependency of manifest.dependencies) {
      const exactSelectors = new Set([
        `${dependency.name}@${dependency.version}`,
        `${dependency.name}@npm:${dependency.version}`,
      ]);
      const candidates = blocks.filter((block) =>
        block.version && block.selectors.some((selector) => selector.startsWith(`${dependency.name}@`)),
      );
      const selected = candidates.find((block) =>
        block.selectors.some((selector) => exactSelectors.has(selector)),
      ) ?? candidates[0];
      if (selected) {
        versions.set(dependencyKey(manifest.workspacePath, dependency.name), selected.version);
      }
    }
  }
  return versions;
}

function yamlPair(line) {
  const match = line.match(/^(['"]?)(.+?)\1:\s*(.*?)\s*$/);
  if (!match) return null;
  return { key: cleanScalar(match[2]), value: match[3] };
}

function pnpmImporterVersions(content) {
  const versions = new Map();
  let importersIndent = null;
  let importer = null;
  let section = null;
  let dependency = null;

  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const pair = yamlPair(rawLine.trim());
    if (!pair) continue;

    if (indent === 0 && pair.key === "importers") {
      importersIndent = indent;
      importer = null;
      continue;
    }
    if (importersIndent === null) continue;
    if (indent <= importersIndent && pair.key !== "importers") break;

    if (indent === importersIndent + 2) {
      importer = { path: pair.key, indent };
      section = null;
      dependency = null;
      continue;
    }
    if (!importer) continue;
    if (indent === importer.indent + 2) {
      section = [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ].includes(pair.key)
        ? { name: pair.key, indent }
        : null;
      dependency = null;
      continue;
    }
    if (!section) continue;
    if (indent === section.indent + 2) {
      dependency = { name: pair.key, indent };
      if (pair.value) {
        versions.set(dependencyKey(importer.path, dependency.name), cleanPnpmVersion(pair.value));
      }
      continue;
    }
    if (dependency && indent === dependency.indent + 2 && pair.key === "version") {
      versions.set(dependencyKey(importer.path, dependency.name), cleanPnpmVersion(pair.value));
    }
  }
  return versions;
}

function pnpmVersions(content, manifests) {
  const importerVersions = pnpmImporterVersions(content);
  const versions = new Map();
  for (const manifest of manifests) {
    for (const dependency of manifest.dependencies) {
      const key = dependencyKey(manifest.workspacePath, dependency.name);
      const version = importerVersions.get(key);
      if (version) versions.set(key, version);
    }
  }
  return versions;
}

function orderedLockfiles(manifests) {
  const manager = manifests[0]?.packageManager?.split("@")[0];
  const preferred = LOCKFILES[manager];
  return preferred
    ? [preferred, ...Object.values(LOCKFILES).filter((lockfile) => lockfile !== preferred)]
    : Object.values(LOCKFILES);
}

async function loadLockfile(manifests, reader) {
  for (const lockfile of orderedLockfiles(manifests)) {
    const content = await reader(lockfile.path);
    if (content === null) continue;
    let versions;
    if (lockfile.type === "npm") versions = npmVersions(content, manifests, lockfile.path);
    else if (lockfile.type === "yarn") versions = yarnVersions(content, manifests);
    else versions = pnpmVersions(content, manifests);
    return { ...lockfile, versions };
  }
  return null;
}

async function readLocalFile(cwd, relative) {
  try {
    return await fs.readFile(path.join(cwd, relative), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Cannot read ${relative}: ${error.message}`);
  }
}

export async function resolveLocalVersions(cwd, manifests) {
  return loadLockfile(manifests, (relative) => readLocalFile(cwd, relative));
}

export async function resolveRevisionVersions(cwd, revision, manifests) {
  return loadLockfile(
    manifests,
    (relative) => readFileAtRevision(cwd, revision, relative),
  );
}

export function lockVersion(lockfile, dependency) {
  if (!lockfile) return null;
  return lockfile.versions.get(dependencyKey(dependency.workspacePath, dependency.name)) ?? null;
}
