# GitHub Action

The included composite action writes a dependency comparison to the job summary.
It does not post comments, request write permissions, install the target project,
or execute repository code.

```yaml
name: Dependency review

on:
  pull_request:

permissions:
  contents: read

jobs:
  depstory:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: Razalpha/depstory@v0.4.0
        id: depstory
        with:
          base: ${{ github.event.pull_request.base.sha }}
          head: ${{ github.event.pull_request.head.sha }}
```

`fetch-depth: 0` is required because the comparison and introduction commits may
be older than the pull request branch. Node.js 20 or newer must be available on
self-hosted runners; GitHub-hosted runners already provide it.

For a monorepo, use the optional workspace input:

```yaml
      - uses: Razalpha/depstory@v0.4.0
        with:
          base: ${{ github.event.pull_request.base.sha }}
          head: ${{ github.event.pull_request.head.sha }}
          workspace: packages/web
```

The action deliberately writes to `$GITHUB_STEP_SUMMARY` rather than opening or
editing a pull request comment. Re-running a workflow therefore does not create
notification noise or require `pull-requests: write`.

## Outputs

Give the step an `id` to use the comparison result in later steps. Every output
is a string, as required by GitHub Actions.

| Output | Value |
| --- | --- |
| `has-changes` | `true` when at least one dependency change was found; otherwise `false` |
| `total` | Total number of dependency changes |
| `added` | Added dependency declarations |
| `removed` | Removed dependency declarations |
| `changed` | Changed dependency declarations |
| `resolved` | Lockfile-only resolved-version changes |

```yaml
      - name: Continue when dependencies changed
        if: steps.depstory.outputs.has-changes == 'true'
        run: echo "${{ steps.depstory.outputs.total }} dependency changes"
```
