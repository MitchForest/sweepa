#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import { CallGraphBuilder } from './analyzer/index.js'
import {
  detectUnusedParams,
  detectAssignOnlyProps,
  detectUnusedMethods,
  detectUnusedImports,
  detectUnusedEnumCases,
  detectRedundantExports,
  detectUnusedFiles,
  detectDependencyIssues,
  detectUnusedTypes,
  detectUnusedModuleExports,
  type Issue,
} from './detectors/index.js'
import {
  shouldIgnoreFile,
  isEntryPointFile,
  getEntryExportsForFile,
} from './frameworks/index.js'
import {
  createAnalysisContext,
  computeReachabilityForContext,
  applyAllIgnores,
} from './analysis/context.js'
import {
  MutatorRunner,
  getCoreMutators,
} from './mutators/index.js'
import {
  createBaseline,
  filterNewIssues,
  validateBaseline,
  type Baseline,
} from './baseline/index.js'
import {
  parseProjectIgnores,
  shouldIgnoreIssue,
} from './config/index.js'
import {
  formatGitHubActions,
  formatGitHubMarkdown,
  formatSARIF,
  formatCSV,
} from './output/index.js'
import path from 'node:path'
import fs from 'node:fs'
import { findNearestPackageJson } from './deps/index.js'
import { removeDependenciesFromPackageJson, moveDependenciesBetweenSections } from './fix/index.js'

const program = new Command()

program
  .name('sweepa')
  .description('Call-graph-based dead code detector for TypeScript')
  .version('0.1.0')

program
  .command('scan')
  .description('Scan a TypeScript project for unused code')
  .option('-p, --project <path>', 'Path to tsconfig.json', 'tsconfig.json')
  .option('--exclude <patterns...>', 'Patterns to exclude from analysis')
  .option('--json', 'Output as JSON')
  .option('--format <format>', 'Output format: console, json, github-actions, github-markdown, sarif, csv', 'console')
  .option('--no-config-strict', 'Do not fail when Sweepa config is invalid')
  .option('--fix', 'Apply safe fixes (currently: removes unused dependencies)')
  // Issue type filters
  .option('--unused-exports', 'Only check unused exports')
  .option('--unused-exported', 'Run unused exported symbol/type checks (module-boundary)')
  .option('--unused-exported-all', 'Run unused-exported checks for all modules (more strict/noisy)')
  .option('--unused-files', 'Only check unused files')
  .option('--dependencies', 'Only check dependencies (unused/unlisted/unresolved)')
  .option('--unused-types', 'Only check unused types')
  .option('--unused-params', 'Only check unused parameters')
  .option('--unused-methods', 'Only check unused methods')
  .option('--unused-imports', 'Only check unused imports')
  .option('--unused-enums', 'Only check unused enum cases')
  .option('--redundant-exports', 'Only check redundant exports')
  .option('--assign-only', 'Only check assign-only properties')
  // Analysis modes
  .option('--reachability', 'Use entry-point reachability analysis (mutator pipeline)')
  // Retention flags
  .option('--retain-public', 'Retain all exports (library mode)')
  .option('--retain-decorated', 'Retain all decorated code')
  .option('--retain-tests', 'Retain test files from analysis')
  // Baseline support
  .option('--baseline <path>', 'Compare against baseline file, report only new issues')
  .option('--write-baseline <path>', 'Write current issues to baseline file')
  // CI flags
  .option('--strict', 'Exit with code 1 if any issues found')
  .option('--quiet', 'Minimal output (only issues)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    const exitCode = await runScan(options)
    process.exit(exitCode)
  })

program
  .command('check')
  .description('Check for unused code and exit with code 1 if found (alias for scan --strict)')
  .option('-p, --project <path>', 'Path to tsconfig.json', 'tsconfig.json')
  .option('--baseline <path>', 'Compare against baseline file')
  .option('--quiet', 'Minimal output')
  .action(async (options) => {
    const exitCode = await runScan({ ...options, strict: true, reachability: true })
    process.exit(exitCode)
  })

program
  .command('stats')
  .description('Show project statistics')
  .option('-p, --project <path>', 'Path to tsconfig.json', 'tsconfig.json')
  .action(async (options) => {
    const tsConfigPath = path.resolve(options.project)

    if (!fs.existsSync(tsConfigPath)) {
      console.error(chalk.red(`Error: tsconfig.json not found at ${tsConfigPath}`))
      process.exit(1)
    }

    const builder = new CallGraphBuilder({ tsConfigPath })
    const graph = builder.build()
    const stats = graph.getStats()

    console.log(chalk.bold('\n📊 Project Statistics:\n'))
    console.log(`  Symbols:    ${stats.nodeCount}`)
    console.log(`  References: ${stats.edgeCount}`)
    console.log(`  Exports:    ${stats.exportedCount}`)
    console.log(`  Entry pts:  ${stats.entryPointCount}`)

    // Breakdown by kind
    const allSymbols = graph.getAllSymbols()
    const byKind = new Map<string, number>()
    for (const s of allSymbols) {
      byKind.set(s.kind, (byKind.get(s.kind) || 0) + 1)
    }

    console.log(chalk.bold('\n  By Kind:'))
    for (const [kind, count] of byKind.entries()) {
      console.log(`    ${kind}: ${count}`)
    }
  })

async function runScan(options: Record<string, any>): Promise<number> {
  const tsConfigPath = path.resolve(options.project || 'tsconfig.json')

  if (!fs.existsSync(tsConfigPath)) {
    console.error(chalk.red(`Error: tsconfig.json not found at ${tsConfigPath}`))
    return 1
  }

  const quiet = options.quiet || options.format === 'github-actions'
  const format = options.json ? 'json' : (options.format || 'console')

  if (!quiet) {
    console.log(chalk.blue(`\n🧹 Sweepa - Scanning project...\n`))
    console.log(chalk.gray(`  Config: ${tsConfigPath}`))
  }

  try {
    const startTime = Date.now()
    const ctx = createAnalysisContext({ tsConfigPath, configStrict: options.configStrict })
    const projectRoot = ctx.projectRoot
    const project = ctx.project
    const frameworks = ctx.frameworks
    const entryPointConfig = ctx.entryPointConfig
    const ignores = ctx.ignoresByFile

    if (frameworks.length > 0 && !quiet) {
      const frameworkNames = frameworks.map(f => f.name).join(', ')
      console.log(chalk.gray(`  Frameworks: ${frameworkNames}`))
    }

    // Determine which checks to run
    const hasSpecificCheck = options.unusedExports || options.unusedExported || options.unusedExportedAll || options.unusedParams ||
                             options.unusedMethods || options.unusedImports ||
                             options.unusedEnums || options.redundantExports ||
                             options.assignOnly || options.unusedFiles ||
                             options.dependencies || options.unusedTypes
    const runAll = !hasSpecificCheck
    const runUnusedExports = runAll || options.unusedExports
    const configUnusedExported = ctx.config.unusedExported ?? 'off'
    const runUnusedExported =
      options.unusedExportedAll ||
      options.unusedExported ||
      (runAll && configUnusedExported !== 'off')
    const runUnusedFiles = runAll || options.unusedFiles
    const runDependencies = runAll || options.dependencies
    const runUnusedTypes = runAll || options.unusedTypes
    const runUnusedParams = runAll || options.unusedParams
    const runUnusedMethods = runAll || options.unusedMethods
    const runUnusedImports = runAll || options.unusedImports
    const runUnusedEnums = runAll || options.unusedEnums
    const runRedundantExports = options.redundantExports // Not in runAll by default (slow)
    const runAssignOnly = runAll || options.assignOnly

    let allIssues: Issue[] = []
    let graphStats = { nodeCount: 0, edgeCount: 0, exportedCount: 0, entryPointCount: 0 }

    // Shared reachability (note: different checks want different ignore behavior)
    const reachabilityForFiles = runUnusedFiles
      ? computeReachabilityForContext(ctx, { ignoreGenerated: true })
      : null

    const reachabilityForCode = (runDependencies || runUnusedTypes || runUnusedExported)
      ? computeReachabilityForContext(ctx, { ignoreGenerated: false })
      : null

    if (runUnusedFiles) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking unused files...'))
      const issues = detectUnusedFiles({ project, tsConfigPath, projectRoot, entryPointConfig })
      allIssues.push(...issues)
    }

    if (runDependencies) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking dependencies...'))
      const reachable = reachabilityForCode?.reachableFiles ?? new Set<string>()

      const issues = detectDependencyIssues({
        project,
        tsConfigPath,
        projectRoot,
        reachableFiles: reachable,
      })
      allIssues.push(...issues)
    }

    if (runUnusedTypes) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking unused types...'))
      const issues = detectUnusedTypes({
        tsConfigPath,
        projectRoot,
        reachableFiles: reachabilityForCode?.reachableFiles ?? undefined,
      })
      allIssues.push(...issues)
    }

    if (runUnusedExported) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking unused exported symbols (module-boundary)...'))
      const reachable = reachabilityForCode?.reachableFiles ?? new Set<string>()
      const mode = options.unusedExportedAll ? 'all' : ((ctx.config.unusedExported ?? 'barrels') === 'all' ? 'all' : 'barrels')
      const ignoreGenerated = ctx.config.unusedExportedIgnoreGenerated ?? true
      const issues = detectUnusedModuleExports({
        project,
        tsConfigPath,
        projectRoot,
        reachableFiles: reachable,
        entryPointConfig,
        mode,
        ignoreGenerated,
      })
      allIssues.push(...issues)
    }

    // Run unused exports detector (uses call graph)
    if (runUnusedExports) {
      const builder = new CallGraphBuilder({
        tsConfigPath,
        exclude: options.exclude,
        verbose: options.verbose && format !== 'json' && !quiet,
      })
      const graph = builder.build()
      graphStats = graph.getStats()

      let unusedExports: typeof graph extends { getExportedSymbols(): (infer T)[] } ? T[] : never[]

      // Use reachability analysis with mutator pipeline
      if (options.reachability) {
        if (!quiet) console.log(chalk.gray('  Running mutator pipeline (reachability analysis)...'))

        const runner = new MutatorRunner({ verbose: options.verbose })
        runner.registerAll(getCoreMutators())

        runner.run({
          graph,
          project,
          projectRoot,
          frameworks,
          config: {
            verbose: options.verbose,
            retainPublic: options.retainPublic,
            retainDecorated: options.retainDecorated,
          },
        })

        // Get unused exports (exported but not marked as used)
        unusedExports = graph.getExportedSymbols().filter(s => !s.isUsed)

        graphStats = graph.getStats()
        const usedCount = graph.getUsedSymbols().length
        const entryPointCount = graph.getEntryPoints().length
        const retainedCount = graph.getRetainedSymbols().length

        if (!quiet && format === 'console') {
          console.log(chalk.gray(`  Entry points: ${entryPointCount}`))
          console.log(chalk.gray(`  Retained: ${retainedCount}`))
          console.log(chalk.gray(`  Used (reachable): ${usedCount}`))
        }
      } else {
        // Legacy mode: just check if any incoming references
        const exportedSymbols = graph.getExportedSymbols()
        unusedExports = exportedSymbols.filter(s => graph.getInDegree(s.id) === 0)
      }

      // Skip if retain-public is set
      if (!options.retainPublic) {
        let frameworkRetained = 0

        for (const symbol of unusedExports) {
          // Skip files that frameworks want to ignore
          if (shouldIgnoreFile(symbol.file, projectRoot, entryPointConfig)) {
            frameworkRetained++
            continue
          }

          // Skip if already retained
          if (symbol.retainedBy) {
            frameworkRetained++
            continue
          }

          // Check for @sweepa-ignore
          const fileIgnores = ignores.get(symbol.file)
          if (fileIgnores && shouldIgnoreIssue(fileIgnores, 'unused-export', symbol.name, symbol.line)) {
            continue
          }

          // Check if this is a framework entry point (legacy check)
          if (!options.reachability && isEntryPointFile(symbol.file, projectRoot, entryPointConfig)) {
            const entryExports = getEntryExportsForFile(symbol.file, projectRoot, entryPointConfig)
            if (entryExports === '*' ||
                (Array.isArray(entryExports) && entryExports.includes(symbol.name))) {
              frameworkRetained++
              continue
            }
          }

          allIssues.push({
            kind: 'unused-export',
            confidence: options.reachability ? 'high' : 'medium',
            name: symbol.name,
            symbolKind: symbol.kind,
            file: symbol.file,
            line: symbol.line,
            column: symbol.column,
            message: `Export '${symbol.name}' is never ${options.reachability ? 'used' : 'imported'}`,
          })
        }

        if (frameworkRetained > 0 && !quiet && format === 'console') {
          console.log(chalk.gray(`  Framework retained: ${frameworkRetained} symbols`))
        }
      }
    }

    // Run other detectors
    if (runUnusedParams) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking unused parameters...'))
      const issues = detectUnusedParams(project)
      allIssues.push(...filterIgnoredIssues(issues, ignores))
    }

    if (runUnusedMethods) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking unused methods...'))
      const issues = detectUnusedMethods(project)
      allIssues.push(...filterIgnoredIssues(issues, ignores))
    }

    if (runUnusedImports) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking unused imports...'))
      const issues = detectUnusedImports(project)
      allIssues.push(...filterIgnoredIssues(issues, ignores))
    }

    if (runUnusedEnums) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking unused enum cases...'))
      const issues = detectUnusedEnumCases(project)
      allIssues.push(...filterIgnoredIssues(issues, ignores))
    }

    if (runRedundantExports) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking redundant exports...'))
      const issues = detectRedundantExports(project, projectRoot)
      allIssues.push(...filterIgnoredIssues(issues, ignores))
    }

    if (runAssignOnly) {
      if (!quiet && format === 'console') console.log(chalk.gray('  Checking assign-only properties...'))
      const issues = detectAssignOnlyProps(project)
      allIssues.push(...filterIgnoredIssues(issues, ignores))
    }

    // Apply config-based ignores (Knip-style ignoreIssues/ignoreDependencies)
    allIssues = applyAllIgnores(ctx, allIssues)

    // Optional: safe fixers
    if (options.fix) {
      const pkgPath = findNearestPackageJson(projectRoot)
      if (pkgPath) {
        const unusedDepNames = new Set(
          allIssues
            .filter((i) => i.kind === 'unused-dependency')
            .map((i) => i.name)
        )

        const moves = allIssues
          .filter((i) => i.kind === 'misplaced-dependency')
          .map((i) => {
            const rec = (i.context?.recommendedSection ?? '') as string
            const to = rec === 'dependencies' ? 'dependencies' : rec === 'devDependencies' ? 'devDependencies' : null
            if (!to) return null
            return { name: i.name, to }
          })
          .filter(Boolean) as Array<{ name: string; to: 'dependencies' | 'devDependencies' }>

        const { removed } = removeDependenciesFromPackageJson({
          packageJsonPath: pkgPath,
          dependencyNames: unusedDepNames,
        })

        const { moved } = moveDependenciesBetweenSections({
          packageJsonPath: pkgPath,
          moves,
        })

        if (removed.length > 0 || moved.length > 0) {
          // Re-run dependency detector to reflect the new package.json state.
          if (runDependencies) {
            const reachable = reachabilityForCode?.reachableFiles ?? new Set<string>()
            const updated = detectDependencyIssues({
              project,
              tsConfigPath,
              projectRoot,
              reachableFiles: reachable,
            })
            const depKinds = new Set(['unused-dependency', 'unlisted-dependency', 'unresolved-import', 'misplaced-dependency'])
            allIssues = [
              ...allIssues.filter((i) => !depKinds.has(i.kind)),
              ...updated,
            ]
            allIssues = applyAllIgnores(ctx, allIssues)
          } else {
            // If dependency checks weren't enabled, at least hide the fixed issues.
            if (removed.length > 0) {
              allIssues = allIssues.filter((i) => !(i.kind === 'unused-dependency' && removed.includes(i.name)))
            }
            if (moved.length > 0) {
              const movedNames = new Set(moved.map((m) => m.name))
              allIssues = allIssues.filter((i) => !(i.kind === 'misplaced-dependency' && movedNames.has(i.name)))
            }
          }

          if (!quiet && format === 'console') {
            if (removed.length > 0) {
              console.log(chalk.green(`  Fixed: removed ${removed.length} unused dependencies from ${path.relative(projectRoot, pkgPath)}`))
            }
            if (moved.length > 0) {
              console.log(chalk.green(`  Fixed: moved ${moved.length} dependencies between sections in ${path.relative(projectRoot, pkgPath)}`))
            }
          }
        }
      }
    }

    // Load and compare against baseline if provided
    let baselineInfo = ''
    if (options.baseline) {
      try {
        const baselineContent = fs.readFileSync(options.baseline, 'utf-8')
        const baseline = JSON.parse(baselineContent)
        if (validateBaseline(baseline)) {
          const originalCount = allIssues.length
          allIssues = filterNewIssues(allIssues, baseline, projectRoot)
          baselineInfo = ` (${originalCount - allIssues.length} in baseline)`
        } else {
          console.error(chalk.yellow('Warning: Invalid baseline file format'))
        }
      } catch (e) {
        console.error(chalk.yellow(`Warning: Could not load baseline: ${e}`))
      }
    }

    // Write baseline if requested
    if (options.writeBaseline) {
      const baseline = createBaseline(allIssues, projectRoot)
      fs.writeFileSync(options.writeBaseline, JSON.stringify(baseline, null, 2))
      if (!quiet) {
        console.log(chalk.green(`\n✓ Baseline written to ${options.writeBaseline}`))
      }
    }

    const elapsed = Date.now() - startTime
    if (!quiet && format === 'console') {
      console.log(chalk.gray(`  Time: ${elapsed}ms\n`))
    }

    // Output results
    outputResults(allIssues, format, projectRoot, graphStats, baselineInfo, quiet)

    // Return exit code
    if (options.strict && allIssues.length > 0) {
      return 1
    }
    return 0
  } catch (error) {
    console.error(chalk.red('Error:'), error)
    return 1
  }
}

function filterIgnoredIssues(
  issues: Issue[],
  ignores: Map<string, ReturnType<typeof import('./config/index.js').parseIgnoreDirectives>>
): Issue[] {
  return issues.filter(issue => {
    const fileIgnores = ignores.get(issue.file)
    if (!fileIgnores) return true
    return !shouldIgnoreIssue(fileIgnores, issue.kind, issue.name, issue.line)
  })
}

function outputResults(
  issues: Issue[],
  format: string,
  projectRoot: string,
  graphStats: { nodeCount: number; edgeCount: number; exportedCount: number; entryPointCount: number },
  baselineInfo: string,
  quiet: boolean
): void {
  // Group issues by kind
  const issuesByKind = new Map<string, Issue[]>()
  for (const issue of issues) {
    const existing = issuesByKind.get(issue.kind) || []
    existing.push(issue)
    issuesByKind.set(issue.kind, existing)
  }

  switch (format) {
    case 'json':
      console.log(JSON.stringify({
        stats: {
          ...graphStats,
          issueCount: issues.length,
          issuesByKind: Object.fromEntries(
            [...issuesByKind.entries()].map(([k, v]) => [k, v.length])
          ),
        },
        issues: issues.map(i => ({
          kind: i.kind,
          confidence: i.confidence,
          name: i.name,
          symbolKind: i.symbolKind,
          file: i.file,
          line: i.line,
          message: i.message,
          parent: i.parent,
        })),
      }, null, 2))
      break

    case 'github-actions':
      console.log(formatGitHubActions(issues, projectRoot))
      break

    case 'github-markdown':
      console.log(formatGitHubMarkdown(issues, projectRoot))
      break

    case 'sarif':
      console.log(JSON.stringify(formatSARIF(issues, projectRoot), null, 2))
      break

    case 'csv':
      console.log(formatCSV(issues, projectRoot))
      break

    case 'console':
    default:
      if (!quiet) {
        console.log(chalk.bold('📊 Analysis Results:\n'))
        console.log(`  Total symbols:    ${graphStats.nodeCount}`)
        console.log(`  Total references: ${graphStats.edgeCount}`)
        console.log(`  Total issues:     ${issues.length}${baselineInfo}`)
      }

      // Print issues by kind
      for (const [kind, kindIssues] of issuesByKind.entries()) {
        const kindLabel = formatKindLabel(kind)
        const color = getKindColor(kind)

        console.log(color(`\n${kindLabel} (${kindIssues.length}):\n`))

        // Group by confidence and show high confidence first
        const highConf = kindIssues.filter(i => i.confidence === 'high')
        const medConf = kindIssues.filter(i => i.confidence === 'medium')
        const lowConf = kindIssues.filter(i => i.confidence === 'low')

        const toShow = [...highConf, ...medConf, ...lowConf].slice(0, 15)

        for (const issue of toShow) {
          const relativePath = path.relative(process.cwd(), issue.file)
          const confBadge = formatConfidence(issue.confidence)
          const parentStr = issue.parent ? chalk.gray(` in ${issue.parent}`) : ''

          console.log(
            `  ${chalk.red('✗')} ${chalk.bold(issue.name)}${parentStr} ` +
            confBadge +
            chalk.gray(` - ${relativePath}:${issue.line}`)
          )
        }

        if (kindIssues.length > 15) {
          console.log(chalk.gray(`  ... and ${kindIssues.length - 15} more`))
        }
      }

      if (issues.length === 0) {
        console.log(chalk.green('\n✓ No issues found!'))
      }
      break
  }
}

function formatKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    'unused-export': '📦 Unused Exports',
    'unused-exported': '📦 Unused Exported Symbols',
    'unused-exported-type': '🏷️ Unused Exported Types',
    'unused-dependency': '📦 Unused Dependencies',
    'misplaced-dependency': '📦 Misplaced Dependencies',
    'unlisted-dependency': '📦 Unlisted Dependencies',
    'unresolved-import': '🚫 Unresolved Imports',
    'unused-method': '🔧 Unused Methods',
    'unused-param': '📝 Unused Parameters',
    'unused-import': '📥 Unused Imports',
    'unused-enum-case': '🔢 Unused Enum Cases',
    'assign-only-property': '✏️ Assign-Only Properties',
    'unused-property': '📋 Unused Properties',
    'unused-variable': '📌 Unused Variables',
    'unused-type': '🏷️ Unused Types',
    'redundant-export': '🔄 Redundant Exports',
  }
  return labels[kind] || kind
}

function getKindColor(kind: string): (s: string) => string {
  const colors: Record<string, (s: string) => string> = {
    'unused-export': chalk.yellow,
    'unused-method': chalk.magenta,
    'unused-param': chalk.cyan,
    'unused-import': chalk.blue,
    'unused-enum-case': chalk.green,
    'assign-only-property': chalk.blue,
    'redundant-export': chalk.red,
  }
  return colors[kind] || chalk.white
}

function formatConfidence(conf: string): string {
  switch (conf) {
    case 'high':
      return chalk.red('[HIGH]')
    case 'medium':
      return chalk.yellow('[MED]')
    case 'low':
      return chalk.gray('[LOW]')
    default:
      return ''
  }
}

program.parse()
