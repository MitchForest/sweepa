/**
 * Unused Parameter Detector
 *
 * Identifies function parameters that are never used within the function body.
 * Handles destructuring patterns, rest parameters, and interface requirements.
 */
import { Project } from 'ts-morph';
import type { Issue } from './types.js';
export interface UnusedParamsOptions {
    /** Ignore parameters starting with underscore */
    ignoreUnderscoreParams?: boolean;
    /** Ignore parameters required by interface/type implementation */
    ignoreInterfaceParams?: boolean;
}
/**
 * Detect unused parameters in a TypeScript project
 */
export declare function detectUnusedParams(project: Project, options?: UnusedParamsOptions): Issue[];
//# sourceMappingURL=UnusedParams.d.ts.map