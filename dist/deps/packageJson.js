import fs from 'node:fs';
import path from 'node:path';
export function findNearestPackageJson(startDir) {
    let current = path.resolve(startDir);
    while (true) {
        const candidate = path.join(current, 'package.json');
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(current);
        if (parent === current)
            return undefined;
        current = parent;
    }
}
export function readPackageJson(packageJsonPath) {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    return JSON.parse(content);
}
export function getAllListedDependencies(pkg) {
    const listed = new Set();
    for (const dep of Object.keys(pkg.dependencies ?? {}))
        listed.add(dep);
    for (const dep of Object.keys(pkg.devDependencies ?? {}))
        listed.add(dep);
    for (const dep of Object.keys(pkg.optionalDependencies ?? {}))
        listed.add(dep);
    for (const dep of Object.keys(pkg.peerDependencies ?? {}))
        listed.add(dep);
    return listed;
}
//# sourceMappingURL=packageJson.js.map