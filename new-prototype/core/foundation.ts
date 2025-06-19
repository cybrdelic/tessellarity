// Start with absolute basics - expand later
export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export class Transform {
    position = { x: 0, y: 0, z: 0 };
    rotation = { x: 0, y: 0, z: 0 };
    scale = { x: 1, y: 1, z: 1 };

    // Add more sophisticated math later
    setPosition(x: number, y: number, z: number) {
        this.position = { x, y, z };
    }

    setRotation(x: number, y: number, z: number) {
        this.rotation = { x, y, z };
    }

    setScale(x: number, y: number, z: number) {
        this.scale = { x, y, z };
    }
}

export interface BoundingBox {
    min: Vector3;
    max: Vector3;
}

export interface SimulationParameter {
    name: string;
    type: 'float' | 'int' | 'boolean' | 'vector3';
    value: any;
    range?: [number, number];
    description?: string;
}

// Minimal simulation interface - expand incrementally
export interface Simulation {
    id: string;
    name: string;
    description: string;

    init(device: GPUDevice, canvas: HTMLCanvasElement): Promise<void>;
    update(deltaTime: number): void;
    render(encoder: GPUCommandEncoder): void;
    cleanup(): void;

    // Parameter system
    getParameters(): SimulationParameter[];
    setParameter(name: string, value: any): void;

    // Spatial interface
    getBounds(): BoundingBox;
    getTransform(): Transform;
}
