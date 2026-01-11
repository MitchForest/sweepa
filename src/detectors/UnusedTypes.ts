import ts from 'typescript'
import path from 'node:path'
import type { Issue } from './types.js'

/**
 * Detect unused exported types (type aliases + interfaces).
 *
 * Uses the TypeScript language service `findReferences` for correctness.
 * This is intentionally closer to how editor tooling works (and more like Knip)
 * than hand-rolled AST scans.
 */
export function detectUnusedTypes(options: {
  tsConfigPath: string
  projectRoot: string
  reachableFiles?: Set<string>
  /** Defaults true: match Knip's `types` check (unused exported types). */
  exportedOnly?: boolean
}): Issue[] {
  const tsConfigPath = path.resolve(options.tsConfigPath)
  const projectRoot = path.resolve(options.projectRoot)
  const reachableFiles = options.reachableFiles
  const exportedOnly = options.exportedOnly ?? true

  const parsed = readTsConfig(tsConfigPath)

  const service = createLanguageService(parsed)
  const program = service.getProgram()
  if (!program) return []

  const checker = program.getTypeChecker()
  const issues: Issue[] = []

  for (const sf of program.getSourceFiles()) {
    const fileName = path.resolve(sf.fileName)
    if (!fileName.startsWith(projectRoot)) continue
    if (fileName.includes(`${path.sep}node_modules${path.sep}`)) continue
    if (fileName.endsWith('.d.ts')) continue
    if (reachableFiles && !reachableFiles.has(fileName)) continue

    const moduleSymbol = checker.getSymbolAtLocation(sf)
    const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []
    const exportedNames = new Set(exports.map((s) => s.getName()))

    for (const stmt of sf.statements) {
      if (!ts.isInterfaceDeclaration(stmt) && !ts.isTypeAliasDeclaration(stmt)) continue
      const nameNode = stmt.name
      if (!nameNode) continue

      const sym = checker.getSymbolAtLocation(nameNode)
      if (!sym) continue

      const name = sym.getName()
      const isExported = exportedNames.has(name) || hasExportModifier(stmt)
      if (exportedOnly && !isExported) continue

      const pos = nameNode.getStart(sf)
      const refs = service.findReferences(fileName, pos) ?? []

      // Count any non-definition reference as usage.
      const usedSomewhere = refs.some((ref) =>
        ref.references.some((r) => r.isDefinition === false)
      )

      if (!usedSomewhere) {
        issues.push({
          kind: 'unused-type',
          confidence: isExported ? 'medium' : 'high',
          name,
          symbolKind: 'type',
          file: fileName,
          line: getLine(sf, pos),
          column: 1,
          message: `Type '${name}' is never referenced`,
        })
      }
    }
  }

  return issues
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = (node as any).modifiers as ts.NodeArray<ts.Modifier> | undefined
  if (!mods) return false
  return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
}

function getLine(sf: ts.SourceFile, pos: number): number {
  const lc = sf.getLineAndCharacterOfPosition(pos)
  return lc.line + 1
}

function createLanguageService(parsed: ts.ParsedCommandLine): ts.LanguageService {
  const files = parsed.fileNames.map((f) => path.resolve(f))
  const versions = new Map<string, string>(files.map((f) => [f, '0']))

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => files,
    getScriptVersion: (fileName) => versions.get(path.resolve(fileName)) ?? '0',
    getScriptSnapshot: (fileName) => {
      const fn = path.resolve(fileName)
      const content = ts.sys.readFile(fn)
      if (content === undefined) return undefined
      return ts.ScriptSnapshot.fromString(content)
    },
    getCurrentDirectory: () => process.cwd(),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  }

  return ts.createLanguageService(host, ts.createDocumentRegistry())
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

