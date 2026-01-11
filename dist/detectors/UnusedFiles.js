import path from 'node:path';
import { computeReachableFiles } from '../analysis/reachability.js';
export function detectUnusedFiles(options) {
    const projectRoot = path.resolve(options.projectRoot);
    const { reachableFiles, entryFiles, fileByPath } = computeReachableFiles({
        project: options.project,
        tsConfigPath: options.tsConfigPath,
        projectRoot,
        entryPointConfig: options.entryPointConfig,
        ignoreGenerated: true,
    });
    const issues = [];
    for (const filePath of fileByPath.keys()) {
        if (reachableFiles.has(filePath))
            continue;
        if (entryFiles.has(filePath))
            continue;
        issues.push({
            kind: 'unused-file',
            confidence: 'high',
            name: path.relative(projectRoot, filePath),
            symbolKind: 'module',
            file: filePath,
            line: 1,
            column: 1,
            message: `File is never imported or executed from any entry point`,
        });
    }
    return issues;
}
//# sourceMappingURL=UnusedFiles.js.map