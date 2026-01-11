/**
 * TanStack Start / TanStack Router Framework Detection
 *
 * Detects TanStack Start (full-stack) or TanStack Router (client-only)
 * and identifies route files as entry points.
 */

import type {
  FrameworkDetector,
  FrameworkDetection,
  FrameworkEntryPointConfig,
  PackageJson,
} from '../types.js'

export const TanStackStartDetector: FrameworkDetector = {
  name: 'TanStack Start',

  detect(projectRoot: string, packageJson: PackageJson): FrameworkDetection {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }

    // Check for TanStack Start (full-stack framework)
    const hasStart = '@tanstack/react-start' in deps || '@tanstack/start' in deps

    // Check for TanStack Router (routing library)
    const hasRouter = '@tanstack/react-router' in deps

    if (hasStart) {
      return {
        name: 'TanStack Start',
        detected: true,
        version: deps['@tanstack/react-start'] || deps['@tanstack/start'],
      }
    }

    if (hasRouter) {
      return {
        name: 'TanStack Router',
        detected: true,
        version: deps['@tanstack/react-router'],
      }
    }

    return { name: 'TanStack Start', detected: false }
  },

  getEntryPointConfig(): FrameworkEntryPointConfig {
    return {
      name: 'TanStack Start',

      // Route files are entry points
      entryFilePatterns: [
        'src/routes/**/*.tsx',
        'src/routes/**/*.ts',
        'app/routes/**/*.tsx',
        'app/routes/**/*.ts',
        'src/router.tsx',
        'src/router.ts',
        'app/router.tsx',
        'app/router.ts',
      ],

      // The Route export is always used by the framework
      entryExports: ['Route', 'default'],

      // Auto-generated files should be ignored entirely
      ignorePatterns: [
        'routeTree.gen.ts',
        'routeTree.gen.tsx',
      ],
    }
  },
}
