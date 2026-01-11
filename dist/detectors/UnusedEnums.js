/**
 * Detect unused enum cases
 *
 * Finds enum members that are never referenced in the codebase.
 */
import { SyntaxKind } from 'ts-morph';
/**
 * Detect unused enum cases in a project
 */
export function detectUnusedEnumCases(project) {
    const issues = [];
    for (const sourceFile of project.getSourceFiles()) {
        // Skip node_modules and declaration files
        const filePath = sourceFile.getFilePath();
        if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
            continue;
        }
        issues.push(...detectInFile(sourceFile));
    }
    return issues;
}
function detectInFile(sourceFile) {
    const issues = [];
    const filePath = sourceFile.getFilePath();
    for (const enumDecl of sourceFile.getEnums()) {
        const enumName = enumDecl.getName();
        for (const member of enumDecl.getMembers()) {
            const memberName = member.getName();
            const fullName = `${enumName}.${memberName}`;
            // Find all references to this enum member
            const refs = member.findReferencesAsNodes();
            // Filter out the definition itself
            const usageRefs = refs.filter(ref => {
                // Skip the definition
                if (ref === member.getNameNode())
                    return false;
                // Skip references in the same enum (e.g., computed values)
                const parentEnum = ref.getFirstAncestorByKind(SyntaxKind.EnumDeclaration);
                if (parentEnum === enumDecl)
                    return false;
                return true;
            });
            if (usageRefs.length === 0) {
                // Determine confidence
                // Lower confidence if the enum is exported (might be used externally)
                let confidence = 'high';
                if (enumDecl.isExported()) {
                    confidence = 'medium';
                }
                const line = member.getStartLineNumber();
                issues.push({
                    kind: 'unused-enum-case',
                    confidence,
                    name: memberName,
                    symbolKind: 'enum-member',
                    file: filePath,
                    line,
                    column: member.getStartLinePos(true) + 1,
                    message: `Enum case '${fullName}' is never used`,
                    parent: enumName,
                });
            }
        }
    }
    return issues;
}
//# sourceMappingURL=UnusedEnums.js.map