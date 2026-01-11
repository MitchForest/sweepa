import path from 'node:path'
import type { Project, ImportDeclaration } from 'ts-morph'
import { createTsModuleResolver } from '../resolution/index.js'
import type { Issue } from './types.js'
import { isEntryPointFile, getEntryExportsForFile, type CombinedEntryPointConfig } from '../frameworks/index.js'

type ExportKind = 'type' | 'value'

interface ExportInfo {
  typeExports: Set<string>
  valueExports: Set<string>
  // exportedName -> list of origins in other files (re-exports).
  // originName is the declaration name in the origin file.
  typeOrigins: Map<string, Array<{ originFile: string; originName: string }>>
  valueOrigins: Map<string, Array<{ originFile: string; originName: string }>>
  starReexportTargets: Set<string>
  skipReporting: boolean
}

interface UsageInfo {
  usedTypes: Set<string>
  usedValues: Set<string>
  usesAll: boolean
}

export function detectUnusedModuleExports(options: {
  project: Project
  tsConfigPath: string
  projectRoot: string
  reachableFiles: Set<string>
  entryPointConfig: CombinedEntryPointConfig
  mode: 'barrels' | 'all'
  ignoreGenerated: boolean
}): Issue[] {
  const projectRoot = path.resolve(options.projectRoot)
  const tsConfigPath = path.resolve(options.tsConfigPath)
  const resolver = createTsModuleResolver({ tsConfigPath })

  const exportsByFile = new Map<string, ExportInfo>()
  const usageByFile = new Map<string, UsageInfo>()

  const projectFiles = new Set<string>()
  for (const sf of options.project.getSourceFiles()) {
    const abs = path.resolve(sf.getFilePath())
    if (abs.includes(`${path.sep}node_modules${path.sep}`)) continue
    projectFiles.add(abs)
  }

  const ensureExportInfo = (file: string): ExportInfo => {
    const existing = exportsByFile.get(file)
    if (existing) return existing
    const next: ExportInfo = {
      typeExports: new Set(),
      valueExports: new Set(),
      typeOrigins: new Map(),
      valueOrigins: new Map(),
      starReexportTargets: new Set(),
      skipReporting: false,
    }
    exportsByFile.set(file, next)
    return next
  }

  const ensureUsageInfo = (file: string): UsageInfo => {
    const existing = usageByFile.get(file)
    if (existing) return existing
    const next: UsageInfo = { usedTypes: new Set(), usedValues: new Set(), usesAll: false }
    usageByFile.set(file, next)
    return next
  }

  const allSourceFiles = options.project.getSourceFiles()

  // Pass 1: collect exports for reachable files
  for (const sf of allSourceFiles) {
    const fileAbs = path.resolve(sf.getFilePath())
    if (!options.reachableFiles.has(fileAbs)) continue
    if (fileAbs.includes(`${path.sep}node_modules${path.sep}`)) continue
    if (options.ignoreGenerated && looksGenerated(fileAbs)) continue
    if (options.mode === 'barrels' && !isBarrelFile(sf)) continue

    const info = ensureExportInfo(fileAbs)

    // Framework entry points (route files, etc.) can be loaded by convention; don't flag exports in them.
    if (isEntryPointFile(fileAbs, projectRoot, options.entryPointConfig)) {
      const entryExports = getEntryExportsForFile(fileAbs, projectRoot, options.entryPointConfig)
      // For now, treat entry-point modules as conventionally used and skip reporting.
      // (Knip has framework-specific handling here; this aligns with that goal.)
      info.skipReporting = true
    }

    // Track export * sources for propagation
    for (const exp of sf.getExportDeclarations()) {
      const spec = exp.getModuleSpecifierValue()
      if (!spec) continue
      if (exp.isNamespaceExport()) {
        const toAbs = resolver.resolveModule(spec, fileAbs)
        const target = toAbs ? path.resolve(toAbs) : undefined
        if (!target) continue
        if (target.includes(`${path.sep}node_modules${path.sep}`)) continue
        if (!projectFiles.has(target)) continue
        info.starReexportTargets.add(target)
      }
    }

    const exported = sf.getExportedDeclarations()
    for (const [name, decls] of exported.entries()) {
      if (name === 'default') continue
      const kind = classifyDeclarations(decls)
      if (kind === 'type') info.typeExports.add(name)
      else info.valueExports.add(name)

      // Capture re-export origins by inspecting declaration source files.
      for (const d of decls) {
        const declSf = d?.getSourceFile?.()
        const declFile = declSf?.getFilePath?.()
        if (!declFile) continue
        const originFile = path.resolve(declFile)
        if (originFile === fileAbs) continue
        if (!projectFiles.has(originFile)) continue

        const originName = getDeclarationName(d) ?? name
        if (kind === 'type') {
          const list = info.typeOrigins.get(name) ?? []
          list.push({ originFile, originName })
          info.typeOrigins.set(name, list)
        } else {
          const list = info.valueOrigins.get(name) ?? []
          list.push({ originFile, originName })
          info.valueOrigins.set(name, list)
        }
      }
    }
  }

  // Pass 2: collect import/re-export usage edges (module boundary)
  for (const sf of allSourceFiles) {
    const fromAbs = path.resolve(sf.getFilePath())
    if (!options.reachableFiles.has(fromAbs)) continue
    if (fromAbs.includes(`${path.sep}node_modules${path.sep}`)) continue
    if (options.ignoreGenerated && looksGenerated(fromAbs)) continue

    for (const imp of sf.getImportDeclarations()) {
      handleImportLike({
        kind: 'import',
        decl: imp,
        fromFileAbs: fromAbs,
        resolve: (spec) => resolver.resolveModule(spec, fromAbs),
        projectFiles,
        onUsage: (toAbs, usage) => usageByFile.set(toAbs, usage),
        ensureUsage: ensureUsageInfo,
      })
    }
  }

  // Propagate usage through re-exports until stable.
  let changed = true
  while (changed) {
    changed = false

    for (const [fileAbs, expInfo] of exportsByFile.entries()) {
      const usage = ensureUsageInfo(fileAbs)

      // If the module is imported as default/namespace somewhere, treat all exports as used.
      if (usage.usesAll) {
        for (const n of expInfo.valueExports) {
          if (!usage.usedValues.has(n)) {
            usage.usedValues.add(n)
            changed = true
          }
        }
        for (const n of expInfo.typeExports) {
          if (!usage.usedTypes.has(n)) {
            usage.usedTypes.add(n)
            changed = true
          }
        }
      }

      // Named re-export origins
      for (const used of Array.from(usage.usedValues)) {
        const origins = expInfo.valueOrigins.get(used) ?? []
        for (const o of origins) {
          const targetUsage = ensureUsageInfo(o.originFile)
          if (!targetUsage.usedValues.has(o.originName)) {
            targetUsage.usedValues.add(o.originName)
            changed = true
          }
        }

        // Star re-export propagation: if this module exports * from X and `used` isn't local,
        // try to mark it used in X if X exports it.
        if (!expInfo.valueOrigins.has(used) && !hasLocalExport(expInfo, used, 'value')) {
          for (const starTarget of expInfo.starReexportTargets) {
            const targetExp = exportsByFile.get(starTarget)
            if (!targetExp) continue
            if (!targetExp.valueExports.has(used)) continue
            const targetUsage = ensureUsageInfo(starTarget)
            if (!targetUsage.usedValues.has(used)) {
              targetUsage.usedValues.add(used)
              changed = true
            }
          }
        }
      }

      for (const used of Array.from(usage.usedTypes)) {
        const origins = expInfo.typeOrigins.get(used) ?? []
        for (const o of origins) {
          const targetUsage = ensureUsageInfo(o.originFile)
          if (!targetUsage.usedTypes.has(o.originName)) {
            targetUsage.usedTypes.add(o.originName)
            changed = true
          }
        }

        if (!expInfo.typeOrigins.has(used) && !hasLocalExport(expInfo, used, 'type')) {
          for (const starTarget of expInfo.starReexportTargets) {
            const targetExp = exportsByFile.get(starTarget)
            if (!targetExp) continue
            if (!targetExp.typeExports.has(used)) continue
            const targetUsage = ensureUsageInfo(starTarget)
            if (!targetUsage.usedTypes.has(used)) {
              targetUsage.usedTypes.add(used)
              changed = true
            }
          }
        }
      }
    }
  }

  const issues: Issue[] = []

  for (const [fileAbs, expInfo] of exportsByFile.entries()) {
    if (expInfo.skipReporting) continue

    const usage = usageByFile.get(fileAbs) ?? { usedTypes: new Set(), usedValues: new Set(), usesAll: false }

    const usedTypes = usage.usedTypes
    const usedValues = usage.usedValues

    for (const name of expInfo.valueExports) {
      if (usedValues.has(name)) continue
      issues.push({
        kind: 'unused-exported',
        confidence: 'high',
        name,
        symbolKind: 'module',
        file: fileAbs,
        line: 1,
        column: 1,
        message: `Export '${name}' is never imported by any reachable module`,
      })
    }

    for (const name of expInfo.typeExports) {
      if (usedTypes.has(name)) continue
      issues.push({
        kind: 'unused-exported-type',
        confidence: 'high',
        name,
        symbolKind: 'type',
        file: fileAbs,
        line: 1,
        column: 1,
        message: `Exported type '${name}' is never imported by any reachable module`,
      })
    }
  }

  return issues
}

function classifyDeclarations(decls: any[]): ExportKind {
  // If *all* declarations are type-ish, treat as type export.
  let seenValue = false
  for (const d of decls) {
    const kindName = d?.getKindName?.() as string | undefined
    if (!kindName) continue
    if (kindName.includes('Interface') || kindName.includes('TypeAlias')) continue
    if (kindName.includes('TypeParameter')) continue
    // Enums are runtime values too.
    seenValue = true
  }
  return seenValue ? 'value' : 'type'
}

function getDeclarationName(d: any): string | undefined {
  try {
    if (typeof d?.getName === 'function') {
      const n = d.getName()
      if (n) return n
    }
    if (typeof d?.getSymbol === 'function') {
      const s = d.getSymbol()
      const n = s?.getName?.()
      if (n) return n
    }
  } catch {
    // ignore
  }
  return undefined
}

function hasLocalExport(info: ExportInfo, name: string, kind: ExportKind): boolean {
  if (kind === 'type') return info.typeExports.has(name)
  return info.valueExports.has(name)
}

function looksGenerated(fileAbs: string): boolean {
  const normalized = fileAbs.replace(/\\/g, '/')
  if (normalized.includes('/generated/')) return true
  if (/\.(gen|generated)\.(ts|tsx|js|jsx)$/.test(normalized)) return true
  return false
}

function isBarrelFile(sf: any): boolean {
  const base = path.basename(sf.getFilePath())
  if (base === 'index.ts' || base === 'index.tsx' || base === 'index.js' || base === 'index.jsx') return true

  // Any re-export style declaration counts as "barrel-ish"
  for (const exp of sf.getExportDeclarations?.() ?? []) {
    if (exp.getModuleSpecifierValue?.()) return true
  }

  return false
}

function handleImportLike(options: {
  kind: 'import'
  decl: ImportDeclaration
  fromFileAbs: string
  resolve: (specifier: string) => string | undefined
  projectFiles: Set<string>
  ensureUsage: (file: string) => UsageInfo
  onUsage: (file: string, usage: UsageInfo) => void
}) {
  const spec = options.decl.getModuleSpecifierValue()
  if (!spec) return

  const resolved = options.resolve(spec)
  if (!resolved) return

  const target = path.resolve(resolved)
  if (!options.projectFiles.has(target)) return
  if (target.includes(`${path.sep}node_modules${path.sep}`)) return

  const usage = options.ensureUsage(target)

  // import * as ns from './x'  -> treat as uses all exports (conservative)
  const ns = options.decl.getNamespaceImport()
  if (ns) {
    usage.usesAll = true
    options.onUsage(target, usage)
    return
  }

  const defaultImport = options.decl.getDefaultImport()
  if (defaultImport) {
    // We don't know what it's called in the exporting module; treat as usesAll to avoid false positives.
    usage.usesAll = true
    options.onUsage(target, usage)
    return
  }

  for (const ni of options.decl.getNamedImports()) {
    const name = ni.getName()
    const isTypeOnly = ni.isTypeOnly?.() ?? options.decl.isTypeOnly()
    if (isTypeOnly) usage.usedTypes.add(name)
    else usage.usedValues.add(name)
  }

  options.onUsage(target, usage)
}

