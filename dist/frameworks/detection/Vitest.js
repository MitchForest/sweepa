/**
 * Vitest / Jest Framework Detection
 *
 * Detects test frameworks and marks test files as entry points.
 */
export const VitestDetector = {
    name: 'Vitest',
    detect(_projectRoot, packageJson) {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        const hasVitest = 'vitest' in deps;
        const hasJest = 'jest' in deps;
        if (hasVitest) {
            return {
                name: 'Vitest',
                detected: true,
                version: deps['vitest'],
            };
        }
        if (hasJest) {
            return {
                name: 'Jest',
                detected: true,
                version: deps['jest'],
            };
        }
        return { name: 'Vitest', detected: false };
    },
    getEntryPointConfig() {
        return {
            name: 'Vitest',
            // Test files are entry points
            entryFilePatterns: [
                '**/*.test.ts',
                '**/*.test.tsx',
                '**/*.spec.ts',
                '**/*.spec.tsx',
                'tests/**/*.ts',
                'tests/**/*.tsx',
                '__tests__/**/*.ts',
                '__tests__/**/*.tsx',
            ],
            // All exports from test files are used (test functions, fixtures, etc.)
            entryExports: '*',
            ignorePatterns: [],
        };
    },
};
//# sourceMappingURL=Vitest.js.map