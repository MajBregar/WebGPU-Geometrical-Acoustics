export class VoxelMeshBuilder {

    constructor(dimensions) {
        this.dimensions = dimensions;
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
        const dims = this.dimensions;

        const vertices = [];
        const indices = [];

        const vertexMap = new Map();

        function voxelAt(x, y, z) {
            if (x < 0 || x >= dims[0] ||
                y < 0 || y >= dims[1] ||
                z < 0 || z >= dims[2]) return 0;

            const i = (z * dims[1] * dims[0] + y * dims[0] + x) * 4;
            return voxelData[i + 3] > 0 ? 1 : 0;
        }

        function addVertex(px, py, pz, nx, ny, nz, r, g, b) {
            const key = `${px}_${py}_${pz}_${nx}_${ny}_${nz}_${r}_${g}_${b}`;

            if (vertexMap.has(key)) {
                return vertexMap.get(key);
            }

            const index = vertices.length / 9;
            vertices.push(
                px, py, pz,
                nx, ny, nz,
                r, g, b
            );
            vertexMap.set(key, index);
            return index;
        }

        for (let z = 0; z < dims[2]; z++)
        for (let y = 0; y < dims[1]; y++)
        for (let x = 0; x < dims[0]; x++) {

            const i = (z * dims[1] * dims[0] + y * dims[0] + x) * 4;
            if (voxelData[i + 3] === 0) continue;

            const r = voxelData[i + 0] / 255;
            const g = voxelData[i + 1] / 255;
            const b = voxelData[i + 2] / 255;

            for (const face of this.faces) {

                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];

                if (voxelAt(nx, ny, nz)) continue;

                const N = face.dir;

                const v0 = addVertex(
                    x + face.corners[0][0],
                    y + face.corners[0][1],
                    z + face.corners[0][2],
                    N[0], N[1], N[2],
                    r, g, b
                );

                const v1 = addVertex(
                    x + face.corners[1][0],
                    y + face.corners[1][1],
                    z + face.corners[1][2],
                    N[0], N[1], N[2],
                    r, g, b
                );

                const v2 = addVertex(
                    x + face.corners[2][0],
                    y + face.corners[2][1],
                    z + face.corners[2][2],
                    N[0], N[1], N[2],
                    r, g, b
                );

                const v3 = addVertex(
                    x + face.corners[3][0],
                    y + face.corners[3][1],
                    z + face.corners[3][2],
                    N[0], N[1], N[2],
                    r, g, b
                );

                indices.push(v0, v1, v2, v0, v2, v3);
            }
        }

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
            indexCount: indices.length
        };
    }

}
