/**
 * Detect redundant exports (redundant public accessibility)
 *
 * Finds exports that are only used within the same package/module,
 * suggesting they could be made internal (non-exported).
 *
 * This is the TypeScript equivalent of Periphery's "redundant public accessibility" detection.
 */
import { Project } from 'ts-morph';
import type { Issue } from './types.js';
export interface ExportAnalysis {
    /** Symbol name */
    name: string;
    /** File where symbol is exported */
    file: string;
    /** Line number */
    line: number;
    /** References by source */
    references: {
        sameFile: number;
        samePackage: number;
        differentPackage: number;
        tests: number;
    };
    /** Suggested action */
    suggestion: 'keep-public' | 'make-internal' | 'make-private' | 'remove';
}
/**
 * Detect redundant exports in a project
 */
export declare function detectRedundantExports(project: Project, projectRoot: string): Issue[];
//# sourceMappingURL=RedundantExports.d.ts.map