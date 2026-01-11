import {
  Project,
  Node,
  SyntaxKind,
  SourceFile,
  type ReferenceFindableNode,
} from 'ts-morph'
import { CallGraph } from '../graph/CallGraph.js'
import type { SymbolNode, SymbolKind, ReferenceEdge, ReferenceType } from '../graph/types.js'

export interface CallGraphBuilderOptions {
  /** Path to tsconfig.json */
  tsConfigPath: string

  /** Additional files to include (beyond tsconfig) */
  include?: string[]

  /** Files/patterns to exclude from analysis (glob patterns supported) */
  exclude?: string[]

  /** Emit progress logs to stderr */
  verbose?: boolean
}

/**
 * Default patterns to exclude from analysis
 * These are commonly generated files that shouldn't be analyzed for unused code
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/generated/**',
  '**/*.gen.ts',
  '**/*.gen.tsx',
  '**/*.generated.ts',
  '**/*.generated.tsx',
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
]

/**
 * Builds a call graph from a TypeScript project using ts-morph.
 *
 * Uses ts-morph's findReferences() to discover all symbol references,
 * similar to how Periphery uses Swift's index store.
 */
export class CallGraphBuilder {
  private project: Project
  private graph: CallGraph
  private options: CallGraphBuilderOptions

  constructor(options: CallGraphBuilderOptions) {
    this.options = options
    this.graph = new CallGraph()

    // Create ts-morph project from tsconfig
    this.project = new Project({
      tsConfigFilePath: options.tsConfigPath,
      skipAddingFilesFromTsConfig: false,
    })

    // Add additional files if specified
    if (options.include) {
      this.project.addSourceFilesAtPaths(options.include)
    }
  }

  /**
   * Build the complete call graph
   */
  build(): CallGraph {
    const sourceFiles = this.project.getSourceFiles()

    if (this.options.verbose) {
      console.error(`Analyzing ${sourceFiles.length} source files...`)
    }

    // Phase 1: Extract all declarations (nodes)
    for (const sourceFile of sourceFiles) {
      if (this.shouldExclude(sourceFile.getFilePath())) continue
      this.extractDeclarations(sourceFile)
    }

    // Phase 2: Build references (edges)
    for (const sourceFile of sourceFiles) {
      if (this.shouldExclude(sourceFile.getFilePath())) continue
      this.extractReferences(sourceFile)
    }

    const stats = this.graph.getStats()
    if (this.options.verbose) {
      console.error(`Graph built: ${stats.nodeCount} symbols, ${stats.edgeCount} references`)
    }

    return this.graph
  }

  private shouldExclude(filePath: string): boolean {
    // Combine user patterns with defaults
    const allPatterns = [
      ...DEFAULT_EXCLUDE_PATTERNS,
      ...(this.options.exclude || []),
    ]

    return allPatterns.some(pattern => this.matchesGlob(filePath, pattern))
  }

  /**
   * Simple glob matching for exclusion patterns
   * Supports ** (any path segments) and * (any characters except /)
   */
  private matchesGlob(filePath: string, pattern: string): boolean {
    // Normalize paths
    const normalizedPath = filePath.replace(/\\/g, '/')
    const normalizedPattern = pattern.replace(/\\/g, '/')

    // Build regex from glob pattern
    let regexPattern = ''
    let i = 0

    while (i < normalizedPattern.length) {
      const char = normalizedPattern[i]
      const nextChar = normalizedPattern[i + 1]

      if (char === '*' && nextChar === '*') {
        // Check for **/
        if (normalizedPattern[i + 2] === '/') {
          // **/ matches zero or more directory segments
          regexPattern += '(?:[^/]+/)*'
          i += 3
        } else if (i + 2 >= normalizedPattern.length) {
          // ** at end matches anything
          regexPattern += '.*'
          i += 2
        } else {
          regexPattern += '.*'
          i += 2
        }
      } else if (char === '*') {
        // * matches anything except /
        regexPattern += '[^/]*'
        i++
      } else if ('.+^${}()|[]\\'.includes(char)) {
        // Escape special regex chars
        regexPattern += '\\' + char
        i++
      } else {
        regexPattern += char
        i++
      }
    }

    // Match anywhere in the path (not just full path)
    const regex = new RegExp(regexPattern)
    return regex.test(normalizedPath)
  }

  /**
   * Extract all declarations from a source file
   */
  private extractDeclarations(sourceFile: SourceFile): void {
    const filePath = sourceFile.getFilePath()

    // Functions
    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName()
      if (!name) continue // Skip anonymous functions

      this.addSymbolNode({
        id: this.createSymbolId(filePath, name),
        name,
        kind: 'function',
        file: filePath,
        line: fn.getStartLineNumber(),
        column: fn.getStart() - fn.getStartLinePos() + 1,
        exported: fn.isExported(),
        isEntryPoint: false,
        isUsed: false,
      })
    }

    // Classes
    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName()
      if (!className) continue

      const classId = this.createSymbolId(filePath, className)

      this.addSymbolNode({
        id: classId,
        name: className,
        kind: 'class',
        file: filePath,
        line: cls.getStartLineNumber(),
        column: cls.getStart() - cls.getStartLinePos() + 1,
        exported: cls.isExported(),
        isEntryPoint: false,
        isUsed: false,
      })

      // Methods
      for (const method of cls.getMethods()) {
        const methodName = method.getName()
        const methodId = this.createSymbolId(filePath, `${className}.${methodName}`)

        this.addSymbolNode({
          id: methodId,
          name: methodName,
          kind: 'method',
          file: filePath,
          line: method.getStartLineNumber(),
          column: method.getStart() - method.getStartLinePos() + 1,
          exported: cls.isExported(), // Methods inherit class export status
          isEntryPoint: false,
          isUsed: false,
          parent: classId,
        })
      }

      // Properties
      for (const prop of cls.getProperties()) {
        const propName = prop.getName()
        const propId = this.createSymbolId(filePath, `${className}.${propName}`)

        this.addSymbolNode({
          id: propId,
          name: propName,
          kind: 'property',
          file: filePath,
          line: prop.getStartLineNumber(),
          column: prop.getStart() - prop.getStartLinePos() + 1,
          exported: false, // Properties are accessed via class
          isEntryPoint: false,
          isUsed: false,
          parent: classId,
        })
      }
    }

    // Interfaces
    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName()

      this.addSymbolNode({
        id: this.createSymbolId(filePath, name),
        name,
        kind: 'interface',
        file: filePath,
        line: iface.getStartLineNumber(),
        column: iface.getStart() - iface.getStartLinePos() + 1,
        exported: iface.isExported(),
        isEntryPoint: false,
        isUsed: false,
      })
    }

    // Type aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      const name = typeAlias.getName()

      this.addSymbolNode({
        id: this.createSymbolId(filePath, name),
        name,
        kind: 'type',
        file: filePath,
        line: typeAlias.getStartLineNumber(),
        column: typeAlias.getStart() - typeAlias.getStartLinePos() + 1,
        exported: typeAlias.isExported(),
        isEntryPoint: false,
        isUsed: false,
      })
    }

    // Enums
    for (const enumDecl of sourceFile.getEnums()) {
      const name = enumDecl.getName()
      const enumId = this.createSymbolId(filePath, name)

      this.addSymbolNode({
        id: enumId,
        name,
        kind: 'enum',
        file: filePath,
        line: enumDecl.getStartLineNumber(),
        column: enumDecl.getStart() - enumDecl.getStartLinePos() + 1,
        exported: enumDecl.isExported(),
        isEntryPoint: false,
        isUsed: false,
      })

      // Enum members
      for (const member of enumDecl.getMembers()) {
        const memberName = member.getName()
        const memberId = this.createSymbolId(filePath, `${name}.${memberName}`)

        this.addSymbolNode({
          id: memberId,
          name: memberName,
          kind: 'enum-member',
          file: filePath,
          line: member.getStartLineNumber(),
          column: member.getStart() - member.getStartLinePos() + 1,
          exported: enumDecl.isExported(),
          isEntryPoint: false,
          isUsed: false,
          parent: enumId,
        })
      }
    }

    // Variable declarations (const, let, var at module level)
    for (const varStmt of sourceFile.getVariableStatements()) {
      const isExported = varStmt.isExported()

      for (const decl of varStmt.getDeclarations()) {
        const nameNode = decl.getNameNode()

        // Handle destructured patterns: const { a, b } = obj
        if (Node.isObjectBindingPattern(nameNode)) {
          for (const element of nameNode.getElements()) {
            const elementName = element.getName()
            this.addSymbolNode({
              id: this.createSymbolId(filePath, elementName),
              name: elementName,
              kind: 'variable',
              file: filePath,
              line: element.getStartLineNumber(),
              column: element.getStart() - element.getStartLinePos() + 1,
              exported: isExported,
              isEntryPoint: false,
              isUsed: false,
            })
          }
        } else if (Node.isArrayBindingPattern(nameNode)) {
          // Handle array destructuring: const [a, b] = arr
          for (const element of nameNode.getElements()) {
            if (Node.isBindingElement(element)) {
              const elementName = element.getName()
              this.addSymbolNode({
                id: this.createSymbolId(filePath, elementName),
                name: elementName,
                kind: 'variable',
                file: filePath,
                line: element.getStartLineNumber(),
                column: element.getStart() - element.getStartLinePos() + 1,
                exported: isExported,
                isEntryPoint: false,
                isUsed: false,
              })
            }
          }
        } else {
          // Regular variable: const name = value
          const name = decl.getName()
          this.addSymbolNode({
            id: this.createSymbolId(filePath, name),
            name,
            kind: 'variable',
            file: filePath,
            line: decl.getStartLineNumber(),
            column: decl.getStart() - decl.getStartLinePos() + 1,
            exported: isExported,
            isEntryPoint: false,
            isUsed: false,
          })
        }
      }
    }
  }

  /**
   * Extract references from declarations using ts-morph's findReferences
   */
  private extractReferences(sourceFile: SourceFile): void {
    const filePath = sourceFile.getFilePath()

    // For each exported/declared symbol, find its references
    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName()
      if (!name) continue

      const symbolId = this.createSymbolId(filePath, name)
      this.findAndAddReferences(fn, symbolId)
      // Also find what this declaration references (outgoing edges)
      this.findOutgoingReferences(fn, symbolId)
    }

    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName()
      if (!className) continue

      const classId = this.createSymbolId(filePath, className)
      this.findAndAddReferences(cls, classId)

      // Also find references to methods
      for (const method of cls.getMethods()) {
        const methodId = this.createSymbolId(filePath, `${className}.${method.getName()}`)
        this.findAndAddReferences(method, methodId)
        this.findOutgoingReferences(method, methodId)
      }
    }

    // Find references to variables
    for (const varStmt of sourceFile.getVariableStatements()) {
      for (const decl of varStmt.getDeclarations()) {
        const nameNode = decl.getNameNode()

        // Handle destructured patterns
        if (Node.isObjectBindingPattern(nameNode)) {
          for (const element of nameNode.getElements()) {
            const elementName = element.getName()
            const symbolId = this.createSymbolId(filePath, elementName)
            // For binding elements, find references using the element's name node
            const nameIdentifier = element.getNameNode()
            if (Node.isIdentifier(nameIdentifier)) {
              this.findAndAddReferences(nameIdentifier, symbolId)
            }
          }
        } else if (Node.isArrayBindingPattern(nameNode)) {
          for (const element of nameNode.getElements()) {
            if (Node.isBindingElement(element)) {
              const elementName = element.getName()
              const symbolId = this.createSymbolId(filePath, elementName)
              const nameIdentifier = element.getNameNode()
              if (Node.isIdentifier(nameIdentifier)) {
                this.findAndAddReferences(nameIdentifier, symbolId)
              }
            }
          }
        } else {
          // Regular variable
          const name = decl.getName()
          const symbolId = this.createSymbolId(filePath, name)
          this.findAndAddReferences(decl, symbolId)
          // Also find what this declaration references (outgoing edges)
          this.findOutgoingReferences(decl, symbolId)
        }
      }
    }

    // Find references to interfaces and types
    for (const iface of sourceFile.getInterfaces()) {
      const symbolId = this.createSymbolId(filePath, iface.getName())
      this.findAndAddReferences(iface, symbolId)
      // Also find what types this interface uses
      this.findOutgoingTypeReferences(iface, symbolId)
    }

    for (const typeAlias of sourceFile.getTypeAliases()) {
      const symbolId = this.createSymbolId(filePath, typeAlias.getName())
      this.findAndAddReferences(typeAlias, symbolId)
      // Also find what types this type alias uses
      this.findOutgoingTypeReferences(typeAlias, symbolId)
    }
  }

  /**
   * Find all identifiers used in a declaration's body/initializer and add edges to them
   * This handles outgoing references (what does this symbol use?)
   */
  private findOutgoingReferences(node: Node, fromId: string): void {
    // Skip if source doesn't exist in graph
    if (!this.graph.hasSymbol(fromId)) return

    // Get the body/initializer to search
    let bodyNode: Node | undefined

    if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
      bodyNode = node.getBody()
    } else if (Node.isVariableDeclaration(node)) {
      bodyNode = node.getInitializer()
    } else if (Node.isArrowFunction(node)) {
      bodyNode = node.getBody()
    }

    if (!bodyNode) return

    const filePath = node.getSourceFile().getFilePath()

    // Find all identifiers in the body
    const identifiers = bodyNode.getDescendantsOfKind(SyntaxKind.Identifier)

    for (const identifier of identifiers) {
      try {
        const symbol = identifier.getSymbol()
        if (!symbol) continue

        const declarations = symbol.getDeclarations()
        if (!declarations || declarations.length === 0) continue

        // Get the first declaration
        let decl = declarations[0]

        // If the declaration is an ImportSpecifier, resolve to the actual exported symbol
        if (Node.isImportSpecifier(decl)) {
          const resolved = this.resolveImportSpecifier(decl)
          if (!resolved) continue
          decl = resolved
        }

        const declFile = decl.getSourceFile().getFilePath()

        // Skip if it's in a different project (node_modules, etc.)
        if (declFile.includes('node_modules')) continue

        // Determine the target symbol ID
        let targetId: string | undefined
        let targetName: string | undefined
        let targetKind: SymbolKind | undefined

        if (Node.isFunctionDeclaration(decl)) {
          targetName = decl.getName()
          if (targetName) {
            targetId = this.createSymbolId(declFile, targetName)
            targetKind = 'function'
          }
        } else if (Node.isVariableDeclaration(decl)) {
          targetName = decl.getName()
          targetId = this.createSymbolId(declFile, targetName)
          targetKind = 'variable'
        } else if (Node.isClassDeclaration(decl)) {
          targetName = decl.getName()
          if (targetName) {
            targetId = this.createSymbolId(declFile, targetName)
            targetKind = 'class'
          }
        } else if (Node.isMethodDeclaration(decl)) {
          const cls = decl.getParentIfKind(SyntaxKind.ClassDeclaration)
          if (cls) {
            const className = cls.getName()
            const methodName = decl.getName()
            if (className && methodName) {
              targetId = this.createSymbolId(declFile, `${className}.${methodName}`)
              targetKind = 'method'
              targetName = methodName
            }
          }
        } else if (Node.isInterfaceDeclaration(decl)) {
          targetName = decl.getName()
          targetId = this.createSymbolId(declFile, targetName)
          targetKind = 'interface'
        } else if (Node.isTypeAliasDeclaration(decl)) {
          targetName = decl.getName()
          targetId = this.createSymbolId(declFile, targetName)
          targetKind = 'type'
        } else if (Node.isEnumDeclaration(decl)) {
          targetName = decl.getName()
          targetId = this.createSymbolId(declFile, targetName)
          targetKind = 'enum'
        }

        if (!targetId || !targetName || !targetKind) continue

        // Skip self-references
        if (targetId === fromId) continue

        // Ensure target exists in graph (create if local/non-exported)
        if (!this.graph.hasSymbol(targetId)) {
          // Check if it's exported
          let isExported = false
          if (Node.isFunctionDeclaration(decl)) {
            isExported = decl.isExported()
          } else if (Node.isVariableDeclaration(decl)) {
            const varStmt = decl.getParent()?.getParent()
            if (varStmt && Node.isVariableStatement(varStmt)) {
              isExported = varStmt.isExported()
            }
          } else if (Node.isClassDeclaration(decl)) {
            isExported = decl.isExported()
          }

          this.addSymbolNode({
            id: targetId,
            name: targetName,
            kind: targetKind,
            file: declFile,
            line: decl.getStartLineNumber(),
            column: decl.getStart() - decl.getStartLinePos() + 1,
            exported: isExported,
            isEntryPoint: false,
            isUsed: false,
          })
        }

        // Add edge from source to target
        this.graph.addReference(fromId, targetId, {
          type: this.determineReferenceType(identifier),
          file: filePath,
          line: identifier.getStartLineNumber(),
          column: identifier.getStart() - identifier.getStartLinePos() + 1,
        })
      } catch {
        // Some identifiers may not have valid symbols, skip them
      }
    }
  }

  /**
   * Resolve an ImportSpecifier to the actual exported declaration in the source module
   */
  private resolveImportSpecifier(importSpec: Node): Node | undefined {
    if (!Node.isImportSpecifier(importSpec)) return undefined

    // Get the import declaration
    const importDecl = importSpec.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
    if (!importDecl) return undefined

    // Get the module specifier (e.g., '../components/button')
    const moduleSpec = importDecl.getModuleSpecifierValue()

    // Resolve the source file
    const sourceFile = importSpec.getSourceFile()
    const moduleSourceFile = sourceFile.getProject()
      .getSourceFile(file => {
        // Try to match the import path to a source file
        const filePath = file.getFilePath()
        return (
          filePath.includes(moduleSpec.replace(/^[./]+/, '')) &&
          (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx'))
        )
      })

    if (!moduleSourceFile) return undefined

    // Get the name we're importing (could be aliased)
    const importedName = importSpec.getName()

    // Find the exported declaration with this name
    // Check variable declarations
    for (const varStmt of moduleSourceFile.getVariableStatements()) {
      if (!varStmt.isExported()) continue
      for (const decl of varStmt.getDeclarations()) {
        if (decl.getName() === importedName) {
          return decl
        }
      }
    }

    // Check function declarations
    for (const fn of moduleSourceFile.getFunctions()) {
      if (fn.isExported() && fn.getName() === importedName) {
        return fn
      }
    }

    // Check class declarations
    for (const cls of moduleSourceFile.getClasses()) {
      if (cls.isExported() && cls.getName() === importedName) {
        return cls
      }
    }

    // Check interfaces
    for (const iface of moduleSourceFile.getInterfaces()) {
      if (iface.isExported() && iface.getName() === importedName) {
        return iface
      }
    }

    // Check type aliases
    for (const typeAlias of moduleSourceFile.getTypeAliases()) {
      if (typeAlias.isExported() && typeAlias.getName() === importedName) {
        return typeAlias
      }
    }

    // Check for re-exports via export declarations
    for (const exportDecl of moduleSourceFile.getExportDeclarations()) {
      for (const namedExport of exportDecl.getNamedExports()) {
        if (namedExport.getName() === importedName) {
          // This is a re-export, follow the chain
          const exportSymbol = namedExport.getSymbol()
          if (exportSymbol) {
            const aliasedDecls = exportSymbol.getDeclarations()
            if (aliasedDecls && aliasedDecls.length > 0) {
              // Recursively resolve if it's another import specifier
              if (Node.isImportSpecifier(aliasedDecls[0])) {
                return this.resolveImportSpecifier(aliasedDecls[0])
              }
              return aliasedDecls[0]
            }
          }
        }
      }
    }

    return undefined
  }

  /**
   * Find type references used in interface/type definitions
   * This handles cases like: interface Props { border: AvatarBorderStyle }
   */
  private findOutgoingTypeReferences(node: Node, fromId: string): void {
    // Skip if source doesn't exist in graph
    if (!this.graph.hasSymbol(fromId)) return

    const filePath = node.getSourceFile().getFilePath()

    // Find all type reference identifiers in the node
    const identifiers = node.getDescendantsOfKind(SyntaxKind.Identifier)

    for (const identifier of identifiers) {
      try {
        const symbol = identifier.getSymbol()
        if (!symbol) continue

        const declarations = symbol.getDeclarations()
        if (!declarations || declarations.length === 0) continue

        // Get the first declaration
        let decl = declarations[0]

        // If the declaration is an ImportSpecifier, resolve to the actual exported symbol
        if (Node.isImportSpecifier(decl)) {
          const resolved = this.resolveImportSpecifier(decl)
          if (!resolved) continue
          decl = resolved
        }

        const declFile = decl.getSourceFile().getFilePath()

        // Skip if it's in a different project (node_modules, etc.)
        if (declFile.includes('node_modules')) continue

        // Determine the target symbol ID
        let targetId: string | undefined
        let targetName: string | undefined
        let targetKind: SymbolKind | undefined

        if (Node.isInterfaceDeclaration(decl)) {
          targetName = decl.getName()
          targetId = this.createSymbolId(declFile, targetName)
          targetKind = 'interface'
        } else if (Node.isTypeAliasDeclaration(decl)) {
          targetName = decl.getName()
          targetId = this.createSymbolId(declFile, targetName)
          targetKind = 'type'
        } else if (Node.isEnumDeclaration(decl)) {
          targetName = decl.getName()
          targetId = this.createSymbolId(declFile, targetName)
          targetKind = 'enum'
        } else if (Node.isClassDeclaration(decl)) {
          targetName = decl.getName()
          if (targetName) {
            targetId = this.createSymbolId(declFile, targetName)
            targetKind = 'class'
          }
        }

        if (!targetId || !targetName || !targetKind) continue

        // Skip self-references
        if (targetId === fromId) continue

        // Ensure target exists in graph
        if (!this.graph.hasSymbol(targetId)) continue

        // Add edge from source to target
        this.graph.addReference(fromId, targetId, {
          type: 'type-reference',
          file: filePath,
          line: identifier.getStartLineNumber(),
          column: identifier.getStart() - identifier.getStartLinePos() + 1,
        })
      } catch {
        // Some identifiers may not have valid symbols, skip them
      }
    }
  }

  /**
   * Check if a node supports findReferences
   */
  private isReferenceFindable(node: Node): node is Node & ReferenceFindableNode {
    return 'findReferencesAsNodes' in node && typeof (node as any).findReferencesAsNodes === 'function'
  }

  /**
   * Find all references to a declaration and add them as edges
   */
  private findAndAddReferences(node: Node, targetId: string): void {
    // Skip if target doesn't exist in graph
    if (!this.graph.hasSymbol(targetId)) return

    // Skip if node doesn't support findReferences
    if (!this.isReferenceFindable(node)) return

    try {
      // Use ts-morph's findReferencesAsNodes - the key API!
      const references = node.findReferencesAsNodes()

      for (const ref of references) {
        // Skip the declaration itself
        if (ref === node) continue

        // Find the containing declaration (what references this symbol?)
        const containingDecl = this.findContainingDeclaration(ref)
        if (!containingDecl) continue

        const refFile = ref.getSourceFile().getFilePath()
        const refType = this.determineReferenceType(ref)

        // Create edge from the referencing symbol to the referenced symbol
        const fromId = containingDecl.id
        if (fromId && this.graph.hasSymbol(fromId)) {
          this.graph.addReference(fromId, targetId, {
            type: refType,
            file: refFile,
            line: ref.getStartLineNumber(),
            column: ref.getStart() - ref.getStartLinePos() + 1,
          })
        } else if (fromId) {
          // The container doesn't exist as a symbol yet - this can happen for
          // local functions, arrow functions, etc. that aren't top-level declarations.
          // We need to ensure they exist in the graph.
          // For now, create them on the fly as non-exported symbols.
          this.addSymbolNode({
            id: fromId,
            name: fromId.split(':').pop() || 'unknown',
            kind: containingDecl.kind,
            file: refFile,
            line: ref.getStartLineNumber(),
            column: 1,
            exported: false,
            isEntryPoint: false,
            isUsed: false,
          })
          this.graph.addReference(fromId, targetId, {
            type: refType,
            file: refFile,
            line: ref.getStartLineNumber(),
            column: ref.getStart() - ref.getStartLinePos() + 1,
          })
        }
      }
    } catch (e) {
      // Some nodes don't support findReferences, skip them
      // console.error('Error in findAndAddReferences:', e)
    }
  }

  /**
   * Find the declaration that contains a reference node
   */
  private findContainingDeclaration(node: Node): { id: string; kind: SymbolKind } | undefined {
    let current: Node | undefined = node
    const filePath = node.getSourceFile().getFilePath()

    while (current) {
      // Check if it's a function declaration (named function)
      if (Node.isFunctionDeclaration(current)) {
        const name = current.getName()
        if (name) {
          return { id: this.createSymbolId(filePath, name), kind: 'function' }
        }
      }

      // Check if it's a function expression (const foo = function() {})
      if (Node.isFunctionExpression(current)) {
        const varDecl = current.getParentIfKind(SyntaxKind.VariableDeclaration)
        if (varDecl) {
          const name = varDecl.getName()
          return { id: this.createSymbolId(filePath, name), kind: 'function' }
        }
      }

      // Arrow function in variable declaration (const foo = () => {})
      if (Node.isArrowFunction(current)) {
        const varDecl = current.getParentIfKind(SyntaxKind.VariableDeclaration)
        if (varDecl) {
          const name = varDecl.getName()
          return { id: this.createSymbolId(filePath, name), kind: 'function' }
        }
      }

      // Check if it's a method
      if (Node.isMethodDeclaration(current)) {
        const cls = current.getParentIfKind(SyntaxKind.ClassDeclaration)
        if (cls) {
          const className = cls.getName()
          const methodName = current.getName()
          if (className && methodName) {
            return {
              id: this.createSymbolId(filePath, `${className}.${methodName}`),
              kind: 'method',
            }
          }
        }
      }

      // Check if it's a class
      if (Node.isClassDeclaration(current)) {
        const name = current.getName()
        if (name) {
          return { id: this.createSymbolId(filePath, name), kind: 'class' }
        }
      }

      // Check if it's a MODULE-LEVEL variable declaration (not local)
      // Module-level means parent is VariableDeclarationList -> VariableStatement -> SourceFile
      if (Node.isVariableDeclaration(current)) {
        const varStmt = current.getParent()?.getParent()
        if (varStmt && Node.isVariableStatement(varStmt)) {
          const parent = varStmt.getParent()
          // Only return if it's at module level (parent is SourceFile)
          if (parent && Node.isSourceFile(parent)) {
            const name = current.getName()
            return { id: this.createSymbolId(filePath, name), kind: 'variable' }
          }
        }
        // If not module-level, continue walking up to find the containing function
      }

      current = current.getParent()
    }

    // If we couldn't find a containing declaration, create a module-level reference
    // This handles code at module level (top-level statements)
    const moduleId = this.createSymbolId(filePath, '<module>')
    this.ensureModuleNode(filePath, moduleId)
    return { id: moduleId, kind: 'module' }
  }

  /**
   * Ensure a module-level node exists for tracking module-level references
   */
  private ensureModuleNode(filePath: string, moduleId: string): void {
    if (this.graph.hasSymbol(moduleId)) return

    // Determine if this is likely an entry point file
    const isEntryFile = /\/(index|main|app|server)\.(tsx?|jsx?)$/.test(filePath)

    this.addSymbolNode({
      id: moduleId,
      name: '<module>',
      kind: 'module',
      file: filePath,
      line: 1,
      column: 1,
      exported: false,
      isEntryPoint: isEntryFile,
      isUsed: false,
    })
  }

  /**
   * Determine the type of reference from context
   */
  private determineReferenceType(node: Node): ReferenceType {
    const parent = node.getParent()

    if (!parent) return 'call'

    // Check for call expression
    if (Node.isCallExpression(parent)) {
      return 'call'
    }

    // Check for new expression
    if (Node.isNewExpression(parent)) {
      return 'instantiation'
    }

    // Check for property access (read or write)
    if (Node.isPropertyAccessExpression(parent)) {
      const grandParent = parent.getParent()
      if (grandParent && Node.isBinaryExpression(grandParent)) {
        const operator = grandParent.getOperatorToken().getText()
        if (operator === '=' || operator.endsWith('=')) {
          return 'property-write'
        }
      }
      return 'property-read'
    }

    // Check for type reference
    if (Node.isTypeReference(parent)) {
      return 'type-reference'
    }

    // Check for import
    if (Node.isImportSpecifier(parent) || Node.isImportClause(parent)) {
      return 'import'
    }

    // Check for decorator
    if (Node.isDecorator(parent)) {
      return 'decorator'
    }

    // Default to call
    return 'call'
  }

  /**
   * Create a unique symbol ID
   */
  private createSymbolId(filePath: string, name: string): string {
    // Normalize path to be relative and consistent
    return `${filePath}:${name}`
  }

  private addSymbolNode(node: SymbolNode): void {
    this.graph.addSymbol(node)
  }

  /**
   * Get the underlying ts-morph project
   */
  getProject(): Project {
    return this.project
  }
}
