# Sweepa

> A call-graph-based dead code detector for TypeScript, designed for agent-driven cleanup workflows.

---

## Part 1: Prior Art Deep Dive

### Knip (TypeScript/JavaScript)

**Repository:** [github.com/webpro-nl/knip](https://github.com/webpro-nl/knip) — 9.9k stars, ISC license

**What it detects:**
- Unused files (source files never imported)
- Unused exports (exported symbols never imported elsewhere)
- Unused dependencies (packages in `package.json` never imported)
- Unused devDependencies

**Architecture:**

```
packages/knip/src/
├── graph/               # Import dependency graph
├── graph-explorer/      # Graph traversal
├── plugins/             # 128+ framework plugins
├── typescript/          # TS AST parsing
├── manifest/            # package.json parsing
├── ConfigurationChief.ts
├── DependencyDeputy.ts
├── ProjectPrincipal.ts  # Main orchestrator
├── WorkspaceWorker.ts   # Monorepo support
└── IssueCollector.ts
```

**How it works:**

1. **Entry point discovery** — Finds entry files via config (`index.ts`, `main.ts`, `cli.ts`) + `package.json` fields (`main`, `bin`, `exports`) + framework plugins

2. **Import graph construction** — Uses TypeScript compiler API to parse all files and build a graph of which modules import which other modules

3. **Graph traversal** — Starting from entry points, walks the import graph to find all reachable modules and symbols

4. **Unused detection** — Anything not reachable from an entry point is marked unused

**Key limitation: Import graph, not call graph.** Knip tracks module imports, not actual function calls. It cannot detect:
- Unused methods on a used class
- Unused function parameters
- Properties that are written but never read
- Exports that are imported but whose return values are ignored

**Plugin system:** 128+ hand-coded plugins to understand framework conventions (Next.js routes, Vite config, etc.). Always playing catch-up with new frameworks.

---

### Periphery (Swift)

**Repository:** [github.com/peripheryapp/periphery](https://github.com/peripheryapp/periphery) — 6k stars, MIT license

**What it detects:**
- Unused declarations (classes, structs, functions, protocols, enums)
- Unused function parameters
- Assign-only properties (written but never read)
- Redundant public accessibility (`public` but only used internally)
- Redundant protocol conformances (conforms but protocol never used as type)
- Unused imports
- Unused enum cases

**Architecture:**

```
Sources/
├── Configuration/       # CLI args, config file, output formats
├── Indexer/             # Reads compiler's index store
├── SourceGraph/         # Declaration reference graph
│   ├── Elements/        # Graph node types
│   └── Mutators/        # ~25 graph transformation passes
├── SyntaxAnalysis/      # SwiftSyntax AST parsing
├── ProjectDrivers/      # Xcode/SPM/Bazel support
├── PeripheryKit/        # Main analysis engine + results
│   └── Results/         # Output formatters (JSON, Checkstyle, etc.)
└── XcodeSupport/        # .xcodeproj parsing
```

**How it works:**

1. **Project build** — Periphery first builds your project with `xcodebuild`, which generates the **index store** — a structured database created by the Swift compiler containing all declarations and references

2. **Index store reading** — Reads the index store via Swift's IndexStoreDB API to get every declaration and every reference to it

3. **Source graph construction** — Builds an in-memory graph where nodes are declarations and edges are references (function calls, property accesses, type usages)

4. **Syntax analysis** — Supplements with SwiftSyntax parsing for comment commands (`// periphery:ignore`), attribute detection (`@objc`), etc.

5. **Graph mutation pipeline** — Runs ~25 mutators that transform the graph for special cases (see below)

6. **Traversal** — Walks from roots to find unreferenced declarations

7. **Baseline comparison** — Compares against baseline file to report only new issues

**Key advantage: Compiler's index store.** Because Periphery uses data from the actual compilation, it has perfect accuracy. The index store contains every reference the compiler saw.

**Key advantage: Call graph, not import graph.** Periphery tracks actual function invocations, property accesses, and type usages — not just module imports.

**Key advantage: Mutator pipeline.** The graph mutation architecture allows handling edge cases without polluting core logic.

#### Periphery's Mutator Pipeline

After building the raw graph, Periphery runs these mutators in sequence:

| Mutator | Purpose |
|---------|---------|
| `CodingKeyEnumReferenceBuilder` | Handle Codable synthesized code |
| `ComplexPropertyAccessorReferenceBuilder` | Handle computed property references |
| `DefaultConstructorReferenceBuilder` | Handle implicit constructor calls |
| `DynamicMemberRetainer` | Retain `@dynamicMemberLookup` |
| `EntryPointAttributeRetainer` | Retain `@main`, `@UIApplicationMain` |
| `EnumCaseReferenceBuilder` | Handle enum case references |
| `ExtensionReferenceBuilder` | Handle Swift extensions |
| `ExternalOverrideRetainer` | Retain overrides of external types |
| `ExternalTypeProtocolConformanceReferenceRemover` | Handle external protocol conformances |
| `GenericClassAndStructConstructorReferenceBuilder` | Handle generic type construction |
| `InheritedImplicitInitializerReferenceBuilder` | Handle inherited initializers |
| `InterfaceBuilderPropertyRetainer` | Retain `@IBOutlet`, `@IBAction` |
| `ObjCAccessibleRetainer` | Retain `@objc` accessible code |
| `PropertyWrapperRetainer` | Retain property wrapper code |
| `ProtocolConformanceReferenceBuilder` | Build protocol conformance edges |
| `ProtocolExtensionReferenceBuilder` | Handle protocol extensions |
| `PubliclyAccessibleRetainer` | Retain public API when configured |
| `RedundantExplicitPublicAccessibilityMarker` | Mark redundant `public` |
| `RedundantProtocolMarker` | Mark unused protocols |
| `ResultBuilderRetainer` | Retain result builder (`@ViewBuilder`) |
| `StringInterpolationAppendInterpolationRetainer` | Handle string interpolation |
| `StructImplicitInitializerReferenceBuilder` | Handle memberwise init |
| `SwiftTestingRetainer` | Retain Swift Testing framework |
| `SwiftUIRetainer` | Retain SwiftUI patterns |
| `UnusedImportMarker` | Mark unused imports |
| `UnusedParameterRetainer` | Handle protocol parameter rules |
| `UsedDeclarationMarker` | Final used/unused marking |
| `XCTestRetainer` | Retain XCTest patterns |

#### Periphery's Configuration Options

Periphery provides extensive configuration for false positive prevention:

**Retention flags:**
- `--retain-public` — Keep all public API (library mode)
- `--retain-objc-accessible` — Keep ObjC-accessible code
- `--retain-objc-annotated` — Keep explicitly `@objc` code
- `--retain-assign-only-properties` — Keep write-only properties
- `--retain-unused-protocol-func-params` — Keep interface params
- `--retain-codable-properties` — Keep serialized properties
- `--retain-encodable-properties` — Keep Encodable properties
- `--retain-swift-ui-previews` — Keep SwiftUI previews
- `--retain-files [patterns]` — Keep specific files
- `--no-retain-spi [names]` — Analyze specific SPIs

**Analysis flags:**
- `--disable-redundant-public-analysis` — Skip redundant public checks
- `--disable-unused-import-analysis` — Skip unused import checks

**External type handling:**
- `--external-codable-protocols` — External serialization protocols
- `--external-test-case-classes` — External test base classes

**Output formats:**
- `xcode` — Xcode warning format (default)
- `json` — Programmatic consumption
- `csv` — Spreadsheet import
- `checkstyle` — Jenkins/CI integration
- `codeclimate` — CodeClimate integration
- `github-actions` — GitHub Actions annotations
- `github-markdown` — PR comment format
- `gitlab-codequality` — GitLab CI integration

**Baseline support:**
- `--baseline <path>` — Compare against baseline, report only new issues
- `--write-baseline <path>` — Save current issues as baseline

**CI integration:**
- `--strict` — Exit 1 if any unused code found
- `--quiet` — Only output issues
- `--verbose` — Output config as YAML for reproducibility

---

### Comparison

| Aspect | Knip | Periphery |
|--------|------|-----------|
| **Graph type** | Import graph (module → module) | Call graph (declaration → declaration) |
| **Data source** | Parses TS independently | Reads compiler's index store |
| **Unused function params** | ❌ | ✅ |
| **Assign-only properties** | ❌ | ✅ |
| **Unused methods on used class** | ❌ | ✅ |
| **Redundant accessibility** | ❌ | ✅ |
| **Framework support** | 128+ plugins | Built-in Xcode/SPM/Bazel |
| **Dynamic code handling** | Plugins try to cover | N/A (Swift less dynamic) |

---

## Part 2: First Principles Requirements

### The Core Question

> "What code can be deleted without changing observable behavior?"

This requires understanding:
1. **Reachability** — Can execution ever reach this code?
2. **Reference counting** — Is this symbol referenced by reachable code?
3. **Effects** — Does this code have observable side effects?

### Why Call Graph > Import Graph

An import graph tracks: "Module A imports Module B"

A call graph tracks: "Function A calls Function B", "Class A accesses property B.x"

**Import graph misses:**

```typescript
// userService.ts
export class UserService {
  getUser(id: string) { ... }      // USED
  deleteUser(id: string) { ... }   // USED
  archiveUser(id: string) { ... }  // NEVER CALLED
}

// app.ts
import { UserService } from './userService'
const svc = new UserService()
svc.getUser('123')
svc.deleteUser('456')
// archiveUser is never called, but Knip can't detect this
```

Knip sees: `UserService` is exported and imported → entire class is "used"

A call graph would see: `archiveUser` method has zero call sites → unused

### Requirements

#### R1: Call Graph Analysis
Build a graph where:
- Nodes are declarations (functions, classes, methods, properties, types)
- Edges are references (calls, property accesses, type usages, extends/implements)

Track at the declaration level, not module level.

#### R2: Unused Parameter Detection
Identify function parameters that are never used within the function body.

```typescript
function greet(name: string, unused: number) {
  //                         ^^^^^^ never used
  return `Hello, ${name}`
}
```

#### R3: Assign-Only Property Detection
Identify properties that are written but never read.

```typescript
class Analytics {
  private lastEvent: string  // Written in track(), never read anywhere

  track(event: string) {
    this.lastEvent = event  // Write
    sendToServer(event)
  }
}
```

#### R4: Unused Method Detection
Identify methods on used classes that are never called.

```typescript
class UserService {
  getUser() { ... }     // Called
  deleteUser() { ... }  // Never called → unused
}
```

#### R5: Redundant Export Detection
Identify exports that are never imported by any other module.

#### R6: Dead Branch Detection
Identify code branches that can never execute.

```typescript
const DEBUG = false
if (DEBUG) {
  // This entire block is dead code
}
```

#### R7: Confidence Scoring
Not all detections are equally certain. Provide confidence scores:

- **High (95%+):** No references, no dynamic patterns, not in public API
- **Medium (70-95%):** Exported but no imports found, framework patterns uncertain
- **Low (<70%):** Dynamic access nearby, metaprogramming detected

#### R8: Framework-Aware Entry Points
Understand framework conventions without hardcoded plugins:
- File-based routing (Next.js, Remix, TanStack Router)
- Config-driven exports (Vite, ESLint, Tailwind)
- Test files (Vitest, Jest)

#### R9: Incremental Analysis
Support fast re-analysis when files change. Don't re-analyze the entire project.

#### R10: Agent-Friendly Interface
Designed to be called as tools by an LLM agent:
- `scan(options)` → list of unused code candidates
- `analyze(symbol)` → detailed analysis of a specific symbol
- `canDelete(symbol)` → confidence score
- `proposeDeletion(symbols)` → generates diff
- `verifyDeletion(diff)` → runs tests

#### R11: Baselines (from Periphery)
Track known issues over time to support incremental adoption:
- `--write-baseline <path>` — Save current issues
- `--baseline <path>` — Only report NEW issues not in baseline
- Essential for CI integration and gradual cleanup

```typescript
interface Baseline {
  version: string
  timestamp: string
  issues: BaselineIssue[]
}

interface BaselineIssue {
  file: string
  line: number
  symbol: string
  kind: IssueKind
  hash: string  // For matching across minor file changes
}
```

#### R12: Graph Mutator Pipeline (from Periphery)
Extensible pipeline for handling framework/language edge cases:
- Runs after initial graph construction
- Each mutator can add/remove edges or mark nodes as retained
- Allows special-case logic without polluting core analysis

```typescript
interface GraphMutator {
  name: string
  priority: number  // Lower runs first
  mutate(graph: CallGraph, config: Config): void
}
```

#### R13: Multiple Output Formats
Support various output formats for different consumers:
- `json` — Agent/programmatic consumption
- `console` — Human readable (default)
- `github-actions` — GitHub Actions annotations
- `github-markdown` — PR comment format
- `sarif` — Universal static analysis format (VS Code, GitHub Code Scanning)

#### R14: Retention Configuration
Flags to prevent false positives in specific scenarios:
- `--retain-exports` — Keep all exports (library mode)
- `--retain-decorated <decorators>` — Keep code with specific decorators
- `--retain-patterns <globs>` — Keep files matching patterns
- `--retain-serializable` — Keep properties used in JSON serialization

#### R15: Strict Mode for CI
- `--strict` — Exit code 1 if ANY issues found
- `--strict --baseline <path>` — Exit 1 only for NEW issues
- Enable failing builds on unused code introduction

#### R16: Report Filtering
Control what appears in results:
- `--exclude <patterns>` — Exclude files from analysis entirely
- `--report-exclude <patterns>` — Analyze but don't report
- `--report-include <patterns>` — Only report issues in matching files

#### R17: Comment Commands
Inline ignore directives:
```typescript
// @sweepa-ignore - Reason for keeping this
// @sweepa-ignore:unused-export
// @sweepa-ignore:unused-param
export function seemsUnused() { ... }
```

#### R18: Toggleable Analyses
Allow disabling specific detectors:
- `--disable-unused-exports`
- `--disable-unused-params`
- `--disable-assign-only`
- `--disable-redundant-exports`
- `--disable-unused-imports`

#### R19: External Type Handling
Handle types from `node_modules` correctly:
- Parameters implementing external interfaces → not unused
- Methods overriding external classes → not unused
- Decorators from external packages → check retention rules

#### R20: JSX/DSL Support
Handle JSX and other DSL patterns:
- JSX elements are "used" (not dead code)
- Tagged template literals (e.g., `sql\`...\``) → tag function is used
- React component children are references

#### R21: Decorator Retention
Handle decorator patterns common in TS frameworks:
- NestJS: `@Injectable`, `@Controller`, `@Get`, etc.
- TypeORM: `@Entity`, `@Column`, etc.
- Class-validator: `@IsString`, `@IsEmail`, etc.

```typescript
interface DecoratorRetention {
  name: string | RegExp
  retains: 'class' | 'method' | 'property' | 'parameter' | 'all'
}
```

#### R22: Redundant Export Detection (from Periphery)
Identify exports that could be internal:
- Export is never imported from outside its package → suggest removing `export`
- Export only used in tests → might be intentional, lower confidence
- Track WHERE references come from, not just IF they exist

```typescript
interface ExportAnalysis {
  symbol: string
  references: {
    sameFile: Reference[]
    samePackage: Reference[]
    differentPackage: Reference[]
  }
  suggestion: 'keep-public' | 'make-internal' | 'make-private' | 'remove'
}
```

---

## Part 3: Foundational Tooling Deep Dive

Building Sweepa requires choosing the right foundation. Here's a first-principles analysis of available tools.

### The Core Question: Type Information vs. Speed

Every tool in this space makes a fundamental tradeoff:

| Approach | Type Information | Speed | Example Tools |
|----------|------------------|-------|---------------|
| TypeScript Compiler API | Full type inference, generics, overloads | Slower (single-threaded, JS) | ts-morph, tsc |
| Tree-sitter | None (syntax only) | Very fast (incremental, C) | tree-sitter-typescript |
| Rust-based parsers | Partial or none | Very fast (multi-threaded, Rust) | SWC, Oxc, Biome |

**For Sweepa, we need type information.** Here's why:

```typescript
// Without types, we can't resolve this:
const handler = getHandler()  // What type? What methods exist?
handler.process(data)         // Is .process() used? Where's it defined?

// Without types, we can't handle:
type EventHandler = (e: Event) => void
const fn: EventHandler = (e) => { /* e is unused param, but matches interface */ }
```

Periphery works because Swift's index store has full type information from the compiler. We need the same for TypeScript.

---

### Tool 1: TypeScript Compiler API (Primary Foundation)

**What it is:** The programmatic interface to the TypeScript compiler itself.

**Key capabilities for Sweepa:**

| Capability | API | Sweepa Use |
|------------|-----|------------|
| Parse files to AST | `ts.createSourceFile()` | Get AST nodes |
| Create program | `ts.createProgram()` | Build full project with type info |
| Type checking | `program.getTypeChecker()` | Resolve types, infer generics |
| Symbol resolution | `checker.getSymbolAtLocation()` | Get symbol for any node |
| Find references | `findAllReferences()` | Core of call graph building |
| Declaration resolution | `symbol.getDeclarations()` | Find where something is defined |

**Critical feature: `findAllReferences()`**

```typescript
import * as ts from 'typescript'

// This is what IDEs use for "Find All References"
const languageService = ts.createLanguageService(host)
const references = languageService.findReferences(fileName, position)

// Returns: Every place in the project that references this symbol
// This is the foundation of Periphery's power - the compiler knows all references
```

**TypeScript Compiler API architecture:**

```
┌────────────────────────────────────────────────────────────┐
│                     ts.Program                              │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ SourceFile 1 │  │ SourceFile 2 │  │ SourceFile N │      │
│  │  (AST)       │  │  (AST)       │  │  (AST)       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
├────────────────────────────────────────────────────────────┤
│                     TypeChecker                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Symbol Table │  │ Type Cache   │  │ Reference Map│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────────────────────────────────────────┘
```

**Pros:**
- Full type information (generics, inference, overloads)
- Same analysis the compiler performs
- Handles all TypeScript edge cases correctly
- Well-maintained (by Microsoft)
- `findAllReferences()` is essentially what Periphery's index store provides

**Cons:**
- Single-threaded (Node.js limitation)
- Memory intensive for large projects
- Complex API with many edge cases
- No incremental parsing (must re-parse changed files)

---

### Tool 2: ts-morph (High-Level Wrapper)

**What it is:** A TypeScript Compiler API wrapper that provides a simpler, more discoverable API.

**Key features:**

```typescript
import { Project } from 'ts-morph'

// Create project from tsconfig
const project = new Project({ tsConfigFilePath: 'tsconfig.json' })

// Get all source files
const sourceFiles = project.getSourceFiles()

// Find all references to a symbol
const classDecl = sourceFile.getClass('UserService')
const references = classDecl.findReferencesAsNodes()  // Easy!

// Get definition from usage
const identifier = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)[0]
const definitions = identifier.getDefinitionNodes()  // Go to definition

// Check if a method is used
const method = classDecl.getMethod('deleteUser')
const refs = method.findReferencesAsNodes()
console.log(`deleteUser has ${refs.length} usages`)
```

**Why ts-morph for Sweepa:**

1. **`findReferences()` is trivial** — The core of call graph building
2. **`getDefinitionNodes()` is trivial** — Trace from usage to definition
3. **Navigation is simple** — `getClass()`, `getMethod()`, `getProperty()`, etc.
4. **Manipulation is possible** — Can generate deletion diffs

**Architecture comparison:**

| Task | Raw TypeScript API | ts-morph |
|------|-------------------|----------|
| Find class by name | 15 lines of AST walking | `sourceFile.getClass('Name')` |
| Find all references | Create LanguageService, host, etc. | `node.findReferencesAsNodes()` |
| Check if node is exported | Walk parent nodes, check modifiers | `node.isExported()` |
| Get symbol | Handle edge cases, undefined | `node.getSymbol()` (nullable) |

**Pros:**
- Much simpler API than raw TypeScript
- Same underlying power (uses TS compiler internally)
- Excellent TypeScript types
- Good documentation
- Active maintenance

**Cons:**
- Some overhead vs. raw API
- Still single-threaded
- Learning curve for TypeScript AST concepts

**Recommendation: Use ts-morph as primary interface to TypeScript.**

---

### Tool 3: tree-sitter (Not Recommended for Sweepa Core)

**What it is:** A parser generator that creates fast, incremental parsers for any language.

**Why it's popular:**
- **Very fast** — C-based, optimized for editors
- **Incremental** — Re-parses only changed parts
- **Multi-language** — Same API for any language
- **Query system** — S-expression queries for pattern matching

```typescript
// tree-sitter query example
const query = `
  (function_declaration
    name: (identifier) @function.name
    parameters: (formal_parameters
      (required_parameter
        pattern: (identifier) @param.name)))
`
// Returns all function names and their parameters
```

**Why NOT for Sweepa:**

```typescript
// tree-sitter sees this:
function process(item: Item) { ... }
//               ^^^^
//               What's Item? tree-sitter doesn't know.

// It's just syntax - no type resolution
// Can't tell if 'item' is used correctly, implements interface, etc.
```

| tree-sitter has | tree-sitter lacks |
|-----------------|-------------------|
| Fast parsing | Type information |
| Incremental updates | Symbol resolution |
| Syntax-level patterns | Overload resolution |
| Cross-language support | Generic type inference |
| Error recovery | Import resolution |

**Possible use case:** Supplementary fast scanning for obvious patterns before full analysis.

---

### Tool 4: graphology (Graph Data Structure)

**What it is:** A robust graph library for JavaScript/TypeScript.

**Why we need it:**

The call graph is the core data structure of Sweepa. We need:
- Directed edges (A calls B, not B calls A)
- Node attributes (declaration info, file location, visibility)
- Edge attributes (reference type: call, property access, type usage)
- Graph algorithms (traversal, cycle detection, connected components)

**graphology features:**

```typescript
import { DirectedGraph } from 'graphology'
import { dfs, bfs } from 'graphology-traversal'
import { connectedComponents } from 'graphology-components'
import { hasCycle } from 'graphology-dag'

// Create call graph
const graph = new DirectedGraph<SymbolNode, ReferenceEdge>()

// Add declaration nodes
graph.addNode('UserService.getUser', {
  kind: 'method',
  file: 'user-service.ts',
  line: 42,
  exported: true
})

// Add reference edges
graph.addEdge('App.handleRequest', 'UserService.getUser', {
  type: 'call',
  file: 'app.ts',
  line: 15
})

// Find all reachable from entry points
const reachable = new Set<string>()
dfs(graph, 'App.main', (node) => reachable.add(node))

// Find unused (not reachable from any entry point)
const unused = graph.nodes().filter(n => !reachable.has(n))

// Find strongly connected components (mutual recursion)
const components = stronglyConnectedComponents(graph)
```

**Why graphology over custom data structures:**
- Battle-tested algorithms (DFS, BFS, SCC, cycle detection)
- Efficient memory representation
- Good TypeScript types
- Visualization support (sigma.js) for debugging
- Standard library of graph algorithms

**Recommendation: Use graphology for call graph representation.**

---

### Tool 5: Rust-Based Parsers (SWC, Oxc, Biome)

**What they are:**
- **SWC** — Rust-based JS/TS compiler (used by Next.js, Vite)
- **Oxc** — Rust-based JS toolchain (parser, linter, minifier)
- **Biome** — Rust-based linter/formatter (Rome successor)

**Why they're fast:**
- Multi-threaded (Rust parallelism)
- Lower-level memory control
- No GC pauses
- Optimized for speed

**Why NOT for Sweepa:**

These tools optimize for **transformation** (compile TS to JS), not **analysis**.

| Tool | Type Information | Use Case |
|------|------------------|----------|
| SWC | Strips types, doesn't resolve | Compilation, bundling |
| Oxc | Partial (linting rules) | Fast linting, transformation |
| Biome | Minimal (formatting) | Formatting, simple linting |

**The fundamental issue:**

```typescript
// SWC sees:
import { getUser } from './api'
const user = getUser(id)

// SWC compiles to:
const { getUser } = require('./api')
const user = getUser(id)

// But SWC doesn't know:
// - What type does getUser return?
// - What interface does user implement?
// - Are there overloads of getUser?
```

**Possible hybrid approach:** Use SWC/Oxc for fast initial file parsing, then TypeScript for type-requiring analysis. Complexity may not be worth it.

---

### Tool 6: TypeScript Language Service

**What it is:** The API that powers IDE features (VS Code, WebStorm).

**Key features:**

| Feature | API Method | IDE Equivalent |
|---------|------------|----------------|
| Find all references | `findReferences()` | "Find All References" |
| Go to definition | `getDefinitionAtPosition()` | "Go to Definition" |
| Find implementations | `getImplementationAtPosition()` | "Go to Implementation" |
| Rename symbol | `findRenameLocations()` | Rename refactoring |
| Get quick info | `getQuickInfoAtPosition()` | Hover tooltip |
| Get completions | `getCompletionsAtPosition()` | Autocomplete |

**This is the secret sauce.** The Language Service has already solved "find all references" — the core of call graph building.

```typescript
import * as ts from 'typescript'

// Create a LanguageService (what ts-morph does internally)
const service = ts.createLanguageService(host, documentRegistry)

// Find all references to a symbol at position
const refs = service.findReferences(fileName, position)

// refs contains EVERY reference in the project
// This is equivalent to what Periphery gets from Swift's index store
```

**Important insight:** ts-morph wraps the Language Service, so we get these features through ts-morph's simpler API.

---

### Tool 7: ESLint Infrastructure (Limited Use)

**What it is:** The ESLint parser and rule system.

**Why NOT for core Sweepa:**
- ESLint rules run per-file, not cross-file
- No built-in "find all references"
- Designed for style/pattern checking, not usage analysis

**Possible use case:** Sweepa could optionally expose results as ESLint rules for IDE integration.

---

### Tool 8: TypeScript Project References

**What it is:** TypeScript's mechanism for multi-package projects.

**Why it matters:**

```json
// tsconfig.json
{
  "references": [
    { "path": "../core" },
    { "path": "../api" }
  ]
}
```

**For Sweepa monorepo support:**
- Use `ts.createSolutionBuilder()` for composite projects
- Understand package boundaries from project references
- Track cross-package imports for redundant export detection

---

### Recommended Tooling Stack

Based on first-principles analysis:

| Layer | Tool | Rationale |
|-------|------|-----------|
| **Core parsing** | TypeScript Compiler API via ts-morph | Full type info, find-references |
| **Graph structure** | graphology | Battle-tested algorithms |
| **CLI** | Commander.js or yargs | Standard CLI tooling |
| **Config** | cosmiconfig | Standard config file loading |
| **Testing** | Vitest | Fast, TypeScript-native |
| **Output** | chalk, ora | Terminal output formatting |

### What We Avoid and Why

| Tool | Why Not |
|------|---------|
| tree-sitter | No type information |
| SWC/Oxc/Biome | No type information for analysis |
| ESLint core | Per-file, no cross-file references |
| Babel | Slower than TS, less type info |
| Custom parser | Reinventing the wheel poorly |

### Key Insight: We're Building on the Same Foundation as Periphery

Periphery works because Swift's compiler generates an **index store** — a database of every declaration and every reference.

TypeScript's **Language Service** provides the same thing through `findReferences()`. We don't need to reinvent this. The TypeScript compiler has already solved the hard problem of "what references what."

Our job is to:
1. Use ts-morph to access this information easily
2. Build a call graph with graphology
3. Run our mutator pipeline on the graph
4. Detect unused code by traversing from entry points

---

## Part 4: Architecture

### Core Components

```
sweepa/
├── src/
│   ├── analyzer/
│   │   ├── CallGraphBuilder.ts      # Build call graph from TS AST
│   │   ├── ReferenceResolver.ts     # Resolve symbol references
│   │   ├── EntryPointDetector.ts    # Find entry points
│   │   └── VisibilityAnalyzer.ts    # Track reference sources (R22)
│   │
│   ├── graph/
│   │   ├── SymbolNode.ts            # Graph node (declaration)
│   │   ├── ReferenceEdge.ts         # Graph edge (reference)
│   │   ├── CallGraph.ts             # Graph data structure
│   │   └── GraphMutator.ts          # Mutator interface (R12)
│   │
│   ├── mutators/                    # Graph mutation pipeline (R12)
│   │   ├── MutatorRunner.ts         # Orchestrates mutator execution
│   │   ├── EntryPointRetainer.ts    # Mark entry points as roots
│   │   ├── DecoratorRetainer.ts     # Retain decorated code (R21)
│   │   ├── ReactComponentRetainer.ts # Retain JSX patterns (R20)
│   │   ├── TestRetainer.ts          # Retain test patterns
│   │   ├── SerializableRetainer.ts  # Retain JSON properties (R14)
│   │   ├── ExternalOverrideRetainer.ts # Retain external overrides (R19)
│   │   ├── ProtocolConformanceBuilder.ts # Build interface edges
│   │   ├── RedundantExportMarker.ts # Mark redundant exports (R22)
│   │   ├── UnusedImportMarker.ts    # Mark unused imports
│   │   └── UsedDeclarationMarker.ts # Final traversal
│   │
│   ├── detectors/
│   │   ├── UnusedExports.ts         # R5: Unused exports
│   │   ├── UnusedMethods.ts         # R4: Unused methods
│   │   ├── UnusedParams.ts          # R2: Unused parameters
│   │   ├── AssignOnlyProps.ts       # R3: Assign-only properties
│   │   ├── DeadBranches.ts          # R6: Dead branches
│   │   └── RedundantExports.ts      # R22: Could-be-internal exports
│   │
│   ├── frameworks/
│   │   ├── FrameworkDetector.ts     # Detect framework from config
│   │   ├── NextJS.ts                # Next.js conventions
│   │   ├── TanStackRouter.ts        # TanStack Router conventions
│   │   ├── Vite.ts                  # Vite conventions
│   │   ├── Hono.ts                  # Hono conventions
│   │   ├── Jest.ts                  # Jest test patterns
│   │   └── Vitest.ts                # Vitest test patterns
│   │
│   ├── scoring/
│   │   ├── ConfidenceScorer.ts      # R7: Confidence scoring
│   │   └── RiskAssessor.ts          # Assess deletion risk
│   │
│   ├── baseline/                    # Baseline support (R11)
│   │   ├── Baseline.ts              # Baseline data structure
│   │   ├── BaselineReader.ts        # Load baseline file
│   │   ├── BaselineWriter.ts        # Write baseline file
│   │   └── BaselineComparer.ts      # Compare results to baseline
│   │
│   ├── output/                      # Output formats (R13)
│   │   ├── Reporter.ts              # Format results
│   │   ├── ConsoleFormatter.ts      # Human readable
│   │   ├── JsonFormatter.ts         # JSON output
│   │   ├── GithubActionsFormatter.ts # GH Actions annotations
│   │   ├── GithubMarkdownFormatter.ts # PR comments
│   │   ├── SarifFormatter.ts        # SARIF format
│   │   └── DiffGenerator.ts         # Generate deletion diffs
│   │
│   ├── config/
│   │   ├── Config.ts                # Configuration types
│   │   ├── ConfigLoader.ts          # Load .sweepa.json
│   │   └── CommentParser.ts         # Parse @sweepa-ignore (R17)
│   │
│   ├── cli.ts                       # CLI interface
│   ├── api.ts                       # Programmatic API (for agents)
│   └── index.ts
│
├── tests/
│   ├── fixtures/                    # Test projects
│   │   ├── basic/                   # Simple cases
│   │   ├── react/                   # React/JSX
│   │   ├── nestjs/                  # NestJS decorators
│   │   └── monorepo/                # Multi-package
│   └── *.test.ts
│
├── package.json
├── tsconfig.json
└── README.md
```

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐
│  TypeScript     │     │  Config File    │
│  Project        │     │  .sweepa.json   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  TS Compiler    │     │  Config Loader  │
│  API            │     │  + Comment Parser│
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Call Graph     │◄────│  Framework      │
│  Builder        │     │  Detector       │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│          Mutator Pipeline               │
├─────────────────────────────────────────┤
│  1. EntryPointRetainer                  │
│  2. DecoratorRetainer                   │
│  3. ReactComponentRetainer              │
│  4. TestRetainer                        │
│  5. SerializableRetainer                │
│  6. ExternalOverrideRetainer            │
│  7. ProtocolConformanceBuilder          │
│  8. RedundantExportMarker               │
│  9. UnusedImportMarker                  │
│ 10. UsedDeclarationMarker (final pass)  │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Detectors      │
│  (unused, dead) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Confidence     │     │  Baseline       │
│  Scorer         │◄────│  Comparer       │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Results        │
│  (new issues)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Output         │
│  Formatter      │
└─────────────────┘
```

### Key Design Decisions

1. **Use ts-morph over raw TypeScript Compiler API** — ts-morph provides `findReferencesAsNodes()`, `getDefinitionNodes()`, and simpler navigation APIs while maintaining full type information. Reduces boilerplate significantly.

2. **Use graphology for graph data structure** — Battle-tested graph library with DFS/BFS traversal, cycle detection, connected components, and visualization support via sigma.js.

3. **Symbol-level granularity** — Track individual declarations, not just files or modules. Every function, method, property, class, type is a node in the call graph.

4. **Reference tracking via ts-morph's findReferences** — Leverage the TypeScript Language Service's `findReferences()` (exposed through ts-morph) — the same API that powers IDE "Find All References."

5. **Mutator pipeline architecture** — Following Periphery's design, handle edge cases via pluggable mutators rather than hardcoded special cases. This keeps core logic clean.

6. **Track reference sources, not just existence** — Know WHERE a reference comes from (same file, same package, different package) to enable redundant export detection.

7. **Baseline-first design** — Design for incremental adoption. Teams can adopt gradually, fixing new issues while tracking known ones.

8. **Output format flexibility** — Support multiple output formats from day one. JSON for agents, SARIF for tooling, markdown for PRs.

9. **Lazy analysis** — Don't build the full graph upfront. Build on-demand as detectors need it.

10. **Incremental via file hashing** — Cache analysis per-file, invalidate when file hash changes.

---

## Part 5: Implementation Plan

### Phase 1: Foundation (Week 1)

**Goal:** Basic call graph building and unused export detection.

#### 1.1 Project Setup
- [ ] Initialize npm package with TypeScript
- [ ] Install core dependencies:
  - `ts-morph` — TypeScript AST parsing and reference finding
  - `graphology` — Graph data structure
  - `graphology-traversal` — DFS/BFS algorithms
  - `graphology-components` — Connected components
  - `commander` — CLI framework
  - `cosmiconfig` — Config file loading
  - `chalk` — Terminal colors
- [ ] Set up test infrastructure (Vitest)
- [ ] Create test fixtures from `apps/api` and `apps/web`

#### 1.2 Call Graph Builder
- [ ] Create ts-morph `Project` from `tsconfig.json`
- [ ] Extract all declarations using ts-morph navigation:
  - `sourceFile.getClasses()`, `getMethods()`, `getFunctions()`, etc.
- [ ] Build graphology `DirectedGraph<SymbolNode, ReferenceEdge>`
- [ ] Use `node.findReferencesAsNodes()` to build edges

#### 1.3 Entry Point Detection
- [ ] Detect `package.json` entry points (`main`, `bin`, `exports`)
- [ ] Detect common patterns (`index.ts`, `src/index.ts`)
- [ ] Detect script files referenced in `package.json` scripts

#### 1.4 Unused Export Detector
- [ ] Find all exports across the project
- [ ] Find all imports
- [ ] Report exports with no corresponding imports

### Phase 2: Deep Analysis (Week 2)

**Goal:** Intra-function analysis for params, properties, methods.

#### 2.1 Unused Parameter Detector
- [ ] For each function, track parameter usage in body
- [ ] Handle destructuring patterns
- [ ] Handle rest parameters
- [ ] Handle protocol/interface requirements (if param is required by interface, not unused)

#### 2.2 Assign-Only Property Detector
- [ ] Track all property writes
- [ ] Track all property reads
- [ ] Report properties with writes but no reads

#### 2.3 Unused Method Detector
- [ ] For each class/object, track method definitions
- [ ] Track method call sites
- [ ] Report methods with no call sites

### Phase 3: Framework Support (Week 3)

**Goal:** Understand framework conventions for entry points.

#### 3.1 Framework Detection
- [ ] Detect Next.js via `next.config.js`
- [ ] Detect TanStack Router via `@tanstack/react-router` in deps
- [ ] Detect Hono via `hono` in deps
- [ ] Detect Vite via `vite.config.ts`

#### 3.2 Framework-Specific Entry Points
- [ ] Next.js: `app/**/page.tsx`, `app/**/route.ts`, etc.
- [ ] TanStack Router: `routes/**/*.tsx`, `router.tsx`
- [ ] Hono: Route handlers in source files
- [ ] Vite: Plugin configs, environment configs

### Phase 4: Mutator Pipeline (Week 4) ✅ COMPLETED

**Goal:** Implement the graph mutator architecture.

**Results on `apps/web`:**
- Before: 209 unused exports detected
- After: 44 unused exports detected (79% false positive reduction)
- Entry points: 26 detected (TanStack routes, router, module-level code)
- Reachable: 317 symbols traced via DFS traversal

**Results on `apps/api`:**
- Before: 209 unused exports detected (no reachability)
- After: 125 unused exports detected
- Entry points: 61 detected (Drizzle schemas, module-level imports)
- Reachable: 81 symbols traced via DFS traversal

#### 4.1 Mutator Framework
- [x] Define `GraphMutator` interface (`src/mutators/types.ts`)
- [x] Implement `MutatorRunner` with phase ordering (`src/mutators/MutatorRunner.ts`)
- [x] Implement `UsedDeclarationMarker` (final DFS traversal)

#### 4.2 Core Mutators
- [x] `EntryPointRetainer` — Mark entry points as roots
- [x] Module-level reference tracking (synthetic `<module>` nodes)
- [ ] `ExternalOverrideRetainer` — Retain interface implementations (future)
- [ ] `ProtocolConformanceBuilder` — Build interface edges (future)
- [ ] `UnusedImportMarker` — Mark unused imports (future)

#### 4.3 Framework Mutators
- [x] `DecoratorRetainer` — Retain decorated code (NestJS, TypeORM, etc.)
- [x] `JSXReferenceBuilder` — Build edges for JSX component usage
- [ ] `TestRetainer` — Retain Jest/Vitest test patterns (future)

### Phase 5: Baselines & Output (Week 5)

**Goal:** Baseline support and multiple output formats.

#### 5.1 Baseline Support
- [ ] Define baseline file format
- [ ] Implement `BaselineReader` — Load baseline file
- [ ] Implement `BaselineWriter` — Write baseline file
- [ ] Implement `BaselineComparer` — Compare results to baseline
- [ ] CLI: `--baseline` and `--write-baseline` flags

#### 5.2 Output Formats
- [ ] `ConsoleFormatter` — Human readable (default)
- [ ] `JsonFormatter` — Programmatic consumption
- [ ] `GithubActionsFormatter` — GH Actions annotations
- [ ] `GithubMarkdownFormatter` — PR comment format
- [ ] `SarifFormatter` — VS Code, GitHub Code Scanning

#### 5.3 CI Integration
- [ ] `--strict` flag (exit 1 on any issues)
- [ ] `--quiet` flag (minimal output)
- [ ] `--verbose` flag (debug output)

### Phase 6: Confidence & CLI (Week 6)

**Goal:** Confidence scoring, full CLI, and agent API.

#### 6.1 Confidence Scoring
- [ ] Score based on reference count (0 refs = high confidence)
- [ ] Reduce confidence for exports (might be used externally)
- [ ] Reduce confidence for dynamic patterns (`eval`, `require()`, template strings)
- [ ] Reduce confidence for decorator usage
- [ ] Boost confidence if in baseline (known issue)

#### 6.2 Full CLI
- [ ] `sweepa scan` — Scan project and report unused code
- [ ] `sweepa check` — Exit 1 if unused code found (for CI)
- [ ] `sweepa explain <symbol>` — Detailed analysis of a symbol
- [ ] `sweepa init` — Create config file interactively
- [ ] Config file support (`.sweepa.json` or `sweepa.config.ts`)
- [ ] All retention flags (`--retain-exports`, `--retain-decorated`, etc.)
- [ ] All filter flags (`--exclude`, `--report-exclude`, `--report-include`)
- [ ] All disable flags (`--disable-unused-exports`, etc.)

#### 6.3 Agent API
- [ ] `scan(options): Promise<Candidate[]>`
- [ ] `analyze(symbol): Promise<Analysis>`
- [ ] `canDelete(symbol): Promise<ConfidenceScore>`
- [ ] `proposeDeletion(symbols): Promise<Diff>`
- [ ] `verifyDeletion(diff): Promise<TestResults>` — Run tests after deletion

### Phase 7: Redundant Export Detection (Week 7)

**Goal:** Detect exports that could be internal.

#### 7.1 Visibility Analyzer
- [ ] Track WHERE references come from (same file, same package, different package)
- [ ] Classify each reference source
- [ ] Build `ExportAnalysis` for each export

#### 7.2 Redundant Export Detector
- [ ] Identify exports only used within same package
- [ ] Identify exports only used within same file
- [ ] Suggest visibility reduction

#### 7.3 Monorepo Awareness
- [ ] Detect package boundaries from `package.json`
- [ ] Understand workspace references
- [ ] Track cross-package usage

### Phase 8: Testing on Real Projects (Week 8)

**Goal:** Validate against `apps/api`, `apps/web`, and `mitch-forest`.

#### 8.1 Test on apps/api (Hono backend)
- [ ] Run analysis
- [ ] Compare results to Knip
- [ ] Identify false positives, adjust mutators
- [ ] Verify Hono route detection

#### 8.2 Test on apps/web (TanStack Router)
- [ ] Run analysis
- [ ] Verify TanStack Router entry points detected
- [ ] Compare results to Knip
- [ ] Test baseline workflow

#### 8.3 Test on mitch-forest
- [ ] Run analysis
- [ ] Verify framework detection
- [ ] Test React component retention

#### 8.4 Performance Testing
- [ ] Benchmark on large codebases
- [ ] Optimize hot paths
- [ ] Ensure <5s for ~100 files

---

## Part 6: Open Questions

1. **How to handle re-exports?** A module might re-export something that's imported elsewhere. Need to trace through re-exports.

2. **How to handle barrel files?** `index.ts` that re-exports everything. Are individual re-exports unused if the barrel is imported but only some items used?

3. **How to handle type-only imports?** `import type { Foo }` doesn't generate runtime code. Should we treat types differently?

4. **How to handle declaration merging?** TypeScript allows interfaces and namespaces to merge across files. How do we track this?

5. **How to handle dynamic imports?** `import('./foo.ts')` and `require(variable)` can't be statically analyzed. Mark as low confidence?

6. **How to handle config files?** Files like `vite.config.ts` are executed by build tools, not imported by our code. How do we trace their references?

7. **How to define package boundaries?** Use `package.json` as the boundary? Or directory structure? What about non-monorepo projects?

8. **How to handle published packages?** If a package is published to npm, we can't see external consumers. Assume all entry point exports are "public"?

9. **How to handle `export type` vs `export`?** Type-only exports have different implications (no runtime footprint). Separate analysis?

10. **How to handle decorators that modify runtime behavior?** Some decorators (like NestJS) fundamentally change how code is called. Need decorator-specific mutators?

11. **How to hash baseline issues for matching?** File contents change, lines shift. What's stable enough to match issues across runs?

---

## Part 7: Success Metrics

### Detection Quality
1. **Parity with Knip:** Catch at least what Knip catches for unused exports
2. **Additional catches:** Detect unused methods, params, properties that Knip misses
3. **Redundant exports:** Successfully identify exports that could be internal
4. **False positive rate:** <5% false positives on real projects

### Performance
5. **Speed:** Analyze `apps/web` (~100 files) in <5 seconds
6. **Incremental:** Re-analysis after single file change in <1 second (with cache)

### Usability
7. **CI integration:** Can fail builds on new unused code via `--strict --baseline`
8. **Agent usability:** Can be integrated into an agent workflow that creates cleanup PRs
9. **Gradual adoption:** Teams can adopt incrementally using baselines

### Output Quality
10. **Confidence accuracy:** High confidence issues are >95% true positives
11. **Actionable suggestions:** Each issue includes clear deletion guidance
12. **Diff generation:** Can generate valid deletion diffs for automated PRs

---

## Part 8: Requirements Summary

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| R1 | Call Graph Analysis | P0 | First principles |
| R2 | Unused Parameter Detection | P0 | Periphery |
| R3 | Assign-Only Property Detection | P1 | Periphery |
| R4 | Unused Method Detection | P0 | Periphery |
| R5 | Redundant Export Detection | P0 | Knip |
| R6 | Dead Branch Detection | P2 | First principles |
| R7 | Confidence Scoring | P1 | First principles |
| R8 | Framework-Aware Entry Points | P1 | Knip |
| R9 | Incremental Analysis | P2 | Performance |
| R10 | Agent-Friendly Interface | P0 | Goal |
| R11 | Baselines | P0 | Periphery |
| R12 | Graph Mutator Pipeline | P0 | Periphery |
| R13 | Multiple Output Formats | P1 | Periphery |
| R14 | Retention Configuration | P1 | Periphery |
| R15 | Strict Mode for CI | P1 | Periphery |
| R16 | Report Filtering | P1 | Periphery |
| R17 | Comment Commands | P2 | Periphery |
| R18 | Toggleable Analyses | P2 | Periphery |
| R19 | External Type Handling | P1 | Periphery |
| R20 | JSX/DSL Support | P1 | TypeScript |
| R21 | Decorator Retention | P1 | TypeScript |
| R22 | Redundant Export Detection | P1 | Periphery |

**Priority Key:**
- P0: Must have for MVP
- P1: Important for production use
- P2: Nice to have

---

## Part 9: Implementation Status (Updated)

### Completed Features ✅

#### Detection Capabilities
- [x] **Unused exports** - Call graph analysis with reachability
- [x] **Unused function parameters** - Deep function body analysis
- [x] **Assign-only properties** - Written but never read
- [x] **Unused methods** - Methods with no call sites
- [x] **Unused imports** - Import statements not used in file
- [x] **Unused enum cases** - Enum members never referenced
- [x] **Redundant exports** - Exports only used internally (Periphery "redundant public accessibility")

#### Output Formats
- [x] **Console** - Human-readable with colors and grouping
- [x] **JSON** - Programmatic consumption
- [x] **GitHub Actions** - `::warning` and `::error` annotations
- [x] **GitHub Markdown** - PR comment format
- [x] **SARIF** - VS Code, GitHub Code Scanning compatible
- [x] **CSV** - Spreadsheet import

#### Baseline Support
- [x] **`--write-baseline <path>`** - Save current issues to baseline file
- [x] **`--baseline <path>`** - Compare against baseline, report only NEW issues
- [x] **Stable issue hashing** - Hash by kind+name+parent+file (not line number)
- [x] **Baseline validation** - Verify baseline file format

#### Comment Commands
- [x] **`@sweepa-ignore`** - Ignore next declaration
- [x] **`@sweepa-ignore:unused-export`** - Ignore specific issue type
- [x] **`@sweepa-ignore:all`** - Ignore entire file (at top of file)
- [x] **Reason capture** - `@sweepa-ignore - Reason for keeping`

#### CI Integration
- [x] **`--strict`** - Exit code 1 when issues found
- [x] **`--quiet`** - Minimal output
- [x] **`-v, --verbose`** - Debug output
- [x] **`sweepa check`** - Alias for `scan --strict --reachability`

#### Retention Flags
- [x] **`--retain-public`** - Keep all exports (library mode)
- [x] **`--retain-decorated`** - Keep all decorated code
- [x] **`--retain-tests`** - Skip test files

#### Framework Support
- [x] **TanStack Start** - Route file detection, router entry points
- [x] **Hono** - API route handlers
- [x] **Vitest** - Test file patterns
- [x] **Drizzle** - Schema tables as entry points

#### Mutator Pipeline
- [x] **EntryPointRetainer** - Mark framework entry points
- [x] **DecoratorRetainer** - Retain decorated code
- [x] **JSXReferenceBuilder** - Build edges for JSX components
- [x] **UsedDeclarationMarker** - Final DFS traversal from roots

### Remaining Work (Future Phases)

#### Not Yet Implemented
- [ ] **Incremental analysis** - Cache graph, invalidate on file change
- [ ] **`sweepa explain <symbol>`** - Detailed analysis of a symbol
- [ ] **`sweepa init`** - Interactive config file creation
- [ ] **Config file support** - `.sweepa.json` or `sweepa.config.ts`
- [ ] **Agent API** - Programmatic interface for LLM agents
- [ ] **Diff generation** - Generate deletion diffs for automated PRs
- [ ] **External override retainer** - Handle interface implementations
- [ ] **Protocol conformance builder** - Build interface edges
- [ ] **Confidence scoring enhancements** - Dynamic patterns, decorator usage
- [ ] **Monorepo package boundary detection** - Scan for package.json

### Periphery Parity Status

| Feature | Periphery | Sweepa |
|---------|-----------|--------|
| Unused declarations | ✅ | ✅ |
| Unused function parameters | ✅ | ✅ |
| Assign-only properties | ✅ | ✅ |
| Unused methods | ✅ | ✅ |
| Unused imports | ✅ | ✅ |
| Unused enum cases | ✅ | ✅ |
| Redundant public accessibility | ✅ | ✅ |
| Comment commands | ✅ | ✅ |
| Baseline support | ✅ | ✅ |
| Multiple output formats | ✅ | ✅ |
| CI integration (--strict) | ✅ | ✅ |
| Retention flags | ✅ | ✅ |
| Framework detection | ✅ | ✅ (4 frameworks) |
| Mutator pipeline | ✅ (~25) | ✅ (4 mutators) |

**Sweepa now has feature parity with Periphery's core functionality for TypeScript projects!**
