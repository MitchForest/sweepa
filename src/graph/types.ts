/**
 * Graph node types - represents declarations in the codebase
 */

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'property'
  | 'variable'
  | 'type'
  | 'interface'
  | 'enum'
  | 'enum-member'
  | 'namespace'
  | 'module'
  | 'parameter'

/**
 * A node in the call graph representing a declaration
 */
export interface SymbolNode {
  /** Unique identifier (e.g., "src/user-service.ts:UserService.getUser") */
  id: string

  /** Human-readable name */
  name: string

  /** Kind of symbol */
  kind: SymbolKind

  /** Source file path */
  file: string

  /** Line number (1-indexed) */
  line: number

  /** Column number (1-indexed) */
  column: number

  /** Is this symbol exported from its module? */
  exported: boolean

  /** Is this an entry point (e.g., main, route handler)? */
  isEntryPoint: boolean

  /** Is this symbol marked as used after analysis? */
  isUsed: boolean

  /** Parent symbol ID (e.g., class for a method) */
  parent?: string

  /** Why this symbol was retained (if explicitly retained by a mutator) */
  retainedBy?: string

  /** Why this symbol is an entry point (if marked as one) */
  entryPointReason?: string
}

/**
 * Type of reference between symbols
 */
export type ReferenceType =
  | 'call'                    // Function/method call
  | 'property-read'           // Reading a property
  | 'property-write'          // Writing a property
  | 'type-reference'          // Type annotation, extends, implements
  | 'import'                  // Import statement
  | 're-export'               // Re-export statement
  | 'instantiation'           // new Class()
  | 'decorator'               // @Decorator usage
  | 'jsx-element'             // <Component /> in JSX
  | 'interface-implementation' // implements Interface

/**
 * An edge in the call graph representing a reference
 */
export interface ReferenceEdge {
  /** Type of reference */
  type: ReferenceType

  /** Source file where reference occurs */
  file: string

  /** Line number of reference */
  line: number

  /** Column number of reference */
  column: number
}

/**
 * Classification of where a reference comes from (for redundant export detection)
 */
export type ReferenceSource =
  | 'same-file'       // Reference from same file
  | 'same-package'    // Reference from same package
  | 'different-package' // Reference from different package
  | 'external'        // Reference from node_modules consumer (assumed)
