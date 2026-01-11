/**
 * Baseline support for incremental adoption
 *
 * A baseline file records known issues, allowing Sweepa to only report NEW issues.
 * This enables gradual cleanup without being overwhelmed by existing technical debt.
 */
import type { Issue, IssueKind } from '../detectors/types.js';
/**
 * A single issue recorded in the baseline
 */
export interface BaselineIssue {
    /** Hash for stable matching across file changes */
    hash: string;
    /** Issue kind */
    kind: IssueKind;
    /** Symbol name */
    name: string;
    /** Relative file path */
    file: string;
    /** Line number (may shift) */
    line: number;
    /** Parent symbol (for methods/properties) */
    parent?: string;
}
/**
 * The baseline file format
 */
export interface Baseline {
    /** Version of the baseline format */
    version: '1.0';
    /** When the baseline was generated */
    timestamp: string;
    /** Project root the baseline was generated from */
    projectRoot: string;
    /** Total number of issues at time of baseline */
    totalIssues: number;
    /** Issues by kind count */
    issuesByKind: Record<string, number>;
    /** The actual issues */
    issues: BaselineIssue[];
}
/**
 * Create a stable hash for an issue
 * Uses symbol name, parent, kind, and file (not line number since that shifts)
 */
export declare function hashIssue(issue: Issue, projectRoot: string): string;
/**
 * Convert an Issue to a BaselineIssue
 */
export declare function toBaselineIssue(issue: Issue, projectRoot: string): BaselineIssue;
/**
 * Create a baseline from a set of issues
 */
export declare function createBaseline(issues: Issue[], projectRoot: string): Baseline;
/**
 * Compare current issues against a baseline
 * Returns only NEW issues not in the baseline
 */
export declare function filterNewIssues(issues: Issue[], baseline: Baseline, projectRoot: string): Issue[];
/**
 * Validate a baseline file structure
 */
export declare function validateBaseline(obj: unknown): obj is Baseline;
//# sourceMappingURL=Baseline.d.ts.map