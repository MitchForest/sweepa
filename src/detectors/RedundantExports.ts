/**
 * Detect redundant exports (redundant public accessibility)
 *
 * Finds exports that are only used within the same package/module,
 * suggesting they could be made internal (non-exported).
 *
 * This is the TypeScript equivalent of Periphery's "redundant public accessibility" detection.
 */

import { Project, SyntaxKind, type SourceFile, type Node } from 'ts-morph'
import type { Issue, Confidence } from './types.js'
import path from 'node:path'

export interface ExportAnalysis {
  /** Symbol name */
  name: string

  /** File where symbol is exported */
  file: string

  /** Line number */
  line: number

  /** References by source */
  references: {
    sameFile: number
    samePackage: number
    differentPackage: number
    tests: number
  }

  /** Suggested action */
  suggestion: 'keep-public' | 'make-internal' | 'make-private' | 'remove'
}

/**
 * Detect redundant exports in a project
 */
export function detectRedundantExports(project: Project, projectRoot: string): Issue[] {
  const issues: Issue[] = []
  const packageBoundaries = detectPackageBoundaries(projectRoot)

  for (const sourceFile of project.getSourceFiles()) {
    // Skip node_modules and declaration files
    const filePath = sourceFile.getFilePath()
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
      continue
    }

    issues.push(...detectInFile(sourceFile, project, projectRoot, packageBoundaries))
  }

  return issues
}

function detectInFile(
  sourceFile: SourceFile,
  project: Project,
  projectRoot: string,
  packageBoundaries: Set<string>
): Issue[] {
  const issues: Issue[] = []
  const filePath = sourceFile.getFilePath()
  const filePackage = getPackageForFile(filePath, packageBoundaries)

  // Get all exported declarations
  const exportedDeclarations = sourceFile.getExportedDeclarations()

  for (const [name, declarations] of exportedDeclarations) {
    // Analyze each declaration
    for (const decl of declarations) {
      const analysis = analyzeExport(decl, name, filePath, filePackage, project, packageBoundaries)

      if (analysis.suggestion === 'make-internal' || analysis.suggestion === 'make-private') {
        // Determine confidence based on reference pattern
        let confidence: Confidence = 'medium'
        if (analysis.references.differentPackage === 0 && analysis.references.tests === 0) {
          confidence = 'high'
        }

        const message = analysis.suggestion === 'make-private'
          ? `Export '${name}' is only used in the same file and could be made private`
          : `Export '${name}' is only used within the same package and could be internal`

        const line = decl.getStartLineNumber()
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
        })
      }
    }
  }

  return issues
}

function analyzeExport(
  decl: Node,
  name: string,
  filePath: string,
  filePackage: string,
  project: Project,
  packageBoundaries: Set<string>
): ExportAnalysis {
  const analysis: ExportAnalysis = {
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
  }

  // Find all references
  let refs: Node[] = []
  try {
    // Try to get references - need to handle different node types
    const symbol = decl.getSymbol()
    if (symbol) {
      for (const d of symbol.getDeclarations()) {
        try {
          // Check if node has findReferencesAsNodes method
          if ('findReferencesAsNodes' in d && typeof d.findReferencesAsNodes === 'function') {
            refs.push(...(d as any).findReferencesAsNodes())
          }
        } catch {
          // Ignore errors for specific declarations
        }
      }
    }
  } catch {
    // Can't find references, keep as public
    return analysis
  }

  // Classify each reference
  for (const ref of refs) {
    const refFile = ref.getSourceFile().getFilePath()

    // Skip references in node_modules
    if (refFile.includes('node_modules')) continue

    // Skip the definition itself
    if (ref === decl) continue

    // Check if it's a test file
    if (isTestFile(refFile)) {
      analysis.references.tests++
      continue
    }

    // Same file?
    if (refFile === filePath) {
      analysis.references.sameFile++
      continue
    }

    // Same package?
    const refPackage = getPackageForFile(refFile, packageBoundaries)
    if (refPackage === filePackage) {
      analysis.references.samePackage++
    } else {
      analysis.references.differentPackage++
    }
  }

  // Determine suggestion
  const { sameFile, samePackage, differentPackage, tests } = analysis.references

  if (differentPackage > 0) {
    // Used across packages, keep public
    analysis.suggestion = 'keep-public'
  } else if (sameFile > 0 && samePackage === 0 && tests === 0) {
    // Only used in same file, could be private (non-exported)
    analysis.suggestion = 'make-private'
  } else if (samePackage > 0 || tests > 0) {
    // Used within package or in tests, suggest internal
    analysis.suggestion = 'make-internal'
  } else if (sameFile === 0 && samePackage === 0 && differentPackage === 0 && tests === 0) {
    // No references at all, would be caught by unused-export
    analysis.suggestion = 'remove'
  }

  return analysis
}

function detectPackageBoundaries(projectRoot: string): Set<string> {
  const boundaries = new Set<string>()

  // The project root is always a boundary
  boundaries.add(projectRoot)

  return boundaries
}

function getPackageForFile(filePath: string, boundaries: Set<string>): string {
  // Find the nearest package boundary
  let current = path.dirname(filePath)

  while (current && current !== '/') {
    if (boundaries.has(current)) {
      return current
    }
    current = path.dirname(current)
  }

  // Default to the first boundary
  return boundaries.values().next().value || path.dirname(filePath)
}

function isTestFile(filePath: string): boolean {
  const patterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\/tests?\//,
  ]

  return patterns.some(p => p.test(filePath))
}

function getSymbolKind(node: Node): 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' {
  const kind = node.getKind()

  switch (kind) {
    case SyntaxKind.FunctionDeclaration:
      return 'function'
    case SyntaxKind.ClassDeclaration:
      return 'class'
    case SyntaxKind.InterfaceDeclaration:
      return 'interface'
    case SyntaxKind.TypeAliasDeclaration:
      return 'type'
    case SyntaxKind.EnumDeclaration:
      return 'enum'
    default:
      return 'variable'
  }
}
