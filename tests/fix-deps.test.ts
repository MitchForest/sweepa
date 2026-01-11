import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { removeDependenciesFromPackageJson } from '../src/fix/dependencies.js'

describe('removeDependenciesFromPackageJson', () => {
  test('removes deps from dependencies/devDependencies and deletes empty sections', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweepa-fix-'))
    const pkgPath = path.join(dir, 'package.json')

    fs.writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: 'x',
          dependencies: { a: '1.0.0', b: '1.0.0' },
          devDependencies: { c: '1.0.0' },
        },
        null,
        2
      ) + '\n'
    )

    const { removed } = removeDependenciesFromPackageJson({
      packageJsonPath: pkgPath,
      dependencyNames: new Set(['a', 'c', 'missing']),
    })

    expect(removed).toEqual(['a', 'c'])
    const next = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    expect(next.dependencies).toEqual({ b: '1.0.0' })
    expect(next.devDependencies).toBeUndefined()
  })
})

