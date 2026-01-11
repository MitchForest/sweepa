/**
 * Output formatters for different consumers
 */
import path from 'node:path';
/**
 * Format issues for GitHub Actions annotations
 * Uses ::warning and ::error workflow commands
 */
export function formatGitHubActions(issues, projectRoot) {
    const lines = [];
    for (const issue of issues) {
        const relativePath = path.relative(projectRoot, issue.file);
        const level = issue.confidence === 'high' ? 'error' : 'warning';
        const title = formatIssueTitle(issue.kind);
        // GitHub Actions annotation format
        // ::warning file={name},line={line},col={col},title={title}::{message}
        lines.push(`::${level} file=${relativePath},line=${issue.line},col=${issue.column},title=${title}::${issue.message}`);
    }
    return lines.join('\n');
}
/**
 * Format issues as GitHub Markdown for PR comments
 */
export function formatGitHubMarkdown(issues, projectRoot, options) {
    const maxIssues = options?.maxIssues ?? 50;
    const lines = [];
    // Group by kind
    const byKind = new Map();
    for (const issue of issues) {
        const existing = byKind.get(issue.kind) || [];
        existing.push(issue);
        byKind.set(issue.kind, existing);
    }
    // Header
    lines.push('## 🧹 Sweepa Analysis');
    lines.push('');
    lines.push(`Found **${issues.length}** issue${issues.length !== 1 ? 's' : ''}`);
    lines.push('');
    // Summary table
    lines.push('| Issue Type | Count |');
    lines.push('|------------|-------|');
    for (const [kind, kindIssues] of byKind.entries()) {
        lines.push(`| ${formatIssueTitle(kind)} | ${kindIssues.length} |`);
    }
    lines.push('');
    // Details by kind (collapsible)
    let shown = 0;
    for (const [kind, kindIssues] of byKind.entries()) {
        if (shown >= maxIssues)
            break;
        lines.push(`### ${formatIssueTitle(kind)}`);
        lines.push('');
        const toShow = kindIssues.slice(0, maxIssues - shown);
        for (const issue of toShow) {
            const relativePath = path.relative(projectRoot, issue.file);
            const confBadge = issue.confidence === 'high' ? '🔴' : issue.confidence === 'medium' ? '🟡' : '⚪';
            lines.push(`- ${confBadge} \`${issue.name}\` - ${relativePath}:${issue.line}`);
            shown++;
        }
        if (kindIssues.length > toShow.length) {
            lines.push(`- ... and ${kindIssues.length - toShow.length} more`);
        }
        lines.push('');
    }
    if (issues.length > maxIssues) {
        lines.push(`> Showing ${maxIssues} of ${issues.length} issues. Run locally for full report.`);
    }
    return lines.join('\n');
}
/**
 * Format issues as SARIF (Static Analysis Results Interchange Format)
 * Compatible with VS Code, GitHub Code Scanning, and many other tools
 */
export function formatSARIF(issues, projectRoot, toolVersion = '0.1.0') {
    // Build rules list (one per issue kind)
    const ruleIds = new Set(issues.map(i => i.kind));
    const rules = Array.from(ruleIds).map(kind => ({
        id: kind,
        name: formatIssueTitle(kind),
        shortDescription: {
            text: getIssueDescription(kind),
        },
        defaultConfiguration: {
            level: 'warning',
        },
        helpUri: `https://github.com/sweepa/sweepa#${kind}`,
    }));
    // Build results
    const results = issues.map(issue => ({
        ruleId: issue.kind,
        level: issue.confidence === 'high' ? 'error' : 'warning',
        message: {
            text: issue.message,
        },
        locations: [
            {
                physicalLocation: {
                    artifactLocation: {
                        uri: path.relative(projectRoot, issue.file),
                        uriBaseId: '%SRCROOT%',
                    },
                    region: {
                        startLine: issue.line,
                        startColumn: issue.column,
                    },
                },
            },
        ],
        properties: {
            confidence: issue.confidence,
            symbolKind: issue.symbolKind,
            parent: issue.parent,
        },
    }));
    return {
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0',
        runs: [
            {
                tool: {
                    driver: {
                        name: 'Sweepa',
                        version: toolVersion,
                        informationUri: 'https://github.com/sweepa/sweepa',
                        rules,
                    },
                },
                results,
                originalUriBaseIds: {
                    '%SRCROOT%': {
                        uri: `file://${projectRoot}/`,
                    },
                },
            },
        ],
    };
}
/**
 * Format issues as CSV
 */
export function formatCSV(issues, projectRoot) {
    const lines = [];
    // Header
    lines.push('kind,confidence,name,parent,file,line,column,message');
    // Rows
    for (const issue of issues) {
        const relativePath = path.relative(projectRoot, issue.file);
        const escapedMessage = `"${issue.message.replace(/"/g, '""')}"`;
        lines.push([
            issue.kind,
            issue.confidence,
            issue.name,
            issue.parent || '',
            relativePath,
            issue.line,
            issue.column,
            escapedMessage,
        ].join(','));
    }
    return lines.join('\n');
}
function formatIssueTitle(kind) {
    const titles = {
        'unused-file': 'Unused File',
        'unused-dependency': 'Unused Dependency',
        'misplaced-dependency': 'Misplaced Dependency',
        'unlisted-dependency': 'Unlisted Dependency',
        'unresolved-import': 'Unresolved Import',
        'unused-exported': 'Unused Exported Symbol',
        'unused-exported-type': 'Unused Exported Type',
        'unused-export': 'Unused Export',
        'unused-method': 'Unused Method',
        'unused-param': 'Unused Parameter',
        'unused-property': 'Unused Property',
        'unused-import': 'Unused Import',
        'unused-enum-case': 'Unused Enum Case',
        'assign-only-property': 'Assign-Only Property',
        'unused-variable': 'Unused Variable',
        'unused-type': 'Unused Type',
        'redundant-export': 'Redundant Export',
    };
    return titles[kind] || kind;
}
function getIssueDescription(kind) {
    const descriptions = {
        'unused-file': 'File is not reachable from configured entry points',
        'unused-dependency': 'Dependency is listed in package.json but not used',
        'misplaced-dependency': 'Dependency is listed in the wrong package.json section (dependencies vs devDependencies)',
        'unlisted-dependency': 'Dependency is used but not listed in package.json',
        'unresolved-import': 'Import specifier cannot be resolved',
        'unused-exported': 'Export is never imported by any reachable module',
        'unused-exported-type': 'Exported type is never imported by any reachable module',
        'unused-export': 'Exported symbol is never imported or used',
        'unused-method': 'Method is defined but never called',
        'unused-param': 'Function parameter is never used in the function body',
        'unused-property': 'Property is defined but never accessed',
        'unused-import': 'Import statement imports a symbol that is never used',
        'unused-enum-case': 'Enum member is never referenced',
        'assign-only-property': 'Property is written to but never read',
        'unused-variable': 'Variable is declared but never used',
        'unused-type': 'Type is defined but never referenced',
        'redundant-export': 'Export is only used internally and could be removed',
    };
    return descriptions[kind] || 'Dead code detected';
}
//# sourceMappingURL=formatters.js.map