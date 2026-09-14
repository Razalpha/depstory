import path from "node:path";
import { findIntroduction } from "./git.mjs";
import { findUsageMap, readManifest } from "./scan.mjs";

function parseArguments(args) {
  const options = { cwd: process.cwd(), format: "text", dependency: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--json") options.format = "json";
    else if (value === "--markdown") options.format = "markdown";
    else if (value === "--cwd") {
      const directory = args[++index];
      if (!directory || directory.startsWith("-")) {
        throw new Error("--cwd requires a directory path.");
      }
      options.cwd = path.resolve(directory);
    }
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`);
    else if (!options.dependency) options.dependency = value;
    else throw new Error(`Unexpected argument: ${value}`);
  }
  return options;
}

function help() {
  return `depstory — tell the story behind your dependencies

Usage:
  depstory [dependency] [--cwd <path>] [--json | --markdown]

Examples:
  depstory react
  depstory --json
  depstory zod --cwd ../my-project
`;
}

function renderText(project, stories) {
  const lines = [`${project} — ${stories.length} dependencies`, ""];
  for (const story of stories) {
    lines.push(`${story.name} ${story.version} (${story.section})`);
    lines.push(
      story.introduced
        ? `  introduced ${story.introduced.date.slice(0, 10)} in ${story.introduced.shortHash}: ${story.introduced.subject}`
        : "  introduction not found in the available Git history",
    );
    lines.push(
      story.usageFiles.length
        ? `  used by ${story.usageFiles.length} file(s): ${story.usageFiles.slice(0, 4).join(", ")}${story.usageFiles.length > 4 ? ", …" : ""}`
        : "  no direct source imports found",
    );
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function renderMarkdown(project, stories) {
  const lines = [`# Dependency story for ${project}`, ""];
  for (const story of stories) {
    lines.push(`## \`${story.name}\``, "");
    lines.push(`- Version: \`${story.version}\``);
    lines.push(`- Kind: \`${story.section}\``);
    lines.push(
      story.introduced
        ? `- Introduced: \`${story.introduced.shortHash}\` on ${story.introduced.date.slice(0, 10)} — ${story.introduced.subject}`
        : "- Introduced: not found in the available Git history",
    );
    lines.push(
      story.usageFiles.length
        ? `- Current usage: ${story.usageFiles.map((file) => `\`${file}\``).join(", ")}`
        : "- Current usage: no direct source imports found",
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

export async function run(args) {
  const options = parseArguments(args);
  if (options.help) {
    console.log(help());
    return;
  }

  const { manifest, dependencies, manifestPath } = await readManifest(options.cwd);
  const selected = options.dependency
    ? dependencies.filter((item) => item.name === options.dependency)
    : dependencies;

  if (options.dependency && selected.length === 0) {
    throw new Error(`Dependency \"${options.dependency}\" is not declared in package.json.`);
  }

  const usagePromise = findUsageMap(
    options.cwd,
    selected.map((item) => item.name),
  );
  const introductionsPromise = Promise.all(
    selected.map((item) => findIntroduction(options.cwd, manifestPath, item.name)),
  );
  const [usage, introductions] = await Promise.all([
    usagePromise,
    introductionsPromise,
  ]);
  const stories = selected.map((item, index) => ({
    ...item,
    introduced: introductions[index],
    usageFiles: usage.get(item.name) ?? [],
  }));
  const project = manifest.name ?? path.basename(options.cwd);

  if (options.format === "json") {
    console.log(JSON.stringify({ project, stories }, null, 2));
  } else if (options.format === "markdown") {
    console.log(renderMarkdown(project, stories));
  } else {
    console.log(renderText(project, stories));
  }
}
