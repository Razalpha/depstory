# Comparison output

`depstory diff <base>...<head> --json` returns a versioned comparison document.
It reads both snapshots from Git and leaves the working tree unchanged.

```json
{
  "schemaVersion": 1,
  "reportType": "comparison",
  "project": "demo-api",
  "comparison": {
    "range": "origin/main...HEAD",
    "separator": "...",
    "baseReference": "origin/main",
    "headReference": "HEAD",
    "requestedBase": "1111111111111111111111111111111111111111",
    "base": "2222222222222222222222222222222222222222",
    "head": "3333333333333333333333333333333333333333"
  },
  "summary": {
    "total": 1,
    "added": 1,
    "removed": 0,
    "changed": 0,
    "resolved": 0
  },
  "changes": [
    {
      "status": "added",
      "fields": ["declaration"],
      "name": "zod",
      "workspace": "demo-api",
      "workspacePath": ".",
      "manifestPath": "package.json",
      "before": null,
      "after": {
        "version": "^4.0.0",
        "resolvedVersion": "4.1.5",
        "section": "dependencies"
      },
      "usageFiles": ["src/schema.ts"],
      "configurationFiles": [],
      "evidence": {
        "assessment": "referenced",
        "note": "Current source or configuration references were found at the head revision."
      }
    }
  ]
}
```

## Status values

| Status | Meaning |
| --- | --- |
| `added` | A dependency declaration exists only at the head revision. |
| `removed` | A declaration exists only at the base revision. |
| `changed` | The declared range or dependency section changed. |
| `resolved` | Only the lockfile's resolved version changed. |

`fields` identifies the exact dimensions that changed: `declaration`, `version`,
`section`, or `resolvedVersion`.

## Evidence

`usageFiles` contains literal imports at the head revision.
`configurationFiles` contains recognized package scripts and tool configuration
references. `evidence.assessment` is one of:

- `referenced`: current static references were found;
- `still-referenced`: the declaration was removed but references remain;
- `no-static-references`: neither scanner found a reference.

The last value is not proof that a package is safe to remove. Loaders, generated
code, shell scripts, and conventions outside the recognized configuration set
can still use it.

## History and links

`introduction` uses the same commit shape as the inventory report. `links.commit`
is available for GitHub remotes. Pull request and issue links are included only
when their numbers are present in the recorded commit subject or body; the
command does not make network requests to infer missing links.

`manifestPatch` is the Git diff for affected manifests. It is capped at 256 KiB;
`manifestPatchTruncated` states whether the cap was reached.
