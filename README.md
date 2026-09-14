# depstory

[![CI](https://github.com/Razalpha/depstory/actions/workflows/ci.yml/badge.svg)](https://github.com/Razalpha/depstory/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933)](package.json)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Your `package.json` records what a project depends on. `depstory` uses the Git
history and current imports to add the missing context: when a package appeared,
what the introducing commit said, and where that package is still imported.

[Türkçe README](README.tr.md)

```text
$ npx --yes github:Razalpha/depstory zod

demo-api — 1 dependency declaration across 1 manifest

zod ^4.0.0 (dependencies)
  introduced 2026-09-14 in 68d9f4a1: validate incoming requests
  resolved 4.1.5 via package-lock.json
  used by 2 file(s): src/api.ts, src/schema.ts
```

The command is useful when reviewing an unfamiliar repository, checking whether
a package can be removed, or finding the original context before an upgrade.
It reads the repository in place; it does not install dependencies or execute
project code.

## Run it

Node.js 20 or newer and Git are required. The package is currently installed
straight from this repository:

```bash
npx --yes github:Razalpha/depstory
npx --yes github:Razalpha/depstory react
npx --yes github:Razalpha/depstory --workspace packages/web
npx --yes github:Razalpha/depstory --markdown
npx --yes github:Razalpha/depstory --json
npx --yes github:Razalpha/depstory zod --cwd ../another-project
npx --yes github:Razalpha/depstory diff origin/main...HEAD --markdown
```

For repeated use:

```bash
npm install --global github:Razalpha/depstory
depstory --help
```

## Compare two revisions

`diff` compares dependency declarations and resolved lockfile versions without
checking out either revision:

```bash
depstory diff origin/main...HEAD
depstory diff v0.2.0..HEAD --json
depstory diff origin/main...HEAD --workspace packages/web --markdown
depstory diff origin/main...HEAD --html > dependency-report.html
```

Two dots compare the exact endpoints. Three dots use the merge base and are the
better choice for pull requests. Each changed package includes its declaration
and resolved-version transition, current source and configuration references,
introduction commit, related PR or closing issue when recorded in the commit
message, and the relevant manifest patch.

The HTML report is self-contained: it has no remote scripts, fonts, images, or
runtime requests. See [docs/diff-output.md](docs/diff-output.md) for the complete
comparison contract.

## What it reports

For every declaration in `dependencies`, `devDependencies`,
`peerDependencies`, and `optionalDependencies`, depstory:

1. searches the relevant `package.json` history for the first commit that added
   the package name;
2. scans JavaScript, TypeScript, Vue, and Svelte source files for literal ESM,
   dynamic-import, re-export, and CommonJS references;
3. checks recognized configuration files and package scripts;
4. reads the selected npm, Yarn, or pnpm lockfile for the resolved version;
5. prints the evidence as terminal text, Markdown, or versioned JSON.

Source files are scanned once per run. Comments, ordinary strings, template
strings, generated output, dependency folders, symlinks, and files larger than
1 MiB are skipped.

Lockfile detection follows the root `packageManager` field when present. Without
that field, depstory checks `package-lock.json`, `pnpm-lock.yaml`, then
`yarn.lock`. npm lockfile versions 1–3, Yarn classic/Berry selectors, and
importer-based pnpm lockfiles are supported.

## Monorepos

Common workspace patterns declared in the root `package.json` are discovered
automatically, including `*`, `**`, `?`, and exclusion patterns. Both the array
form and the `workspaces.packages` form are supported. Use a package name or
repository-relative path to narrow the report:

```bash
depstory --workspace @acme/web
depstory react --workspace packages/web
```

Usage is scoped to the selected workspace. Root dependencies are checked
against the whole repository because they may support shared scripts or tools.

## Reading the result carefully

The report is evidence, not a verdict. No direct import does not always mean a
package is unused: CLIs, loaders, framework plugins, configuration files, and
transitive integrations may not appear in source imports. Likewise, a shallow
clone may not contain the introducing commit; depstory marks that case in its
output.

Git history follows the current manifest path. If a manifest was renamed, older
commits before that rename may require a full-clone investigation with Git.

The machine-readable inventory fields and compatibility rules live in
[docs/json-output.md](docs/json-output.md).

## Pull request reports

The repository includes a read-only composite action that writes the comparison
to the GitHub Actions job summary. It does not install the target project or
execute repository code. Copy the workflow from
[docs/github-action.md](docs/github-action.md) to add it to a project.

## Development

```bash
npm run check
npm test
npm run coverage
npm pack --dry-run
```

There are no runtime dependencies and the tests do not need network access.
Before proposing a parser change, add the smallest fixture that demonstrates
the missing syntax. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow
and [ROADMAP.md](ROADMAP.md) for work that is ready to be picked up.

## License

[MIT](LICENSE)
