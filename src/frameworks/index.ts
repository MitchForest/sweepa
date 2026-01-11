export {
  detectFrameworks,
  isEntryPointFile,
  shouldIgnoreFile,
  getEntryExportsForFile,
} from './FrameworkDetector.js'
export type {
  DetectedFrameworks,
  CombinedEntryPointConfig,
} from './FrameworkDetector.js'
export type {
  FrameworkDetection,
  FrameworkEntryPointConfig,
  FrameworkDetector,
  PackageJson,
} from './types.js'

// Re-export individual detectors for testing
export { TanStackStartDetector } from './detection/TanStackStart.js'
export { HonoDetector } from './detection/Hono.js'
export { VitestDetector } from './detection/Vitest.js'
export { DrizzleDetector } from './detection/Drizzle.js'
