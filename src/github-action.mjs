import { appendFile } from "node:fs/promises";
import { buildDiffReport } from "./diff.mjs";
import { renderDiffMarkdown } from "./diff-render.mjs";

function requireValue(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function outputsForReport(report) {
  const { summary } = report;
  return {
    "has-changes": String(summary.total > 0),
    total: String(summary.total),
    added: String(summary.added),
    removed: String(summary.removed),
    changed: String(summary.changed),
    resolved: String(summary.resolved),
  };
}

function renderOutputs(outputs) {
  return `${Object.entries(outputs)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n")}\n`;
}

export async function runGitHubAction(options) {
  const repositoryPath = requireValue(options.repositoryPath, "GITHUB_WORKSPACE");
  const base = requireValue(options.base, "base input");
  const head = requireValue(options.head, "head input");
  const summaryPath = requireValue(options.summaryPath, "GITHUB_STEP_SUMMARY");
  const outputPath = requireValue(options.outputPath, "GITHUB_OUTPUT");
  const workspace = options.workspace || null;

  const report = await buildDiffReport(
    repositoryPath,
    `${base}...${head}`,
    { workspace },
  );
  const outputs = outputsForReport(report);

  await Promise.all([
    appendFile(summaryPath, `${renderDiffMarkdown(report)}\n`),
    appendFile(outputPath, renderOutputs(outputs)),
  ]);

  return { report, outputs };
}
