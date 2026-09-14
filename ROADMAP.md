# Roadmap

The next useful improvements are intentionally kept independent so they can be
discussed, implemented, and reviewed without a large rewrite.

## History

- Follow manifest renames without losing older introduction commits.
- Link an introduction commit to its pull request when a remote is available.
- Show the exact manifest diff that introduced a dependency.

## Detection

- Recognize framework and tool configuration outside source imports.
- Explain why an import was attributed to a particular package.
- Add fixture-backed adapters for `pyproject.toml`, `Cargo.toml`, and `go.mod`.

## Reports

- Produce a self-contained HTML timeline.
- Compare dependency evidence between two Git revisions.
- Add a GitHub Action that updates a report only when its evidence changes.

The issue tracker is the source of truth for work in progress. An item here is a
direction, not a reservation; comment on or open an issue before starting a
larger implementation.
