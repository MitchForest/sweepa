/**
 * Detect redundant exports (redundant public accessibility)
 *
 * Finds exports that are only used within the same package/module,
 * suggesting they could be made internal (non-exported).
 *
 * This is the TypeScript equivalent of Periphery's "redundant public accessibility" detection.
 */
import { SyntaxKind } from 'ts-morph';
import path from 'node:path';
/**
 * Detect redundant exports in a project
 */
export function detectRedundantExports(project, projectRoot) {
    const issues = [];
    const packageBoundaries = detectPackageBoundaries(projectRoot);
    for (const sourceFile of project.getSourceFiles()) {
        // Skip node_modules and declaration files
        const filePath = sourceFile.getFilePath();
        if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
            continue;
        }
        issues.push(...detectInFile(sourceFile, project, projectRoot, packageBoundaries));
    }
    return issues;
}
function detectInFile(sourceFile, project, projectRoot, packageBoundaries) {
    const issues = [];
    const filePath = sourceFile.getFilePath();
    const filePackage = getPackageForFile(filePath, packageBoundaries);
    // Get all exported declarations
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    for (const [name, declarations] of exportedDeclarations) {
        // Analyze each declaration
        for (const decl of declarations) {
            const analysis = analyzeExport(decl, name, filePath, filePackage, project, packageBoundaries);
            if (analysis.suggestion === 'make-internal' || analysis.suggestion === 'make-private') {
                // Determine confidence based on reference pattern
                let confidence = 'medium';
                if (analysis.references.differentPackage === 0 && analysis.references.tests === 0) {
                    confidence = 'high';
                }
                const message = analysis.suggestion === 'make-private'
                    ? `Export '${name}' is only used in the same file and could be made private`
                    : `Export '${name}' is only used within the same package and could be internal`;
                const line = decl.getStartLineNumber();
                issues.push({
                    kind: 'redundant-export',
                    confidence,
                    name,
                    symbolKind: getSymbolKind(decl),
                    file: filePath,
                    line,
                    column: decl.getStartLinePos(true) + 1,
                    message,
                    context: {
                        sameFileRefs: analysis.references.sameFile,
                        samePackageRefs: analysis.references.samePackage,
                        differentPackageRefs: analysis.references.differentPackage,
                        testRefs: analysis.references.tests,
                    },
                });
            }
        }
    }
    return issues;
}
function analyzeExport(decl, name, filePath, filePackage, project, packageBoundaries) {
    const analysis = {
        name,
        file: filePath,
        line: decl.getStartLineNumber(),
        references: {
            sameFile: 0,
            samePackage: 0,
            differentPackage: 0,
            tests: 0,
        },
        suggestion: 'keep-public',
    };
    // Find all references
    let refs = [];
    try {
        // Try to get references - need to handle different node types
        const symbol = decl.getSymbol();
        if (symbol) {
            for (const d of symbol.getDeclarations()) {
                try {
                    // Check if node has findReferencesAsNodes method
                    if ('findReferencesAsNodes' in d && typeof d.findReferencesAsNodes === 'function') {
                        refs.push(...d.findReferencesAsNodes());
                    }
                }
                catch {
                    // Ignore errors for specific declarations
                }
            }
        }
    }
    catch {
        // Can't find references, keep as public
        return analysis;
    }
    // Classify each reference
    for (const ref of refs) {
        const refFile = ref.getSourceFile().getFilePath();
        // Skip references in node_modules
        if (refFile.includes('node_modules'))
            continue;
        // Skip the definition itself
        if (ref === decl)
            continue;
        // Check if it's a test file
        if (isTestFile(refFile)) {
            analysis.references.tests++;
            continue;
        }
        // Same file?
        if (refFile === filePath) {
            analysis.references.sameFile++;
            continue;
        }
        // Same package?
        const refPackage = getPackageForFile(refFile, packageBoundaries);
        if (refPackage === filePackage) {
            analysis.references.samePackage++;
        }
        else {
            analysis.references.differentPackage++;
        }
    }
    // Determine suggestion
    const { sameFile, samePackage, differentPackage, tests } = analysis.references;
    if (differentPackage > 0) {
        // Used across packages, keep public
        analysis.suggestion = 'keep-public';
    }
    else if (sameFile > 0 && samePackage === 0 && tests === 0) {
        // Only used in same file, could be private (non-exported)
        analysis.suggestion = 'make-private';
    }
    else if (samePackage > 0 || tests > 0) {
        // Used within package or in tests, suggest internal
        analysis.suggestion = 'make-internal';
    }
    else if (sameFile === 0 && samePackage === 0 && differentPackage === 0 && tests === 0) {
        // No references at all, would be caught by unused-export
        analysis.suggestion = 'remove';
    }
    return analysis;
}
function detectPackageBoundaries(projectRoot) {
    const boundaries = new Set();
    // The project root is always a boundary
    boundaries.add(projectRoot);
    return boundaries;
}
function getPackageForFile(filePath, boundaries) {
    // Find the nearest package boundary
    let current = path.dirname(filePath);
    while (current && current !== '/') {
        if (boundaries.has(current)) {
            return current;
        }
        current = path.dirname(current);
    }
    // Default to the first boundary
    return boundaries.values().next().value || path.dirname(filePath);
}
function isTestFile(filePath) {
    const patterns = [
        /\.test\.[jt]sx?$/,
        /\.spec\.[jt]sx?$/,
        /__tests__\//,
        /\/tests?\//,
    ];
    return patterns.some(p => p.test(filePath));
}
function getSymbolKind(node) {
    const kind = node.getKind();
    switch (kind) {
        case SyntaxKind.FunctionDeclaration:
            return 'function';
        case SyntaxKind.ClassDeclaration:
            return 'class';
        case SyntaxKind.InterfaceDeclaration:
            return 'interface';
        case SyntaxKind.TypeAliasDeclaration:
            return 'type';
        case SyntaxKind.EnumDeclaration:
            return 'enum';
        default:
            return 'variable';
    }
}
//# sourceMappingURL=RedundantExports.js.map