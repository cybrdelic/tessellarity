import { Vector3, BoundingBox } from './foundation';

export class BasicVector3 implements Vector3 {
    constructor(public x = 0, public y = 0, public z = 0) { }

    add(other: Vector3): BasicVector3 {
        return new BasicVector3(
            this.x + other.x,
            this.y + other.y,
            this.z + other.z
        );
    }

    subtract(other: Vector3): BasicVector3 {
        return new BasicVector3(
            this.x - other.x,
            this.y - other.y,
            this.z - other.z
        );
    }

    multiply(scalar: number): BasicVector3 {
        return new BasicVector3(
            this.x * scalar,
            this.y * scalar,
            this.z * scalar
        );
    }

    length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize(): BasicVector3 {
        const len = this.length();
        if (len === 0) return new BasicVector3();
        return this.multiply(1 / len);
    }

    static distance(a: Vector3, b: Vector3): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}

export class BasicBoundingBox implements BoundingBox {
    constructor(
        public min: Vector3 = { x: -1, y: -1, z: -1 },
        public max: Vector3 = { x: 1, y: 1, z: 1 }
    ) { }

    contains(point: Vector3): boolean {
        return point.x >= this.min.x && point.x <= this.max.x &&
            point.y >= this.min.y && point.y <= this.max.y &&
            point.z >= this.min.z && point.z <= this.max.z;
    }

    getCenter(): Vector3 {
        return {
            x: (this.min.x + this.max.x) / 2,
            y: (this.min.y + this.max.y) / 2,
            z: (this.min.z + this.max.z) / 2
        };
    }

    getSize(): Vector3 {
        return {
            x: this.max.x - this.min.x,
            y: this.max.y - this.min.y,
            z: this.max.z - this.min.z
        };
    }
}
