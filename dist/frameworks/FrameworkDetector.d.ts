/**
 * Framework Detector
 *
 * Orchestrates detection of all supported frameworks and aggregates
 * their entry point configurations.
 */
import type { FrameworkDetection } from './types.js';
export interface DetectedFrameworks {
    /** All detected frameworks */
    frameworks: FrameworkDetection[];
    /** Combined entry point configuration */
    entryPointConfig: CombinedEntryPointConfig;
}
export interface CombinedEntryPointConfig {
    /** All entry file patterns from detected frameworks */
    entryFilePatterns: string[];
    /** Files to ignore completely */
    ignorePatterns: string[];
    /** Map of pattern -> specific exports to mark as used */
    patternExports: Map<string, string[] | '*'>;
}
/**
 * Detect all frameworks in a project
 */
export declare function detectFrameworks(projectRoot: string): DetectedFrameworks;
/**
 * Check if a file matches any of the entry point patterns
 */
export declare function isEntryPointFile(filePath: string, projectRoot: string, config: CombinedEntryPointConfig): boolean;
/**
 * Check if a file should be ignored
 */
export declare function shouldIgnoreFile(filePath: string, projectRoot: string, config: CombinedEntryPointConfig): boolean;
/**
 * Get exports that should be marked as entry points for a file
 */
export declare function getEntryExportsForFile(filePath: string, projectRoot: string, config: CombinedEntryPointConfig): string[] | '*' | null;
//# sourceMappingURL=FrameworkDetector.d.ts.map