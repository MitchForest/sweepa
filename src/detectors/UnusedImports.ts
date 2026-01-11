/**
 * Detect unused imports
 *
 * Finds import statements where the imported symbols are never used in the file.
 */

import { Project, SyntaxKind, type SourceFile, type ImportDeclaration } from 'ts-morph'
import type { Issue } from './types.js'

/**
 * Detect unused imports in a project
 */
export function detectUnusedImports(project: Project): Issue[] {
  const issues: Issue[] = []

  for (const sourceFile of project.getSourceFiles()) {
    // Skip node_modules and declaration files
    const filePath = sourceFile.getFilePath()
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
      continue
    }

    issues.push(...detectInFile(sourceFile))
  }

  return issues
}

function detectInFile(sourceFile: SourceFile): Issue[] {
  const issues: Issue[] = []
  const filePath = sourceFile.getFilePath()

  for (const importDecl of sourceFile.getImportDeclarations()) {
    // Skip type-only imports - they have no runtime effect
    if (importDecl.isTypeOnly()) {
      continue
    }

    // Check default import
    const defaultImport = importDecl.getDefaultImport()
    if (defaultImport) {
      if (!isIdentifierUsed(sourceFile, defaultImport.getText(), importDecl)) {
        const line = defaultImport.getStartLineNumber()
        issues.push({
          kind: 'unused-import',
          confidence: 'high',
          name: defaultImport.getText(),
          symbolKind: 'variable',
          file: filePath,
          line,
          column: defaultImport.getStartLinePos(true) + 1,
          message: `Import '${defaultImport.getText()}' is never used`,
          context: { importKind: 'default' },
        })
      }
    }

    // Check namespace import (import * as foo)
    const namespaceImport = importDecl.getNamespaceImport()
    if (namespaceImport) {
      if (!isIdentifierUsed(sourceFile, namespaceImport.getText(), importDecl)) {
        const line = namespaceImport.getStartLineNumber()
        issues.push({
          kind: 'unused-import',
          confidence: 'high',
          name: namespaceImport.getText(),
          symbolKind: 'variable',
          file: filePath,
          line,
          column: namespaceImport.getStartLinePos(true) + 1,
          message: `Import '${namespaceImport.getText()}' is never used`,
          context: { importKind: 'namespace' },
        })
      }
    }

    // Check named imports
    const namedImports = importDecl.getNamedImports()
    for (const namedImport of namedImports) {
      // Skip type-only named imports
      if (namedImport.isTypeOnly()) {
        continue
      }

      const name = namedImport.getAliasNode()?.getText() || namedImport.getName()

      if (!isIdentifierUsed(sourceFile, name, importDecl)) {
        const line = namedImport.getStartLineNumber()
        issues.push({
          kind: 'unused-import',
          confidence: 'high',
          name,
          symbolKind: 'variable',
          file: filePath,
          line,
          column: namedImport.getStartLinePos(true) + 1,
          message: `Import '${name}' is never used`,
          context: { importKind: 'named', originalName: namedImport.getName() },
        })
      }
    }
  }

  return issues
}

/**
 * Check if an identifier is used anywhere in the file (excluding the import itself)
 */
function isIdentifierUsed(
  sourceFile: SourceFile,
  name: string,
  importDecl: ImportDeclaration
): boolean {
  // Get all identifiers with this name in the file
  const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(id => id.getText() === name)

  // Check if any are outside the import declaration
  for (const id of identifiers) {
    // Skip if inside the import declaration
    const importAncestor = id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
    if (importAncestor === importDecl) {
      continue
    }

    // Also check if it's being re-exported (still counts as used)
    const exportAncestor = id.getFirstAncestorByKind(SyntaxKind.ExportDeclaration)
    if (exportAncestor) {
      return true
    }

    // It's used somewhere else in the file
    return true
  }

  // Also check JSX - component names in JSX don't show up as identifiers in some cases
  const jsxOpenings = sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
  const jsxSelfClosing = sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)

  for (const jsx of [...jsxOpenings, ...jsxSelfClosing]) {
    const tagName = jsx.getTagNameNode()
    if (tagName.getText() === name || tagName.getText().startsWith(`${name}.`)) {
      return true
    }
  }

  return false
}
