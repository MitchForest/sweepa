/**
 * Baseline support for incremental adoption
 *
 * A baseline file records known issues, allowing Sweepa to only report NEW issues.
 * This enables gradual cleanup without being overwhelmed by existing technical debt.
 */

import type { Issue, IssueKind } from '../detectors/types.js'
import crypto from 'node:crypto'
import path from 'node:path'

/**
 * A single issue recorded in the baseline
 */
export interface BaselineIssue {
  /** Hash for stable matching across file changes */
  hash: string

  /** Issue kind */
  kind: IssueKind

  /** Symbol name */
  name: string

  /** Relative file path */
  file: string

  /** Line number (may shift) */
  line: number

  /** Parent symbol (for methods/properties) */
  parent?: string
}

/**
 * The baseline file format
 */
export interface Baseline {
  /** Version of the baseline format */
  version: '1.0'

  /** When the baseline was generated */
  timestamp: string

  /** Project root the baseline was generated from */
  projectRoot: string

  /** Total number of issues at time of baseline */
  totalIssues: number

  /** Issues by kind count */
  issuesByKind: Record<string, number>

  /** The actual issues */
  issues: BaselineIssue[]
}

/**
 * Create a stable hash for an issue
 * Uses symbol name, parent, kind, and file (not line number since that shifts)
 */
export function hashIssue(issue: Issue, projectRoot: string): string {
  const relativePath = path.relative(projectRoot, issue.file)
  const input = [
    issue.kind,
    issue.name,
    issue.parent || '',
    relativePath,
  ].join('::')

  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16)
}

/**
 * Convert an Issue to a BaselineIssue
 */
export function toBaselineIssue(issue: Issue, projectRoot: string): BaselineIssue {
  return {
    hash: hashIssue(issue, projectRoot),
    kind: issue.kind,
    name: issue.name,
    file: path.relative(projectRoot, issue.file),
    line: issue.line,
    parent: issue.parent,
  }
}

/**
 * Create a baseline from a set of issues
 */
export function createBaseline(issues: Issue[], projectRoot: string): Baseline {
  const issuesByKind: Record<string, number> = {}
  for (const issue of issues) {
    issuesByKind[issue.kind] = (issuesByKind[issue.kind] || 0) + 1
  }

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    projectRoot: path.basename(projectRoot),
    totalIssues: issues.length,
    issuesByKind,
    issues: issues.map(issue => toBaselineIssue(issue, projectRoot)),
  }
}

/**
 * Compare current issues against a baseline
 * Returns only NEW issues not in the baseline
 */
export function filterNewIssues(
  issues: Issue[],
  baseline: Baseline,
  projectRoot: string
): Issue[] {
  const baselineHashes = new Set(baseline.issues.map(i => i.hash))

  return issues.filter(issue => {
    const hash = hashIssue(issue, projectRoot)
    return !baselineHashes.has(hash)
  })
}

/**
 * Validate a baseline file structure
 */
export function validateBaseline(obj: unknown): obj is Baseline {
  if (!obj || typeof obj !== 'object') return false

  const baseline = obj as Record<string, unknown>

  if (baseline.version !== '1.0') return false
  if (typeof baseline.timestamp !== 'string') return false
  if (typeof baseline.totalIssues !== 'number') return false
  if (!Array.isArray(baseline.issues)) return false

  // Validate each issue has required fields
  for (const issue of baseline.issues) {
    if (typeof issue !== 'object' || issue === null) return false
    const i = issue as Record<string, unknown>
    if (typeof i.hash !== 'string') return false
    if (typeof i.kind !== 'string') return false
    if (typeof i.name !== 'string') return false
    if (typeof i.file !== 'string') return false
  }

  return true
}
