import type { Issue } from './types.js';
/**
 * Detect unused exported types (type aliases + interfaces).
 *
 * Uses the TypeScript language service `findReferences` for correctness.
 * This is intentionally closer to how editor tooling works (and more like Knip)
 * than hand-rolled AST scans.
 */
export declare function detectUnusedTypes(options: {
    tsConfigPath: string;
    projectRoot: string;
    reachableFiles?: Set<string>;
    /** Defaults true: match Knip's `types` check (unused exported types). */
    exportedOnly?: boolean;
}): Issue[];
//# sourceMappingURL=UnusedTypes.d.ts.map