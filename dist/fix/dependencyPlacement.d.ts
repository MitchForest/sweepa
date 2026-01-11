type DepSection = 'dependencies' | 'devDependencies';
export declare function moveDependenciesBetweenSections(options: {
    packageJsonPath: string;
    moves: Array<{
        name: string;
        to: DepSection;
    }>;
}): {
    moved: Array<{
        name: string;
        to: DepSection;
    }>;
};
export {};
//# sourceMappingURL=dependencyPlacement.d.ts.map