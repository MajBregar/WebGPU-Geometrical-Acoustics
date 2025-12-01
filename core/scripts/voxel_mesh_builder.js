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

        const voxel_2_face = new Uint32Array(voxelCount * 6);
        voxel_2_face.fill(0xFFFFFFFF);
        const face_2_voxel = [];

        function isSolid(r, g, b, a) {
            if (a === 0) return false;
            return (
                r === RoomBlock.WALL.rgba[0] &&
                g === RoomBlock.WALL.rgba[1] &&
                b === RoomBlock.WALL.rgba[2]
            );
        }

        function isAirAt(index) {
            if (index < 0 || index >= voxelCount) return true; // treat out of bounds as air
            return voxels[index * 4 + 3] === 0;
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

                    const r = voxels[v * 4 + 0];
                    const g = voxels[v * 4 + 1];
                    const b = voxels[v * 4 + 2];
                    const a = voxels[v * 4 + 3];

                    if (!isSolid(r, g, b, a)) continue;

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




    buildStaticMesh(face_to_voxel, voxel_to_face) {
        const [sx, sy, sz] = this.dimensions;

        const stride = 7;
        const vertices = [];
        const indices = [];
        const faceVertexStart = new Array(face_to_voxel.length);

        let vertexCount = 0;
        let indexOffset = 0;

        // Loop over visible faces only
        for (let faceIndex = 0; faceIndex < face_to_voxel.length; faceIndex++) {

            // voxel index that owns this face
            const v = face_to_voxel[faceIndex];

            // recover voxel coordinates
            const x = v % sx;
            const y = Math.floor(v / sx) % sy;
            const z = Math.floor(v / (sx * sy));

            // find which faceLocal corresponds to this faceIndex
            // voxel_to_face[v*6 + faceLocal] == faceIndex
            let faceLocal = -1;
            const base = v * 6;
            for (let f = 0; f < 6; f++) {
                if (voxel_to_face[base + f] === faceIndex) {
                    faceLocal = f;
                    break;
                }
            }
            if (faceLocal === -1) continue; // safety fallback

            // face definition
            const f = this.faces[faceLocal];
            const N = f.dir;

            // record where this face’s vertices start
            faceVertexStart[faceIndex] = vertexCount;

            // 4 quad vertices
            for (let c = 0; c < 4; c++) {
                const [cx, cy, cz] = f.corners[c];

                vertices.push(
                    x + cx, y + cy, z + cz,
                    N[0], N[1], N[2],
                    faceIndex
                );

                vertexCount++;
            }

            // 2 triangles
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

        // Convert to packed U32 buffer
        const vertexArray = new Uint32Array(vertices.length);
        const floatView = new Float32Array(vertexArray.buffer);

        for (let i = 0; i < vertices.length; i++) {
            if ((i % stride) === 6) {
                vertexArray[i] = vertices[i]; // faceIndex = uint32
            } else {
                floatView[i] = vertices[i]; // position + normal = float32
            }
        }

        return {
            vertices: vertexArray,
            indices: new Uint32Array(indices),
            indexCount: indices.length,
            faceVertexStart
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
