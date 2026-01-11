/**
 * Detect unused enum cases
 *
 * Finds enum members that are never referenced in the codebase.
 */
import { Project } from 'ts-morph';
import type { Issue } from './types.js';
/**
 * Detect unused enum cases in a project
 */
export declare function detectUnusedEnumCases(project: Project): Issue[];
//# sourceMappingURL=UnusedEnums.d.ts.map