# Changelog

All notable changes are recorded here. The project follows Semantic Versioning
while keeping the usual pre-1.0 allowance for changes to new interfaces.

## Unreleased

## 0.3.0 - 2026-09-14

### Added

- Git revision comparison with two-dot and merge-base-aware three-dot ranges.
- Added, removed, declared-version, section, and resolved-version change types.
- npm, Yarn, and pnpm lockfile resolution.
- Package-script and common tool-configuration evidence.
- Commit, pull request, and closing-issue links for GitHub remotes.
- Standalone HTML timeline, Markdown summary, and versioned JSON output.
- A read-only composite GitHub Action for pull request job summaries.
- Batched Git object reads for revision scans.

## 0.2.0 - 2026-09-14

### Added

- npm, Yarn, and compatible `package.json` workspace discovery.
- Workspace filtering by package name or repository-relative path.
- A versioned JSON output contract and `--version` command.
- Explicit shallow-clone and non-Git repository status.
- CLI, workspace-glob, malformed-manifest, and package-output tests.
- Turkish documentation.

### Changed

- Git failures other than a non-repository directory are reported instead of
  being mistaken for missing history.
- Dependency usage in a monorepo is scoped to the declaring workspace.

## 0.1.0 - 2026-09-14

### Added

- Git-based dependency introduction lookup.
- Literal ESM, dynamic import, re-export, and CommonJS usage scanning.
- Terminal, Markdown, and JSON output.
