import ts from 'typescript'
import path from 'node:path'

export interface TsModuleResolver {
  /**
   * Resolve a module specifier from within a containing file.
   *
   * Returns an absolute path to the resolved module file (if it resolves to a file),
   * or undefined if it cannot be resolved.
   */
  resolveModule(specifier: string, containingFileAbsPath: string): string | undefined
}

export function createTsModuleResolver(options: {
  tsConfigPath: string
}): TsModuleResolver {
  const tsConfigPath = path.resolve(options.tsConfigPath)
  const tsConfigDir = path.dirname(tsConfigPath)

  const parsed = readTsConfig(tsConfigPath)
  const compilerOptions = parsed.options

  const host: ts.ModuleResolutionHost = {
    ...ts.sys,
    getCurrentDirectory: () => tsConfigDir,
    realpath: ts.sys.realpath
      ? (p) => ts.sys.realpath!(p)
      : (p) => p,
  }

  const moduleResolutionCache = ts.createModuleResolutionCache(
    tsConfigDir,
    (s) => s,
    compilerOptions
  )

  return {
    resolveModule(specifier: string, containingFileAbsPath: string): string | undefined {
      const containing = path.resolve(containingFileAbsPath)
      const result = ts.resolveModuleName(
        specifier,
        containing,
        compilerOptions,
        host,
        moduleResolutionCache
      )

      const resolved = result.resolvedModule?.resolvedFileName
      if (!resolved) return undefined

      // Typescript can resolve to .d.ts; for file reachability we usually want source files.
      // Keep .d.ts resolution only if it is the only option (caller can decide to filter).
      return path.resolve(resolved)
    },
  }
}

function readTsConfig(tsConfigPath: string): ts.ParsedCommandLine {
  const readResult = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
  if (readResult.error) {
    const msg = ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n')
    throw new Error(`Failed to read tsconfig at ${tsConfigPath}: ${msg}`)
  }

  const config = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    path.dirname(tsConfigPath),
    undefined,
    tsConfigPath
  )

  if (config.errors.length > 0) {
    const msg = config.errors
      .map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n'))
      .join('\n')
    throw new Error(`Failed to parse tsconfig at ${tsConfigPath}:\n${msg}`)
  }

  return config
}

