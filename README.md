# Sweepa

Sweepa is a dead-code and dependency hygiene tool for TypeScript projects.

It combines:
- **Call-graph reachability** (unused exports, code-level issues)
- **Module reachability** (unused files)
- **Dependency analysis** (`unused-dependency`, `unlisted-dependency`, `unresolved-import`, `misplaced-dependency`)

## Install

This repo is written for Bun/Node.

### Use from source (dev)

```bash
cd sweepa
bun install
bun run build
node dist/cli.js --help
```

### Use in another repo

If you’re using Sweepa from another repo during development, point Node at the built CLI:

```bash
node /absolute/path/to/sweepa/dist/cli.js scan -p path/to/tsconfig.json
```

## CLI

### `scan`

Scan a single TypeScript project (a `tsconfig.json`).

```bash
sweepa scan -p apps/web/tsconfig.json
```

Useful flags:
- `--reachability`: enables entry-point reachability analysis for unused exports (recommended)
- `--dependencies`: only run dependency checks
- `--unused-files`: only run unused file checks
- `--unused-types`: only run unused exported types
- `--strict`: exit 1 if any issues are found (CI)
- `--format`: `console`, `json`, `github-actions`, `github-markdown`, `sarif`, `csv`
- `--quiet`: minimal output (especially useful with `--format json`)
- `--exclude`: exclude file patterns from call-graph building (used by `unused-export` scan)

### `check`

Alias for CI usage (`scan --strict --reachability`):

```bash
sweepa check -p apps/web/tsconfig.json
```

### `stats`

Call-graph stats (debugging/visibility):

```bash
sweepa stats -p apps/web/tsconfig.json
```

## What Sweepa reports

### Dependency issues

- **`unused-dependency`**: listed in package.json, not used
- **`unlisted-dependency`**: used, not listed
- **`unresolved-import`**: import specifier can’t be resolved by TS module resolution
- **`misplaced-dependency`**: prod-used dep in `devDependencies`, or dev-only dep in `dependencies`

### Code issues (selected)

- **`unused-export`**: exported symbol is never used/imported (best with `--reachability`)
- **`unused-type`**: type/interface is never referenced
- plus other code-level checks (unused params/methods/imports/etc.)

### File issues

- **`unused-file`**: file isn’t reachable from configured entry points

## Configuration

Sweepa loads config from the first match walking upward from the `tsconfig.json` directory:

- `package.json` under the `sweepa` key
- `.sweepa.json`, `.sweepa.yml`, `.sweepa.yaml`
- `sweepa.config.json`, `sweepa.config.yml`, `sweepa.config.yaml`

Schema is available at `schema.json`.

Config is **strict by default**: if a config file is found but invalid, Sweepa fails.
To bypass (not recommended in CI): `--no-config-strict`.

### Options

- `ignoreIssues`: `{ [globPattern]: IssueKind[] }` (ignore by file pattern + issue kind)
- `ignoreDependencies`: `string[]` (ignore dep names for dependency issue kinds)
- `ignoreUnresolved`: `string[]` (ignore unresolved import specifiers by glob)
- `unusedExported`: `off | barrels | all` (module-boundary unused exported checks; defaults to `off`)
- `unusedExportedIgnoreGenerated`: `boolean` (defaults to `true`)
- `workspaces`: `{ [workspaceDir]: SweepaConfig }` (layered overrides; most-specific wins)

### Example `.sweepa.json`

```json
{
  "ignoreIssues": {
    "apps/api/src/alpha/openapi/*.generated.ts": ["unused-type"]
  },
  "ignoreDependencies": ["shadcn"],
  "ignoreUnresolved": ["virtual:*"],
  "unusedExported": "barrels",
  "workspaces": {
    "apps/web": {
      "ignoreUnresolved": ["uno.css"]
    }
  }
}
```

## Fixing (`--fix`)

Sweepa has safe fixers for dependency hygiene:

```bash
sweepa scan -p apps/web/tsconfig.json --dependencies --fix
```

Currently:
- Removes **`unused-dependency`** entries from the nearest `package.json`.
- Moves **`misplaced-dependency`** entries between `dependencies` and `devDependencies`.

## Knip-style exported API checks

To get Knip-style “exported but never imported elsewhere” findings, enable:

```bash
sweepa scan -p apps/web/tsconfig.json --unused-exported
```

Or configure it:

```json
{ "unusedExported": "barrels" }
```

Use `--unused-exported-all` (or config `"unusedExported": "all"`) for strict mode.

## Baseline (incremental adoption)

Use baselines to adopt Sweepa gradually:

```bash
sweepa scan -p apps/web/tsconfig.json --format json --write-baseline .sweepa.baseline.json
sweepa scan -p apps/web/tsconfig.json --baseline .sweepa.baseline.json --strict
```

## Notes / gotchas

- Sweepa analyzes **one tsconfig at a time**; in monorepos use `workspaces` overrides for config.
- `unresolved-import` uses TypeScript module resolution; bundler-only virtual modules should be ignored via `ignoreUnresolved`.
- Generated code is usually better handled via `ignoreIssues` rather than turning off detectors.

