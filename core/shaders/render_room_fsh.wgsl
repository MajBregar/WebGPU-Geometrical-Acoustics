struct Uniforms {
    viewProj        : mat4x4<f32>,
    invViewProj     : mat4x4<f32>,
    screenSize      : vec2<f32>,
    lightDir        : vec3<f32>,
    lightColor      : vec3<f32>,
    lightIntensity  : f32,
    shadowMatrix    : mat4x4<f32>,
    shadowBias      : f32,
    shadowNormalBias: f32,
};

@group(0) @binding(0)
var<uniform> uni : Uniforms;

@group(0) @binding(1)
var shadowMap : texture_depth_2d;

@group(0) @binding(2)
var shadowSampler : sampler_comparison;

struct FSInput {
    @location(0) normal : vec3<f32>,
    @location(1) color  : vec3<f32>
};

@fragment
fn fs_main(input : FSInput) -> @location(0) vec4<f32> {

    //dummy data
    let uv = vec2<f32>(0.0, 0.0);
    let _depthSample = textureSampleCompare(shadowMap, shadowSampler, uv, 0.0);

    let N = normalize(input.normal);
    let L = normalize(-uni.lightDir);

    let diffuse = max(dot(N, L), 0.0);

    let litColor = input.color * diffuse;
    
    return vec4<f32>(litColor, 1.0);
}
