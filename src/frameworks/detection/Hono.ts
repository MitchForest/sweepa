/**
 * Hono Framework Detection
 *
 * Detects Hono web framework and identifies route handlers as entry points.
 */

import type {
  FrameworkDetector,
  FrameworkDetection,
  FrameworkEntryPointConfig,
  PackageJson,
} from '../types.js'

export const HonoDetector: FrameworkDetector = {
  name: 'Hono',

  detect(_projectRoot: string, packageJson: PackageJson): FrameworkDetection {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }

    const hasHono = 'hono' in deps

    if (hasHono) {
      return {
        name: 'Hono',
        detected: true,
        version: deps['hono'],
      }
    }

    return { name: 'Hono', detected: false }
  },

  getEntryPointConfig(): FrameworkEntryPointConfig {
    return {
      name: 'Hono',

      // Entry point files - typically where app is created
      entryFilePatterns: [
        'src/index.ts',
        'src/app.ts',
        'src/server.ts',
        'src/api.ts',
        'src/routes/**/*.ts',
        'src/handlers/**/*.ts',
      ],

      // All exports from these files are potentially used
      // (Hono handlers are passed to app.get(), app.post(), etc.)
      entryExports: '*',

      ignorePatterns: [],
    }
  },
}
