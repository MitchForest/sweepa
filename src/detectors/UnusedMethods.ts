/**
 * Unused Method Detector
 *
 * Identifies methods on classes that are never called.
 * This goes beyond Knip's import-graph analysis to find methods
 * on used classes that are themselves unused.
 */

import {
  Project,
  Node,
  SyntaxKind,
  type MethodDeclaration,
} from 'ts-morph'
import type { Issue } from './types.js'

export interface UnusedMethodsOptions {
  /** Ignore methods with specific decorators (e.g., @Get, @Post) */
  ignoreDecorators?: string[]

  /** Ignore lifecycle methods (e.g., constructor, ngOnInit) */
  ignoreLifecycleMethods?: boolean

  /** Ignore methods starting with underscore */
  ignoreUnderscoreMethods?: boolean
}

// Common lifecycle method names across frameworks
const LIFECYCLE_METHODS = new Set([
  'constructor',
  'ngOnInit',
  'ngOnDestroy',
  'ngOnChanges',
  'ngAfterViewInit',
  'ngAfterContentInit',
  'componentDidMount',
  'componentWillUnmount',
  'componentDidUpdate',
  'render',
  'connectedCallback',
  'disconnectedCallback',
  'attributeChangedCallback',
  'toString',
  'valueOf',
  'toJSON',
  '[Symbol.iterator]',
  '[Symbol.toStringTag]',
])

/**
 * Detect unused methods in a TypeScript project
 */
export function detectUnusedMethods(
  project: Project,
  options: UnusedMethodsOptions = {}
): Issue[] {
  const issues: Issue[] = []
  const {
    ignoreDecorators = [],
    ignoreLifecycleMethods = true,
    ignoreUnderscoreMethods = true,
  } = options

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()

    // Skip node_modules and declaration files
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
      continue
    }

    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName()
      if (!className) continue

      for (const method of cls.getMethods()) {
        const methodName = method.getName()

        // Skip lifecycle methods
        if (ignoreLifecycleMethods && LIFECYCLE_METHODS.has(methodName)) {
          continue
        }

        // Skip underscore-prefixed methods
        if (ignoreUnderscoreMethods && methodName.startsWith('_')) {
          continue
        }

        // Skip methods with ignored decorators
        if (hasIgnoredDecorator(method, ignoreDecorators)) {
          continue
        }

        // Skip methods that override a parent class method
        if (isOverrideMethod(method)) {
          continue
        }

        // Find references to this method
        const references = findMethodReferences(method, project)

        // If no references (excluding the declaration itself), it's unused
        if (references.length === 0) {
          issues.push({
            kind: 'unused-method',
            confidence: determineConfidence(method, cls.isExported()),
            name: methodName,
            symbolKind: 'method',
            file: filePath,
            line: method.getStartLineNumber(),
            column: method.getStart() - method.getStartLinePos() + 1,
            message: `Method '${methodName}' is never called`,
            parent: className,
            context: {
              isStatic: method.isStatic(),
              isPrivate: method.hasModifier(SyntaxKind.PrivateKeyword),
              isProtected: method.hasModifier(SyntaxKind.ProtectedKeyword),
              classExported: cls.isExported(),
            },
          })
        }
      }
    }
  }

  return issues
}

/**
 * Find all call sites for a method
 */
function findMethodReferences(method: MethodDeclaration, _project: Project): Node[] {
  const references: Node[] = []

  try {
    // Use ts-morph's findReferencesAsNodes
    const allRefs = method.findReferencesAsNodes()

    for (const ref of allRefs) {
      // Skip the method declaration itself
      if (ref === method || ref === method.getNameNode()) {
        continue
      }

      // Skip references in the same position (duplicate)
      const refLine = ref.getStartLineNumber()
      const methodLine = method.getStartLineNumber()
      if (refLine === methodLine && ref.getSourceFile() === method.getSourceFile()) {
        continue
      }

      references.push(ref)
    }
  } catch {
    // If findReferences fails, return empty (assume used to be safe)
  }

  return references
}

/**
 * Check if method has ignored decorator
 */
function hasIgnoredDecorator(method: MethodDeclaration, ignoreDecorators: string[]): boolean {
  if (ignoreDecorators.length === 0) return false

  const decorators = method.getDecorators()
  for (const decorator of decorators) {
    const name = decorator.getName()
    if (ignoreDecorators.includes(name)) {
      return true
    }
  }

  return false
}

/**
 * Check if method overrides a parent class method
 */
function isOverrideMethod(method: MethodDeclaration): boolean {
  // Check for explicit override modifier (TS 4.3+)
  if (method.hasModifier(SyntaxKind.OverrideKeyword)) {
    return true
  }

  // Check parent class for same method name
  const cls = method.getParentIfKind(SyntaxKind.ClassDeclaration)
  if (!cls) return false

  const methodName = method.getName()
  const baseClass = cls.getBaseClass()

  if (baseClass) {
    const parentMethod = baseClass.getMethod(methodName)
    if (parentMethod) {
      return true
    }
  }

  // Check implemented interfaces
  for (const impl of cls.getImplements()) {
    const type = impl.getType()
    const property = type.getProperty(methodName)
    if (property) {
      return true
    }
  }

  return false
}

/**
 * Determine confidence level
 */
function determineConfidence(
  method: MethodDeclaration,
  classExported: boolean
): 'high' | 'medium' | 'low' {
  // Lower confidence if class is exported (method might be called externally)
  if (classExported && !method.hasModifier(SyntaxKind.PrivateKeyword)) {
    return 'medium'
  }

  // Lower confidence if method has decorators
  if (method.getDecorators().length > 0) {
    return 'low'
  }

  // High confidence for private methods
  if (method.hasModifier(SyntaxKind.PrivateKeyword)) {
    return 'high'
  }

  return 'high'
}
