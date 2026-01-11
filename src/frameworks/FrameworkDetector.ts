/**
 * Framework Detector
 *
 * Orchestrates detection of all supported frameworks and aggregates
 * their entry point configurations.
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  FrameworkDetection,
  FrameworkEntryPointConfig,
  FrameworkDetector,
  PackageJson,
} from './types.js'
import { BUILTIN_PLUGINS } from '../plugins/index.js'

export interface DetectedFrameworks {
  /** All detected frameworks */
  frameworks: FrameworkDetection[]

  /** Combined entry point configuration */
  entryPointConfig: CombinedEntryPointConfig
}

export interface CombinedEntryPointConfig {
  /** All entry file patterns from detected frameworks */
  entryFilePatterns: string[]

  /** Files to ignore completely */
  ignorePatterns: string[]

  /** Map of pattern -> specific exports to mark as used */
  patternExports: Map<string, string[] | '*'>
}

/**
 * Detect all frameworks in a project
 */
export function detectFrameworks(projectRoot: string): DetectedFrameworks {
  // Read package.json
  const packageJsonPath = path.join(projectRoot, 'package.json')
  let packageJson: PackageJson = {}

  if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, 'utf-8')
      packageJson = JSON.parse(content)
    } catch {
      // Ignore parse errors
    }
  }

  // Run all detectors (from plugins)
  const detectedFrameworks: FrameworkDetection[] = []
  const entryConfigs: FrameworkEntryPointConfig[] = []

  const detectors: FrameworkDetector[] = []
  for (const plugin of BUILTIN_PLUGINS) {
    detectors.push(...(plugin.frameworks ?? []))
  }

  for (const detector of detectors) {
    const detection = detector.detect(projectRoot, packageJson)
    if (detection.detected) {
      detectedFrameworks.push(detection)
      entryConfigs.push(detector.getEntryPointConfig())
    }
  }

  // Combine entry point configurations
  const entryFilePatterns: string[] = []
  const ignorePatterns: string[] = []
  const patternExports = new Map<string, string[] | '*'>()

  for (const config of entryConfigs) {
    entryFilePatterns.push(...config.entryFilePatterns)
    ignorePatterns.push(...config.ignorePatterns)

    // Map each pattern to its exports
    for (const pattern of config.entryFilePatterns) {
      patternExports.set(pattern, config.entryExports)
    }
  }

  return {
    frameworks: detectedFrameworks,
    entryPointConfig: {
      entryFilePatterns,
      ignorePatterns,
      patternExports,
    },
  }
}

/**
 * Check if a file matches any of the entry point patterns
 */
export function isEntryPointFile(
  filePath: string,
  projectRoot: string,
  config: CombinedEntryPointConfig
): boolean {
  const relativePath = path.relative(projectRoot, filePath)

  for (const pattern of config.entryFilePatterns) {
    if (matchesGlob(relativePath, pattern)) {
      return true
    }
  }

  return false
}

/**
 * Check if a file should be ignored
 */
export function shouldIgnoreFile(
  filePath: string,
  projectRoot: string,
  config: CombinedEntryPointConfig
): boolean {
  const relativePath = path.relative(projectRoot, filePath)
  const fileName = path.basename(filePath)

  for (const pattern of config.ignorePatterns) {
    // Check exact filename match
    if (fileName === pattern) {
      return true
    }
    // Check glob pattern
    if (matchesGlob(relativePath, pattern)) {
      return true
    }
  }

  return false
}

/**
 * Get exports that should be marked as entry points for a file
 */
export function getEntryExportsForFile(
  filePath: string,
  projectRoot: string,
  config: CombinedEntryPointConfig
): string[] | '*' | null {
  const relativePath = path.relative(projectRoot, filePath)

  for (const [pattern, exports] of config.patternExports.entries()) {
    if (matchesGlob(relativePath, pattern)) {
      return exports
    }
  }

  return null
}

/**
 * Simple glob matching (supports ** and *)
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  // Normalize paths
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')

  // Build regex step by step
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
      } else {
        // ** at end matches anything
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

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(normalizedPath)
}
