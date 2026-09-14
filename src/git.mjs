import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(
  cwd,
  args,
  {
    allowOutsideRepository = false,
    allowEmptyHistory = false,
    allowMissingPath = false,
    allowNoValue = false,
    trim = true,
  } = {},
) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, LANG: "C", LC_ALL: "C" },
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return trim ? stdout.trim() : stdout;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Git was not found on PATH.");
    }
    const stderr = String(error.stderr ?? "").trim();
    if (allowOutsideRepository && stderr.includes("not a git repository")) return "";
    if (allowEmptyHistory && stderr.includes("does not have any commits yet")) return "";
    if (allowMissingPath && (
      stderr.includes("does not exist in") ||
      stderr.includes("exists on disk, but not in")
    )) return null;
    if (allowNoValue && (error.code === 1 || error.code === 5) && !stderr) return null;
    throw new Error(`Git failed${stderr ? `: ${stderr}` : "."}`);
  }
}

export async function resolveCommit(cwd, reference) {
  let value;
  try {
    value = await git(cwd, ["rev-parse", "--verify", `${reference}^{commit}`]);
  } catch (error) {
    if (error.message === "Git was not found on PATH.") throw error;
    throw new Error(`Cannot resolve Git reference \"${reference}\".`);
  }
  if (!/^[0-9a-f]{40,64}$/i.test(value)) {
    throw new Error(`Git reference \"${reference}\" did not resolve to a commit.`);
  }
  return value;
}

export async function resolveComparison(cwd, range = "HEAD~1..HEAD") {
  const tripleIndex = range.indexOf("...");
  const doubleIndex = tripleIndex === -1 ? range.indexOf("..") : -1;
  const separator = tripleIndex === -1 ? ".." : "...";
  const index = tripleIndex === -1 ? doubleIndex : tripleIndex;
  if (index <= 0 || index + separator.length >= range.length) {
    throw new Error(`Comparison \"${range}\" must use <base>..<head> or <base>...<head>.`);
  }

  const baseReference = range.slice(0, index);
  const headReference = range.slice(index + separator.length);
  const [requestedBase, head] = await Promise.all([
    resolveCommit(cwd, baseReference),
    resolveCommit(cwd, headReference),
  ]);
  const base = separator === "..."
    ? await git(cwd, ["merge-base", requestedBase, head])
    : requestedBase;
  return {
    range,
    separator,
    baseReference,
    headReference,
    requestedBase,
    base,
    head,
  };
}

export async function listFilesAtRevision(cwd, revision) {
  const output = await git(
    cwd,
    ["ls-tree", "-r", "--name-only", "-z", revision],
    { trim: false },
  );
  return output.split("\0").filter(Boolean);
}

async function listBlobEntries(cwd, revision) {
  const output = await git(
    cwd,
    ["ls-tree", "-r", "-l", "-z", revision],
    { trim: false },
  );
  return output.split("\0").filter(Boolean).map((record) => {
    const tab = record.indexOf("\t");
    const metadata = record.slice(0, tab).split(/\s+/);
    return {
      mode: metadata[0],
      type: metadata[1],
      object: metadata[2],
      size: metadata[3] === "-" ? null : Number(metadata[3]),
      path: record.slice(tab + 1),
    };
  });
}

export async function visitFilesAtRevision(
  cwd,
  revision,
  files,
  visitor,
  { maxSize = 1024 * 1024 } = {},
) {
  const requested = new Set(files);
  const entries = (await listBlobEntries(cwd, revision))
    .filter((entry) => entry.type === "blob" && requested.has(entry.path))
    .filter((entry) => entry.size !== null && entry.size <= maxSize);
  if (entries.length === 0) return;

  await new Promise((resolve, reject) => {
    const child = spawn("git", ["cat-file", "--batch"], {
      cwd,
      env: { ...process.env, LANG: "C", LC_ALL: "C" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let buffer = Buffer.alloc(0);
    let entryIndex = 0;
    let contentSize = null;
    let stderr = "";
    let failure = null;

    const fail = (error) => {
      if (!failure) failure = error;
      child.kill();
    };

    child.on("error", (error) => {
      if (error.code === "ENOENT") fail(new Error("Git was not found on PATH."));
      else fail(error);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk) => {
      if (failure) return;
      buffer = Buffer.concat([buffer, chunk]);
      try {
        while (entryIndex < entries.length) {
          if (contentSize === null) {
            const newline = buffer.indexOf(0x0a);
            if (newline === -1) return;
            const header = buffer.subarray(0, newline).toString("utf8");
            buffer = buffer.subarray(newline + 1);
            const match = header.match(/^[0-9a-f]+ blob (\d+)$/i);
            if (!match) throw new Error(`Unexpected Git object header: ${header}`);
            contentSize = Number(match[1]);
          }
          if (buffer.length < contentSize + 1) return;
          const content = buffer.subarray(0, contentSize).toString("utf8");
          buffer = buffer.subarray(contentSize + 1);
          visitor(entries[entryIndex].path, content);
          entryIndex += 1;
          contentSize = null;
        }
      } catch (error) {
        fail(error);
      }
    });
    child.on("close", (code) => {
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Git failed${stderr.trim() ? `: ${stderr.trim()}` : "."}`));
      else if (entryIndex !== entries.length) reject(new Error("Git returned an incomplete object stream."));
      else resolve();
    });
    child.stdin.on("error", fail);
    child.stdin.end(`${entries.map((entry) => entry.object).join("\n")}\n`);
  });
}

export async function readFileAtRevision(cwd, revision, file) {
  return git(
    cwd,
    ["show", `${revision}:${file}`],
    { allowMissingPath: true, trim: false },
  );
}

export async function manifestDiff(cwd, base, head, files) {
  if (files.length === 0) return "";
  return git(
    cwd,
    [
      "--literal-pathspecs",
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--unified=2",
      base,
      head,
      "--",
      ...files,
    ],
  );
}

export async function inspectRemote(cwd) {
  const url = await git(cwd, ["config", "--get", "remote.origin.url"], {
    allowNoValue: true,
  });
  if (!url) return null;

  const github = url.match(/^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!github) return { url, webUrl: null, owner: null, repository: null };
  const [, owner, repository] = github;
  return {
    url,
    webUrl: `https://github.com/${owner}/${repository}`,
    owner,
    repository,
  };
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

async function findIntroductionRecord(cwd, manifestPath, dependency, repository, revision) {
  const state = repository ?? await inspectRepository(cwd);
  if (!state.isRepository) return null;

  const needle = `\"${dependency}\"`;
  const recordSeparator = "\u001e";
  const fieldSeparator = "\u001f";
  const revisionArguments = revision ? [revision] : [];
  const output = await git(
    cwd,
    [
      "--literal-pathspecs",
      "log",
      "--reverse",
      `-S${needle}`,
      `--format=${recordSeparator}%H${fieldSeparator}%aI${fieldSeparator}%an${fieldSeparator}%s${fieldSeparator}%b`,
      ...revisionArguments,
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

export async function findIntroduction(cwd, manifestPath, dependency, repository) {
  return findIntroductionRecord(cwd, manifestPath, dependency, repository, null);
}

export async function findIntroductionAtRevision(
  cwd,
  manifestPath,
  dependency,
  revision,
  repository,
) {
  return findIntroductionRecord(cwd, manifestPath, dependency, repository, revision);
}
