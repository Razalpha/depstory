# Roadmap

The next useful improvements are intentionally kept independent so they can be
discussed, implemented, and reviewed without a large rewrite.

## History

- Follow manifest renames without losing older introduction commits.
- Resolve pull requests that are not mentioned in commit messages through an
  optional authenticated provider.
- Explain dependency moves when a manifest itself changes path.

## Detection

- Expand configuration recognition with framework-owned fixture suites.
- Explain why an import was attributed to a particular package.
- Add fixture-backed adapters for `pyproject.toml`, `Cargo.toml`, and `go.mod`.
- Support legacy pnpm lockfiles that predate importer records.

## Reports

- Compare multiple packages as one upgrade group.
- Add an optional policy file for repository-specific review rules.
- Publish signed npm provenance with the first registry release.

The issue tracker is the source of truth for work in progress. An item here is a
direction, not a reservation; comment on or open an issue before starting a
larger implementation.
