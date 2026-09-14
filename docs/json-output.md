# JSON output

`depstory --json` is intended for scripts, CI jobs, and report generators. The
top-level `schemaVersion` is the compatibility boundary. New optional fields may
be added to version 1; existing fields will not be renamed or removed without a
new version.

```json
{
  "schemaVersion": 1,
  "project": "demo-api",
  "manifestCount": 1,
  "repository": {
    "isRepository": true,
    "isShallow": false
  },
  "stories": [
    {
      "name": "zod",
      "version": "^4.0.0",
      "section": "dependencies",
      "workspace": "demo-api",
      "workspacePath": ".",
      "manifestPath": "package.json",
      "introduced": {
        "hash": "68d9f4a1f12d0000000000000000000000000000",
        "shortHash": "68d9f4a1",
        "date": "2026-09-14T10:20:30+03:00",
        "author": "Example Maintainer",
        "subject": "validate incoming requests",
        "body": ""
      },
      "usageFiles": ["src/api.ts", "src/schema.ts"]
    }
  ]
}
```

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Output contract version; currently `1`. |
| `project` | string | Root package name, or the root directory name when unnamed. |
| `manifestCount` | integer | Number of manifests included after workspace filtering. |
| `repository.isRepository` | boolean | Whether the target is inside a Git work tree. |
| `repository.isShallow` | boolean | Whether Git reports a shallow repository. |
| `stories` | array | One item per dependency declaration. |
| `stories[].name` | string | Package name as declared in the manifest. |
| `stories[].version` | string | Unmodified version range or protocol. |
| `stories[].section` | string | Manifest section containing the declaration. |
| `stories[].workspace` | string | Workspace package name or directory fallback. |
| `stories[].workspacePath` | string | POSIX-style path from the repository root; `.` means root. |
| `stories[].manifestPath` | string | POSIX-style path to the declaring manifest. |
| `stories[].introduced` | object or null | Earliest matching commit in the available history. |
| `stories[].usageFiles` | string array | Current literal source imports, sorted by path. |

An `introduced` value of `null` has more than one possible cause. Check the
`repository` object first. In a complete Git repository, `null` means no matching
addition was found at the manifest's current path.

## Filtering example

The following prints packages with no direct source import. Treat the result as
an investigation list rather than an automatic removal list.

```bash
depstory --json | jq -r '.stories[] | select(.usageFiles | length == 0) | .name'
```
