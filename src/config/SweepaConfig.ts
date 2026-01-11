import path from 'node:path'
import { cosmiconfigSync } from 'cosmiconfig'
import type { Issue, IssueKind } from '../detectors/types.js'

export interface SweepaConfig {
  /**
   * Ignore issues by file pattern, similar to Knip's ignoreIssues.
   *
   * Keys are glob-ish patterns (supports `*` and `**`).
   * Values are issue kinds to ignore for matching files.
   */
  ignoreIssues?: Record<string, IssueKind[]>

  /**
   * Ignore dependency names for dependency-related issue kinds.
   * Applies to both unused-dependency and unlisted-dependency.
   */
  ignoreDependencies?: string[]

  /**
   * Ignore unresolved import specifiers (e.g. bundler virtual modules).
   * Entries are glob-ish patterns (supports `*` and `**`).
   */
  ignoreUnresolved?: string[]

  /**
   * Module-boundary exported symbol/type checks (Knip-style).
   *
   * - off: do not run these checks
   * - barrels: run only for barrel/re-export modules (safer defaults)
   * - all: run for all reachable modules (strict)
   */
  unusedExported?: 'off' | 'barrels' | 'all'

  /**
   * Ignore generated files for unusedExported checks by default.
   */
  unusedExportedIgnoreGenerated?: boolean

  /**
   * Workspace-specific overrides, keyed by workspace directory relative to the configRoot.
   * Example: { "apps/web": { ignoreIssues: {...} } }
   */
  workspaces?: Record<string, SweepaConfig>
}

export interface LoadedSweepaConfig {
  config: SweepaConfig
  /** Directory containing the loaded config file (or projectRoot if none). */
  configRoot: string
  /** File path of the loaded config, if any. */
  configPath?: string
  /** Validation errors (empty if valid). */
  errors: string[]
}

export function resolveSweepaConfigForProject(options: {
  loaded: LoadedSweepaConfig
  projectRoot: string
}): { configRoot: string; config: SweepaConfig } {
  const configRoot = path.resolve(options.loaded.configRoot)
  const projectRoot = path.resolve(options.projectRoot)
  const relativeProjectRoot = path.relative(configRoot, projectRoot).replace(/\\/g, '/')

  const base = normalizeConfig(options.loaded.config)
  const workspaces = options.loaded.config.workspaces ?? {}

  const matchingKeys = Object.keys(workspaces)
    .map((k) => k.replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter((k) => {
      if (!k) return false
      return relativeProjectRoot === k || relativeProjectRoot.startsWith(k + '/')
    })
    .sort((a, b) => a.length - b.length)

  if (matchingKeys.length === 0) return { configRoot, config: base }

  let merged = base
  for (const key of matchingKeys) {
    merged = mergeConfigs(merged, normalizeConfig(workspaces[key] ?? {}))
  }

  return { configRoot, config: merged }
}

export function loadSweepaConfig(projectRoot: string): LoadedSweepaConfig {
  const root = path.resolve(projectRoot)
  const explorer = cosmiconfigSync('sweepa', {
    searchPlaces: [
      'package.json',
      '.sweepa.json',
      '.sweepa.yaml',
      '.sweepa.yml',
      'sweepa.config.json',
      'sweepa.config.yaml',
      'sweepa.config.yml',
    ],
  })

  try {
    const result = explorer.search(root) ?? manualSearchUpwards(explorer, root)
    const cfg = (result?.config ?? {}) as SweepaConfig
    const normalized = normalizeConfig(cfg)
    const errors = validateConfig(normalized)

    return {
      config: normalized,
      configRoot: result?.filepath ? path.dirname(result.filepath) : root,
      configPath: result?.filepath,
      errors,
    }
  } catch {
    return { config: {}, configRoot: root, errors: [] }
  }
}

export function applyConfigIgnores(
  issues: Issue[],
  config: SweepaConfig,
  configRoot: string
): Issue[] {
  const ignoreDependencies = new Set(config.ignoreDependencies ?? [])
  const ignoreIssues = config.ignoreIssues ?? {}
  const ignoreUnresolved = config.ignoreUnresolved ?? []

  return issues.filter((issue) => {
    if ((issue.kind === 'unused-dependency' || issue.kind === 'unlisted-dependency') &&
        ignoreDependencies.has(issue.name)) {
      return false
    }

    if (issue.kind === 'unresolved-import') {
      for (const pattern of ignoreUnresolved) {
        if (matchesGlob(issue.name, pattern)) return false
      }
    }

    const relativePath = path.relative(configRoot, issue.file).replace(/\\/g, '/')
    for (const [pattern, kinds] of Object.entries(ignoreIssues)) {
      if (kinds.includes(issue.kind) && matchesGlob(relativePath, pattern)) {
        return false
      }
    }

    return true
  })
}

function normalizeConfig(cfg: SweepaConfig): SweepaConfig {
  return {
    ignoreIssues: cfg.ignoreIssues ?? {},
    ignoreDependencies: cfg.ignoreDependencies ?? [],
    ignoreUnresolved: cfg.ignoreUnresolved ?? [],
    unusedExported: cfg.unusedExported ?? 'off',
    unusedExportedIgnoreGenerated: cfg.unusedExportedIgnoreGenerated ?? true,
    workspaces: cfg.workspaces ?? {},
  }
}

function mergeConfigs(base: SweepaConfig, override: SweepaConfig): SweepaConfig {
  return {
    ignoreDependencies: Array.from(
      new Set([...(base.ignoreDependencies ?? []), ...(override.ignoreDependencies ?? [])])
    ),
    ignoreUnresolved: Array.from(
      new Set([...(base.ignoreUnresolved ?? []), ...(override.ignoreUnresolved ?? [])])
    ),
    ignoreIssues: { ...(base.ignoreIssues ?? {}), ...(override.ignoreIssues ?? {}) },
    unusedExported: (override.unusedExported ?? base.unusedExported) ?? 'off',
    unusedExportedIgnoreGenerated: (override.unusedExportedIgnoreGenerated ?? base.unusedExportedIgnoreGenerated) ?? true,
    workspaces: base.workspaces ?? {},
  }
}

function manualSearchUpwards(
  explorer: ReturnType<typeof cosmiconfigSync>,
  startDir: string
): ReturnType<ReturnType<typeof cosmiconfigSync>['search']> {
  let current = path.resolve(startDir)

  while (true) {
    for (const candidate of [
      path.join(current, '.sweepa.json'),
      path.join(current, '.sweepa.yaml'),
      path.join(current, '.sweepa.yml'),
      path.join(current, 'sweepa.config.json'),
      path.join(current, 'sweepa.config.yaml'),
      path.join(current, 'sweepa.config.yml'),
      path.join(current, 'package.json'),
    ]) {
      try {
        const loaded = explorer.load(candidate)
        if (loaded && loaded.config) {
          if (path.basename(candidate) === 'package.json') {
            if (loaded.config && typeof loaded.config === 'object' && 'sweepa' in (loaded.config as any)) {
              return { config: (loaded.config as any).sweepa, filepath: candidate, isEmpty: false }
            }
            continue
          }
          return loaded
        }
      } catch {
        // ignore
      }
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

/**
 * Simple glob matching (supports `**` and `*`), anchored to full path.
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')

  let regexPattern = ''
  let i = 0

  while (i < normalizedPattern.length) {
    const char = normalizedPattern[i]
    const nextChar = normalizedPattern[i + 1]

    if (char === '*' && nextChar === '*') {
      if (normalizedPattern[i + 2] === '/') {
        regexPattern += '(?:[^/]+/)*'
        i += 3
      } else {
        regexPattern += '.*'
        i += 2
      }
    } else if (char === '*') {
      regexPattern += '[^/]*'
      i++
    } else if ('.+^${}()|[]\\'.includes(char)) {
      regexPattern += '\\' + char
      i++
    } else {
      regexPattern += char
      i++
    }
  }

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(normalizedPath)
}

// Exported for unit testing; not considered part of the stable public API yet.
export const __private__matchesGlob = matchesGlob

function validateConfig(cfg: SweepaConfig): string[] {
  const errors: string[] = []

  if (cfg.ignoreDependencies && !Array.isArray(cfg.ignoreDependencies)) {
    errors.push('ignoreDependencies must be an array of strings')
  } else if (cfg.ignoreDependencies) {
    for (const [i, v] of cfg.ignoreDependencies.entries()) {
      if (typeof v !== 'string') errors.push(`ignoreDependencies[${i}] must be a string`)
    }
  }

  if (cfg.ignoreIssues && typeof cfg.ignoreIssues !== 'object') {
    errors.push('ignoreIssues must be an object of pattern -> issueKinds[]')
  } else if (cfg.ignoreIssues) {
    for (const [pattern, kinds] of Object.entries(cfg.ignoreIssues)) {
      if (!Array.isArray(kinds)) {
        errors.push(`ignoreIssues['${pattern}'] must be an array of issue kinds`)
        continue
      }
      for (const [i, k] of kinds.entries()) {
        if (typeof k !== 'string') errors.push(`ignoreIssues['${pattern}'][${i}] must be a string issue kind`)
      }
    }
  }

  if (cfg.ignoreUnresolved && !Array.isArray(cfg.ignoreUnresolved)) {
    errors.push('ignoreUnresolved must be an array of strings')
  } else if (cfg.ignoreUnresolved) {
    for (const [i, v] of cfg.ignoreUnresolved.entries()) {
      if (typeof v !== 'string') errors.push(`ignoreUnresolved[${i}] must be a string`)
    }
  }

  if (cfg.unusedExported && !['off', 'barrels', 'all'].includes(cfg.unusedExported)) {
    errors.push('unusedExported must be one of: off, barrels, all')
  }

  if (cfg.unusedExportedIgnoreGenerated !== undefined && typeof cfg.unusedExportedIgnoreGenerated !== 'boolean') {
    errors.push('unusedExportedIgnoreGenerated must be a boolean')
  }

  if (cfg.workspaces && typeof cfg.workspaces !== 'object') {
    errors.push('workspaces must be an object of workspacePath -> SweepaConfig')
  } else if (cfg.workspaces) {
    for (const [wk, wc] of Object.entries(cfg.workspaces)) {
      if (!wk) errors.push('workspaces keys must be non-empty strings')
      errors.push(...validateConfig(wc ?? {}).map((e) => `workspaces['${wk}'].${e}`))
    }
  }

  return errors
}
