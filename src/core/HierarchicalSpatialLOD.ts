/**
 * Hierarchical Spatial LOD System
 * Implements octree-based spatial partitioning for efficient LOD management
 */

export interface SpatialNode {
    bounds: {
        min: [number, number, number];
        max: [number, number, number];
    };
    center: [number, number, number];
    size: number;
    level: number;
    particleCount: number;
    children?: SpatialNode[];
    lodLevel: number;
    importance: number;
}

export interface HierarchicalLODConfig {
    maxDepth: number;
    maxParticlesPerNode: number;
    importanceThreshold: number;
    distanceImportanceWeight: number;
    densityImportanceWeight: number;
    motionImportanceWeight: number;
}

export class HierarchicalSpatialLOD {
    private config: HierarchicalLODConfig;
    private rootNode?: SpatialNode;
    private nodePool: SpatialNode[] = [];

    constructor(config: Partial<HierarchicalLODConfig> = {}) {
        this.config = {
            maxDepth: 6,
            maxParticlesPerNode: 1000,
            importanceThreshold: 0.3,
            distanceImportanceWeight: 0.4,
            densityImportanceWeight: 0.3,
            motionImportanceWeight: 0.3,
            ...config
        };
    }

    /**
     * Build spatial hierarchy from particle data
     */
    buildHierarchy(
        particles: Float32Array, // [x, y, z, x, y, z, ...]
        particleCount: number,
        bounds: { min: [number, number, number], max: [number, number, number] }
    ): void {
        // Create root node
        this.rootNode = this.createNode(bounds, 0);

        // Insert particles into hierarchy
        for (let i = 0; i < particleCount; i++) {
            const position: [number, number, number] = [
                particles[i * 3],
                particles[i * 3 + 1],
                particles[i * 3 + 2]
            ];
            this.insertParticle(this.rootNode, position, i);
        }

        // Calculate importance scores for all nodes
        this.calculateImportance(this.rootNode);
    }

    private createNode(
        bounds: { min: [number, number, number], max: [number, number, number] },
        level: number
    ): SpatialNode {
        const center: [number, number, number] = [
            (bounds.min[0] + bounds.max[0]) / 2,
            (bounds.min[1] + bounds.max[1]) / 2,
            (bounds.min[2] + bounds.max[2]) / 2
        ];

        const size = Math.max(
            bounds.max[0] - bounds.min[0],
            bounds.max[1] - bounds.min[1],
            bounds.max[2] - bounds.min[2]
        );

        return {
            bounds,
            center,
            size,
            level,
            particleCount: 0,
            lodLevel: 0,
            importance: 0
        };
    }

    private insertParticle(node: SpatialNode, position: [number, number, number], particleIndex: number): void {
        node.particleCount++;

        // If we're at max depth or under particle limit, store here
        if (node.level >= this.config.maxDepth || node.particleCount <= this.config.maxParticlesPerNode) {
            return;
        }

        // Otherwise, subdivide if not already done
        if (!node.children) {
            this.subdivideNode(node);
        }

        // Find which child contains this particle
        const childIndex = this.getChildIndex(node, position);
        if (childIndex !== -1 && node.children) {
            this.insertParticle(node.children[childIndex], position, particleIndex);
        }
    }

    private subdivideNode(node: SpatialNode): void {
        const { min, max } = node.bounds;
        const center = node.center;

        node.children = [];
        // Create 8 child nodes (octree)
        const childBounds: { min: [number, number, number], max: [number, number, number] }[] = [
            // Bottom 4
            { min: [min[0], min[1], min[2]], max: [center[0], center[1], center[2]] },
            { min: [center[0], min[1], min[2]], max: [max[0], center[1], center[2]] },
            { min: [min[0], center[1], min[2]], max: [center[0], max[1], center[2]] },
            { min: [center[0], center[1], min[2]], max: [max[0], max[1], center[2]] },
            // Top 4
            { min: [min[0], min[1], center[2]], max: [center[0], center[1], max[2]] },
            { min: [center[0], min[1], center[2]], max: [max[0], center[1], max[2]] },
            { min: [min[0], center[1], center[2]], max: [center[0], max[1], max[2]] },
            { min: [center[0], center[1], center[2]], max: [max[0], max[1], max[2]] },
        ];

        for (const bounds of childBounds) {
            node.children.push(this.createNode(bounds, node.level + 1));
        }
    }

    private getChildIndex(node: SpatialNode, position: [number, number, number]): number {
        if (!node.children) return -1;

        const center = node.center;
        let index = 0;

        if (position[0] >= center[0]) index |= 1;
        if (position[1] >= center[1]) index |= 2;
        if (position[2] >= center[2]) index |= 4;

        return index;
    }

    /**
     * Calculate importance scores for hierarchical LOD
     */
    private calculateImportance(node: SpatialNode, cameraPosition?: [number, number, number]): void {
        if (!node) return;

        // Base importance from particle density
        const densityImportance = Math.min(1.0, node.particleCount / this.config.maxParticlesPerNode);

        // Distance-based importance
        let distanceImportance = 1.0;
        if (cameraPosition) {
            const distance = Math.sqrt(
                Math.pow(node.center[0] - cameraPosition[0], 2) +
                Math.pow(node.center[1] - cameraPosition[1], 2) +
                Math.pow(node.center[2] - cameraPosition[2], 2)
            );
            distanceImportance = Math.max(0.1, 1.0 - (distance / 200.0)); // Normalize by max distance
        }

        // Motion importance (would need velocity data)
        const motionImportance = 0.5; // Placeholder

        // Combine importance factors
        node.importance =
            this.config.distanceImportanceWeight * distanceImportance +
            this.config.densityImportanceWeight * densityImportance +
            this.config.motionImportanceWeight * motionImportance;

        // Determine LOD level based on importance
        if (node.importance > 0.8) {
            node.lodLevel = 0; // Highest detail
        } else if (node.importance > 0.5) {
            node.lodLevel = 1; // Medium detail
        } else if (node.importance > 0.2) {
            node.lodLevel = 2; // Low detail
        } else {
            node.lodLevel = 3; // Minimal detail or cull
        }

        // Recursively calculate for children
        if (node.children) {
            for (const child of node.children) {
                this.calculateImportance(child, cameraPosition);
            }
        }
    }

    /**
     * Get spatial LOD distribution for rendering
     */
    getSpatialLODDistribution(cameraPosition: [number, number, number]): {
        highDetail: SpatialNode[];
        mediumDetail: SpatialNode[];
        lowDetail: SpatialNode[];
        culled: SpatialNode[];
    } {
        if (!this.rootNode) {
            return { highDetail: [], mediumDetail: [], lowDetail: [], culled: [] };
        }

        // Update importance scores based on current camera position
        this.calculateImportance(this.rootNode, cameraPosition);

        const distribution = {
            highDetail: [] as SpatialNode[],
            mediumDetail: [] as SpatialNode[],
            lowDetail: [] as SpatialNode[],
            culled: [] as SpatialNode[]
        };

        this.collectNodesByLOD(this.rootNode, distribution);

        return distribution;
    }

    private collectNodesByLOD(
        node: SpatialNode,
        distribution: {
            highDetail: SpatialNode[];
            mediumDetail: SpatialNode[];
            lowDetail: SpatialNode[];
            culled: SpatialNode[];
        }
    ): void {
        // If this node has children, process them instead
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                this.collectNodesByLOD(child, distribution);
            }
            return;
        }

        // Leaf node - categorize by LOD level
        switch (node.lodLevel) {
            case 0:
                distribution.highDetail.push(node);
                break;
            case 1:
                distribution.mediumDetail.push(node);
                break;
            case 2:
                distribution.lowDetail.push(node);
                break;
            case 3:
            default:
                distribution.culled.push(node);
                break;
        }
    }

    /**
     * Get adaptive particle counts for different spatial regions
     */
    getAdaptiveParticleCounts(totalParticles: number): Map<SpatialNode, number> {
        const distribution = new Map<SpatialNode, number>();
        if (!this.rootNode) return distribution;

        const allNodes: SpatialNode[] = [];
        this.collectAllLeafNodes(this.rootNode, allNodes);

        // Calculate total importance
        const totalImportance = allNodes.reduce((sum, node) => sum + node.importance, 0);

        // Distribute particles based on importance
        let remainingParticles = totalParticles;

        for (const node of allNodes) {
            if (remainingParticles <= 0) break;

            const importanceRatio = node.importance / totalImportance;
            const nodeParticles = Math.min(
                remainingParticles,
                Math.floor(totalParticles * importanceRatio)
            );

            distribution.set(node, nodeParticles);
            remainingParticles -= nodeParticles;
        }

        return distribution;
    }

    private collectAllLeafNodes(node: SpatialNode, nodes: SpatialNode[]): void {
        if (!node.children || node.children.length === 0) {
            nodes.push(node);
            return;
        }

        for (const child of node.children) {
            this.collectAllLeafNodes(child, nodes);
        }
    }

    /**
     * Update hierarchy dynamically as particles move
     */
    updateDynamic(
        particles: Float32Array,
        particleCount: number,
        cameraPosition: [number, number, number]
    ): void {
        if (!this.rootNode) return;

        // Reset particle counts
        this.resetParticleCounts(this.rootNode);

        // Re-insert particles (could be optimized to only update moved particles)
        for (let i = 0; i < particleCount; i++) {
            const position: [number, number, number] = [
                particles[i * 3],
                particles[i * 3 + 1],
                particles[i * 3 + 2]
            ];
            this.insertParticle(this.rootNode, position, i);
        }

        // Recalculate importance
        this.calculateImportance(this.rootNode, cameraPosition);
    }

    private resetParticleCounts(node: SpatialNode): void {
        node.particleCount = 0;
        if (node.children) {
            for (const child of node.children) {
                this.resetParticleCounts(child);
            }
        }
    }

    /**
     * Get debug visualization data
     */
    getDebugData(): {
        nodes: SpatialNode[];
        bounds: { min: [number, number, number], max: [number, number, number] }[];
        colors: [number, number, number, number][]; // RGBA based on importance
    } {
        const nodes: SpatialNode[] = [];
        const bounds: { min: [number, number, number], max: [number, number, number] }[] = [];
        const colors: [number, number, number, number][] = [];

        if (this.rootNode) {
            this.collectDebugNodes(this.rootNode, nodes, bounds, colors);
        }

        return { nodes, bounds, colors };
    }

    private collectDebugNodes(
        node: SpatialNode,
        nodes: SpatialNode[],
        bounds: { min: [number, number, number], max: [number, number, number] }[],
        colors: [number, number, number, number][]
    ): void {
        nodes.push(node);
        bounds.push(node.bounds);

        // Color based on importance and LOD level
        const importance = node.importance;
        const lodColors = [
            [0, 1, 0, 0.8], // High detail - green
            [1, 1, 0, 0.6], // Medium detail - yellow
            [1, 0.5, 0, 0.4], // Low detail - orange
            [1, 0, 0, 0.2]  // Culled - red
        ];

        const baseColor = lodColors[Math.min(3, node.lodLevel)];
        colors.push([
            baseColor[0],
            baseColor[1],
            baseColor[2],
            baseColor[3] * importance
        ]);

        if (node.children) {
            for (const child of node.children) {
                this.collectDebugNodes(child, nodes, bounds, colors);
            }
        }
    }
}
