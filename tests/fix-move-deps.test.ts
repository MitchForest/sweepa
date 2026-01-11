import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { moveDependenciesBetweenSections } from '../src/fix/dependencyPlacement.js'

describe('moveDependenciesBetweenSections', () => {
  test('moves dependency from devDependencies to dependencies', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweepa-move-'))
    const pkgPath = path.join(dir, 'package.json')

    fs.writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: 'x',
          dependencies: { b: '1.0.0' },
          devDependencies: { a: '2.0.0' },
        },
        null,
        2
      ) + '\n'
    )

    const { moved } = moveDependenciesBetweenSections({
      packageJsonPath: pkgPath,
      moves: [{ name: 'a', to: 'dependencies' }],
    })

    expect(moved).toEqual([{ name: 'a', to: 'dependencies' }])

    const next = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    expect(next.dependencies).toEqual({ b: '1.0.0', a: '2.0.0' })
    expect(next.devDependencies).toBeUndefined()
  })
})

