import type { Issue, IssueKind } from '../detectors/types.js';
export interface SweepaConfig {
    /**
     * Ignore issues by file pattern, similar to Knip's ignoreIssues.
     *
     * Keys are glob-ish patterns (supports `*` and `**`).
     * Values are issue kinds to ignore for matching files.
     */
    ignoreIssues?: Record<string, IssueKind[]>;
    /**
     * Ignore dependency names for dependency-related issue kinds.
     * Applies to both unused-dependency and unlisted-dependency.
     */
    ignoreDependencies?: string[];
    /**
     * Ignore unresolved import specifiers (e.g. bundler virtual modules).
     * Entries are glob-ish patterns (supports `*` and `**`).
     */
    ignoreUnresolved?: string[];
    /**
     * Module-boundary exported symbol/type checks (Knip-style).
     *
     * - off: do not run these checks
     * - barrels: run only for barrel/re-export modules (safer defaults)
     * - all: run for all reachable modules (strict)
     */
    unusedExported?: 'off' | 'barrels' | 'all';
    /**
     * Ignore generated files for unusedExported checks by default.
     */
    unusedExportedIgnoreGenerated?: boolean;
    /**
     * Workspace-specific overrides, keyed by workspace directory relative to the configRoot.
     * Example: { "apps/web": { ignoreIssues: {...} } }
     */
    workspaces?: Record<string, SweepaConfig>;
}
export interface LoadedSweepaConfig {
    config: SweepaConfig;
    /** Directory containing the loaded config file (or projectRoot if none). */
    configRoot: string;
    /** File path of the loaded config, if any. */
    configPath?: string;
    /** Validation errors (empty if valid). */
    errors: string[];
}
export declare function resolveSweepaConfigForProject(options: {
    loaded: LoadedSweepaConfig;
    projectRoot: string;
}): {
    configRoot: string;
    config: SweepaConfig;
};
export declare function loadSweepaConfig(projectRoot: string): LoadedSweepaConfig;
export declare function applyConfigIgnores(issues: Issue[], config: SweepaConfig, configRoot: string): Issue[];
/**
 * Simple glob matching (supports `**` and `*`), anchored to full path.
 */
declare function matchesGlob(filePath: string, pattern: string): boolean;
export declare const __private__matchesGlob: typeof matchesGlob;
export {};
//# sourceMappingURL=SweepaConfig.d.ts.map