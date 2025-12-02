struct FaceStats {
    bounceCount    : atomic<u32>,
    absorbedEnergy : atomic<u32>
};

struct RayUniforms {
    roomSize    : vec3<u32>,
    maxSteps  : u32,

    rayOrigin   : vec3<f32>,
    voxelScale  : f32,

    rayCount    : u32,
    energyBandCount : u32,
    energyCutoff : f32, 
    faceCount : u32
};

@group(0) @binding(0)
var<uniform> uni : RayUniforms;

@group(0) @binding(1)
var<storage, read> voxelCoef : array<f32>;

@group(0) @binding(2)
var<storage, read> voxel_to_face : array<u32>;

@group(0) @binding(3)
var<storage, read_write> stats : array<FaceStats>;

@group(0) @binding(4)
var<storage, read> energyBands : array<f32>;


fn sign_float(x : f32) -> f32 {
    return select(-1.0, 1.0, x >= 0.0);
}

fn safe_div(a : f32, b : f32) -> f32 {
    return a / select(b, 1e-6, abs(b) < 1e-6);
}

fn world_to_voxel(pos : vec3<f32>) -> vec3<i32> {
    return vec3<i32>(floor(pos));
}

fn get_voxelID(id : vec3<i32>, room : vec3<u32>) -> u32 {
    return u32(id.z) * room.y * room.x + u32(id.y) * room.x + u32(id.x);
}

fn dda_step(pos : vec3<f32>, dir : vec3<f32>, voxelID : vec3<i32>) -> vec2<f32> {

    // Voxel boundaries in world space
    let x0 = f32(voxelID.x);
    let x1 = x0 + 1.0;

    let y0 = f32(voxelID.y);
    let y1 = y0 + 1.0;

    let z0 = f32(voxelID.z);
    let z1 = z0 + 1.0;

    // Ray intersects which of these faces?
    var tx = 1e30;
    var ty = 1e30;
    var tz = 1e30;

    if (dir.x > 0.0) { tx = (x1 - pos.x) / dir.x; }
    if (dir.x < 0.0) { tx = (x0 - pos.x) / dir.x; }

    if (dir.y > 0.0) { ty = (y1 - pos.y) / dir.y; }
    if (dir.y < 0.0) { ty = (y0 - pos.y) / dir.y; }

    if (dir.z > 0.0) { tz = (z1 - pos.z) / dir.z; }
    if (dir.z < 0.0) { tz = (z0 - pos.z) / dir.z; }

    // pick the smallest positive t
    if (tx <= ty && tx <= tz) { return vec2<f32>(tx, 0.0); }
    if (ty <= tx && ty <= tz) { return vec2<f32>(ty, 1.0); }

    return vec2<f32>(tz, 2.0);
}


fn local_face_index(axis: u32, dir: vec3<f32>) -> u32 {
    if (axis == 0u) {                  // X boundary
        return select(0u, 1u, dir.x > 0.0);   // -X = 0, +X = 1
    }
    if (axis == 1u) {                  // Y boundary
        return select(2u, 3u, dir.y > 0.0);   // -Y = 2, +Y = 3
    }
    // axis == 2 → Z boundary
    return select(4u, 5u, dir.z > 0.0);        // -Z = 4, +Z = 5
}


fn encode_pos(p : vec3<f32>) -> u32 {
    // Convert to normalized [0,1]
    let nx = clamp(p.x / f32(uni.roomSize.x), 0.0, 1.0);
    let ny = clamp(p.y / f32(uni.roomSize.y), 0.0, 1.0);
    let nz = clamp(p.z / f32(uni.roomSize.z), 0.0, 1.0);

    // Quantize to 10 bits per axis
    let qx = u32(nx * 1023.0);
    let qy = u32(ny * 1023.0);
    let qz = u32(nz * 1023.0);

    // Pack as z|y|x into 30 bits
    return (qz << 20u) | (qy << 10u) | qx;
}



struct RayResult {
    dir : vec3<f32>,
    energy : array<f32, 32>,
};

fn trace_ray(
    startPos : vec3<f32>,
    dirInput : vec3<f32>,
    energyInput : array<f32, 32>
) -> RayResult {

    var pos = startPos;
    var dir = normalize(dirInput);
    var localEnergy = energyInput;
    var step : u32 = 0u;

    loop {
        if (step >= uni.maxSteps) { break; }

        // Log entry position
        //atomicStore(&stats[bounce].bounceCount, encode_pos(pos));

        // Determine voxel
        let voxel = world_to_voxel(pos);
        if (voxel.x < 0 || voxel.y < 0 || voxel.z < 0 ||
            voxel.x >= i32(uni.roomSize.x) ||
            voxel.y >= i32(uni.roomSize.y) ||
            voxel.z >= i32(uni.roomSize.z)) {
            break;
        }

        // DDA step
        let info = dda_step(pos, dir, voxel);
        let t = info.x;
        let axis = u32(info.y);

        // Hit position
        let hitPos = pos + dir * t;
        //atomicStore(&stats[bounce].absorbedEnergy, encode_pos(hitPos));

        //-----------------------------------------------------------
        // FIX 1: Determine normal of face HIT
        //-----------------------------------------------------------
        var N = vec3<f32>(0.0);

        if (axis == 0u) {           // X axis
            N = vec3<f32>(sign_float(dir.x), 0.0, 0.0);
        }
        if (axis == 1u) {           // Y axis
            N = vec3<f32>(0.0, sign_float(dir.y), 0.0);
        }
        if (axis == 2u) {           // Z axis
            N = vec3<f32>(0.0, 0.0, sign_float(dir.z));
        }

        //-----------------------------------------------------------
        // FIX 2: Determine voxel we *enter*
        //-----------------------------------------------------------
        var next = voxel;

        if (axis == 0u) {
            next.x += select(-1, 1, dir.x > 0.0);
        }
        if (axis == 1u) {
            next.y += select(-1, 1, dir.y > 0.0);
        }
        if (axis == 2u) {
            next.z += select(-1, 1, dir.z > 0.0);
        }

        // Out of room?
        if (next.x < 0 || next.y < 0 || next.z < 0 ||
            next.x >= i32(uni.roomSize.x) ||
            next.y >= i32(uni.roomSize.y) ||
            next.z >= i32(uni.roomSize.z)) {
            break;
        }


        


        //-----------------------------------------------------------
        // FIX 3: WALL CHECK MUST USE `next` voxel, not current voxel
        //-----------------------------------------------------------
        let nextID = get_voxelID(next, uni.roomSize);
        let absorption = voxelCoef[nextID];
        let isWall = absorption > 0.0;

        //-----------------------------------------------------------
        // Reflection or transmission
        //-----------------------------------------------------------
        if (isWall) {
            let loc = local_face_index(axis, dir);
            let faceIndex = voxel_to_face[nextID * 6u + loc];
            atomicAdd(&stats[faceIndex].bounceCount, 1u);

            dir = normalize(dir - 2.0 * dot(dir, N) * N);

            // Move slightly into reflected direction
            pos = hitPos + dir * 1e-4;
        } else {
            // Free space → just continue
            pos = hitPos + dir * 1e-4;
        }

        step++;
    }

    return RayResult(dir, localEnergy);
}




@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid : vec3<u32>) {

    let rayID = gid.x;
    if (rayID >= uni.rayCount) { return; }

    let N = f32(uni.rayCount);
    let i = f32(rayID);
    let golden = 1.61803398875;

    let z = 1.0 - 2.0 * ((i + 0.5) / N);
    let r = sqrt(1.0 - z * z);
    let phi = 6.28318530718 * i * golden;
    let dir = normalize(vec3<f32>(r * cos(phi), r * sin(phi), z));

    var initialEnergy : array<f32, 32>;
    for (var j : u32 = 0u; j < uni.energyBandCount; j++) {
        initialEnergy[j] = energyBands[j];
    }

    let origin = uni.rayOrigin + dir * 1e-4;
    let result = trace_ray(origin, dir, initialEnergy);

}
