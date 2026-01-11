/**
 * Mutator Runner - Orchestrates the mutator pipeline
 */

import type { Project } from 'ts-morph'
import type { CallGraph } from '../graph/index.js'
import type { FrameworkDetection } from '../frameworks/index.js'
import type {
  GraphMutator,
  MutatorContext,
  MutatorConfig,
  MutatorPhase,
} from './types.js'

/**
 * Runs mutators in phase order, then priority order within each phase.
 */
export class MutatorRunner {
  private mutators: GraphMutator[] = []
  private verbose: boolean

  constructor(options?: { verbose?: boolean }) {
    this.verbose = options?.verbose ?? false
  }

  /**
   * Register a mutator
   */
  register(mutator: GraphMutator): void {
    this.mutators.push(mutator)
  }

  /**
   * Register multiple mutators
   */
  registerAll(mutators: GraphMutator[]): void {
    for (const mutator of mutators) {
      this.register(mutator)
    }
  }

  /**
   * Run all mutators in phase order
   */
  run(options: {
    graph: CallGraph
    project: Project
    projectRoot: string
    frameworks: FrameworkDetection[]
    config?: MutatorConfig
  }): void {
    const phases: MutatorPhase[] = ['entry-points', 'references', 'retention', 'marking']
    const config = options.config ?? {}

    // Create context with helper methods
    const context = this.createContext(options.graph, options, config)

    for (const phase of phases) {
      const phaseMutators = this.mutators
        .filter(m => m.phase === phase)
        .sort((a, b) => a.priority - b.priority)

      if (phaseMutators.length === 0) continue

      if (this.verbose) {
        console.log(`\n  Phase: ${phase}`)
      }

      for (const mutator of phaseMutators) {
        if (this.verbose) {
          console.log(`    Running ${mutator.name}...`)
        }
        mutator.mutate(context)
      }
    }
  }

  /**
   * Get registered mutators (for debugging)
   */
  getMutators(): GraphMutator[] {
    return [...this.mutators]
  }

  private createContext(
    graph: CallGraph,
    options: {
      project: Project
      projectRoot: string
      frameworks: FrameworkDetection[]
    },
    config: MutatorConfig
  ): MutatorContext {
    return {
      graph,
      project: options.project,
      projectRoot: options.projectRoot,
      frameworks: options.frameworks,
      config,

      markAsEntryPoint: (nodeId: string, reason: string) => {
        graph.markAsEntryPoint(nodeId, reason)
        if (config.verbose) {
          console.log(`      Entry point: ${nodeId} (${reason})`)
        }
      },

      markAsRetained: (nodeId: string, reason: string) => {
        graph.markAsRetained(nodeId, reason)
        if (config.verbose) {
          console.log(`      Retained: ${nodeId} (${reason})`)
        }
      },

      addReference: (fromId: string, toId: string, type) => {
        graph.addReferenceByType(fromId, toId, type)
        if (config.verbose) {
          console.log(`      Edge: ${fromId} -> ${toId} (${type})`)
        }
      },

      log: (message: string) => {
        if (config.verbose) {
          console.log(`      ${message}`)
        }
      },
    }
  }
}
