import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.trim();
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Git was not found on PATH.");
    }
    return "";
  }
}

export async function isGitRepository(cwd) {
  return (await git(cwd, ["rev-parse", "--is-inside-work-tree"])) === "true";
}

export async function findIntroduction(cwd, manifestPath, dependency) {
  if (!(await isGitRepository(cwd))) return null;

  const needle = `\"${dependency}\"`;
  const recordSeparator = "\u001e";
  const fieldSeparator = "\u001f";
  const output = await git(cwd, [
    "log",
    "--reverse",
    `-S${needle}`,
    `--format=${recordSeparator}%H${fieldSeparator}%aI${fieldSeparator}%an${fieldSeparator}%s${fieldSeparator}%b`,
    "--",
    manifestPath,
  ]);

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
