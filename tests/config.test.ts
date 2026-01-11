import { describe, expect, test } from 'vitest'
import { applyConfigIgnores, resolveSweepaConfigForProject, type LoadedSweepaConfig } from '../src/config/SweepaConfig.js'

describe('SweepaConfig', () => {
  test('applyConfigIgnores: ignoreIssues by glob', () => {
    const cfg = {
      ignoreIssues: {
        'src/**/*.generated.ts': ['unused-type'],
      },
      ignoreDependencies: [],
    }

    const issues = [
      {
        kind: 'unused-type' as const,
        confidence: 'medium' as const,
        name: 'webhooks',
        symbolKind: 'type' as const,
        file: '/repo/src/api/openapi/generated/foo.generated.ts',
        line: 1,
        column: 1,
        message: 'x',
      },
      {
        kind: 'unused-type' as const,
        confidence: 'medium' as const,
        name: 'operations',
        symbolKind: 'type' as const,
        file: '/repo/src/api/openapi/real.ts',
        line: 1,
        column: 1,
        message: 'x',
      },
    ]

    const filtered = applyConfigIgnores(issues as any, cfg as any, '/repo')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('operations')
  })

  test('resolveSweepaConfigForProject: picks most specific workspace override', () => {
    const loaded: LoadedSweepaConfig = {
      configRoot: '/repo',
      config: {
        ignoreDependencies: ['eslint'],
        ignoreIssues: {},
        workspaces: {
          'apps/web': {
            ignoreDependencies: ['vitest'],
          },
          'apps/web/admin': {
            ignoreDependencies: ['jsdom'],
          },
        },
      },
    }

    const resolved = resolveSweepaConfigForProject({
      loaded,
      projectRoot: '/repo/apps/web/admin',
    })

    expect(resolved.config.ignoreDependencies).toEqual(expect.arrayContaining(['eslint', 'vitest', 'jsdom']))
  })

  test('applyConfigIgnores: ignoreUnresolved filters unresolved-import by specifier glob', () => {
    const cfg = {
      ignoreUnresolved: ['virtual:*', 'uno.css'],
    }

    const issues = [
      {
        kind: 'unresolved-import' as const,
        confidence: 'high' as const,
        name: 'virtual:foo',
        symbolKind: 'module' as const,
        file: '/repo/src/a.ts',
        line: 1,
        column: 1,
        message: 'x',
      },
      {
        kind: 'unresolved-import' as const,
        confidence: 'high' as const,
        name: 'uno.css',
        symbolKind: 'module' as const,
        file: '/repo/src/b.ts',
        line: 1,
        column: 1,
        message: 'x',
      },
      {
        kind: 'unresolved-import' as const,
        confidence: 'high' as const,
        name: 'react',
        symbolKind: 'module' as const,
        file: '/repo/src/c.ts',
        line: 1,
        column: 1,
        message: 'x',
      },
    ]

    const filtered = applyConfigIgnores(issues as any, cfg as any, '/repo')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('react')
  })
})

