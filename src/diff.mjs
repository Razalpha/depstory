import {
  findIntroductionAtRevision,
  inspectRemote,
  inspectRepository,
  manifestDiff,
  resolveComparison,
} from "./git.mjs";
import { discoverManifestsAtRevision } from "./manifest.mjs";
import { lockVersion, resolveRevisionVersions } from "./lockfiles.mjs";
import { linksForCommit } from "./references.mjs";
import { findUsageMapAtRevision } from "./scan.mjs";
import { findConfigurationUsageAtRevision } from "./config-usage.mjs";

const MAX_PATCH_LENGTH = 256 * 1024;

function filterManifests(manifests, workspace) {
  if (!workspace) return manifests;
  return manifests.filter(
    (manifest) => manifest.name === workspace || manifest.workspacePath === workspace,
  );
}

function dependencyId(dependency) {
  return `${dependency.manifestPath}\0${dependency.name}`;
}

function dependencyMap(manifests) {
  const result = new Map();
  for (const dependency of manifests.flatMap((manifest) => manifest.dependencies)) {
    const id = dependencyId(dependency);
    if (result.has(id)) {
      throw new Error(
        `${dependency.manifestPath} declares ${dependency.name} in more than one dependency section.`,
      );
    }
    result.set(id, dependency);
  }
  return result;
}

function snapshot(dependency, lockfile) {
  if (!dependency) return null;
  return {
    version: dependency.version,
    resolvedVersion: lockVersion(lockfile, dependency),
    section: dependency.section,
  };
}

function classify(before, after, beforeSnapshot, afterSnapshot) {
  if (!before) return { status: "added", fields: ["declaration"] };
  if (!after) return { status: "removed", fields: ["declaration"] };
  const fields = [];
  if (before.version !== after.version) fields.push("version");
  if (before.section !== after.section) fields.push("section");
  if (beforeSnapshot.resolvedVersion !== afterSnapshot.resolvedVersion) {
    fields.push("resolvedVersion");
  }
  if (fields.length === 0) return null;
  return {
    status: fields.length === 1 && fields[0] === "resolvedVersion" ? "resolved" : "changed",
    fields,
  };
}

function evidenceFor(status, usageFiles, configurationFiles) {
  const references = usageFiles.length + configurationFiles.length;
  if (status === "removed" && references > 0) {
    return {
      assessment: "still-referenced",
      note: "The package was removed from the manifest but references remain at the head revision.",
    };
  }
  if (status === "removed") {
    return {
      assessment: "no-static-references",
      note: "No literal source import or recognized configuration reference remains; manual review is still required.",
    };
  }
  if (references === 0) {
    return {
      assessment: "no-static-references",
      note: "No literal source import or recognized configuration reference was found.",
    };
  }
  return {
    assessment: "referenced",
    note: "Current source or configuration references were found at the head revision.",
  };
}

function scopedFiles(files, workspacePath) {
  return workspacePath === "."
    ? files
    : files.filter((file) => file.startsWith(`${workspacePath}/`));
}

function publicLockfile(lockfile) {
  return lockfile ? { type: lockfile.type, path: lockfile.path } : null;
}

export async function buildDiffReport(cwd, range, { workspace = null } = {}) {
  const repository = await inspectRepository(cwd);
  if (!repository.isRepository) {
    throw new Error("Dependency comparison requires a Git repository.");
  }
  const comparison = await resolveComparison(cwd, range);
  const [allBeforeManifests, allAfterManifests, remote] = await Promise.all([
    discoverManifestsAtRevision(cwd, comparison.base),
    discoverManifestsAtRevision(cwd, comparison.head),
    inspectRemote(cwd),
  ]);
  const beforeManifests = filterManifests(allBeforeManifests, workspace);
  const afterManifests = filterManifests(allAfterManifests, workspace);
  if (workspace && beforeManifests.length === 0 && afterManifests.length === 0) {
    throw new Error(`Workspace \"${workspace}\" was not found at either revision.`);
  }

  const [beforeLockfile, afterLockfile] = await Promise.all([
    resolveRevisionVersions(cwd, comparison.base, allBeforeManifests),
    resolveRevisionVersions(cwd, comparison.head, allAfterManifests),
  ]);
  const beforeDependencies = dependencyMap(beforeManifests);
  const afterDependencies = dependencyMap(afterManifests);
  const ids = [...new Set([...beforeDependencies.keys(), ...afterDependencies.keys()])].sort();
  const candidates = [];
  for (const id of ids) {
    const before = beforeDependencies.get(id) ?? null;
    const after = afterDependencies.get(id) ?? null;
    const beforeState = snapshot(before, beforeLockfile);
    const afterState = snapshot(after, afterLockfile);
    const classification = classify(before, after, beforeState, afterState);
    if (classification) {
      candidates.push({ id, before, after, beforeState, afterState, ...classification });
    }
  }

  const packageNames = [...new Set(candidates.map(({ before, after }) => (after ?? before).name))];
  const [usage, configurationUsage] = await Promise.all([
    findUsageMapAtRevision(cwd, comparison.head, packageNames),
    findConfigurationUsageAtRevision(cwd, comparison.head, packageNames),
  ]);
  const introductions = await Promise.all(candidates.map(({ before, after }) => {
    const dependency = after ?? before;
    const revision = after ? comparison.head : comparison.base;
    return findIntroductionAtRevision(
      cwd,
      dependency.manifestPath,
      dependency.name,
      revision,
      repository,
    );
  }));

  const changes = candidates.map((candidate, index) => {
    const dependency = candidate.after ?? candidate.before;
    const usageFiles = scopedFiles(usage.get(dependency.name) ?? [], dependency.workspacePath);
    const configurationFiles = scopedFiles(
      configurationUsage.get(dependency.name) ?? [],
      dependency.workspacePath,
    );
    const introduction = introductions[index];
    return {
      status: candidate.status,
      fields: candidate.fields,
      name: dependency.name,
      workspace: dependency.workspace,
      workspacePath: dependency.workspacePath,
      manifestPath: dependency.manifestPath,
      before: candidate.beforeState,
      after: candidate.afterState,
      usageFiles,
      configurationFiles,
      evidence: evidenceFor(candidate.status, usageFiles, configurationFiles),
      introduction,
      links: linksForCommit(introduction, remote),
    };
  });

  const manifestFiles = [...new Set(changes.map((change) => change.manifestPath))].sort();
  const fullPatch = await manifestDiff(cwd, comparison.base, comparison.head, manifestFiles);
  const patchTruncated = fullPatch.length > MAX_PATCH_LENGTH;
  const project = allAfterManifests[0]?.name ?? allBeforeManifests[0]?.name ?? "repository";
  return {
    schemaVersion: 1,
    reportType: "comparison",
    project,
    comparison,
    repository: { ...repository, remote },
    lockfiles: {
      base: publicLockfile(beforeLockfile),
      head: publicLockfile(afterLockfile),
    },
    manifestCount: {
      base: beforeManifests.length,
      head: afterManifests.length,
    },
    summary: {
      total: changes.length,
      added: changes.filter((change) => change.status === "added").length,
      removed: changes.filter((change) => change.status === "removed").length,
      changed: changes.filter((change) => change.status === "changed").length,
      resolved: changes.filter((change) => change.status === "resolved").length,
    },
    changes,
    manifestPatch: patchTruncated ? fullPatch.slice(0, MAX_PATCH_LENGTH) : fullPatch,
    manifestPatchTruncated: patchTruncated,
  };
}
