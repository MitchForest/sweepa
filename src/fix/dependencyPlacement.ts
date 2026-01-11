import fs from 'node:fs'

type DepSection = 'dependencies' | 'devDependencies'

export function moveDependenciesBetweenSections(options: {
  packageJsonPath: string
  moves: Array<{ name: string; to: DepSection }>
}): { moved: Array<{ name: string; to: DepSection }> } {
  if (options.moves.length === 0) return { moved: [] }
  if (!fs.existsSync(options.packageJsonPath)) return { moved: [] }

  const raw = fs.readFileSync(options.packageJsonPath, 'utf-8')
  const pkg = JSON.parse(raw) as Record<string, any>

  const deps: Record<string, string> = pkg.dependencies ?? {}
  const devDeps: Record<string, string> = pkg.devDependencies ?? {}

  const moved: Array<{ name: string; to: DepSection }> = []

  for (const move of options.moves) {
    const fromSection: DepSection = move.to === 'dependencies' ? 'devDependencies' : 'dependencies'
    const from = fromSection === 'dependencies' ? deps : devDeps
    const to = move.to === 'dependencies' ? deps : devDeps

    const version = from[move.name]
    if (!version) continue

    delete from[move.name]
    to[move.name] = version
    moved.push({ name: move.name, to: move.to })
  }

  // Clean up empty objects.
  if (Object.keys(deps).length === 0) delete pkg.dependencies
  else pkg.dependencies = deps
  if (Object.keys(devDeps).length === 0) delete pkg.devDependencies
  else pkg.devDependencies = devDeps

  fs.writeFileSync(options.packageJsonPath, JSON.stringify(pkg, null, 2) + '\n')
  return { moved }
}

