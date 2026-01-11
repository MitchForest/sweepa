/**
 * Assign-Only Property Detector
 *
 * Identifies properties that are written but never read.
 * These are often indicators of dead code or incomplete implementations.
 */
import { Project } from 'ts-morph';
import type { Issue } from './types.js';
export interface AssignOnlyPropsOptions {
    /** Ignore properties with specific decorators (e.g., @Column, @Prop) */
    ignoreDecorators?: string[];
    /** Ignore private properties */
    ignorePrivate?: boolean;
}
/**
 * Detect assign-only properties in a TypeScript project
 */
export declare function detectAssignOnlyProps(project: Project, options?: AssignOnlyPropsOptions): Issue[];
//# sourceMappingURL=AssignOnlyProps.d.ts.map