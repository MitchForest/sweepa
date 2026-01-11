import fs from 'node:fs'
import path from 'node:path'

export interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

export function findNearestPackageJson(startDir: string): string | undefined {
  let current = path.resolve(startDir)
  while (true) {
    const candidate = path.join(current, 'package.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

export function readPackageJson(packageJsonPath: string): PackageJson {
  const content = fs.readFileSync(packageJsonPath, 'utf-8')
  return JSON.parse(content) as PackageJson
}

export function getAllListedDependencies(pkg: PackageJson): Set<string> {
  const listed = new Set<string>()
  for (const dep of Object.keys(pkg.dependencies ?? {})) listed.add(dep)
  for (const dep of Object.keys(pkg.devDependencies ?? {})) listed.add(dep)
  for (const dep of Object.keys(pkg.optionalDependencies ?? {})) listed.add(dep)
  for (const dep of Object.keys(pkg.peerDependencies ?? {})) listed.add(dep)
  return listed
}

