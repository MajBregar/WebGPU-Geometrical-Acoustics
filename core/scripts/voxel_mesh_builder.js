import { MATERIAL_IDS } from "./room_generation.js";

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

    createSphereMesh(radius = 1, segments = 32, rings = 16) {
        const vertices = [];
        const indices = [];

        for (let y = 0; y <= rings; y++) {
            const v = y / rings;
            const theta = v * Math.PI;

            for (let x = 0; x <= segments; x++) {
                const u = x / segments;
                const phi = u * 2 * Math.PI;

                const px = Math.sin(theta) * Math.cos(phi);
                const py = Math.cos(theta);
                const pz = Math.sin(theta) * Math.sin(phi);

                const nx = px;
                const ny = py;
                const nz = pz;

                vertices.push(
                    px * radius, py * radius, pz * radius,
                    nx, ny, nz,
                    0xFFFFFFFF
                );
            }
        }

        for (let y = 0; y < rings; y++) {
            for (let x = 0; x < segments; x++) {
                const i0 = y * (segments + 1) + x;
                const i1 = i0 + 1;
                const i2 = i0 + segments + 1;
                const i3 = i2 + 1;

                indices.push(i0, i2, i1);
                indices.push(i1, i2, i3);
            }
        }

        return {
            vertexData: new Float32Array(vertices),
            indexData: new Uint32Array(indices)
        };
    }


    buildFaceArrayFromVoxels(voxels) {
        const [sx, sy, sz] = this.dimensions;

        const voxelCount = sx * sy * sz;

        const voxel_2_face = new Uint32Array(voxelCount * 6);
        voxel_2_face.fill(0xFFFFFFFF);

        const face_2_voxel = [];

        function isSolidVoxel(voxelID) {
            return voxelID !== MATERIAL_IDS.AIR;
        }

        function isAirAt(index) {
            if (index < 0 || index >= voxelCount) return true;
            return voxels[index] === MATERIAL_IDS.AIR;
        }

        const dirs = [
            [ 1, 0, 0, 0], // +X → faces[0]
            [-1, 0, 0, 1], // -X → faces[1]
            [ 0, 1, 0, 2], // +Y → faces[2]
            [ 0,-1, 0, 3], // -Y → faces[3]
            [ 0, 0, 1, 4], // +Z → faces[4]
            [ 0, 0,-1, 5]  // -Z → faces[5]
        ];

        for (let z = 0; z < sz; z++) {
            for (let y = 0; y < sy; y++) {
                for (let x = 0; x < sx; x++) {

                    const v = z * sy * sx + y * sx + x;

                    const voxelID = voxels[v];

                    if (!isSolidVoxel(voxelID)) {
                        continue;
                    }

                    for (let i = 0; i < 6; i++) {
                        const [dx, dy, dz, faceIndex] = dirs[i];

                        const nx = x + dx;
                        const ny = y + dy;
                        const nz = z + dz;

                        const neighbor =
                            (nz < 0 || nz >= sz ||
                            ny < 0 || ny >= sy ||
                            nx < 0 || nx >= sx)
                            ? -1
                            : (nz * sy * sx + ny * sx + nx);

                        const exposed = (neighbor === -1) || isAirAt(neighbor);

                        if (exposed) {
                            const newFaceID = face_2_voxel.length;
                            face_2_voxel.push(v);
                            voxel_2_face[v * 6 + faceIndex] = newFaceID;
                        }
                    }
                }
            }
        }

        return {
            v2f: voxel_2_face,
            f2v: face_2_voxel
        };
    }





    buildStaticMesh(face_to_voxel, voxel_to_face, vertexSize) {
        const [sx, sy, sz] = this.dimensions;

        const stride = vertexSize;
        const vertices = [];
        const indices = [];

        let vertexCount = 0;
        let indexOffset = 0;

        for (let faceIndex = 0; faceIndex < face_to_voxel.length; faceIndex++) {

            const v = face_to_voxel[faceIndex];

            const x = v % sx;
            const y = Math.floor(v / sx) % sy;
            const z = Math.floor(v / (sx * sy));

            let faceLocal = -1;
            const base = v * 6;
            for (let f = 0; f < 6; f++) {
                if (voxel_to_face[base + f] === faceIndex) {
                    faceLocal = f;
                    break;
                }
            }
            if (faceLocal === -1) continue;

            const f = this.faces[faceLocal];
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
            indexCount: indices.length
        };
    }


    buildHiddenFaceMask(face_to_voxel, hide_walls) {
        const [sx, sy, sz] = this.dimensions;
        const faceCount = face_to_voxel.length;

        const mask = new Array(faceCount);
        mask.fill(false);

        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {

            const v = face_to_voxel[faceIndex];

            const x = v %  sx;
            const y = Math.floor(v / sx) % sy;
            const z = Math.floor(v / (sx * sy));

            let hide = false;

            if (hide_walls.top    && y === sy - 1) hide = true;
            if (hide_walls.north  && z === 0)      hide = true;
            if (hide_walls.south  && z === sz - 1) hide = true;
            if (hide_walls.east   && x === sx - 1) hide = true;
            if (hide_walls.west   && x === 0)      hide = true;

            mask[faceIndex] = hide;
        }

        return mask;
    }







}
