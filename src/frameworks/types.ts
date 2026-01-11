/**
 * Framework detection and entry point types
 */

export interface FrameworkDetection {
  /** Framework name */
  name: string

  /** Whether the framework was detected */
  detected: boolean

  /** Version if available */
  version?: string

  /** Config file that confirmed detection */
  configFile?: string
}

export interface FrameworkEntryPointConfig {
  /** Framework name */
  name: string

  /** Glob patterns for files that are entry points */
  entryFilePatterns: string[]

  /** Specific exports from entry files that should be marked as used */
  entryExports: string[] | '*'

  /** Files to completely ignore (auto-generated) */
  ignorePatterns: string[]

  /** Decorators that indicate a symbol is used by the framework */
  retainDecorators?: string[]
}

export interface FrameworkDetector {
  /** Framework name */
  name: string

  /** Detect if this framework is in use */
  detect(projectRoot: string, packageJson: PackageJson): FrameworkDetection

  /** Get entry point configuration */
  getEntryPointConfig(): FrameworkEntryPointConfig
}

export interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}
