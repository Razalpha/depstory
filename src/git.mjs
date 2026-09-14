import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(
  cwd,
  args,
  { allowOutsideRepository = false, allowEmptyHistory = false } = {},
) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, LANG: "C", LC_ALL: "C" },
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.trim();
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Git was not found on PATH.");
    }
    const stderr = String(error.stderr ?? "").trim();
    if (allowOutsideRepository && stderr.includes("not a git repository")) return "";
    if (allowEmptyHistory && stderr.includes("does not have any commits yet")) return "";
    throw new Error(`Git failed${stderr ? `: ${stderr}` : "."}`);
  }
}

export async function isGitRepository(cwd) {
  return (
    await git(cwd, ["rev-parse", "--is-inside-work-tree"], {
      allowOutsideRepository: true,
    })
  ) === "true";
}

export async function inspectRepository(cwd) {
  const isRepository = await isGitRepository(cwd);
  if (!isRepository) return { isRepository: false, isShallow: false };
  const isShallow = (await git(cwd, ["rev-parse", "--is-shallow-repository"])) === "true";
  return { isRepository: true, isShallow };
}

export async function findIntroduction(cwd, manifestPath, dependency, repository) {
  const state = repository ?? await inspectRepository(cwd);
  if (!state.isRepository) return null;

  const needle = `\"${dependency}\"`;
  const recordSeparator = "\u001e";
  const fieldSeparator = "\u001f";
  const output = await git(
    cwd,
    [
      "--literal-pathspecs",
      "log",
      "--reverse",
      `-S${needle}`,
      `--format=${recordSeparator}%H${fieldSeparator}%aI${fieldSeparator}%an${fieldSeparator}%s${fieldSeparator}%b`,
      "--",
      manifestPath,
    ],
    { allowEmptyHistory: true },
  );

  const first = output
    .split(recordSeparator)
    .map((entry) => entry.trim())
    .filter(Boolean)[0];

  if (!first) return null;
  const [hash, date, author, subject, ...body] = first.split(fieldSeparator);
  return {
    hash,
    shortHash: hash.slice(0, 8),
    date,
    author,
    subject,
    body: body.join(fieldSeparator).trim(),
  };
}
