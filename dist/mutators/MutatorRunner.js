/**
 * Mutator Runner - Orchestrates the mutator pipeline
 */
/**
 * Runs mutators in phase order, then priority order within each phase.
 */
export class MutatorRunner {
    mutators = [];
    verbose;
    constructor(options) {
        this.verbose = options?.verbose ?? false;
    }
    /**
     * Register a mutator
     */
    register(mutator) {
        this.mutators.push(mutator);
    }
    /**
     * Register multiple mutators
     */
    registerAll(mutators) {
        for (const mutator of mutators) {
            this.register(mutator);
        }
    }
    /**
     * Run all mutators in phase order
     */
    run(options) {
        const phases = ['entry-points', 'references', 'retention', 'marking'];
        const config = options.config ?? {};
        // Create context with helper methods
        const context = this.createContext(options.graph, options, config);
        for (const phase of phases) {
            const phaseMutators = this.mutators
                .filter(m => m.phase === phase)
                .sort((a, b) => a.priority - b.priority);
            if (phaseMutators.length === 0)
                continue;
            if (this.verbose) {
                console.log(`\n  Phase: ${phase}`);
            }
            for (const mutator of phaseMutators) {
                if (this.verbose) {
                    console.log(`    Running ${mutator.name}...`);
                }
                mutator.mutate(context);
            }
        }
    }
    /**
     * Get registered mutators (for debugging)
     */
    getMutators() {
        return [...this.mutators];
    }
    createContext(graph, options, config) {
        return {
            graph,
            project: options.project,
            projectRoot: options.projectRoot,
            frameworks: options.frameworks,
            config,
            markAsEntryPoint: (nodeId, reason) => {
                graph.markAsEntryPoint(nodeId, reason);
                if (config.verbose) {
                    console.log(`      Entry point: ${nodeId} (${reason})`);
                }
            },
            markAsRetained: (nodeId, reason) => {
                graph.markAsRetained(nodeId, reason);
                if (config.verbose) {
                    console.log(`      Retained: ${nodeId} (${reason})`);
                }
            },
            addReference: (fromId, toId, type) => {
                graph.addReferenceByType(fromId, toId, type);
                if (config.verbose) {
                    console.log(`      Edge: ${fromId} -> ${toId} (${type})`);
                }
            },
            log: (message) => {
                if (config.verbose) {
                    console.log(`      ${message}`);
                }
            },
        };
    }
}
//# sourceMappingURL=MutatorRunner.js.map