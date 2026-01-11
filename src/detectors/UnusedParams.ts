/**
 * Unused Parameter Detector
 *
 * Identifies function parameters that are never used within the function body.
 * Handles destructuring patterns, rest parameters, and interface requirements.
 */

import {
  Project,
  Node,
  SyntaxKind,
  type FunctionDeclaration,
  type MethodDeclaration,
  type ArrowFunction,
  type FunctionExpression,
  type ParameterDeclaration,
} from 'ts-morph'
import type { Issue } from './types.js'

type FunctionLike =
  | FunctionDeclaration
  | MethodDeclaration
  | ArrowFunction
  | FunctionExpression

export interface UnusedParamsOptions {
  /** Ignore parameters starting with underscore */
  ignoreUnderscoreParams?: boolean

  /** Ignore parameters required by interface/type implementation */
  ignoreInterfaceParams?: boolean
}

/**
 * Detect unused parameters in a TypeScript project
 */
export function detectUnusedParams(
  project: Project,
  options: UnusedParamsOptions = {}
): Issue[] {
  const issues: Issue[] = []
  const {
    ignoreUnderscoreParams = true,
    ignoreInterfaceParams = true,
  } = options

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()

    // Skip node_modules and declaration files
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) {
      continue
    }

    // Find all function-like declarations
    const functions: FunctionLike[] = [
      ...sourceFile.getFunctions(),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression),
    ]

    // Also get methods from classes
    for (const cls of sourceFile.getClasses()) {
      functions.push(...cls.getMethods())
    }

    for (const fn of functions) {
      const params = fn.getParameters()

      for (const param of params) {
        const paramName = getParameterName(param)
        if (!paramName) continue

        // Skip underscore-prefixed params if configured
        if (ignoreUnderscoreParams && paramName.startsWith('_')) {
          continue
        }

        // Skip rest parameters (often used for forwarding)
        if (param.isRestParameter()) {
          continue
        }

        // Check if parameter is required by an interface
        if (ignoreInterfaceParams && isRequiredByInterface(fn, param)) {
          continue
        }

        // Check if parameter is used in the function body
        if (!isParameterUsed(fn, param)) {
          const parentName = getParentName(fn)

          issues.push({
            kind: 'unused-param',
            confidence: determineConfidence(fn, param),
            name: paramName,
            symbolKind: 'parameter',
            file: filePath,
            line: param.getStartLineNumber(),
            column: param.getStart() - param.getStartLinePos() + 1,
            message: `Parameter '${paramName}' is never used`,
            parent: parentName,
            context: {
              functionName: getFunctionName(fn),
              paramIndex: params.indexOf(param),
            },
          })
        }
      }
    }
  }

  return issues
}

/**
 * Get the name of a parameter (handles destructuring)
 */
function getParameterName(param: ParameterDeclaration): string | undefined {
  const nameNode = param.getNameNode()

  if (Node.isIdentifier(nameNode)) {
    return nameNode.getText()
  }

  // For destructuring patterns, return the whole pattern text
  if (Node.isObjectBindingPattern(nameNode) || Node.isArrayBindingPattern(nameNode)) {
    return nameNode.getText()
  }

  return undefined
}

/**
 * Check if a parameter is used in the function body
 */
function isParameterUsed(fn: FunctionLike, param: ParameterDeclaration): boolean {
  const body = fn.getBody()
  if (!body) return true // No body = can't determine, assume used

  const nameNode = param.getNameNode()

  // Handle simple identifier parameters
  if (Node.isIdentifier(nameNode)) {
    const paramName = nameNode.getText()
    const references = findReferencesInNode(body, paramName)
    return references.length > 0
  }

  // Handle destructuring patterns - check if any binding is used
  if (Node.isObjectBindingPattern(nameNode)) {
    for (const element of nameNode.getElements()) {
      const binding = element.getNameNode()
      if (Node.isIdentifier(binding)) {
        const references = findReferencesInNode(body, binding.getText())
        if (references.length > 0) return true
      }
    }
    return false
  }

  if (Node.isArrayBindingPattern(nameNode)) {
    for (const element of nameNode.getElements()) {
      if (Node.isBindingElement(element)) {
        const binding = element.getNameNode()
        if (Node.isIdentifier(binding)) {
          const references = findReferencesInNode(body, binding.getText())
          if (references.length > 0) return true
        }
      }
    }
    return false
  }

  // Unknown pattern, assume used
  return true
}

/**
 * Find all references to a name within a node
 */
function findReferencesInNode(node: Node, name: string): Node[] {
  const refs: Node[] = []

  node.forEachDescendant((descendant) => {
    if (Node.isIdentifier(descendant) && descendant.getText() === name) {
      // Make sure it's not a property name in an object literal
      const parent = descendant.getParent()
      if (parent && Node.isPropertyAssignment(parent)) {
        if (parent.getNameNode() === descendant) {
          return // Skip property names
        }
      }
      refs.push(descendant)
    }
  })

  return refs
}

/**
 * Check if parameter is required by an interface implementation
 */
function isRequiredByInterface(fn: FunctionLike, param: ParameterDeclaration): boolean {
  // Check if this is a method implementing an interface
  if (Node.isMethodDeclaration(fn)) {
    const cls = fn.getParentIfKind(SyntaxKind.ClassDeclaration)
    if (cls) {
      const implementedInterfaces = cls.getImplements()
      if (implementedInterfaces.length > 0) {
        // Check if this specific method is part of an interface
        const methodName = fn.getName()
        for (const impl of implementedInterfaces) {
          const type = impl.getType()
          const prop = type.getProperty(methodName)
          if (prop) {
            // This method implements an interface method
            // The parameter might be required by the interface signature
            return true
          }
        }
      }
    }
  }

  // Check if the function is assigned to a variable with a function type
  if (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) {
    const parent = fn.getParent()
    if (parent && Node.isVariableDeclaration(parent)) {
      const typeNode = parent.getTypeNode()
      if (typeNode) {
        // Has explicit type annotation - params might be required by that type
        return true
      }
    }
  }

  // Check if parameter has explicit position requirement from callback signature
  // This is a heuristic: if the param is not the last param and params after it ARE used,
  // then this param might be required for positional reasons
  const params = fn.getParameters()
  const paramIndex = params.indexOf(param)
  if (paramIndex < params.length - 1) {
    // Check if any subsequent parameter is used
    const body = fn.getBody()
    if (body) {
      for (let i = paramIndex + 1; i < params.length; i++) {
        const laterParam = params[i]
        const nameNode = laterParam.getNameNode()
        if (Node.isIdentifier(nameNode)) {
          const name = nameNode.getText()
          const refs = findReferencesInBody(body, name)
          if (refs > 0) {
            // A later parameter is used, so this unused param might be positionally required
            return false // Don't skip, but reduce confidence later
          }
        }
      }
    }
  }

  return false
}

/**
 * Count references to a name in a function body
 */
function findReferencesInBody(body: Node, name: string): number {
  let count = 0
  body.forEachDescendant((descendant) => {
    if (Node.isIdentifier(descendant) && descendant.getText() === name) {
      count++
    }
  })
  return count
}

/**
 * Determine confidence level for the issue
 */
function determineConfidence(fn: FunctionLike, _param: ParameterDeclaration): 'high' | 'medium' | 'low' {
  // Lower confidence for methods (might be overrides)
  if (Node.isMethodDeclaration(fn)) {
    return 'medium'
  }

  // Lower confidence for exported functions (might be API contract)
  if (Node.isFunctionDeclaration(fn) && fn.isExported()) {
    return 'medium'
  }

  // High confidence for internal arrow functions
  if (Node.isArrowFunction(fn)) {
    return 'high'
  }

  return 'high'
}

/**
 * Get the name of the function
 */
function getFunctionName(fn: FunctionLike): string {
  if (Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn)) {
    return fn.getName() || '<anonymous>'
  }

  // For arrow functions, try to get the variable name
  const parent = fn.getParent()
  if (parent && Node.isVariableDeclaration(parent)) {
    return parent.getName()
  }

  return '<anonymous>'
}

/**
 * Get the parent name (class name for methods)
 */
function getParentName(fn: FunctionLike): string | undefined {
  if (Node.isMethodDeclaration(fn)) {
    const cls = fn.getParentIfKind(SyntaxKind.ClassDeclaration)
    return cls?.getName()
  }
  return undefined
}
