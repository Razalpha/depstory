import path from "node:path";
import { findConfigurationUsage } from "./config-usage.mjs";
import { buildDiffReport } from "./diff.mjs";
import { renderDiffHtml, renderDiffMarkdown, renderDiffText } from "./diff-render.mjs";
import { findIntroduction, inspectRepository } from "./git.mjs";
import { lockVersion, resolveLocalVersions } from "./lockfiles.mjs";
import { discoverManifests, findUsageMap } from "./scan.mjs";

export const VERSION = "0.4.0";

export function parseArguments(args) {
  const options = {
    cwd: process.cwd(),
    format: "text",
    command: "story",
    dependency: null,
    range: null,
    workspace: null,
  };
  let explicitFormat = null;
  let start = 0;
  if (args[0] === "diff") {
    options.command = "diff";
    start = 1;
  }
  for (let index = start; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--json" || value === "--markdown" || value === "--html") {
      const format = value.slice(2);
      if (explicitFormat && explicitFormat !== format) {
        throw new Error("Choose only one output format.");
      }
      explicitFormat = format;
      options.format = format;
    }
    else if (value === "--cwd") {
      const directory = args[++index];
      if (!directory || directory.startsWith("-")) {
        throw new Error("--cwd requires a directory path.");
      }
      options.cwd = path.resolve(directory);
    }
    else if (value === "--workspace") {
      const workspace = args[++index];
      if (!workspace || workspace.startsWith("-")) {
        throw new Error("--workspace requires a package name or relative path.");
      }
      const normalized = workspace
        .replaceAll("\\", "/")
        .replace(/^\.\//, "")
        .replace(/\/+$/, "");
      options.workspace = normalized || ".";
    }
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--version" || value === "-v") options.version = true;
    else if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`);
    else if (options.command === "diff" && !options.range) options.range = value;
    else if (options.command === "story" && !options.dependency) options.dependency = value;
    else throw new Error(`Unexpected argument: ${value}`);
  }
  return options;
}

export function help() {
  return `depstory — tell the story behind your dependencies

Usage:
  depstory [dependency] [options]
  depstory diff [<base>..<head>] [options]

Options:
  --cwd <path>          inspect another repository
  --workspace <name>    limit a monorepo report by package name or path
  --json                print the versioned JSON format
  --markdown            print a Markdown report
  --html                print a standalone HTML comparison report
  -v, --version         print the installed version
  -h, --help            show this help

Examples:
  depstory react
  depstory --json
  depstory --workspace packages/web
  depstory zod --cwd ../my-project
  depstory diff origin/main...HEAD --markdown
`;
}

function workspaceLabel(story, manifestCount) {
  return manifestCount > 1
    ? ` · ${safeLine(story.workspace)} at ${safeLine(story.workspacePath)}`
    : "";
}

function safeLine(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

function markdownText(value) {
  return safeLine(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_[\]])/g, "\\$1");
}

function inlineCode(value) {
  const text = safeLine(value);
  const longestRun = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${padding}${text}${padding}${fence}`;
}

function historyText(story, repository) {
  if (story.introduced) {
    return `introduced ${story.introduced.date.slice(0, 10)} in ${story.introduced.shortHash}: ${safeLine(story.introduced.subject)}`;
  }
  if (!repository.isRepository) return "introduction unavailable: this directory is not a Git repository";
  if (repository.isShallow) return "introduction not found in the available shallow Git history";
  return "introduction not found in the available Git history";
}

function renderText(project, manifests, stories, repository) {
  const noun = stories.length === 1 ? "dependency declaration" : "dependency declarations";
  const scope = manifests.length === 1 ? "1 manifest" : `${manifests.length} manifests`;
  const lines = [`${safeLine(project)} — ${stories.length} ${noun} across ${scope}`, ""];
  for (const story of stories) {
    lines.push(`${safeLine(story.name)} ${safeLine(story.version)} (${story.section}${workspaceLabel(story, manifests.length)})`);
    lines.push(`  ${historyText(story, repository)}`);
    if (story.resolvedVersion) {
      lines.push(`  resolved ${safeLine(story.resolvedVersion)} via ${safeLine(story.lockfile.path)}`);
    }
    lines.push(
      story.usageFiles.length
        ? `  used by ${story.usageFiles.length} file(s): ${story.usageFiles.slice(0, 4).map(safeLine).join(", ")}${story.usageFiles.length > 4 ? ", …" : ""}`
        : "  no direct source imports found",
    );
    if (story.configurationFiles.length) {
      lines.push(`  referenced by configuration: ${story.configurationFiles.map(safeLine).join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function renderMarkdown(project, manifests, stories, repository) {
  const lines = [`# Dependency story for ${markdownText(project)}`, ""];
  for (const story of stories) {
    lines.push(`## ${inlineCode(story.name)}`, "");
    lines.push(`- Version: ${inlineCode(story.version)}`);
    lines.push(`- Kind: ${inlineCode(story.section)}`);
    if (manifests.length > 1) {
      lines.push(`- Workspace: ${inlineCode(story.workspace)} (${inlineCode(story.workspacePath)})`);
    }
    lines.push(`- History: ${markdownText(historyText(story, repository))}`);
    if (story.resolvedVersion) {
      lines.push(`- Resolved version: ${inlineCode(story.resolvedVersion)} via ${inlineCode(story.lockfile.path)}`);
    }
    lines.push(story.usageFiles.length
      ? `- Current usage: ${story.usageFiles.map(inlineCode).join(", ")}`
      : "- Current usage: no direct source imports found");
    if (story.configurationFiles.length) {
      lines.push(`- Configuration references: ${story.configurationFiles.map(inlineCode).join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function belongsToWorkspace(file, workspacePath) {
  return workspacePath === "." || file.startsWith(`${workspacePath}/`);
}

export async function run(args) {
  const options = parseArguments(args);
  if (options.help) {
    console.log(help());
    return;
  }
  if (options.version) {
    console.log(VERSION);
    return;
  }
  if (options.command === "diff") {
    const report = await buildDiffReport(
      options.cwd,
      options.range ?? "HEAD~1..HEAD",
      { workspace: options.workspace },
    );
    if (options.format === "json") console.log(JSON.stringify(report, null, 2));
    else if (options.format === "markdown") console.log(renderDiffMarkdown(report));
    else if (options.format === "html") console.log(renderDiffHtml(report));
    else console.log(renderDiffText(report));
    return;
  }
  if (options.format === "html") {
    throw new Error("--html is available with the diff command.");
  }

  const allManifests = await discoverManifests(options.cwd);
  const manifests = options.workspace
    ? allManifests.filter(
      (manifest) => manifest.name === options.workspace || manifest.workspacePath === options.workspace,
    )
    : allManifests;
  if (options.workspace && manifests.length === 0) {
    throw new Error(`Workspace \"${options.workspace}\" was not found.`);
  }

  const dependencies = manifests.flatMap((manifest) => manifest.dependencies);
  const selected = options.dependency
    ? dependencies.filter((item) => item.name === options.dependency)
    : dependencies;

  if (options.dependency && selected.length === 0) {
    const location = options.workspace ? `workspace \"${options.workspace}\"` : "the discovered manifests";
    throw new Error(`Dependency \"${options.dependency}\" is not declared in ${location}.`);
  }

  const uniqueDependencies = [...new Set(selected.map((item) => item.name))];
  const usagePromise = findUsageMap(
    options.cwd,
    uniqueDependencies,
  );
  const repositoryPromise = inspectRepository(options.cwd);
  const lockfilePromise = resolveLocalVersions(options.cwd, allManifests);
  const configurationPromise = findConfigurationUsage(options.cwd, uniqueDependencies);
  const [usage, repository, lockfile, configurationUsage] = await Promise.all([
    usagePromise,
    repositoryPromise,
    lockfilePromise,
    configurationPromise,
  ]);
  const introductions = await Promise.all(
    selected.map((item) => findIntroduction(
      options.cwd,
      item.manifestPath,
      item.name,
      repository,
    )),
  );
  const stories = selected.map((item, index) => ({
    ...item,
    introduced: introductions[index],
    resolvedVersion: lockVersion(lockfile, item),
    lockfile: lockfile ? { type: lockfile.type, path: lockfile.path } : null,
    usageFiles: (usage.get(item.name) ?? [])
      .filter((file) => belongsToWorkspace(file, item.workspacePath)),
    configurationFiles: (configurationUsage.get(item.name) ?? [])
      .filter((file) => belongsToWorkspace(file, item.workspacePath)),
  }));
  const project = allManifests[0].name ?? path.basename(options.cwd);

  if (options.format === "json") {
    console.log(JSON.stringify({
      schemaVersion: 1,
      reportType: "inventory",
      project,
      manifestCount: manifests.length,
      repository,
      lockfile: lockfile ? { type: lockfile.type, path: lockfile.path } : null,
      stories,
    }, null, 2));
  } else if (options.format === "markdown") {
    console.log(renderMarkdown(project, manifests, stories, repository));
  } else {
    console.log(renderText(project, manifests, stories, repository));
  }
}
