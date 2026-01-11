import fs from 'node:fs';
export function moveDependenciesBetweenSections(options) {
    if (options.moves.length === 0)
        return { moved: [] };
    if (!fs.existsSync(options.packageJsonPath))
        return { moved: [] };
    const raw = fs.readFileSync(options.packageJsonPath, 'utf-8');
    const pkg = JSON.parse(raw);
    const deps = pkg.dependencies ?? {};
    const devDeps = pkg.devDependencies ?? {};
    const moved = [];
    for (const move of options.moves) {
        const fromSection = move.to === 'dependencies' ? 'devDependencies' : 'dependencies';
        const from = fromSection === 'dependencies' ? deps : devDeps;
        const to = move.to === 'dependencies' ? deps : devDeps;
        const version = from[move.name];
        if (!version)
            continue;
        delete from[move.name];
        to[move.name] = version;
        moved.push({ name: move.name, to: move.to });
    }
    // Clean up empty objects.
    if (Object.keys(deps).length === 0)
        delete pkg.dependencies;
    else
        pkg.dependencies = deps;
    if (Object.keys(devDeps).length === 0)
        delete pkg.devDependencies;
    else
        pkg.devDependencies = devDeps;
    fs.writeFileSync(options.packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    return { moved };
}
//# sourceMappingURL=dependencyPlacement.js.map