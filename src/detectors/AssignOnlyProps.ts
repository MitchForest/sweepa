/**
 * Assign-Only Property Detector
 *
 * Identifies properties that are written but never read.
 * These are often indicators of dead code or incomplete implementations.
 */

import {
  Project,
  Node,
  SyntaxKind,
  type ClassDeclaration,
  type PropertyDeclaration,
} from 'ts-morph'
import type { Issue } from './types.js'

export interface AssignOnlyPropsOptions {
  /** Ignore properties with specific decorators (e.g., @Column, @Prop) */
  ignoreDecorators?: string[]

  /** Ignore private properties */
  ignorePrivate?: boolean
}

/**
 * Detect assign-only properties in a TypeScript project
 */
export function detectAssignOnlyProps(
  project: Project,
  options: AssignOnlyPropsOptions = {}
): Issue[] {
  const issues: Issue[] = []
  const { ignoreDecorators = [], ignorePrivate = false } = options

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()

    // Skip node_modules and declaration files
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
      continue
    }

    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName()
      if (!className) continue

      for (const prop of cls.getProperties()) {
        const propName = prop.getName()

        // Skip properties with ignored decorators
        if (hasIgnoredDecorator(prop, ignoreDecorators)) {
          continue
        }

        // Skip private if configured
        if (ignorePrivate && prop.hasModifier(SyntaxKind.PrivateKeyword)) {
          continue
        }

        // Analyze property usage
        const usage = analyzePropertyUsage(cls, propName)

        if (usage.writeCount > 0 && usage.readCount === 0) {
          issues.push({
            kind: 'assign-only-property',
            confidence: determineConfidence(prop, usage),
            name: propName,
            symbolKind: 'property',
            file: filePath,
            line: prop.getStartLineNumber(),
            column: prop.getStart() - prop.getStartLinePos() + 1,
            message: `Property '${propName}' is assigned but never read`,
            parent: className,
            context: {
              writeCount: usage.writeCount,
              hasInitializer: prop.hasInitializer(),
              isPrivate: prop.hasModifier(SyntaxKind.PrivateKeyword),
            },
          })
        }
      }
    }
  }

  return issues
}

interface PropertyUsage {
  readCount: number
  writeCount: number
  readLocations: { line: number; column: number }[]
  writeLocations: { line: number; column: number }[]
}

/**
 * Analyze how a property is used within its class
 */
function analyzePropertyUsage(cls: ClassDeclaration, propName: string): PropertyUsage {
  const usage: PropertyUsage = {
    readCount: 0,
    writeCount: 0,
    readLocations: [],
    writeLocations: [],
  }

  // Find all references to this.propName or just propName in the class
  cls.forEachDescendant((node) => {
    // Look for property access expressions like this.propName
    if (Node.isPropertyAccessExpression(node)) {
      const expression = node.getExpression()
      const name = node.getName()

      // Check if it's this.propName
      if (name === propName && expression.getText() === 'this') {
        const parent = node.getParent()

        // Check if it's a write (assignment target)
        if (parent && isWriteContext(node, parent)) {
          usage.writeCount++
          usage.writeLocations.push({
            line: node.getStartLineNumber(),
            column: node.getStart() - node.getStartLinePos() + 1,
          })
        } else {
          usage.readCount++
          usage.readLocations.push({
            line: node.getStartLineNumber(),
            column: node.getStart() - node.getStartLinePos() + 1,
          })
        }
      }
    }
  })

  // Count initializer as a write if present
  const property = cls.getProperty(propName)
  if (property?.hasInitializer()) {
    usage.writeCount++
  }

  return usage
}

/**
 * Check if a property access is in a write context
 */
function isWriteContext(node: Node, parent: Node): boolean {
  // Direct assignment: this.prop = value
  if (Node.isBinaryExpression(parent)) {
    const operator = parent.getOperatorToken().getText()
    const left = parent.getLeft()

    // Check if this node is the left side of an assignment
    if (left === node && (operator === '=' || operator.endsWith('='))) {
      return true
    }
  }

  // Prefix/postfix increment/decrement: this.prop++, ++this.prop
  if (Node.isPrefixUnaryExpression(parent) || Node.isPostfixUnaryExpression(parent)) {
    const operator = parent.getOperatorToken()
    // operator is a SyntaxKind enum value, not a node
    if (operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken) {
      return true
    }
  }

  return false
}

/**
 * Check if property has an ignored decorator
 */
function hasIgnoredDecorator(prop: PropertyDeclaration, ignoreDecorators: string[]): boolean {
  if (ignoreDecorators.length === 0) return false

  const decorators = prop.getDecorators()
  for (const decorator of decorators) {
    const name = decorator.getName()
    if (ignoreDecorators.includes(name)) {
      return true
    }
  }

  return false
}

/**
 * Determine confidence level
 */
function determineConfidence(
  prop: PropertyDeclaration,
  usage: PropertyUsage
): 'high' | 'medium' | 'low' {
  // Lower confidence if property has decorators (might be used by framework)
  if (prop.getDecorators().length > 0) {
    return 'low'
  }

  // Lower confidence for public/protected properties (might be used externally)
  if (!prop.hasModifier(SyntaxKind.PrivateKeyword)) {
    return 'medium'
  }

  // High confidence for private properties with multiple writes but no reads
  if (usage.writeCount > 1) {
    return 'high'
  }

  return 'high'
}
