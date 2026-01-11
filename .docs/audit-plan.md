# Sweepa Audit & Roadmap: Replace Knip (inspired by Knip + Periphery)

## Objective

Replace Knip with Sweepa for JS/TS hygiene in a Bun/TS monorepo (like `scribble`) while staying credible and useful for other repos when Sweepa is open sourced.

**Success criteria (replacement bar):**
- **Parity on the “big 3”:**
  - **Unused files** (dead modules never executed / never imported from any entrypoint)
  - **Unused + unlisted dependencies** (prod vs dev), plus unresolved imports and binaries/scripts
  - **Unused exports/types/members** with low false positives across common frameworks and build setups
- **CI-grade outputs** (JSON, SARIF, GitHub Actions, Markdown) and deterministic baselines
- **Fixers** (`--fix`) for safe, common changes (deps, exports, optionally files behind a flag)
- **Performance suitable for PR gating**

## Current state (Sweepa today)

Sweepa already has:
- **Call graph + reachability mode** (Periphery-inspired: entrypoints -> traverse -> unused)
- **Detectors**: unused exports/params/methods/imports/enum cases, assign-only properties, redundant exports
- **Baseline support** (stable hashing)
- **Output formats** including SARIF and GitHub Actions

Gaps vs Knip:
- No **unused files** check (Knip `files`)
- No **dependency** / `package.json` analysis (Knip `dependencies`, `unlisted`, `unresolved`, `binaries`, `catalog`)
- No **unused types** parity (Knip `types`, `nsTypes`, etc.)
- Module resolution is not yet a first-class, reusable core (required for Knip parity)

## Architectural principles (Periphery + Knip lessons)

- **Periphery principle: trust first.** Incorrect analysis at scale is worse than no analysis.
- **Knip principle: repo integration is the product.** Plugins/framework detection + config discovery matter as much as “graph theory”.
- **Single canonical identity.** One symbol/file ID scheme everywhere (no ad hoc strings).
- **Centralize module resolution.** Everything depends on correct TS resolution: unused files, deps, exports, entrypoints.
- **Extensible pipeline.** Keep Sweepa’s mutator phases, but make them a stable plugin surface.

## Phase 0 — Correctness foundations (must-have)

### 0.1 Canonical IDs
- Define a `SymbolId` helper and ban hand-built IDs across detectors/mutators.
- Canonicalize on **absolute file paths** + qualified name for symbols.
- Canonicalize on **absolute file paths** for modules/files.

### 0.2 Module resolution as a core library (blocker for Knip parity)
Implement a `ModuleResolver` that supports:
- `tsconfig` compiler options (baseUrl/paths)
- Node resolution including `package.json` `"exports"` / `"imports"`
- Extensions + index resolution (`.ts/.tsx/.mts/.cts`, `/index.ts`, etc.)
- Workspace package boundaries (monorepo)

Implementation guidance:
- Prefer TypeScript compiler APIs (`typescript.resolveModuleName`) as the ground truth.
- Use ts-morph for AST convenience only; do not reimplement resolution heuristics.

### 0.3 Graph edge semantics
- For reachability analysis, treat edges as a **set** (connectivity), not multi-edges.
- If we need locations/counts later, store metadata separately (edge attributes or side tables).

## Phase 1 — Knip parity: unused files + dependencies + exports/types

### 1.1 Unused files (Knip `files`)
Core algorithm:
- Discover entry files (configurable + plugin-provided)
- Build a **module graph** (file -> resolved import targets)
- Mark reachable modules from entrypoints
- Report any project files not reachable (with ignore rules)

Entry sources:
- Explicit `entry` patterns in Sweepa config
- Framework detectors (TanStack Start routes, Hono route modules, Vitest tests, etc.)
- Always-keep patterns for configs (e.g. `*.config.ts`)

### 1.2 Dependency analysis (Knip `dependencies`, `unlisted`, `unresolved`, `binaries`)
Analyze each workspace `package.json`:
- Map non-relative imports to packages (using resolver)
- Classify usage:
  - prod-only -> `dependencies`
  - dev/test/tooling-only -> `devDependencies`
  - referenced but not listed -> `unlisted`
  - listed but never referenced -> `unused dependency`
- Surface unresolved imports (optional parity)
- Track `bin` usage via scripts / known tooling entrypoints (plugin-based)

### 1.3 Exports/types/members parity (Knip `exports`, `types`, `classMembers`, etc.)
Extend Sweepa detectors:
- **Unused types** (type exports and internal types)
- Better handling of:
  - re-exports/barrels
  - type-only imports/exports
  - dynamic imports
  - side-effect-only modules
- Avoid noisy cascades:
  - If a file is unused, avoid spamming export-level issues for it by default.

## Phase 2 — Plugin system (ecosystem integration)

Create a stable plugin interface inspired by Knip and aligned with Sweepa’s mutator pipeline.

Plugins can contribute:
- Entrypoints (files and/or exports)
- Retention rules (treat as used/retained)
- Config-file discovery (vite, drizzle, eslint, tailwind, etc.)
- Import resolvers for non-standard specifiers (virtual modules, Vite aliases, etc.)

Ship built-in plugins:
- TanStack Start
- Hono
- Vitest
- Drizzle
- Vite (config + plugin hooks)

## Phase 3 — Fixers & DX (replace Knip in practice)

### 3.1 `--fix` (safe-by-default)
- Remove unused deps from `package.json`
- Remove unused imports
- Remove unused exports (and update barrels/re-exports safely)
- Optional file deletion behind an explicit flag (like Knip’s `--allow-remove-files`)

### 3.2 Config format + schema
- Provide `sweepa.config.(ts|js|json)` with a published JSON schema.
- Per-workspace configuration (entry, project, ignore, ignoreDependencies, ignoreIssues, rules severities).

### 3.3 Deterministic machine output
- Ensure JSON/SARIF output is clean (no mixed logs).
- Keep SARIF compatible with GitHub code scanning.

## Phase 4 — Performance (caching explicitly allowed)

We will implement caching because it’s typically required for PR gating on mid/large repos.

Caching strategy:
- Cache resolved module graph + symbol tables per file with content hashes
- Incremental recompute only for changed files
- Cache invalidation keyed on:
  - tsconfig changes
  - lockfile/package.json changes
  - plugin config changes

Notes:
- Caching must be correct; correctness > speed.
- Provide flags to disable caching for debugging.

## Phase 5 — Rollout plan (safe migration off Knip)

1. Run Sweepa **side-by-side** with Knip in CI (informational).
2. Close parity gaps:
   - unused files counts
   - deps/unlisted/unresolved parity
   - types/exports parity
3. Gate PRs on Sweepa.
4. Remove Knip from tooling.

## Immediate execution plan (next milestones)

1. Implement TypeScript-correct **module resolution** as a reusable core.
2. Implement **unused files** detection and validate against Knip’s output in `scribble/apps/web`.
3. Implement dependency analysis for workspace `package.json`.
4. Implement unused types detector parity.
5. Add fixers + schema.
6. Add caching once correctness is proven on real repos.

