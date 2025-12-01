struct FaceStats {
    bounceCount    : atomic<u32>,
    absorbedEnergy : atomic<u32>
};

struct RayUniforms {
    roomSize    : vec3<u32>,
    maxBounces  : u32,

    rayOrigin   : vec3<f32>,
    voxelScale  : f32,

    rayCount    : u32,
    energyBandCount : u32,
    energyCutoff : f32
};

@group(0) @binding(0)
var<uniform> uni : RayUniforms;

@group(0) @binding(1)
var<storage, read> voxelCoef : array<f32>;

@group(0) @binding(2)
var<storage, read> voxelToSolidID : array<u32>;

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

fn world_to_voxel(pos : vec3<f32>) -> vec3<u32> {
    return vec3<u32>(floor(pos));
}

fn get_voxelID(id : vec3<u32>, room : vec3<u32>) -> u32 {
    return id.z * room.y * room.x + id.y * room.x + id.x;
}

fn dda_step(
    pos : vec3<f32>,
    dir : vec3<f32>,
    voxelID : vec3<u32>
) -> vec2<f32> {

    let vx = f32(voxelID.x);
    let vy = f32(voxelID.y);
    let vz = f32(voxelID.z);

    let boundaryX = (vx + select(1.0, 0.0, dir.x > 0.0));
    let boundaryY = (vy + select(1.0, 0.0, dir.y > 0.0));
    let boundaryZ = (vz + select(1.0, 0.0, dir.z > 0.0));

    let tx = safe_div(boundaryX - pos.x, dir.x);
    let ty = safe_div(boundaryY - pos.y, dir.y);
    let tz = safe_div(boundaryZ - pos.z, dir.z);

    if (tx <= ty && tx <= tz) { return vec2<f32>(tx, 0.0); }
    if (ty <= tx && ty <= tz) { return vec2<f32>(ty, 1.0); }

    return vec2<f32>(tz, 2.0);
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
    var dir = dirInput;
    var localEnergy = energyInput;
    var bounce : u32 = 0u;

    loop {
        if (bounce >= uni.maxBounces) { break; }

        let voxelID = world_to_voxel(pos);

        if (voxelID.x >= uni.roomSize.x ||
            voxelID.y >= uni.roomSize.y ||
            voxelID.z >= uni.roomSize.z)
        {
            break;
        }

        let info = dda_step(pos, dir, voxelID);
        let t = info.x;
        let axis = u32(info.y);

        let hitPos = pos + dir * t;

        var N = vec3<f32>(0.0);
        if (axis == 0u) { N = vec3<f32>(sign_float(dir.x), 0.0, 0.0); }
        if (axis == 1u) { N = vec3<f32>(0.0, sign_float(dir.y), 0.0); }
        if (axis == 2u) { N = vec3<f32>(0.0, 0.0, sign_float(dir.z)); }

        let newPos = hitPos - N * 1e-4;

        let flatID = get_voxelID(voxelID, uni.roomSize);
        let absorption = voxelCoef[flatID];
        let isWall = absorption > 0.0;

        if (!isWall) {
            pos = newPos;
            bounce++;
            continue;
        }

        // for (var j : u32 = 0u; j < uni.energyBandCount; j++) {
        //     localEnergy[j] = localEnergy[j];
        // }

        var total : f32 = 0.0;
        for (var j : u32 = 0u; j < uni.energyBandCount; j++) {
            total += localEnergy[j];
        }

        let localFaceID = axis * 2u + select(1u, 0u, dir[axis] > 0.0);
        let faceID = voxelToSolidID[flatID * 6 + localFaceID];
        if (faceID != 0xffffffffu) {
            atomicAdd(&stats[faceID].bounceCount, 1u);

            let e = u32(total * 1000.0);
            atomicAdd(&stats[faceID].absorbedEnergy, e);
        }

        dir = normalize(dir - 2.0 * dot(dir, N) * N);
        pos = newPos;
        bounce++;
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

    let result = trace_ray(uni.rayOrigin, dir, initialEnergy);

}
