import { TanStackStartDetector } from '../frameworks/detection/TanStackStart.js'
import { HonoDetector } from '../frameworks/detection/Hono.js'
import { VitestDetector } from '../frameworks/detection/Vitest.js'
import { DrizzleDetector } from '../frameworks/detection/Drizzle.js'
import type { SweepaPlugin } from './types.js'

export const BUILTIN_PLUGINS: SweepaPlugin[] = [
  {
    name: 'core-frameworks',
    frameworks: [TanStackStartDetector, HonoDetector, VitestDetector, DrizzleDetector],
  },
]

