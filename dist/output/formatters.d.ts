/**
 * Output formatters for different consumers
 */
import type { Issue } from '../detectors/types.js';
/**
 * Format issues for GitHub Actions annotations
 * Uses ::warning and ::error workflow commands
 */
export declare function formatGitHubActions(issues: Issue[], projectRoot: string): string;
/**
 * Format issues as GitHub Markdown for PR comments
 */
export declare function formatGitHubMarkdown(issues: Issue[], projectRoot: string, options?: {
    maxIssues?: number;
}): string;
/**
 * Format issues as SARIF (Static Analysis Results Interchange Format)
 * Compatible with VS Code, GitHub Code Scanning, and many other tools
 */
export declare function formatSARIF(issues: Issue[], projectRoot: string, toolVersion?: string): object;
/**
 * Format issues as CSV
 */
export declare function formatCSV(issues: Issue[], projectRoot: string): string;
//# sourceMappingURL=formatters.d.ts.map