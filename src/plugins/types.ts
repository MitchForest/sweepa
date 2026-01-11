import type { FrameworkDetector } from '../frameworks/types.js'

export interface SweepaPlugin {
  name: string
  frameworks?: FrameworkDetector[]
}

