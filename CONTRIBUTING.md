# Contributing

Small, testable changes are easiest to review. Bug reports should include a
minimal `package.json`, the source form that was missed, and the output you
expected. Please remove private repository names and credentials from fixtures.

For a larger change, open an issue before writing the implementation. This is
especially helpful for new ecosystems and output fields, where a small design
choice can become a long-term compatibility promise.

## Local setup

```bash
git clone https://github.com/Razalpha/depstory.git
cd depstory
npm test
```

There is no install step because the project has no development dependencies.
Use Node.js 20 or newer. A complete local check is:

```bash
npm run check
npm test
npm run coverage
npm pack --dry-run
```

## Pull requests

- Keep analysis read-only and deterministic.
- Add a focused test for each behavior change or bug fix.
- Do not make tests depend on a network connection, global Git configuration,
  or the committer's operating system.
- Preserve the JSON contract. Additive fields are fine within schema version 1;
  renames or removals require a new schema version.
- Update the README or output reference when visible behavior changes.

Commit messages should describe the result in the imperative mood, for example
`fix: detect side-effect imports`. A tidy history is appreciated, but reviewers
will not reject a useful contribution over imperfect commit wording.

## Reporting security problems

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md)
so maintainers have time to investigate before details are published.
