import { promises as fs } from "node:fs";
import path from "node:path";
import { listFilesAtRevision, readFileAtRevision } from "./git.mjs";

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

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

function toPosix(value) {
  return value.split(path.sep).join("/");
}

async function readPackageJson(absolutePath) {
  let content;
  try {
    content = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Cannot read ${absolutePath}: ${error.message}`);
  }

  return parsePackageJson(content, absolutePath);
}

export function parsePackageJson(content, label = "package.json") {
  try {
    const manifest = JSON.parse(content.replace(/^\uFEFF/, ""));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("the root value must be an object");
    }
    return manifest;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function workspacePatterns(manifest) {
  if (Array.isArray(manifest.workspaces)) return manifest.workspaces;
  if (Array.isArray(manifest.workspaces?.packages)) {
    return manifest.workspaces.packages;
  }
  return [];
}

function globToRegExp(glob) {
  const normalized = glob.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      if (normalized[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

async function findNestedPackageFiles(directory, root, results = []) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return results;
    throw new Error(`Cannot scan ${directory}: ${error.message}`);
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const child = path.join(directory, entry.name);
    const manifestPath = path.join(child, "package.json");
    try {
      const stat = await fs.stat(manifestPath);
      if (stat.isFile()) results.push(toPosix(path.relative(root, manifestPath)));
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") {
        throw new Error(`Cannot inspect ${manifestPath}: ${error.message}`);
      }
    }
    await findNestedPackageFiles(child, root, results);
  }
  return results;
}

export function normalizeManifest(cwd, manifestPath, manifest) {
  const workspacePath = path.posix.dirname(manifestPath);
  const normalizedWorkspacePath = workspacePath === "." ? "." : workspacePath;
  const workspace = manifest.name ||
    (normalizedWorkspacePath === "." ? path.basename(cwd) : path.posix.basename(workspacePath));
  const dependencies = [];

  for (const section of DEPENDENCY_SECTIONS) {
    const values = manifest[section];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const [name, version] of Object.entries(values)) {
      if (typeof version !== "string") {
        throw new Error(`${manifestPath}: ${section}.${name} must be a string`);
      }
      dependencies.push({
        name,
        version,
        section,
        workspace,
        workspacePath: normalizedWorkspacePath,
        manifestPath,
      });
    }
  }

  return {
    name: workspace,
    path: manifestPath,
    workspacePath: normalizedWorkspacePath,
    packageManager: typeof manifest.packageManager === "string" ? manifest.packageManager : null,
    dependencies,
  };
}

function isIgnoredManifest(manifestPath) {
  const directories = manifestPath.split("/").slice(0, -1);
  return directories.some((directory) => IGNORED_DIRECTORIES.has(directory));
}

export function selectWorkspaceManifestPaths(root, candidates) {
  const patterns = workspacePatterns(root)
    .filter((pattern) => typeof pattern === "string" && pattern.length > 0)
    .map((pattern) => ({
      excluded: pattern.startsWith("!"),
      expression: globToRegExp(pattern.startsWith("!") ? pattern.slice(1) : pattern),
    }));
  const included = patterns.filter((pattern) => !pattern.excluded);
  const excluded = patterns.filter((pattern) => pattern.excluded);
  if (included.length === 0) return ["package.json"];

  return [
    "package.json",
    ...candidates
      .filter((manifestPath) => manifestPath !== "package.json")
      .filter((manifestPath) => manifestPath.endsWith("/package.json"))
      .filter((manifestPath) => !isIgnoredManifest(manifestPath))
      .filter((manifestPath) => {
        const directory = path.posix.dirname(manifestPath);
        return included.some(({ expression }) => expression.test(directory)) &&
          !excluded.some(({ expression }) => expression.test(directory));
      })
      .sort(),
  ];
}

export async function discoverManifests(cwd) {
  const rootPath = path.join(cwd, "package.json");
  const root = await readPackageJson(rootPath);
  if (!root) throw new Error(`No package.json found in ${cwd}`);

  const candidates = await findNestedPackageFiles(cwd, cwd);
  const paths = selectWorkspaceManifestPaths(root, candidates);
  const manifests = [normalizeManifest(cwd, "package.json", root)];
  for (const manifestPath of paths.slice(1)) {
    const manifest = await readPackageJson(path.join(cwd, ...manifestPath.split("/")));
    if (manifest) manifests.push(normalizeManifest(cwd, manifestPath, manifest));
  }

  return manifests;
}

export async function discoverManifestsAtRevision(cwd, revision) {
  const rootContent = await readFileAtRevision(cwd, revision, "package.json");
  if (rootContent === null) {
    throw new Error(`No package.json found at Git revision ${revision.slice(0, 8)}.`);
  }
  const root = parsePackageJson(rootContent, `${revision.slice(0, 8)}:package.json`);
  const files = await listFilesAtRevision(cwd, revision);
  const paths = selectWorkspaceManifestPaths(root, files);
  const manifests = [normalizeManifest(cwd, "package.json", root)];
  for (const manifestPath of paths.slice(1)) {
    const content = await readFileAtRevision(cwd, revision, manifestPath);
    if (content === null) continue;
    const manifest = parsePackageJson(content, `${revision.slice(0, 8)}:${manifestPath}`);
    manifests.push(normalizeManifest(cwd, manifestPath, manifest));
  }
  return manifests;
}

export async function readManifest(cwd) {
  const [manifest] = await discoverManifests(cwd);
  const raw = await readPackageJson(path.join(cwd, "package.json"));
  return {
    manifest: raw,
    dependencies: manifest.dependencies.map(({ name, version, section }) => ({
      name,
      version,
      section,
    })),
    manifestPath: "package.json",
  };
}
