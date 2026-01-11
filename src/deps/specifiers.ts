import { builtinModules } from 'node:module'

const BUILTINS = new Set<string>([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
])

export function isNodeBuiltin(specifier: string): boolean {
  return BUILTINS.has(specifier)
}

export function isRelativeOrAbsolute(specifier: string): boolean {
  return (
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    specifier.startsWith('file:')
  )
}

/**
 * Convert an import specifier like:
 * - "react" -> "react"
 * - "@scope/pkg" -> "@scope/pkg"
 * - "@scope/pkg/subpath" -> "@scope/pkg"
 * - "lodash/get" -> "lodash"
 */
export function getPackageNameFromSpecifier(specifier: string): string {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/')
    return name ? `${scope}/${name}` : specifier
  }
  const [name] = specifier.split('/')
  return name ?? specifier
}

