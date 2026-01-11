/**
 * Parser for @sweepa-ignore comment commands
 *
 * Supports:
 * - @sweepa-ignore - Ignore next declaration
 * - @sweepa-ignore:unused-export - Ignore specific issue type
 * - @sweepa-ignore:unused-param paramName - Ignore specific param
 * - @sweepa-ignore:all - Ignore entire file (at top of file)
 * - @sweepa-ignore - Reason for ignoring
 */
import { type SourceFile } from 'ts-morph';
import type { IssueKind } from '../detectors/types.js';
export interface IgnoreDirective {
    /** Issue kinds to ignore (empty = all) */
    kinds: IssueKind[];
    /** Specific names to ignore (e.g., param names) */
    names: string[];
    /** Line where the directive appears */
    line: number;
    /** Optional reason provided */
    reason?: string;
}
export interface FileIgnores {
    /** Ignore entire file */
    ignoreAll: boolean;
    /** Directives by line number they apply to */
    byLine: Map<number, IgnoreDirective>;
    /** Directives by symbol name */
    byName: Map<string, IgnoreDirective>;
}
/**
 * Parse @sweepa-ignore directives from a source file
 */
export declare function parseIgnoreDirectives(sourceFile: SourceFile): FileIgnores;
/**
 * Check if an issue should be ignored based on parsed directives
 */
export declare function shouldIgnoreIssue(ignores: FileIgnores, kind: IssueKind, name: string, line: number): boolean;
/**
 * Parse all ignore directives for a project
 */
export declare function parseProjectIgnores(sourceFiles: SourceFile[]): Map<string, FileIgnores>;
//# sourceMappingURL=CommentParser.d.ts.map