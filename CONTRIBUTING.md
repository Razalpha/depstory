# Contributing to depstory

Thanks for helping make dependency history easier to understand.

## Good first contributions

- Add an import syntax fixture that is not detected yet.
- Improve Windows, macOS, or Linux path coverage.
- Add a new output format without changing the analysis result.
- Document a real dependency-removal investigation.

For larger package-manager or language adapters, open an issue first so the data
contract can be agreed before implementation.

## Development

```bash
npm run check
npm test
```

Keep the CLI local-first, read-only, and deterministic. New behavior should have
a fixture that does not require network access.
