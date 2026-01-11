/**
 * Unused Method Detector
 *
 * Identifies methods on classes that are never called.
 * This goes beyond Knip's import-graph analysis to find methods
 * on used classes that are themselves unused.
 */
import { Project } from 'ts-morph';
import type { Issue } from './types.js';
export interface UnusedMethodsOptions {
    /** Ignore methods with specific decorators (e.g., @Get, @Post) */
    ignoreDecorators?: string[];
    /** Ignore lifecycle methods (e.g., constructor, ngOnInit) */
    ignoreLifecycleMethods?: boolean;
    /** Ignore methods starting with underscore */
    ignoreUnderscoreMethods?: boolean;
}
/**
 * Detect unused methods in a TypeScript project
 */
export declare function detectUnusedMethods(project: Project, options?: UnusedMethodsOptions): Issue[];
//# sourceMappingURL=UnusedMethods.d.ts.map