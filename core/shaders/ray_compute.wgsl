struct FaceStats {
    bounceCount    : atomic<u32>,
    absorbedEnergy : atomic<u32>
};

struct RayUniforms {
    roomSize    : vec3<u32>,
    maxBounces  : u32,
    voxelScale  : f32,
    energyBandCount : u32,
    energyCutoff : f32,
    rayCount : u32
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

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid : vec3<u32>) {

    let rayID = gid.x;
    if (rayID >= uni.rayCount) {
        return;
    }

    let theta = f32(rayID) * 0.0019;
    let phi   = f32(rayID) * 0.0037;

    let dir = vec3<f32>(
        sin(theta) * cos(phi),
        cos(theta),
        sin(theta) * sin(phi)
    );

    //let flatFaceIndex = solidVoxelIndex * 6u + faceID;
    atomicAdd(&stats[0].bounceCount, 1u);

    let energy = u32(energyBands[8] * 1000.0);
    atomicAdd(&stats[0].absorbedEnergy, energy);
}