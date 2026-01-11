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
const DIRECTIVE_REGEX = /^@sweepa-ignore(?::([a-z-]+))?(?:\s+([^\s-]+(?:\s*,\s*[^\s-]+)*))?(?:\s+-\s+(.+))?$/i;
/**
 * Parse @sweepa-ignore directives from a source file
 */
export function parseIgnoreDirectives(sourceFile) {
    const result = {
        ignoreAll: false,
        byLine: new Map(),
        byName: new Map(),
    };
    const fullText = sourceFile.getFullText();
    const lines = fullText.split('\n');
    // Check for file-level @sweepa-ignore:all in first 10 lines
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i];
        if (line.includes('@sweepa-ignore:all')) {
            result.ignoreAll = true;
            return result;
        }
    }
    // Parse line-by-line comments
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1; // 1-indexed
        // Check for single-line comment
        const singleLineMatch = line.match(/\/\/\s*(.*)/);
        if (singleLineMatch) {
            const directive = parseDirective(singleLineMatch[1].trim());
            if (directive) {
                directive.line = lineNum;
                // Directive applies to NEXT line
                result.byLine.set(lineNum + 1, directive);
                // If specific names are given, also index by name
                for (const name of directive.names) {
                    result.byName.set(name, directive);
                }
            }
        }
        // Check for block comment on same line
        const blockMatch = line.match(/\/\*\s*(.*?)\s*\*\//);
        if (blockMatch) {
            const directive = parseDirective(blockMatch[1].trim());
            if (directive) {
                directive.line = lineNum;
                result.byLine.set(lineNum, directive); // Applies to same line for inline
            }
        }
    }
    return result;
}
function parseDirective(text) {
    const match = text.match(DIRECTIVE_REGEX);
    if (!match)
        return null;
    const [, kindStr, namesStr, reason] = match;
    const kinds = [];
    if (kindStr) {
        // Map shorthand to full kind
        const kind = parseKind(kindStr);
        if (kind)
            kinds.push(kind);
    }
    const names = [];
    if (namesStr) {
        names.push(...namesStr.split(/\s*,\s*/).map(n => n.trim()));
    }
    return {
        kinds,
        names,
        line: 0, // Will be set by caller
        reason,
    };
}
function parseKind(kindStr) {
    const mapping = {
        'unused-export': 'unused-export',
        'export': 'unused-export',
        'unused-method': 'unused-method',
        'method': 'unused-method',
        'unused-param': 'unused-param',
        'param': 'unused-param',
        'unused-property': 'unused-property',
        'property': 'unused-property',
        'assign-only': 'assign-only-property',
        'assign-only-property': 'assign-only-property',
        'unused-variable': 'unused-variable',
        'variable': 'unused-variable',
        'unused-type': 'unused-type',
        'type': 'unused-type',
        'redundant-export': 'redundant-export',
    };
    return mapping[kindStr.toLowerCase()] || null;
}
/**
 * Check if an issue should be ignored based on parsed directives
 */
export function shouldIgnoreIssue(ignores, kind, name, line) {
    // File-level ignore
    if (ignores.ignoreAll)
        return true;
    // Check by line (directive on previous line)
    const lineDirective = ignores.byLine.get(line);
    if (lineDirective) {
        // Empty kinds means ignore all
        if (lineDirective.kinds.length === 0)
            return true;
        if (lineDirective.kinds.includes(kind))
            return true;
    }
    // Check by name
    const nameDirective = ignores.byName.get(name);
    if (nameDirective) {
        if (nameDirective.kinds.length === 0)
            return true;
        if (nameDirective.kinds.includes(kind))
            return true;
    }
    return false;
}
/**
 * Parse all ignore directives for a project
 */
export function parseProjectIgnores(sourceFiles) {
    const result = new Map();
    for (const sourceFile of sourceFiles) {
        const filePath = sourceFile.getFilePath();
        result.set(filePath, parseIgnoreDirectives(sourceFile));
    }
    return result;
}
//# sourceMappingURL=CommentParser.js.map