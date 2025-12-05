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
    faceCount : u32,

    listenerPos : vec3<f32>,
    listenerRadius : f32
};

const MAX_BANDS: u32 = 10;
const PRECISION_ADJ : f32 = 1000000.0;

@group(0) @binding(0)
var<uniform> uni : RayUniforms;

@group(0) @binding(1)
var<storage, read> voxelCoef : array<f32>;

@group(0) @binding(2)
var<storage, read> voxel_to_face : array<u32>;

@group(0) @binding(3)
var<storage, read_write> stats : array<FaceStats>;

@group(0) @binding(4)
var<storage, read> initialEnergyBands : array<f32>;

@group(0) @binding(5)
var<storage, read_write> listenerEnergyBands : array<atomic<u32>>;



fn sign_float(x : f32) -> f32 {
    return select(-1.0, 1.0, x >= 0.0);
}

fn world_to_voxel(pos : vec3<f32>) -> vec3<i32> {
    return vec3<i32>(floor(pos));
}

fn get_voxelID(id : vec3<i32>, room : vec3<i32>) -> u32 {
    return u32(id.z * room.y * room.x + id.y * room.x + id.x);
}

fn dda_step(pos : vec3<f32>, dir : vec3<f32>, voxelID : vec3<i32>) -> vec2<f32> {
    let x0 = f32(voxelID.x);
    let x1 = x0 + 1.0;

    let y0 = f32(voxelID.y);
    let y1 = y0 + 1.0;

    let z0 = f32(voxelID.z);
    let z1 = z0 + 1.0;

    var tx = 1e30;
    var ty = 1e30;
    var tz = 1e30;

    if (dir.x > 0.0) { tx = (x1 - pos.x) / dir.x; }
    if (dir.x < 0.0) { tx = (x0 - pos.x) / dir.x; }

    if (dir.y > 0.0) { ty = (y1 - pos.y) / dir.y; }
    if (dir.y < 0.0) { ty = (y0 - pos.y) / dir.y; }

    if (dir.z > 0.0) { tz = (z1 - pos.z) / dir.z; }
    if (dir.z < 0.0) { tz = (z0 - pos.z) / dir.z; }

    if (tx <= ty && tx <= tz) { return vec2<f32>(tx, 0.0); }
    if (ty <= tx && ty <= tz) { return vec2<f32>(ty, 1.0); }

    return vec2<f32>(tz, 2.0);
}


fn local_face_index(axis: u32, dir: vec3<f32>) -> u32 {
    if (axis == 0u) {
        return select(0u, 1u, dir.x > 0.0);
    }
    if (axis == 1u) {
        return select(2u, 3u, dir.y > 0.0);
    }
    return select(4u, 5u, dir.z > 0.0);
}

fn get_face_normal(axis: u32, dir: vec3<f32>) -> vec3<f32>{
    if (axis == 0u) {
        return vec3<f32>(sign_float(dir.x), 0.0, 0.0);
    }
    if (axis == 1u) {
        return vec3<f32>(0.0, sign_float(dir.y), 0.0);
    }
    if (axis == 2u) {
        return vec3<f32>(0.0, 0.0, sign_float(dir.z));
    }
    return vec3<f32>(0.0);
}

fn get_collided_voxel(axis : u32, current_voxel: vec3<i32>, dir: vec3<f32>) -> vec3<i32>{
        if (axis == 0u) {
            return vec3<i32>(current_voxel.x + select(-1, 1, dir.x > 0.0), current_voxel.y, current_voxel.z);
        }
        if (axis == 1u) {
            return vec3<i32>(current_voxel.x, current_voxel.y + select(-1, 1, dir.y > 0.0), current_voxel.z);
        }
        if (axis == 2u) {
            return vec3<i32>(current_voxel.x, current_voxel.y, current_voxel.z + select(-1, 1, dir.z > 0.0));
        }
        return current_voxel;
}

fn valid_voxel_pos(voxel_pos: vec3<i32>, room_dims: vec3<i32>) -> bool{
    if (voxel_pos.x < 0 || voxel_pos.y < 0 || voxel_pos.z < 0 ||
        voxel_pos.x >= room_dims.x ||
        voxel_pos.y >= room_dims.y||
        voxel_pos.z >= room_dims.z) 
    {
        return false;
    }
    return true;
}

// fn encode_pos(p : vec3<f32>) -> u32 {
//     let nx = clamp(p.x / f32(uni.roomSize.x), 0.0, 1.0);
//     let ny = clamp(p.y / f32(uni.roomSize.y), 0.0, 1.0);
//     let nz = clamp(p.z / f32(uni.roomSize.z), 0.0, 1.0);
//     let qx = u32(nx * 1023.0);
//     let qy = u32(ny * 1023.0);
//     let qz = u32(nz * 1023.0);
//     return (qz << 20u) | (qy << 10u) | qx;
// }



struct RayResult {
    dir : vec3<f32>,
    energy : array<f32, MAX_BANDS>
};

fn trace_ray(
    startPos : vec3<f32>,
    dirInput : vec3<f32>,
) -> RayResult {

    let roomDims = vec3<i32>(i32(uni.roomSize.x), i32(uni.roomSize.y), i32(uni.roomSize.z));

    var ray_enery_bands : array<f32, MAX_BANDS>;
    for (var j : u32 = 0u; j < uni.energyBandCount; j++) {
        ray_enery_bands[j] = (initialEnergyBands[j] * PRECISION_ADJ) /  f32(uni.rayCount);
    }
    var pos = startPos;
    var dir = dirInput;
    var step = 0u;

    loop {
        if (step >= uni.maxSteps) { break; }

        let voxel = world_to_voxel(pos);
        if (!valid_voxel_pos(voxel, roomDims)) {
            break;
        }

        let info = dda_step(pos, dir, voxel);
        let t = info.x;
        let hitPos = pos + dir * t;

        let axis = u32(info.y);
        let N = get_face_normal(axis, dir);
        let next = get_collided_voxel(axis, voxel, dir);

        if (!valid_voxel_pos(next, roomDims)) {
            break;
        }

        let nextID = get_voxelID(next, roomDims);
        let absorption = voxelCoef[nextID];
        let isWall = absorption > 0.0;



        var overall_energy = 0.0;
        if (isWall) {
            //update energy after collision
            var energy_loss = 0.0;
            for (var i : u32 = 0u; i < uni.energyBandCount; i++) {
                energy_loss += ray_enery_bands[i];
                ray_enery_bands[i] = ray_enery_bands[i] * 0.9;
                energy_loss -= ray_enery_bands[i];
                overall_energy += ray_enery_bands[i];
            }

            //update face heatmap
            let loc = local_face_index(axis, dir);
            let faceIndex = voxel_to_face[nextID * 6u + loc];
            atomicAdd(&stats[faceIndex].bounceCount, 1u);
            atomicAdd(&stats[faceIndex].absorbedEnergy, u32(energy_loss));

            //update dir
            dir = normalize(dir - 2.0 * dot(dir, N) * N);
        } else {
            //travel through air

            //update energy through air
            for (var i : u32 = 0u; i < uni.energyBandCount; i++) {
                ray_enery_bands[i] = ray_enery_bands[i] - 0.0;
                overall_energy += ray_enery_bands[i];
            }
        }

    
        if (overall_energy < uni.energyCutoff){
            break;
        }

        
        pos = hitPos + dir * 1e-4;
        step++;
    }

    return RayResult(dir, ray_enery_bands);
}

fn generate_direction_on_sphere(id : u32, max_rays : u32) -> vec3<f32>{
    let N = f32(max_rays);
    let i = f32(id);
    let golden = 1.61803398875;

    let z = 1.0 - 2.0 * ((i + 0.5) / N);
    let r = sqrt(1.0 - z * z);
    let phi = 6.28318530718 * i * golden;
    return normalize(vec3<f32>(r * cos(phi), r * sin(phi), z));
}


@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid : vec3<u32>) {

    let rayID = gid.x;
    if (rayID >= uni.rayCount) { return; }

    let dir = generate_direction_on_sphere(rayID, uni.rayCount);
    let origin = uni.rayOrigin + dir * 1e-4;
    let result = trace_ray(origin, dir);

    //test
    for (var i : u32 = 0u; i < uni.energyBandCount; i++) {
        atomicAdd(&listenerEnergyBands[i], 1u);
    }

}
