/**
 * Types for issue detection
 */

import type { SymbolKind } from '../graph/types.js'

/**
 * Type of issue detected
 */
export type IssueKind =
  | 'unused-file'
  | 'unused-dependency'
  | 'misplaced-dependency'
  | 'unlisted-dependency'
  | 'unresolved-import'
  | 'unused-exported'
  | 'unused-exported-type'
  | 'unused-export'
  | 'unused-method'
  | 'unused-param'
  | 'unused-property'
  | 'unused-import'
  | 'unused-enum-case'
  | 'assign-only-property'
  | 'unused-variable'
  | 'unused-type'
  | 'redundant-export'

/**
 * Confidence level for an issue
 */
export type Confidence = 'high' | 'medium' | 'low'

/**
 * An issue detected by Sweepa
 */
export interface Issue {
  /** Type of issue */
  kind: IssueKind

  /** Confidence level */
  confidence: Confidence

  /** Symbol name */
  name: string

  /** Kind of symbol (function, class, method, etc.) */
  symbolKind: SymbolKind

  /** File path */
  file: string

  /** Line number (1-indexed) */
  line: number

  /** Column number (1-indexed) */
  column: number

  /** Human-readable message */
  message: string

  /** Parent symbol (e.g., class for a method) */
  parent?: string

  /** Additional context */
  context?: Record<string, unknown>
}

/**
 * Result from running detectors
 */
export interface DetectionResult {
  /** All issues found */
  issues: Issue[]

  /** Statistics */
  stats: {
    filesAnalyzed: number
    symbolsAnalyzed: number
    issuesByKind: Record<IssueKind, number>
  }
}
