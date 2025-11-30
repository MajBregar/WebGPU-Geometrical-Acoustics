import { RoomBlock } from "./room_generation.js";

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

    buildFaceArrayFromVoxels(voxels) {
        const [sx, sy, sz] = this.dimensions;

        const voxelCount = sx * sy * sz;
        const voxel_to_face = new Uint32Array(voxelCount);
        voxel_to_face.fill(0xFFFFFFFF);

        function isSolid(r, g, b, a) {
            if (a === 0) return false;
            return (
                r === RoomBlock.WALL.rgba[0] &&
                g === RoomBlock.WALL.rgba[1] &&
                b === RoomBlock.WALL.rgba[2]
            );
        }

        function isAirAt(index) {
            if (index < 0 || index >= voxelCount) return true;  // outside → treat as air
            return voxels[index * 4 + 3] === 0;
        }

        let face_count = 0;

        // --------------------------------------------------------
        // 1. Assign solidID only to voxels that are NOT interior
        // --------------------------------------------------------
        for (let z = 0; z < sz; z++) {
            for (let y = 0; y < sy; y++) {
                for (let x = 0; x < sx; x++) {

                    const v = z * sy * sx + y * sx + x;
                    const r = voxels[v * 4 + 0];
                    const g = voxels[v * 4 + 1];
                    const b = voxels[v * 4 + 2];
                    const a = voxels[v * 4 + 3];

                    if (!isSolid(r, g, b, a)) continue;

                    const airNegX = isAirAt(v - 1);
                    const airPosX = isAirAt(v + 1);
                    const airNegY = isAirAt(v - sx);
                    const airPosY = isAirAt(v + sx);
                    const airNegZ = isAirAt(v - sx * sy);
                    const airPosZ = isAirAt(v + sx * sy);

                    // If ALL neighbors are solid → interior voxel → skip
                    if (
                        !airNegX && !airPosX &&
                        !airNegY && !airPosY &&
                        !airNegZ && !airPosZ
                    ) {
                        continue;
                    }

                    // Boundary voxel → assign a visible solidID
                    voxel_to_face[v] = face_count++;
                }
            }
        }

        // --------------------------------------------------------
        // 2. Build solidID → voxel coord table
        // --------------------------------------------------------
        const face_to_voxels = new Array(face_count);
        for (let v = 0; v < voxelCount; v++) {
            const id = voxel_to_face[v];
            if (id !== 0xFFFFFFFF) {
                const x = v % sx;
                const y = Math.floor(v / sx) % sy;
                const z = Math.floor(v / (sx * sy));
                face_to_voxels[id] = [x, y, z];
            }
        }

        return {
            v2f: voxel_to_face,
            f2v: face_to_voxels
        };
    }



    buildStaticMesh(solidToVoxel) {
        const [sx, sy, sz] = this.dimensions;

        const solidGrid = new Uint8Array(sx * sy * sz);

        for (let id = 0; id < solidToVoxel.length; id++) {
            const v = solidToVoxel[id];
            if (!v) continue;
            const idx = v[2] * sy * sx + v[1] * sx + v[0];
            solidGrid[idx] = 1;
        }

        const isSolid = (x, y, z) => {
            if (x < 0 || y < 0 || z < 0 ||
                x >= sx || y >= sy || z >= sz)
                return false;
            return solidGrid[z * sy * sx + y * sx + x] === 1;
        };

        const stride = 7; // 7 u32s per vertex: 6 floats + 1 uint
        const vertices = [];
        const indices = [];
        const faceVertexStart = new Array(solidToVoxel.length * 6);

        let vertexCount = 0;
        let indexOffset = 0;

        for (let solidID = 0; solidID < solidToVoxel.length; solidID++) {
            const voxel = solidToVoxel[solidID];
            if (!voxel) continue;

            const [x, y, z] = voxel;

            for (let faceLocal = 0; faceLocal < 6; faceLocal++) {
                const f = this.faces[faceLocal];

                const nx = x + f.dir[0];
                const ny = y + f.dir[1];
                const nz = z + f.dir[2];

                if (isSolid(nx, ny, nz)) continue;

                const faceIndex = solidID * 6 + faceLocal;
                faceVertexStart[faceIndex] = vertexCount;

                const N = f.dir;

                for (let c = 0; c < 4; c++) {
                    const [cx, cy, cz] = f.corners[c];

                    vertices.push(
                        x + cx, y + cy, z + cz,
                        N[0], N[1], N[2],
                        faceIndex
                    );

                    vertexCount++;
                }

                indices.push(
                    indexOffset + 0,
                    indexOffset + 1,
                    indexOffset + 2,
                    indexOffset + 0,
                    indexOffset + 2,
                    indexOffset + 3
                );

                indexOffset += 4;
            }
        }

        const vertexArray = new Uint32Array(vertices.length);
        const floatView = new Float32Array(vertexArray.buffer);

        for (let i = 0; i < vertices.length; i++) {
            if ((i % stride) === 6) {
                vertexArray[i] = vertices[i];
            } else {
                floatView[i] = vertices[i];
            }
        }

        return {
            vertices: vertexArray,
            indices: new Uint32Array(indices),
            indexCount: indices.length,
            faceVertexStart
        };
    }







}
