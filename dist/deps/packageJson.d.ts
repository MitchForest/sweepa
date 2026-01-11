export interface PackageJson {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
}
export declare function findNearestPackageJson(startDir: string): string | undefined;
export declare function readPackageJson(packageJsonPath: string): PackageJson;
export declare function getAllListedDependencies(pkg: PackageJson): Set<string>;
//# sourceMappingURL=packageJson.d.ts.map