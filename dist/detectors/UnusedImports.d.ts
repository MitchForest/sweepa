/**
 * Detect unused imports
 *
 * Finds import statements where the imported symbols are never used in the file.
 */
import { Project } from 'ts-morph';
import type { Issue } from './types.js';
/**
 * Detect unused imports in a project
 */
export declare function detectUnusedImports(project: Project): Issue[];
//# sourceMappingURL=UnusedImports.d.ts.map