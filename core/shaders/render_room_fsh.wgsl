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
    @location(0) normal    : vec3<f32>,
    @location(1) color     : vec3<f32>,
    @location(2) shadowPos : vec4<f32>
};

@fragment
fn fs_main(input : FSInput) -> @location(0) vec4<f32> {


    let shadow_ndc  = input.shadowPos.xyz / input.shadowPos.w;
    let shadow_uv = vec2(
        shadow_ndc.x * 0.5 + 0.5,
        -(shadow_ndc.y * 0.5 + 0.5) + 1.0
    );
    let shadow_depth= shadow_ndc.z;

    let shadow = textureSampleCompare(
        shadowMap,
        shadowSampler,
        shadow_uv,
        shadow_depth
    );



    let N = normalize(input.normal);
    let L = normalize(-uni.lightDir);

    let diffuse = max(dot(N, L), 0.0);

    let litColor = uni.lightIntensity * input.color * diffuse;
    
    return vec4<f32>(vec3(shadow), 1.0);
}
