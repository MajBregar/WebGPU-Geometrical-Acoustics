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
    listenerRadius : f32,

    precisionAdj : f32
};

const MAX_BANDS: u32 = 10;

@group(0) @binding(0)
var<uniform> uni : RayUniforms;

@group(0) @binding(1)
var<storage, read> materialID : array<u32>;

@group(0) @binding(2)
var<storage, read> voxel_to_face : array<u32>;

@group(0) @binding(3)
var<storage, read_write> stats : array<FaceStats>;

@group(0) @binding(4)
var<storage, read> initialEnergyBands : array<f32>;

@group(0) @binding(5)
var<storage, read_write> listenerEnergyBands : array<atomic<u32>>;











const MATERIAL_AIR : u32 = 0u;


struct Material {
    absorption   : array<f32, MAX_BANDS>,
    reflection   : array<f32, MAX_BANDS>,
    transmission : array<f32, MAX_BANDS>,
    refraction   : array<f32, MAX_BANDS>,
};

const concreteMaterial : Material = Material(
    // absorption
    array<f32, MAX_BANDS>(
        0.01, // 31.5 Hz
        0.01, // 63 Hz
        0.02, // 125 Hz
        0.02, // 250 Hz
        0.03, // 500 Hz
        0.04, // 1 kHz
        0.05, // 2 kHz
        0.07, // 4 kHz
        0.09, // 8 kHz
        0.10  // 16 kHz
    ),

    // reflection
    array<f32, MAX_BANDS>(
        0.99,
        0.99,
        0.98,
        0.98,
        0.97,
        0.96,
        0.95,
        0.93,
        0.91,
        0.90
    ),

    // transmission (all zero)
    array<f32, MAX_BANDS>(
        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    ),

    // refraction (all zero)
    array<f32, MAX_BANDS>(
        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    )
);


const materials : array<Material, 1> = array<Material, 1>(
    concreteMaterial
);









const MAX_RAY_DEPTH  : u32 = 6u;
const MAX_STACK_SIZE : u32 = 24u;

struct RayStackEntry {
    pos   : vec3<f32>,
    dir   : vec3<f32>,
    energy: array<f32, MAX_BANDS>,
    depth : u32,
    material : u32
};


const refractiveIndex : array<f32, 2> = array<f32, 2>(
    1.0000, // air
    1.2000, // wall (generic solid)
);


const materialAttenuation : array<f32, 2> = array<f32, 2>(
    0.001, // air
    6.0, // wall
);

const interfaceAbsorption : array<f32, 2> = array<f32, 2>(
    0.0, // air
    0.05, // wall: 20% loss on reflection, zero transmission
);









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

fn debug_vec3_id_to_u32(p: vec3<f32>, id: u32) -> u32 {
    let nx = clamp(p.x / f32(uni.roomSize.x), 0.0, 1.0);
    let ny = clamp(p.y / f32(uni.roomSize.y), 0.0, 1.0);
    let nz = clamp(p.z / f32(uni.roomSize.z), 0.0, 1.0);

    let qx = u32(nx * 255.0);
    let qy = u32(ny * 255.0);
    let qz = u32(nz * 255.0);
    let qi = id & 0xFFu;

    return (qi << 24u) | (qz << 16u) | (qy << 8u) | qx;
}























struct RayResult { 
    dir : vec3<f32>, 
    energy : array<f32, MAX_BANDS>, 
    hit_listener : bool 
};

fn trace_ray(startPos: vec3<f32>, dirInput: vec3<f32>) -> RayResult {

    let roomDims = vec3<i32>(
        i32(uni.roomSize.x),
        i32(uni.roomSize.y),
        i32(uni.roomSize.z)
    );

    var rayStack : array<RayStackEntry, MAX_STACK_SIZE>;
    var stackTop : i32 = -1;

    // ---- initial energy ----
    var start_energy : array<f32, MAX_BANDS>;
    for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
        start_energy[i] =
            (initialEnergyBands[i] * uni.precisionAdj) /
            f32(uni.rayCount);
    }

    // ---- push primary ray (air) ----
    stackTop = 0;
    rayStack[0] = RayStackEntry(
        startPos,
        normalize(dirInput),
        start_energy,
        0u,
        MATERIAL_AIR
    );

    var final_dir = dirInput;
    var final_energy = start_energy;
    var hit_listener = false;

    var insertion_ind = 0u;

    // ===== RAY STACK LOOP =====
    loop {
        if (stackTop < 0) { break; }

        let ray = rayStack[stackTop];
        stackTop--;

        var pos = ray.pos;
        var dir = ray.dir;
        var ray_energy = ray.energy;
        var curr_material = ray.material;
        var step = 0u;

        // ===== DDA LOOP =====
        loop {
            if (step >= uni.maxSteps) { break; }

            let voxel = world_to_voxel(pos);
            if (!valid_voxel_pos(voxel, roomDims)) { break; }

            let info = dda_step(pos, dir, voxel);
            let t = info.x;
            let hitPos = pos + dir * t;

            let axis = u32(info.y);
            let next = get_collided_voxel(axis, voxel, dir);
            if (!valid_voxel_pos(next, roomDims)) { break; }

            // ---- ENERGY CUTOFF (ray-local) ----
            var total_energy = 0.0;
            for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                total_energy += ray_energy[i];
            }
            if (total_energy < uni.energyCutoff) {
                break;
            }

            let nextID = get_voxelID(next, roomDims);
            let next_material = materialID[nextID];

            // ---- DEBUG (kept exactly) ----
            let debug_pos_id = debug_vec3_id_to_u32(pos, ray.depth);
            atomicAdd(&stats[insertion_ind].bounceCount, debug_pos_id);
            insertion_ind++;

            let distance_m = t * uni.voxelScale;

            // ---- SAME MATERIAL: distance attenuation + continue ----
            if (next_material == curr_material) {

                let att = exp(-materialAttenuation[curr_material] * distance_m);
                for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                    ray_energy[i] *= att;
                }

                pos = hitPos + dir * 1e-4;
                step++;
                continue;
            }

            // ===== MATERIAL BOUNDARY =====

            // ---- attenuation up to boundary ----
            let att = exp(-materialAttenuation[curr_material] * distance_m);

            var boundary_energy = ray_energy;
            for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                boundary_energy[i] *= att;
            }

            let n1 = refractiveIndex[curr_material];
            let n2 = refractiveIndex[next_material];

            // ---- correct normal orientation ----
            var N = get_face_normal(axis, dir);
            if (dot(N, dir) > 0.0) {
                N = -N;
            }

            let cos_i = clamp(-dot(N, dir), 0.0, 1.0);
            let eta = n1 / n2;
            let sin2_t = eta * eta * (1.0 - cos_i * cos_i);

            // ---- Fresnel (Schlick) ----
            let R0 = pow((n1 - n2) / (n1 + n2), 2.0);
            let R = R0 + (1.0 - R0) * pow(1.0 - cos_i, 5.0);
            let T = 1.0 - R;

            let survive = 1.0 - interfaceAbsorption[next_material];


            // ----- FACE ABSORPTION (correct side) -----
            let enterFace = local_face_index(axis, dir);
            let exitFace  = enterFace ^ 1u;

            var faceVoxelID : u32;
            var faceIndex   : u32;

            // If entering an absorbing material → credit next voxel's entry face
            // If exiting an absorbing material → credit current voxel's exit face
            if (interfaceAbsorption[next_material] > 0.0) {

                faceVoxelID = get_voxelID(next, roomDims);
                faceIndex = voxel_to_face[faceVoxelID * 6u + enterFace];

            } else if (interfaceAbsorption[curr_material] > 0.0) {

                faceVoxelID = get_voxelID(voxel, roomDims);
                faceIndex = voxel_to_face[faceVoxelID * 6u + exitFace];

            } else {
                // no absorbing material involved
                faceIndex = 0u;
            }

            // ----- accumulate absorbed energy -----
            if (faceIndex != 0u) {

                var absorbed = 0.0;
                let absorbCoeff =
                    select(interfaceAbsorption[curr_material],
                        interfaceAbsorption[next_material],
                        interfaceAbsorption[next_material] > 0.0);

                for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                    absorbed += boundary_energy[i] * absorbCoeff;
                }

                atomicAdd(&stats[faceIndex].absorbedEnergy, u32(absorbed));
            }








            if (ray.depth < MAX_RAY_DEPTH &&
                stackTop < i32(MAX_STACK_SIZE - 2u)) {

                // ---- reflected ray ----
                let reflDir = normalize(dir + 2.0 * cos_i * N);
                var refl_energy = boundary_energy;
                for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                    refl_energy[i] *= R * survive;
                }

                stackTop++;
                rayStack[stackTop] = RayStackEntry(
                    hitPos + N * 1e-3,
                    reflDir,
                    refl_energy,
                    ray.depth + 1u,
                    curr_material
                );

                // ---- refracted ray ----
                if (sin2_t <= 1.0) {
                    let cos_t = sqrt(1.0 - sin2_t);
                    let refrDir =
                        normalize(eta * dir + (eta * cos_i - cos_t) * N);

                    var refr_energy = boundary_energy;
                    for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                        refr_energy[i] *= T * survive;
                    }

                    stackTop++;
                    rayStack[stackTop] = RayStackEntry(
                        hitPos - N * 1e-3,
                        refrDir,
                        refr_energy,
                        ray.depth + 1u,
                        next_material
                    );
                }
            }

            break;
        }
    }

    return RayResult(final_dir, final_energy, hit_listener);
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

    if (result.hit_listener) {
        for (var i : u32 = 0u; i < uni.energyBandCount; i++) {
            let e = result.energy[i];
            let e_u32 = u32(e * uni.precisionAdj);
            atomicAdd(&listenerEnergyBands[i], e_u32);
        }
    }
}
