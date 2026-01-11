/**
 * JSXReferenceBuilder - Adds reference edges for React components in JSX
 *
 * When we see <UserCard />, we need to add an edge from the containing
 * component to the UserCard component. The TypeScript compiler already
 * resolves these, but we need to trace them for dead code analysis.
 */

import { SyntaxKind, Node, type SourceFile } from 'ts-morph'
import type { GraphMutator, MutatorContext } from '../types.js'
import path from 'node:path'
import fs from 'node:fs'

export const JSXReferenceBuilder: GraphMutator = {
  name: 'JSXReferenceBuilder',
  priority: 20,
  phase: 'references',

  mutate(ctx: MutatorContext): void {
    const { graph, project, projectRoot } = ctx

    let edgesAdded = 0

    for (const sourceFile of project.getSourceFiles()) {
      // Skip non-JSX files
      const filePath = sourceFile.getFilePath()
      if (!filePath.match(/\.(tsx|jsx)$/)) continue

      // Find all JSX opening elements and self-closing elements
      const jsxElements = [
        ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
        ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ]

      for (const jsx of jsxElements) {
        const tagNode = jsx.getTagNameNode()
        const tagName = tagNode.getText()

        // Skip HTML elements (lowercase first letter)
        if (tagName[0] === tagName[0].toLowerCase()) continue

        // Find the containing function/class/component
        const container = findContainingDeclaration(jsx)
        if (!container) continue

        // Build container's symbol ID
        // IMPORTANT: Sweepa's graph IDs use absolute file paths (CallGraphBuilder),
        // so all mutators must use absolute paths as well.
        const containerId = buildSymbolId(filePath, container.name)
        if (!graph.hasSymbol(containerId)) continue

        // Find the component being referenced
        // Try to resolve the symbol from the tag name
        const componentSymbol = findComponentSymbol(graph, tagName, sourceFile, projectRoot)
        if (!componentSymbol) continue

        // Add edge: container → component
        ctx.addReference(containerId, componentSymbol.id, 'jsx-element')
        edgesAdded++
      }
    }

    ctx.log(`Added ${edgesAdded} JSX reference edges`)
  },
}

interface ContainerInfo {
  name: string
  kind: 'function' | 'class' | 'variable'
}

function findContainingDeclaration(node: Node): ContainerInfo | undefined {
  let current = node.getParent()

  while (current) {
    // Function declaration
    if (Node.isFunctionDeclaration(current)) {
      const name = current.getName()
      if (name) return { name, kind: 'function' }
    }

    // Arrow function in variable declaration
    if (Node.isVariableDeclaration(current)) {
      const name = current.getName()
      const init = current.getInitializer()
      if (name && init && Node.isArrowFunction(init)) {
        return { name, kind: 'function' }
      }
    }

    // Class method
    if (Node.isMethodDeclaration(current)) {
      const name = current.getName()
      const cls = current.getParent()
      if (name && Node.isClassDeclaration(cls)) {
        const clsName = cls.getName()
        if (clsName) return { name: `${clsName}.${name}`, kind: 'function' }
      }
    }

    // Class declaration (for class components)
    if (Node.isClassDeclaration(current)) {
      const name = current.getName()
      if (name) return { name, kind: 'class' }
    }

    current = current.getParent()
  }

  return undefined
}

function buildSymbolId(filePath: string, name: string): string {
  return `${filePath}:${name}`
}

function findComponentSymbol(
  graph: ReturnType<MutatorContext['graph']['getAllSymbols']> extends (infer T)[] ? { hasSymbol: (id: string) => boolean; getSymbol: (id: string) => T | undefined; getAllSymbols: () => T[] } : never,
  tagName: string,
  sourceFile: SourceFile,
  projectRoot: string
): { id: string } | undefined {
  // First, try to find an import for this component
  const imports = sourceFile.getImportDeclarations()

  for (const imp of imports) {
    // Check named imports
    for (const named of imp.getNamedImports()) {
      const importedName = named.getAliasNode()?.getText() ?? named.getName()
      if (importedName === tagName) {
        // Resolve to the source file
        const moduleSpecifier = imp.getModuleSpecifierValue()
        const resolvedFile = resolveModulePath(moduleSpecifier, sourceFile)
        if (resolvedFile) {
          const originalName = named.getName()
          const symbolId = `${resolvedFile}:${originalName}`
          if (graph.hasSymbol(symbolId)) {
            return { id: symbolId }
          }
        }
      }
    }

    // Check default import
    const defaultImport = imp.getDefaultImport()
    if (defaultImport?.getText() === tagName) {
      const moduleSpecifier = imp.getModuleSpecifierValue()
      const resolvedFile = resolveModulePath(moduleSpecifier, sourceFile)
      if (resolvedFile) {
        // For default exports, try common names
        for (const name of ['default', tagName]) {
          const symbolId = `${resolvedFile}:${name}`
          if (graph.hasSymbol(symbolId)) {
            return { id: symbolId }
          }
        }
      }
    }
  }

  // Try to find in same file
  const sameFileId = `${sourceFile.getFilePath()}:${tagName}`
  if (graph.hasSymbol(sameFileId)) {
    return { id: sameFileId }
  }

  return undefined
}

function resolveModulePath(
  moduleSpecifier: string,
  sourceFile: SourceFile
): string | undefined {
  // Handle relative imports
  if (moduleSpecifier.startsWith('.')) {
    const sourceDir = path.dirname(sourceFile.getFilePath())
    const resolvedPath = path.resolve(sourceDir, moduleSpecifier)

    // Try with extensions
    const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']

    for (const ext of extensions) {
      const fullPath = resolvedPath + ext
      if (fs.existsSync(fullPath)) {
        return fullPath
      }
    }

    // If no file found, return undefined (better to miss an edge than add a wrong one)
    return undefined
  }

  // For absolute/package imports, we can't resolve without more context
  return undefined
}
