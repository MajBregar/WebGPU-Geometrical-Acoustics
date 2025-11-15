
export class VoxelMeshBuilder {

    constructor(size) {
        this.SIZE = size;

        // Cube face definitions
        this.faces = [
            { // +X
                dir: [1, 0, 0],
                corners: [
                    [1, 0, 0],
                    [1, 1, 0],
                    [1, 1, 1],
                    [1, 0, 1]
                ]
            },
            { // -X
                dir: [-1, 0, 0],
                corners: [
                    [0, 0, 0],
                    [0, 0, 1],
                    [0, 1, 1],
                    [0, 1, 0]
                ]
            },
            { // +Y
                dir: [0, 1, 0],
                corners: [
                    [0, 1, 0],
                    [0, 1, 1],
                    [1, 1, 1],
                    [1, 1, 0]
                ]
            },
            { // -Y
                dir: [0, -1, 0],
                corners: [
                    [0, 0, 0],
                    [1, 0, 0],
                    [1, 0, 1],
                    [0, 0, 1]
                ]
            },
            { // +Z
                dir: [0, 0, 1],
                corners: [
                    [0, 0, 1],
                    [1, 0, 1],
                    [1, 1, 1],
                    [0, 1, 1]
                ]
            },
            { // -Z
                dir: [0, 0, -1],
                corners: [
                    [0, 0, 0],
                    [0, 1, 0],
                    [1, 1, 0],
                    [1, 0, 0]
                ]
            },
        ];
    }

    build(voxelData) {
        const SIZE = this.SIZE;

        const vertices = [];
        const indices = [];

        let indexOffset = 0;

        function voxelAt(x, y, z) {
            if (x < 0 || x >= SIZE ||
                y < 0 || y >= SIZE ||
                z < 0 || z >= SIZE) return 0;
            const i = (z * SIZE * SIZE + y * SIZE + x) * 4;
            return voxelData[i + 3] > 0 ? 1 : 0;
        }

        for (let z = 0; z < SIZE; z++)
        for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {

            const i = (z * SIZE * SIZE + y * SIZE + x) * 4;
            const solid = voxelData[i + 3] > 0;
            if (!solid) continue;

            for (const face of this.faces) {
                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                if (voxelAt(nx, ny, nz)) continue;

                const r = voxelData[i + 0] / 255;
                const g = voxelData[i + 1] / 255;
                const b = voxelData[i + 2] / 255;

                for (const c of face.corners) {
                    vertices.push(
                        x + c[0],
                        y + c[1],
                        z + c[2],
                        r, g, b
                    );
                }

                indices.push(
                    indexOffset, indexOffset + 1, indexOffset + 2,
                    indexOffset, indexOffset + 2, indexOffset + 3
                );

                indexOffset += 4;
            }
        }

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
            indexCount: indices.length
        };
    }
}
