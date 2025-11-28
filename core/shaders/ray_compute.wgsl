struct Ray {
    origin : vec3<f32>,
    dir    : vec3<f32>,
    energy : f32,
    ray_active : u32,
};

struct FaceStats {
    bounceCount    : atomic<u32>,
    absorbedEnergy : atomic<u32>
};

struct RayUniforms {
    roomSize    : vec3<u32>,
    maxBounces  : u32,
    voxelScale  : f32,
    rayCount    : u32,
    energyCutoff: f32
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
var<storage, read_write> rays : array<Ray>;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid : vec3<u32>) {

    let ray_id = gid.x;
    if (ray_id >= uni.rayCount) {
        return;
    }
    let ray = &rays[ray_id];

    //let flatFaceIndex = solidVoxelIndex * 6u + faceID;
    atomicStore(&stats[ray_id].bounceCount, 1u);
    atomicStore(&stats[ray_id].absorbedEnergy, 10u);

}