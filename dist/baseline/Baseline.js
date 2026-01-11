/**
 * Baseline support for incremental adoption
 *
 * A baseline file records known issues, allowing Sweepa to only report NEW issues.
 * This enables gradual cleanup without being overwhelmed by existing technical debt.
 */
import crypto from 'node:crypto';
import path from 'node:path';
/**
 * Create a stable hash for an issue
 * Uses symbol name, parent, kind, and file (not line number since that shifts)
 */
export function hashIssue(issue, projectRoot) {
    const relativePath = path.relative(projectRoot, issue.file);
    const input = [
        issue.kind,
        issue.name,
        issue.parent || '',
        relativePath,
    ].join('::');
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}
/**
 * Convert an Issue to a BaselineIssue
 */
export function toBaselineIssue(issue, projectRoot) {
    return {
        hash: hashIssue(issue, projectRoot),
        kind: issue.kind,
        name: issue.name,
        file: path.relative(projectRoot, issue.file),
        line: issue.line,
        parent: issue.parent,
    };
}
/**
 * Create a baseline from a set of issues
 */
export function createBaseline(issues, projectRoot) {
    const issuesByKind = {};
    for (const issue of issues) {
        issuesByKind[issue.kind] = (issuesByKind[issue.kind] || 0) + 1;
    }
    return {
        version: '1.0',
        timestamp: new Date().toISOString(),
        projectRoot: path.basename(projectRoot),
        totalIssues: issues.length,
        issuesByKind,
        issues: issues.map(issue => toBaselineIssue(issue, projectRoot)),
    };
}
/**
 * Compare current issues against a baseline
 * Returns only NEW issues not in the baseline
 */
export function filterNewIssues(issues, baseline, projectRoot) {
    const baselineHashes = new Set(baseline.issues.map(i => i.hash));
    return issues.filter(issue => {
        const hash = hashIssue(issue, projectRoot);
        return !baselineHashes.has(hash);
    });
}
/**
 * Validate a baseline file structure
 */
export function validateBaseline(obj) {
    if (!obj || typeof obj !== 'object')
        return false;
    const baseline = obj;
    if (baseline.version !== '1.0')
        return false;
    if (typeof baseline.timestamp !== 'string')
        return false;
    if (typeof baseline.totalIssues !== 'number')
        return false;
    if (!Array.isArray(baseline.issues))
        return false;
    // Validate each issue has required fields
    for (const issue of baseline.issues) {
        if (typeof issue !== 'object' || issue === null)
            return false;
        const i = issue;
        if (typeof i.hash !== 'string')
            return false;
        if (typeof i.kind !== 'string')
            return false;
        if (typeof i.name !== 'string')
            return false;
        if (typeof i.file !== 'string')
            return false;
    }
    return true;
}
//# sourceMappingURL=Baseline.js.map