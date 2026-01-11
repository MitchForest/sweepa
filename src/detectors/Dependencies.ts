import type { Project, SourceFile } from 'ts-morph'
import { SyntaxKind } from 'ts-morph'
import path from 'node:path'
import fs from 'node:fs'
import {
  findNearestPackageJson,
  readPackageJson,
  getAllListedDependencies,
  isNodeBuiltin,
  isRelativeOrAbsolute,
  getPackageNameFromSpecifier,
} from '../deps/index.js'
import { createTsModuleResolver } from '../resolution/index.js'
import type { Issue } from './types.js'

type UsageKind = 'prod' | 'dev'

interface PackageUsage {
  usedInProd: boolean
  usedInDev: boolean
  byFiles: Set<string>
  unresolvedSpecifiers: Set<string>
}

export function detectDependencyIssues(options: {
  project: Project
  tsConfigPath: string
  projectRoot: string
  reachableFiles: Set<string>
}): Issue[] {
  const projectRoot = path.resolve(options.projectRoot)
  const tsConfigPath = path.resolve(options.tsConfigPath)
  const resolver = createTsModuleResolver({ tsConfigPath })

  const packageJsonPath = findNearestPackageJson(projectRoot)
  if (!packageJsonPath) return []

  const pkg = readPackageJson(packageJsonPath)
  const listed = getAllListedDependencies(pkg)

  const usages = new Map<string, PackageUsage>()
  const unresolved: Array<{ file: string; specifier: string }> = []
  const unresolvedSeen = new Set<string>()
  const cssFilesToScan = new Set<string>()
  let usesNodeBuiltins = false

  for (const sf of options.project.getSourceFiles()) {
    const filePath = path.resolve(sf.getFilePath())
    if (!options.reachableFiles.has(filePath) && !isDevDependencyEntryFile(projectRoot, filePath)) continue

    const usageKind = classifyFileUsageKind(projectRoot, filePath)
    const specifiers = getAllSpecifiers(sf)

    for (const specifier of specifiers) {
      if (!specifier) continue

      if (isNodeBuiltin(specifier)) {
        usesNodeBuiltins = true
        continue
      }

      // Relative/absolute imports are internal module edges, not deps.
      if (isRelativeOrAbsolute(specifier)) {
        // Capture CSS imports so we can scan @import deps.
        if (looksLikeCssImport(specifier)) {
          const cssPath = resolveRelativeAsset(filePath, specifier)
          if (cssPath) cssFilesToScan.add(cssPath)
          continue
        }

        // Only check unresolved for relative imports. Absolute paths ("/x") are usually bundler/runtime concerns.
        if (specifier.startsWith('/')) continue

        const resolvedInternal = resolver.resolveModule(specifier, filePath)
        if (!resolvedInternal) {
          const key = `${filePath}::${specifier}`
          if (!unresolvedSeen.has(key)) {
            unresolvedSeen.add(key)
            unresolved.push({ file: filePath, specifier })
          }
        }
        continue
      }

      const pkgName = getPackageNameFromSpecifier(specifier)
      if (!pkgName) continue

      const resolved = resolver.resolveModule(specifier, filePath)

      // If TS can't resolve, record unresolved (unless it's a known builtin/relative).
      if (!resolved) {
        const key = `${filePath}::${specifier}`
        if (!unresolvedSeen.has(key)) {
          unresolvedSeen.add(key)
          unresolved.push({ file: filePath, specifier })
        }
        continue
      }

      // Skip if it resolves to a local workspace file (not node_modules).
      // (Heuristic: resolved path is not under node_modules.)
      if (!resolved.includes(`${path.sep}node_modules${path.sep}`)) {
        continue
      }

      const existing = usages.get(pkgName) ?? {
        usedInProd: false,
        usedInDev: false,
        byFiles: new Set<string>(),
        unresolvedSpecifiers: new Set<string>(),
      }
      existing.byFiles.add(filePath)
      if (usageKind === 'prod') existing.usedInProd = true
      if (usageKind === 'dev') existing.usedInDev = true
      usages.set(pkgName, existing)
    }
  }

  // Scan reachable CSS files for @import "pkg" usages.
  for (const cssFile of cssFilesToScan) {
    const imports = extractCssPackageImports(cssFile)
    for (const pkgName of imports) {
      const existing = usages.get(pkgName) ?? {
        usedInProd: false,
        usedInDev: false,
        byFiles: new Set<string>(),
        unresolvedSpecifiers: new Set<string>(),
      }
      existing.byFiles.add(cssFile)
      // CSS imports are runtime/prod usage unless file is clearly a dev-only config asset.
      existing.usedInProd = true
      usages.set(pkgName, existing)
    }
  }

  // Treat package.json scripts as dev usage (tools often only appear in scripts, not imports).
  applyScriptUsage({
    pkg,
    listed,
    usages,
    labelFile: packageJsonPath,
  })

  // Treat common tool config entrypoints as dev usage even if they aren't part of the tsconfig project.
  // (Example: apps/api/eslint.config.js is not in tsconfig includes, but it drives lint deps.)
  applyConfigFileUsage({
    projectRoot,
    packageJsonPath,
    listed,
    usages,
  })

  // Heuristics for common indirect deps (to reduce noise, Knip-style):
  // - react-dom: often required by React frameworks even if not imported directly by app code.
    // - react-dom
  if (listed.has('react') && listed.has('react-dom')) {
    const existing = usages.get('react-dom') ?? {
      usedInProd: true,
      usedInDev: false,
      byFiles: new Set<string>(),
      unresolvedSpecifiers: new Set<string>(),
    }
    existing.usedInProd = true
    usages.set('react-dom', existing)
  }

  // - tailwindcss
  if ((listed.has('@tailwindcss/vite') || listed.has('tailwindcss')) && listed.has('tailwindcss')) {
    const existing = usages.get('tailwindcss') ?? {
      usedInProd: true,
      usedInDev: false,
      byFiles: new Set<string>(),
      unresolvedSpecifiers: new Set<string>(),
    }
    existing.usedInProd = true
    usages.set('tailwindcss', existing)
  }

  // - @types/node
  if (usesNodeBuiltins && listed.has('@types/node')) {
    const existing = usages.get('@types/node') ?? {
      usedInProd: false,
      usedInDev: true,
      byFiles: new Set<string>(['<builtins>']),
      unresolvedSpecifiers: new Set<string>(),
    }
    existing.usedInDev = true
    usages.set('@types/node', existing)
  }

  // - React types
  if (listed.has('react') && listed.has('@types/react')) {
    const existing = usages.get('@types/react') ?? {
      usedInProd: false,
      usedInDev: true,
      byFiles: new Set<string>(['<react-types>']),
      unresolvedSpecifiers: new Set<string>(),
    }
    existing.usedInDev = true
    usages.set('@types/react', existing)
  }
  if (listed.has('react-dom') && listed.has('@types/react-dom')) {
    const existing = usages.get('@types/react-dom') ?? {
      usedInProd: false,
      usedInDev: true,
      byFiles: new Set<string>(['<react-dom-types>']),
      unresolvedSpecifiers: new Set<string>(),
    }
    existing.usedInDev = true
    usages.set('@types/react-dom', existing)
  }

  // - zod (required by @hono/zod-openapi via peerDependency)
  if (listed.has('@hono/zod-openapi') && listed.has('zod')) {
    markUsage(usages, 'zod', 'prod', packageJsonPath, '<peer:@hono/zod-openapi>')
  }

  // - typescript (TypeScript projects should consider TS a dev tool even if not explicitly invoked in scripts)
  if (listed.has('typescript')) {
    markUsage(usages, 'typescript', 'dev', packageJsonPath, '<tsconfig>')
  }

  // - @types/node (commonly required by tooling configs even if app code doesn't import node builtins directly)
  if (listed.has('@types/node') && (listed.has('vite') || listed.has('vitest') || listed.has('eslint') || listed.has('drizzle-kit'))) {
    markUsage(usages, '@types/node', 'dev', packageJsonPath, '<tooling>')
  }

  // - jsdom (often used by vitest environment config)
  if (listed.has('vitest') && listed.has('jsdom')) {
    markUsage(usages, 'jsdom', 'dev', packageJsonPath, '<vitest-env>')
  }

  // - jiti (common TS/ESM loader dependency for eslint configs)
  if (listed.has('eslint') && listed.has('jiti')) {
    markUsage(usages, 'jiti', 'dev', packageJsonPath, '<eslint-loader>')
  }

  // - @types/bun (if scripts use bun)
  if (listed.has('@types/bun') && scriptsMentionBun(pkg)) {
    markUsage(usages, '@types/bun', 'dev', packageJsonPath, '<bun-runtime>')
  }

  const issues: Issue[] = []

  // Unresolved imports
  for (const u of unresolved) {
    issues.push({
      kind: 'unresolved-import',
      confidence: 'high',
      name: u.specifier,
      symbolKind: 'module',
      file: u.file,
      line: 1,
      column: 1,
      message: `Import '${u.specifier}' could not be resolved`,
    })
  }

  // Unlisted dependencies
  for (const [dep, usage] of usages.entries()) {
    if (listed.has(dep)) continue

    issues.push({
      kind: 'unlisted-dependency',
      confidence: 'high',
      name: dep,
      symbolKind: 'module',
      file: packageJsonPath,
      line: 1,
      column: 1,
      message: `Dependency '${dep}' is used but not listed in package.json`,
      context: {
        usedInProd: usage.usedInProd,
        usedInDev: usage.usedInDev,
        usedBy: Array.from(usage.byFiles).slice(0, 20),
      },
    })
  }

  // Unused dependencies (listed but never used)
  for (const dep of listed) {
    const usage = usages.get(dep)
    if (usage) continue

    issues.push({
      kind: 'unused-dependency',
      confidence: 'medium',
      name: dep,
      symbolKind: 'module',
      file: packageJsonPath,
      line: 1,
      column: 1,
      message: `Dependency '${dep}' is listed in package.json but never used`,
    })
  }

  // Misplaced dependencies (prod deps in devDependencies, or dev-only deps in dependencies)
  for (const [dep, usage] of usages.entries()) {
    if (!listed.has(dep)) continue

    const inDeps = Boolean((pkg.dependencies ?? {})[dep])
    const inDevDeps = Boolean((pkg.devDependencies ?? {})[dep])

    // If it's in neither (e.g. peer/optional only), skip placement checks.
    if (!inDeps && !inDevDeps) continue

    const shouldBeProd = usage.usedInProd
    const shouldBeDevOnly = usage.usedInDev && !usage.usedInProd

    if (shouldBeProd && inDevDeps && !inDeps) {
      issues.push({
        kind: 'misplaced-dependency',
        confidence: 'high',
        name: dep,
        symbolKind: 'module',
        file: packageJsonPath,
        line: 1,
        column: 1,
        message: `Dependency '${dep}' is used in production code but listed in devDependencies`,
        context: {
          currentSection: 'devDependencies',
          recommendedSection: 'dependencies',
          usedInProd: usage.usedInProd,
          usedInDev: usage.usedInDev,
          usedBy: Array.from(usage.byFiles).slice(0, 20),
        },
      })
    }

    if (shouldBeDevOnly && inDeps && !inDevDeps) {
      issues.push({
        kind: 'misplaced-dependency',
        confidence: 'high',
        name: dep,
        symbolKind: 'module',
        file: packageJsonPath,
        line: 1,
        column: 1,
        message: `Dependency '${dep}' is only used in dev tooling but listed in dependencies`,
        context: {
          currentSection: 'dependencies',
          recommendedSection: 'devDependencies',
          usedInProd: usage.usedInProd,
          usedInDev: usage.usedInDev,
          usedBy: Array.from(usage.byFiles).slice(0, 20),
        },
      })
    }
  }

  return issues
}

function classifyFileUsageKind(projectRoot: string, filePathAbs: string): UsageKind {
  const rel = path.relative(projectRoot, filePathAbs).replace(/\\/g, '/')
  const base = path.basename(filePathAbs)

  if (base.endsWith('.config.ts') || base.endsWith('.config.js') || base.endsWith('.config.mjs') || base.endsWith('.config.cjs')) {
    return 'dev'
  }

  if (/(^|\/)scripts\//.test(rel)) return 'dev'
  if (/(^|\/)bin\//.test(rel)) return 'dev'

  if (/(^|\/)__tests__\//.test(rel)) return 'dev'
  if (/(^|\/)tests?\//.test(rel)) return 'dev'
  if (/\.(test|spec)\.[jt]sx?$/.test(rel)) return 'dev'

  return 'prod'
}

function isDevDependencyEntryFile(projectRoot: string, filePathAbs: string): boolean {
  const rel = path.relative(projectRoot, filePathAbs).replace(/\\/g, '/')
  const base = path.basename(filePathAbs)

  // Common config entrypoints that influence dependency usage.
  if (base === 'eslint.config.js' || base === 'eslint.config.mjs' || base === 'eslint.config.cjs') return true
  if (base.startsWith('vite.config.')) return true
  if (base.startsWith('vitest.config.')) return true
  if (base.startsWith('drizzle.config.')) return true

  if (base.endsWith('.config.ts') || base.endsWith('.config.js') || base.endsWith('.config.mjs') || base.endsWith('.config.cjs')) {
    return true
  }

  if (/(^|\/)scripts\//.test(rel)) return true
  if (/(^|\/)bin\//.test(rel)) return true

  return false
}

function getAllSpecifiers(sourceFile: SourceFile): string[] {
  const out: string[] = []

  for (const imp of sourceFile.getImportDeclarations()) {
    out.push(imp.getModuleSpecifierValue())
  }
  for (const exp of sourceFile.getExportDeclarations()) {
    const spec = exp.getModuleSpecifierValue()
    if (spec) out.push(spec)
  }

  // dynamic import("x")
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression()
    const exprKind = expr.getKind()

    const isDynamicImport = exprKind === SyntaxKind.ImportKeyword || expr.getText() === 'import'
    const isRequire = expr.getText() === 'require'

    if (!isDynamicImport && !isRequire) continue

    const args = call.getArguments()
    if (args.length < 1) continue
    const first = args[0]
    if (!first) continue
    if (!first.isKind(SyntaxKind.StringLiteral)) continue

    out.push(first.getLiteralText())
  }

  return out
}

function looksLikeCssImport(specifier: string): boolean {
  return specifier.includes('.css')
}

function resolveRelativeAsset(containingFileAbs: string, specifier: string): string | undefined {
  try {
    const baseDir = path.dirname(containingFileAbs)
    const cleaned = specifier.split('?')[0] ?? specifier
    if (!cleaned) return undefined
    const full = path.resolve(baseDir, cleaned)
    if (fs.existsSync(full) && full.endsWith('.css')) return full
    return undefined
  } catch {
    return undefined
  }
}

function extractCssPackageImports(cssFileAbs: string): Set<string> {
  const out = new Set<string>()
  try {
    const content = fs.readFileSync(cssFileAbs, 'utf-8')
    const regex = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g
    for (const match of content.matchAll(regex)) {
      const raw = match[1]
      if (!raw) continue
      if (raw.startsWith('.')) continue
      if (raw.startsWith('/')) continue
      if (raw.startsWith('http://') || raw.startsWith('https://')) continue
      out.add(getPackageNameFromSpecifier(raw))
    }
  } catch {
    // ignore
  }
  return out
}

function applyScriptUsage(options: {
  pkg: ReturnType<typeof readPackageJson>
  listed: Set<string>
  usages: Map<string, PackageUsage>
  labelFile: string
}) {
  const scripts = options.pkg.scripts ?? {}
  for (const [scriptName, scriptCmd] of Object.entries(scripts)) {
    if (!scriptCmd) continue

    const tools = extractToolsFromScript(scriptCmd)
    for (const tool of tools) {
      const pkgName = mapScriptToolToPackage(tool, options.listed)
      if (!pkgName) continue
      markUsage(options.usages, pkgName, 'dev', options.labelFile, `<script:${scriptName}>`)
    }
  }
}

function markUsage(
  usages: Map<string, PackageUsage>,
  pkgName: string,
  usageKind: UsageKind,
  filePath: string,
  label?: string
) {
  const existing = usages.get(pkgName) ?? {
    usedInProd: false,
    usedInDev: false,
    byFiles: new Set<string>(),
    unresolvedSpecifiers: new Set<string>(),
  }
  existing.byFiles.add(label ? `${filePath}#${label}` : filePath)
  if (usageKind === 'prod') existing.usedInProd = true
  if (usageKind === 'dev') existing.usedInDev = true
  usages.set(pkgName, existing)
}

function extractToolsFromScript(script: string): Set<string> {
  const out = new Set<string>()

  // Split on common command separators.
  const parts = script
    .split(/&&|\|\||;|\n/g)
    .map((p) => p.trim())
    .filter(Boolean)

  for (const part of parts) {
    const tokens = part.split(/\s+/).map((t) => t.trim()).filter(Boolean)
    if (tokens.length === 0) continue

    // Drop env assignments like NODE_ENV=production
    let i = 0
    while (i < tokens.length) {
      const t = tokens[i]
      if (!t) break
      if (t.startsWith('-')) break
      if (t.includes('=') && !t.startsWith('./') && !t.includes('/') && !t.startsWith('@')) {
        i++
        continue
      }
      break
    }
    if (i >= tokens.length) continue

    // Unwrap common runners
    let tool = tokens[i]
    let j = i + 1

    const unwrap = (name: string) => tool === name
    if (unwrap('bunx') || unwrap('npx') || unwrap('pnpm') || unwrap('yarn') || unwrap('npm')) {
      // Skip options after runner
      while (j < tokens.length && tokens[j]?.startsWith('-')) j++
      tool = tokens[j] ?? tool
    } else if (unwrap('bun')) {
      // bun run <script>  -> not a package dep
      // bun test          -> not a package dep
      continue
    } else if (unwrap('node')) {
      // node something.js -> not a package dep
      continue
    } else if (unwrap('cross-env') || unwrap('env')) {
      while (j < tokens.length && tokens[j]?.includes('=')) j++
      while (j < tokens.length && tokens[j]?.startsWith('-')) j++
      tool = tokens[j] ?? tool
    }

    // Normalize ./node_modules/.bin/foo
    tool = tool.replace(/^\.\/node_modules\/\.bin\//, '')
    if (!tool) continue

    out.add(tool)
  }

  return out
}

function mapScriptToolToPackage(tool: string, listed: Set<string>): string | undefined {
  // If the tool is itself a listed dependency, accept it.
  if (listed.has(tool)) return tool

  const mapping: Record<string, string> = {
    tsc: 'typescript',
    prettier: 'prettier',
    eslint: 'eslint',
    vitest: 'vitest',
    vite: 'vite',
    'drizzle-kit': 'drizzle-kit',
    'openapi-typescript': 'openapi-typescript',
    knip: 'knip',
    tsx: 'tsx',
    jest: 'jest',
  }

  const mapped = mapping[tool]
  if (mapped && listed.has(mapped)) return mapped
  return undefined
}

function scriptsMentionBun(pkg: ReturnType<typeof readPackageJson>): boolean {
  const scripts = pkg.scripts ?? {}
  for (const cmd of Object.values(scripts)) {
    if (!cmd) continue
    if (/\bbun\b/.test(cmd)) return true
  }
  return false
}

function applyConfigFileUsage(options: {
  projectRoot: string
  packageJsonPath: string
  listed: Set<string>
  usages: Map<string, PackageUsage>
}) {
  const candidates = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mjs',
    'vite.config.cjs',
    'vitest.config.ts',
    'vitest.config.js',
    'vitest.config.mjs',
    'vitest.config.cjs',
    'drizzle.config.ts',
    'drizzle.config.js',
    'drizzle.config.mjs',
    'drizzle.config.cjs',
  ]

  for (const name of candidates) {
    const abs = path.join(options.projectRoot, name)
    if (!fs.existsSync(abs)) continue

    const imports = extractJsImportsFromTextFile(abs)
    for (const spec of imports) {
      if (!spec) continue
      if (isRelativeOrAbsolute(spec)) continue
      const pkgName = getPackageNameFromSpecifier(spec)
      if (!pkgName) continue

      // Only count as usage if it's actually listed in this package.json; otherwise
      // it will be reported as unlisted-dependency (which is desirable).
      if (!options.listed.has(pkgName)) continue
      markUsage(options.usages, pkgName, 'dev', options.packageJsonPath, `<config:${name}>`)
    }
  }
}

function extractJsImportsFromTextFile(fileAbs: string): Set<string> {
  const out = new Set<string>()
  try {
    const content = fs.readFileSync(fileAbs, 'utf-8')

    // import x from "pkg" / export ... from "pkg"
    for (const match of content.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      if (match[1]) out.add(match[1])
    }
    // import "pkg"
    for (const match of content.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) {
      if (match[1]) out.add(match[1])
    }
    // require("pkg")
    for (const match of content.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (match[1]) out.add(match[1])
    }
    // import("pkg")
    for (const match of content.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (match[1]) out.add(match[1])
    }
  } catch {
    // ignore
  }
  return out
}
