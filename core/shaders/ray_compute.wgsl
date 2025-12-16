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

struct FaceStats {
    bounceCount    : atomic<u32>,
    absorbedEnergy : atomic<u32>
};

struct Material {
    absorption        : array<f32, MAX_BANDS>, // surface absorption
    reflection        : array<f32, MAX_BANDS>, // surface reflection
    transmission      : array<f32, MAX_BANDS>, // surface transmission
    attenuation       : array<f32, MAX_BANDS>, // volume attenuation
    diffusion         : array<f32, MAX_BANDS>, // percentage of reflection that is diffuse
    diffraction       : array<f32, MAX_BANDS>, // low-freq diffraction participation
    refractive_index  : f32                    // coefficient for snells law
};

struct RayStackEntry {
    pos   : vec3<f32>,
    dir   : vec3<f32>,
    energy: array<f32, MAX_BANDS>,
    depth : u32,
    material : u32
};

const MAX_BANDS: u32 = 10;
const MAX_RAY_DEPTH  : u32 = 3u;
const MAX_STACK_SIZE : u32 = 12u;

const MATERIAL_AIR_ID : u32 = 0u;

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

@group(0) @binding(6)
var<storage, read> materials : array<Material>;

// ============================================================
// DDA HELPERS
// ============================================================

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

fn opposite_face_index(f: u32) -> u32 {
    switch (f) {
        case 0u: { return 1u; }
        case 1u: { return 0u; }
        case 2u: { return 3u; }
        case 3u: { return 2u; }
        case 4u: { return 5u; }
        case 5u: { return 4u; }
        default: { return 0xFFFFFFFFu; }
    }
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


// ============================================================
// RAY HELPERS
// ============================================================

fn cosine_hemisphere(N: vec3<f32>, rnd: vec2<f32>) -> vec3<f32> {
    let r = sqrt(rnd.x);
    let phi = 2.0 * 3.14159265359 * rnd.y;

    let x = r * cos(phi);
    let y = r * sin(phi);
    let z = sqrt(max(0.0, 1.0 - rnd.x));

    let up = select(
        vec3<f32>(0.0, 0.0, 1.0),
        vec3<f32>(1.0, 0.0, 0.0),
        abs(N.z) > 0.999
    );

    let T = normalize(cross(up, N));
    let B = cross(N, T);
    return normalize(x * T + y * B + z * N);
}

fn should_diffract(dir: vec3<f32>, curr_voxel_id: vec3<i32>, next_voxel_id: u32) -> bool {
    return false;
}
fn diffract_dir(dir: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(0.0);
}


fn hash_u32(x: u32) -> u32 {
    var v = x;
    v ^= v >> 16;
    v *= 0x7feb352du;
    v ^= v >> 15;
    v *= 0x846ca68bu;
    v ^= v >> 16;
    return v;
}

fn rand_f32(seed: u32) -> f32 {
    return f32(hash_u32(seed)) / 4294967296.0;
}


// ============================================================
// MAIN RAY TRACING
// ============================================================


fn trace_ray(startPos: vec3<f32>, dirInput: vec3<f32>) {
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
        start_energy[i] = initialEnergyBands[i] / f32(uni.rayCount);
    }

    // ---- push primary ray (air) ----
    stackTop = 0;
    rayStack[0] = RayStackEntry(
        startPos,
        dirInput,
        start_energy,
        0u,
        MATERIAL_AIR_ID
    );

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

            // ---- ENERGY CUTOFF ----
            var total_energy = 0.0;
            for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                total_energy += ray_energy[i];
            }
            if (total_energy < uni.energyCutoff) {
                break;
            }

            // ---- LISTENER HIT ----
            let dist_to_listener = distance(pos, uni.listenerPos);
            if (dist_to_listener <= uni.listenerRadius) {
                for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                    atomicAdd(
                        &listenerEnergyBands[i],
                        u32(ray_energy[i] * uni.precisionAdj)
                    );
                }
                break;
            }

            // ---- VOXEL DDA ----
            let voxel = world_to_voxel(pos);
            if (!valid_voxel_pos(voxel, roomDims)) { break; }

            let info   = dda_step(pos, dir, voxel);
            let t      = info.x;
            let axis   = u32(info.y);
            let hitPos = pos + dir * t;

            let next = get_collided_voxel(axis, voxel, dir);
            if (!valid_voxel_pos(next, roomDims)) { break; }

            let nextID        = get_voxelID(next, roomDims);
            let next_material = materialID[nextID];

            let distance_m = t * uni.voxelScale;

            var N = get_face_normal(axis, dir);
            if (dot(N, dir) > 0.0) { N = -N; }



            // ============================================================
            // NO MATERIAL CHANGE CALCULATIONS (OPTIMIZED)
            // ============================================================

            if (next_material == curr_material) {

                for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                    ray_energy[i] *= exp(-materials[curr_material].attenuation[i] * distance_m);
                }

                if (should_diffract(dir, voxel, nextID) && ray.depth < MAX_RAY_DEPTH && stackTop < i32(MAX_STACK_SIZE - 1u)) {

                    // Allocate only when needed
                    var diffract_energy : array<f32, MAX_BANDS>;
                    var diffract_sum = 0.0;

                    for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                        let kd = materials[curr_material].diffraction[i];
                        let d  = ray_energy[i] * kd;

                        diffract_energy[i] = d;
                        ray_energy[i] -= d;

                        diffract_sum += d;
                    }

                    if (diffract_sum > uni.energyCutoff) {
                        let diffDir = diffract_dir(dir, N);

                        stackTop++;
                        rayStack[stackTop] = RayStackEntry(
                            hitPos + diffDir * 1e-4,
                            diffDir,
                            diffract_energy,
                            ray.depth + 1u,
                            curr_material
                        );
                    }
                }

                pos = hitPos + dir * 1e-4;
                step++;
                continue;
            }




            






            // ============================================================
            // MATERIAL CHANGE CALCULATIONS
            // ============================================================

            // ---- ENERGY UP TO BOUNDARY ----
            var boundary_energy = ray_energy;
            for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                boundary_energy[i] *= exp(-materials[curr_material].attenuation[i] * distance_m);
            }

            // ---- LOG FACE ABSORPTION ----
            let enterFace = local_face_index(axis, dir);
            let exitFace  = opposite_face_index(enterFace);

            let enter_face_id = voxel_to_face[get_voxelID(next, roomDims) * 6u + enterFace];
            let exit_face_id = voxel_to_face[get_voxelID(voxel, roomDims) * 6u + exitFace];

            let absorbing_face_id = select(exit_face_id, enter_face_id, enter_face_id != 0xFFFFFFFFu);
            let boundary_material_id = select(curr_material, next_material, enter_face_id != 0xFFFFFFFFu);

            if (enter_face_id == 0xFFFFFFFFu && exit_face_id == 0xFFFFFFFFu) {
                //kill invalid ray
                break;
            }

            // ---- ABSORPTION ----
            var absorbed_sum = 0.0;
            for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                let absorbed = boundary_energy[i] * materials[boundary_material_id].absorption[i];
                absorbed_sum += absorbed;
                boundary_energy[i] -= absorbed;
            }
  
            atomicAdd(&stats[absorbing_face_id].absorbedEnergy, u32(absorbed_sum * uni.precisionAdj));
            atomicAdd(&stats[absorbing_face_id].bounceCount, 1u);
            
            // ---- REFRACTION SETUP ----
            let n1 = materials[curr_material].refractive_index;
            let n2 = materials[next_material].refractive_index;

            let cos_i = clamp(-dot(N, dir), 0.0, 1.0);
            let eta   = n1 / n2;
            let sin2_t = eta * eta * (1.0 - cos_i * cos_i);

            // ---- FRESNEL (DIRECTION SPLIT ONLY) ----
            let R0 = pow((n1 - n2) / (n1 + n2), 2.0);
            let R  = R0 + (1.0 - R0) * pow(1.0 - cos_i, 5.0);
            let T  = 1.0 - R;


            if (ray.depth < MAX_RAY_DEPTH && stackTop < i32(MAX_STACK_SIZE - 1u)) {

                let reflDir = normalize(dir + 2.0 * cos_i * N);

                var spec_energy = boundary_energy;
                var diff_energy = boundary_energy;

                var spec_sum = 0.0;
                var diff_sum = 0.0;

                for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                    let refl = R * materials[boundary_material_id].reflection[i];
                    let kd   = materials[boundary_material_id].diffusion[i];
                    let ks   = 1.0 - kd;

                    let s = spec_energy[i] * refl * ks;
                    let d = diff_energy[i] * refl * kd;

                    spec_energy[i] = s;
                    diff_energy[i] = d;

                    spec_sum += s;
                    diff_sum += d;
                }

                // ============================================================
                // REFRACTION (ENERGY COMPUTE FIRST)
                // ============================================================

                var refr_energy = boundary_energy;
                var refr_sum = 0.0;
                var has_refr = false;

                if (sin2_t <= 1.0) {
                    for (var i: u32 = 0u; i < uni.energyBandCount; i++) {
                        let e = refr_energy[i] * T * materials[boundary_material_id].transmission[i];
                        refr_energy[i] = e;
                        refr_sum += e;
                    }
                    has_refr = true;
                }

                // ============================================================
                // SELECT RAYS BASED ON AVAILABLE STACK SPACE
                // ============================================================

                let free_slots = i32(MAX_STACK_SIZE) - stackTop - 1;
                let spec_ok = spec_sum > uni.energyCutoff;
                let diff_ok = diff_sum > uni.energyCutoff;
                let refr_ok = refr_sum > uni.energyCutoff && has_refr;

                // PUSH RAYS BY ENERGY SUM
                for (var k = 0; k < free_slots; k++) {

                    var best = 0; // 1=spec, 2=diff, 3=refr
                    var best_val = 0.0;

                    if (spec_ok && spec_sum > best_val) {
                        best = 1; best_val = spec_sum;
                    }
                    if (diff_ok && diff_sum > best_val) {
                        best = 2; best_val = diff_sum;
                    }
                    if (refr_ok && refr_sum > best_val) {
                        best = 3; best_val = refr_sum;
                    }

                    if (best == 0) {
                        break; // nothing left to push
                    }

                    // ---- SPECULAR ----
                    if (best == 1) {
                        stackTop++;
                        rayStack[stackTop] = RayStackEntry(
                            hitPos + N * 1e-3,
                            reflDir,
                            spec_energy,
                            ray.depth + 1u,
                            curr_material
                        );
                        spec_sum = 0.0;
                    }

                    // ---- DIFFUSE ----
                    else if (best == 2) {
                        let seed = (((ray.depth * 73856093u) ^ ray.material) * 19349663u) ^ u32(hitPos.x * 4096.0) ^ u32(hitPos.y * 4096.0) ^ u32(hitPos.z * 4096.0);
                        let rnd = vec2<f32>(rand_f32(seed), rand_f32(seed ^ 0x9e3779b9u));
                        let diffDir = cosine_hemisphere(N, rnd);

                        stackTop++;
                        rayStack[stackTop] = RayStackEntry(
                            hitPos + N * 1e-3,
                            diffDir,
                            diff_energy,
                            ray.depth + 1u,
                            curr_material
                        );
                        diff_sum = 0.0;
                    }

                    // ---- REFRACTION ----
                    else {
                        let cos_t = sqrt(1.0 - sin2_t);
                        let refrDir = normalize(eta * dir + (eta * cos_i - cos_t) * N);

                        stackTop++;
                        rayStack[stackTop] = RayStackEntry(
                            hitPos - N * 1e-3,
                            refrDir,
                            refr_energy,
                            ray.depth + 1u,
                            next_material
                        );
                        refr_sum = 0.0;
                    }
                }
            }

            //BREAK OUT OF RAY LOOP AND GET NEW RAY
            break;
        }

    }
}




// ============================================================
// MAIN
// ============================================================


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
    trace_ray(origin, dir);

}
