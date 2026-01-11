import fs from 'node:fs';
export function removeDependenciesFromPackageJson(options) {
    const removed = [];
    if (options.dependencyNames.size === 0)
        return { removed };
    if (!fs.existsSync(options.packageJsonPath))
        return { removed };
    const raw = fs.readFileSync(options.packageJsonPath, 'utf-8');
    const pkg = JSON.parse(raw);
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        const deps = pkg[section];
        if (!deps || typeof deps !== 'object')
            continue;
        for (const name of options.dependencyNames) {
            if (Object.prototype.hasOwnProperty.call(deps, name)) {
                delete deps[name];
                removed.push(name);
            }
        }
        // If section is now empty, remove it to avoid noise.
        if (Object.keys(deps).length === 0) {
            delete pkg[section];
        }
    }
    // Dedup in case a dep existed in multiple sections (shouldn't, but be safe).
    const uniqueRemoved = Array.from(new Set(removed)).sort();
    fs.writeFileSync(options.packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    return { removed: uniqueRemoved };
}
//# sourceMappingURL=dependencies.js.map