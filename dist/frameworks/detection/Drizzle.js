/**
 * Drizzle ORM Detection
 *
 * Detects Drizzle ORM and marks schema exports as used.
 * Drizzle schema exports (tables, relations, types) are used by the ORM
 * even if not directly imported in application code.
 */
export const DrizzleDetector = {
    name: 'Drizzle',
    detect(_projectRoot, packageJson) {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        const hasDrizzle = 'drizzle-orm' in deps;
        if (hasDrizzle) {
            return {
                name: 'Drizzle',
                detected: true,
                version: deps['drizzle-orm'],
            };
        }
        return { name: 'Drizzle', detected: false };
    },
    getEntryPointConfig() {
        return {
            name: 'Drizzle',
            // Schema files are entry points
            entryFilePatterns: [
                'db/schema/**/*.ts',
                'src/db/schema/**/*.ts',
                'drizzle/schema/**/*.ts',
                '**/schema.ts',
            ],
            // All exports from schema files are used by Drizzle
            // (tables, relations, type exports)
            entryExports: '*',
            ignorePatterns: [],
        };
    },
};
//# sourceMappingURL=Drizzle.js.map