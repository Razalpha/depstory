# depstory

> Your manifest says **what** you installed. Git remembers **why**.

`depstory` is a zero-dependency CLI that connects every JavaScript dependency to
the commit that introduced it and the source files that still use it.

```text
$ npx depstory zod

zod ^4.0.0 (dependencies)
  introduced 2026-09-14 in 68d9f4a1: feat: validate user input
  used by 2 file(s): src/schema.ts, src/api.ts
```

## Why this is different

Package managers explain dependency trees. Unused-dependency tools inspect the
current tree. `depstory` adds the missing historical layer:

- When did this dependency enter the repository?
- What problem did the original commit say it solved?
- Which files still import it today?
- Is it declared but no longer directly used?

Everything runs locally. There is no API key, telemetry, or AI-generated guess.

## Try it

Requires Node.js 20+ and Git.

```bash
npx depstory
npx depstory react
npx depstory --markdown
npx depstory --json
npx depstory zod --cwd ../another-project
```

Until the first npm release, clone this repository and run:

```bash
npm test
node bin/depstory.mjs
```

## Current scope

The first release reads the four dependency sections in `package.json`, finds
direct ESM/CommonJS imports, and searches the available Git history for the
commit that first added each package.

## Roadmap — contributions welcome

- Link introduction commits to GitHub pull requests and issues
- Show the manifest diff and neighboring dependencies from the same commit
- Add pnpm/yarn/npm workspace awareness
- Add adapters for `pyproject.toml`, `Cargo.toml`, and `go.mod`
- Calculate a conservative removal-confidence signal
- Generate a standalone interactive HTML dependency timeline
- Ship a GitHub Action that comments only when dependency history changes

Each item is deliberately separable so a first-time contributor can own an
adapter, output format, fixture, or detection rule.

## Design principles

1. Evidence before inference — every claim links to Git or a source file.
2. Local first — repository contents never leave the machine.
3. Read only — analysis must not modify the target repository.
4. Explainable — JSON output exposes the same facts as the terminal output.

## Contributing

Issues and pull requests are welcome. Please include a small fixture for every
new parser or detector and run:

```bash
npm run check
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

## License

MIT
