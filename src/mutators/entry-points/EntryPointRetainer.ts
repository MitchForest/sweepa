/**
 * EntryPointRetainer - Marks framework entry points as roots
 *
 * Entry points are the starting nodes for graph traversal.
 * Everything reachable from an entry point is considered "used".
 */

import type { GraphMutator, MutatorContext } from '../types.js'
import path from 'node:path'

export const EntryPointRetainer: GraphMutator = {
  name: 'EntryPointRetainer',
  priority: 10,
  phase: 'entry-points',

  mutate(ctx: MutatorContext): void {
    const { graph, frameworks, projectRoot } = ctx

    // Build entry point patterns from detected frameworks
    const entryPatterns = buildEntryPatterns(frameworks)

    let marked = 0

    // First pass: mark exported symbols matching patterns
    for (const symbol of graph.getAllSymbols()) {
      // Skip non-exported symbols for now
      if (!symbol.exported) continue

      const relPath = path.relative(projectRoot, symbol.file)

      for (const pattern of entryPatterns) {
        if (matchesEntryPattern(relPath, symbol.name, pattern)) {
          ctx.markAsEntryPoint(symbol.id, pattern.reason)
          marked++
          break
        }
      }
    }

    // Hono route modules are usually imported for side effects and often default-exported,
    // so the module itself should be treated as an entry point (not just named exports).
    const honoModulePatterns = entryPatterns.filter(
      (p) => p.filePattern && p.reason.toLowerCase().startsWith('hono ')
    )
    if (honoModulePatterns.length > 0) {
      for (const symbol of graph.getAllSymbols()) {
        if (symbol.kind !== 'module') continue

        const relPath = path.relative(projectRoot, symbol.file)
        for (const pattern of honoModulePatterns) {
          if (pattern.filePattern!.test(relPath)) {
            ctx.markAsEntryPoint(symbol.id, pattern.reason)
            marked++
            break
          }
        }
      }
    }

    // Second pass: for app entry files (index.ts, app.ts, server.ts),
    // mark ALL symbols as entry points since they're executed for side effects
    const appEntryPatterns = [
      /^(src\/)?index\.(tsx?|jsx?)$/,
      /^(src\/)?app\.(tsx?|jsx?)$/,
      /^(src\/)?server\.(tsx?|jsx?)$/,
      /^(src\/)?worker\.(tsx?|jsx?)$/,
      /^(src\/)?main\.(tsx?|jsx?)$/,
    ]

    for (const symbol of graph.getAllSymbols()) {
      // Skip already marked
      if (symbol.isEntryPoint) continue

      const relPath = path.relative(projectRoot, symbol.file)

      for (const pattern of appEntryPatterns) {
        if (pattern.test(relPath)) {
          ctx.markAsEntryPoint(symbol.id, 'App entry file')
          marked++
          break
        }
      }
    }

    ctx.log(`Marked ${marked} entry points`)
  },
}

interface EntryPattern {
  /** File path pattern (glob-like) */
  filePattern?: RegExp
  /** Export name pattern */
  exportPattern?: RegExp | string
  /** Reason for marking as entry point */
  reason: string
}

function buildEntryPatterns(frameworks: { name: string }[]): EntryPattern[] {
  const patterns: EntryPattern[] = []

  for (const fw of frameworks) {
    // Normalize framework name for matching
    const fwName = fw.name.toLowerCase().replace(/\s+/g, '-')

    switch (fwName) {
      case 'tanstack-start':
        patterns.push(
          // Route files (with or without src/ prefix)
          { filePattern: /(^|\/)routes\/.*\.(tsx?|jsx?)$/, exportPattern: 'Route', reason: 'TanStack route' },
          { filePattern: /(^|\/)routes\/.*\.(tsx?|jsx?)$/, exportPattern: 'loader', reason: 'TanStack loader' },
          { filePattern: /(^|\/)routes\/.*\.(tsx?|jsx?)$/, exportPattern: 'action', reason: 'TanStack action' },
          { filePattern: /(^|\/)routes\/.*\.(tsx?|jsx?)$/, exportPattern: /^[A-Z]/, reason: 'TanStack route component' },
          // Root router
          { filePattern: /(^|\/)router\.(tsx?|jsx?)$/, reason: 'TanStack router' },
          { filePattern: /routeTree\.gen\.(tsx?|jsx?)$/, reason: 'TanStack route tree' },
        )
        break

      case 'next':
      case 'next.js':
        patterns.push(
          // Pages router
          { filePattern: /(^|\/)pages\/.*\.(tsx?|jsx?)$/, exportPattern: 'default', reason: 'Next.js page' },
          { filePattern: /(^|\/)pages\/.*\.(tsx?|jsx?)$/, exportPattern: 'getServerSideProps', reason: 'Next.js SSR' },
          { filePattern: /(^|\/)pages\/.*\.(tsx?|jsx?)$/, exportPattern: 'getStaticProps', reason: 'Next.js SSG' },
          { filePattern: /(^|\/)pages\/.*\.(tsx?|jsx?)$/, exportPattern: 'getStaticPaths', reason: 'Next.js paths' },
          // App router
          { filePattern: /(^|\/)app\/.*\/page\.(tsx?|jsx?)$/, exportPattern: 'default', reason: 'Next.js app page' },
          { filePattern: /(^|\/)app\/.*\/layout\.(tsx?|jsx?)$/, exportPattern: 'default', reason: 'Next.js layout' },
          { filePattern: /(^|\/)app\/.*\/loading\.(tsx?|jsx?)$/, exportPattern: 'default', reason: 'Next.js loading' },
          { filePattern: /(^|\/)app\/.*\/error\.(tsx?|jsx?)$/, exportPattern: 'default', reason: 'Next.js error' },
          // API routes
          { filePattern: /(^|\/)pages\/api\/.*\.(tsx?|jsx?)$/, exportPattern: 'default', reason: 'Next.js API route' },
          { filePattern: /(^|\/)app\/api\/.*\/route\.(tsx?|jsx?)$/, reason: 'Next.js route handler' },
        )
        break

      case 'hono':
        patterns.push(
          // Main app entry - only root level index
          { filePattern: /^(src\/)?index\.(tsx?|jsx?)$/, reason: 'Hono app entry' },
          { filePattern: /^(src\/)?app\.(tsx?|jsx?)$/, reason: 'Hono app' },
          { filePattern: /^(src\/)?server\.(tsx?|jsx?)$/, reason: 'Hono server' },
          // Route files (common pattern)
          { filePattern: /(^|\/)routes\/.*\.(tsx?|jsx?)$/, reason: 'Hono route file' },
        )
        break

      case 'vitest':
      case 'jest':
        patterns.push(
          // Test files - all exports are entry points
          { filePattern: /\.(test|spec)\.(tsx?|jsx?)$/, reason: `${fw.name} test file` },
          { filePattern: /(^|\/)__tests__\/.*\.(tsx?|jsx?)$/, reason: `${fw.name} test file` },
        )
        break

      case 'drizzle':
        patterns.push(
          // Schema files
          { filePattern: /(^|\/)schema\.(tsx?|jsx?)$/, reason: 'Drizzle schema' },
          { filePattern: /(^|\/)db\/.*\.(tsx?|jsx?)$/, reason: 'Drizzle database' },
        )
        break

      default:
        // Generic patterns for unknown frameworks
        break
    }
  }

  // Always add common patterns
  patterns.push(
    // Main entry files (with or without src/ prefix)
    { filePattern: /^(src\/)?(index|main)\.(tsx?|jsx?)$/, reason: 'Main entry' },
    // Config files
    { filePattern: /\.config\.(tsx?|jsx?|mjs|cjs)$/, reason: 'Config file' },
  )

  return patterns
}

function matchesEntryPattern(
  filePath: string,
  exportName: string,
  pattern: EntryPattern
): boolean {
  // Check file pattern
  if (pattern.filePattern && !pattern.filePattern.test(filePath)) {
    return false
  }

  // If no export pattern, any export matches
  if (!pattern.exportPattern) {
    return true
  }

  // Check export pattern
  if (typeof pattern.exportPattern === 'string') {
    return exportName === pattern.exportPattern
  }

  return pattern.exportPattern.test(exportName)
}
