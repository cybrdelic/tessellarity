import { Vector3 } from './foundation';

export class Camera {
    position = { x: 0, y: 0, z: -5 };
    target = { x: 0, y: 0, z: 0 };
    up = { x: 0, y: 1, z: 0 };

    fov = 60;
    near = 0.1;
    far = 100;

    private viewMatrix = new Float32Array(16);
    private projectionMatrix = new Float32Array(16);

    getViewMatrix(): Float32Array {
        this.updateViewMatrix();
        return this.viewMatrix;
    }

    getProjectionMatrix(aspect: number): Float32Array {
        this.updateProjectionMatrix(aspect);
        return this.projectionMatrix;
    }

    private updateViewMatrix() {
        // Basic lookAt matrix implementation
        const zAxis = this.normalize({
            x: this.position.x - this.target.x,
            y: this.position.y - this.target.y,
            z: this.position.z - this.target.z
        });

        const xAxis = this.normalize(this.cross(this.up, zAxis));
        const yAxis = this.cross(zAxis, xAxis);

        this.viewMatrix[0] = xAxis.x;
        this.viewMatrix[1] = yAxis.x;
        this.viewMatrix[2] = zAxis.x;
        this.viewMatrix[3] = 0;

        this.viewMatrix[4] = xAxis.y;
        this.viewMatrix[5] = yAxis.y;
        this.viewMatrix[6] = zAxis.y;
        this.viewMatrix[7] = 0;

        this.viewMatrix[8] = xAxis.z;
        this.viewMatrix[9] = yAxis.z;
        this.viewMatrix[10] = zAxis.z;
        this.viewMatrix[11] = 0;

        this.viewMatrix[12] = -this.dot(xAxis, this.position);
        this.viewMatrix[13] = -this.dot(yAxis, this.position);
        this.viewMatrix[14] = -this.dot(zAxis, this.position);
        this.viewMatrix[15] = 1;
    }

    private updateProjectionMatrix(aspect: number) {
        const fovRad = (this.fov * Math.PI) / 180;
        const f = 1.0 / Math.tan(fovRad / 2);
        const rangeInv = 1 / (this.near - this.far);

        this.projectionMatrix.fill(0);
        this.projectionMatrix[0] = f / aspect;
        this.projectionMatrix[5] = f;
        this.projectionMatrix[10] = (this.near + this.far) * rangeInv;
        this.projectionMatrix[11] = -1;
        this.projectionMatrix[14] = this.near * this.far * rangeInv * 2;
    }

    // Essential camera controls
    orbit(deltaX: number, deltaY: number) {
        const radius = Math.sqrt(
            this.position.x * this.position.x +
            this.position.y * this.position.y +
            this.position.z * this.position.z
        );

        const theta = Math.atan2(this.position.x, this.position.z) + deltaX * 0.01;
        const phi = Math.acos(this.position.y / radius) + deltaY * 0.01;

        this.position.x = radius * Math.sin(phi) * Math.sin(theta);
        this.position.y = radius * Math.cos(phi);
        this.position.z = radius * Math.sin(phi) * Math.cos(theta);
    }

    zoom(delta: number) {
        const direction = this.normalize({
            x: this.target.x - this.position.x,
            y: this.target.y - this.position.y,
            z: this.target.z - this.position.z
        });

        this.position.x += direction.x * delta;
        this.position.y += direction.y * delta;
        this.position.z += direction.z * delta;
    }

    // Helper methods
    private normalize(v: Vector3): Vector3 {
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (len === 0) return { x: 0, y: 0, z: 0 };
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    private cross(a: Vector3, b: Vector3): Vector3 {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    private dot(a: Vector3, b: Vector3): number {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }
}
